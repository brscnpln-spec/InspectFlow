import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage, toSafeUser } from "./storage";
import { comparePasswords, hashPassword } from "./auth";
import { seedDatabase } from "./seed";
import { randomUUID } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { pushSchema } from "./db-migrate";
import { z } from "zod";
import { loginSchema, type InspectionRequest, type Notification } from "@shared/schema";
import rateLimit from "express-rate-limit";
import helmet from "helmet";

export const PASSWORD_POLICY = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,}$/,
    "Password must include uppercase, lowercase, a number, and a special character"
  );

/** Cast Express 5 params (string | string[]) to string safely */
function pid(p: string | string[]): string {
  return Array.isArray(p) ? p[0]! : p;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function getTodayStr(): string { return toDateStr(new Date()); }
function getTomorrowStr(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return toDateStr(d);
}

async function notify(data: Omit<Partial<Notification>, "id" | "createdAt">) {
  try { await storage.createNotification(data); } catch {}
}

// Persistent upload directory — lives inside the project root, git-ignored via uploads/
const uploadsDir = path.resolve("uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "text/plain",
]);

const MAGIC_BYTES: Record<string, number[][]> = {
  "application/pdf":        [[0x25, 0x50, 0x44, 0x46]],
  "application/msword":     [[0xD0, 0xCF, 0x11, 0xE0]],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    [0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06], [0x50, 0x4B, 0x07, 0x08],
  ],
  "application/vnd.ms-excel":   [[0xD0, 0xCF, 0x11, 0xE0]],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    [0x50, 0x4B, 0x03, 0x04], [0x50, 0x4B, 0x05, 0x06], [0x50, 0x4B, 0x07, 0x08],
  ],
  "image/jpeg":  [[0xFF, 0xD8, 0xFF]],
  "image/png":   [[0x89, 0x50, 0x4E, 0x47]],
  "image/gif":   [[0x47, 0x49, 0x46, 0x38]],
  "image/webp":  [[0x52, 0x49, 0x46, 0x46]],
  "text/plain":  [],
};

export function validateMagicBytes(filePath: string, mimeType: string): boolean {
  const sigs = MAGIC_BYTES[mimeType];
  if (sigs === undefined) return false;
  if (sigs.length === 0) return true;
  const buf = Buffer.alloc(8);
  const fd = fs.openSync(filePath, "r");
  try { fs.readSync(fd, buf, 0, 8, 0); } finally { fs.closeSync(fd); }
  return sigs.some(sig => sig.every((b, i) => buf[i] === b));
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadsDir),
    filename: (_req, file, cb) => {
      const uniqueName = `${Date.now()}-${randomUUID()}${path.extname(file.originalname)}`;
      cb(null, uniqueName);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("File type not allowed. Accepted: PDF, Word, Excel, images, plain text."));
    }
  },
});

const tenantSchema = z.object({
  companyName: z.string().trim().min(1, "Company name is required"),
  klx: z.string().trim().min(1, "KLX is required"),
  klCustomerNumber: z.string().trim().min(1, "KL Customer Number is required"),
  contactPerson1: z.string().trim().min(1, "Contact 1 name is required"),
  phone1: z.string().trim().min(1, "Contact 1 phone is required"),
  email1: z.string().trim().email("Contact 1 email must be valid"),
  contactPerson2: z.string().trim().min(1, "Contact 2 name is required"),
  phone2: z.string().trim().min(1, "Contact 2 phone is required"),
  email2: z.string().trim().email("Contact 2 email must be valid"),
});

const createInspectionSchema = z.object({
  tenantId: z.string().min(1, "Tenant is required"),
  notes: z.string().optional().nullable(),
  isEmergency: z.boolean().optional().default(false),
  recurringDays: z.number().optional().nullable(),
  assignedServiceMemberId: z.string().optional().nullable(),
  inspectionDate: z.string().optional().nullable(),
  inspectionTime: z.string().optional().nullable(),
});

const editInspectionSchema = z.object({
  notes: z.string().optional().nullable(),
  isEmergency: z.boolean(),
  recurringDays: z.number().optional().nullable(),
  assignedServiceMemberId: z.string().optional().nullable(),
  inspectionDate: z.string().optional().nullable(),
  inspectionTime: z.string().optional().nullable(),
});

const assignSchema = z.object({
  assignedServiceMemberId: z.string().min(1),
  inspectionDate: z.string().min(1),
  inspectionTime: z.string().optional().nullable(),
});

const npsResponseSchema = z.object({
  reportScore: z.number().min(0).max(10),
  serviceScore: z.number().min(0).max(10).optional().nullable(),
  comment: z.string().max(2000).optional().nullable(),
  respondentEmail: z.string().email().optional().nullable(),
});

declare module "express-session" {
  interface SessionData {
    userId: string;
    csrfToken: string;
  }
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const user = await storage.getUser(req.session.userId);
  if (!user || user.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = connectPgSimple(session);

  const sessionSecret = process.env.SESSION_SECRET;
  if (!sessionSecret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.get("/readyz", async (_req, res) => {
    try {
      await pool.query("SELECT 1");
      res.status(200).json({ status: "ready" });
    } catch {
      res.status(503).json({ status: "not_ready" });
    }
  });

  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "blob:"],
              fontSrc: ["'self'"],
              connectSrc: ["'self'"],
              frameSrc: ["'none'"],
              objectSrc: ["'none'"],
            },
          }
        : false,
      hsts: process.env.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false,
    })
  );

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { message: "Too many login attempts. Please try again later." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const surveyLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: { message: "Too many survey submissions from this IP." },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use("/api", apiLimiter);

  app.use(
    session({
      store: new PgStore({
        pool: pool,
        createTableIfMissing: true,
      }),
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  await pushSchema();
  if (process.env.NODE_ENV !== "production") {
    await seedDatabase();
  }

  // CSRF protection: all authenticated non-GET mutations require matching X-CSRF-Token header
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
    if (!req.session.userId) return next();  // unauthenticated (login/survey) — no session to forge
    if (req.path === "/api/auth/logout") return next();  // logout is benign without CSRF
    const token = req.headers["x-csrf-token"];
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }
    next();
  });

  setInterval(async () => {
    try {
      const expired = await storage.getPendingExpiredAssignments();
      for (const inspection of expired) {
        await storage.updateInspection(inspection.id, {
          assignmentStatus: "expired",
          status: "new",
          assignedServiceMemberId: null,
          inspectionDate: null,
          inspectionTime: null,
        });
        console.log(`Assignment expired for inspection ${inspection.id} (${inspection.companyName})`);
        await notify({
          type: "assignment_expired",
          title: "Assignment not accepted",
          message: `${inspection.companyName} — the assigned team member did not respond within the deadline.`,
          targetUrl: `/inspections/${inspection.id}`,
          relatedInspectionId: inspection.id,
          isRead: false,
          deduplicationKey: `assignment_expired:${inspection.id}`,
        });
      }
    } catch (e) {
      console.error("Error checking expired assignments:", e);
    }
  }, 60 * 1000);

  setInterval(async () => {
    try {
      const overdueInspections = await storage.getOverdueInspections();
      for (const insp of overdueInspections) {
        await notify({
          type: "inspection_overdue",
          title: "Inspection overdue",
          message: `${insp.companyName} — inspection date has passed but the inspection has not been completed within 3 business days.`,
          targetUrl: `/inspections/${insp.id}`,
          relatedInspectionId: insp.id,
          isRead: false,
          deduplicationKey: `inspection_overdue:${insp.id}:${insp.inspectionDate}`,
        });
      }

      const expiredSurveys = await storage.getExpiredUncompletedSurveys();
      for (const survey of expiredSurveys) {
        const insp = await storage.getInspection(survey.inspectionId);
        if (!insp) continue;
        await notify({
          type: "feedback_expired",
          title: "Feedback form expired",
          message: `${insp.companyName} — the feedback form expired without any response.`,
          targetUrl: `/inspections/${insp.id}`,
          relatedInspectionId: insp.id,
          isRead: false,
          deduplicationKey: `feedback_expired:${survey.id}`,
        });
      }

      const tomorrowStr = getTomorrowStr();
      const tomorrowInspections = await storage.getScheduledInspectionsByDate(tomorrowStr);
      for (const insp of tomorrowInspections) {
        await notify({
          type: "tomorrow_reminder",
          title: "Inspection tomorrow",
          message: `${insp.companyName} is scheduled for tomorrow${insp.inspectionTime ? ` at ${insp.inspectionTime}` : ""}.`,
          targetUrl: `/calendar`,
          relatedInspectionId: insp.id,
          isRead: false,
          deduplicationKey: `tomorrow_reminder:${insp.id}:${tomorrowStr}`,
        });
      }
    } catch (e) {
      console.error("Error in notification scheduler:", e);
    }
  }, 15 * 60 * 1000);

  app.post("/api/auth/login", loginLimiter, async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Username and password required" });
    }
    const { username, password } = parsed.data;
    const user = await storage.getUserByUsername(username);
    if (!user || !(await comparePasswords(password, user.password))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    req.session.userId = user.id;
    req.session.csrfToken = randomUUID();
    // Deliver CSRF token in a response header, not the body, so it never appears in logs or JSON payloads.
    res.setHeader("X-CSRF-Token", req.session.csrfToken);
    res.json(toSafeUser(user));
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!req.session.csrfToken) {
      req.session.csrfToken = randomUUID();
    }
    res.setHeader("X-CSRF-Token", req.session.csrfToken);
    res.json(toSafeUser(user));
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/users/service-members", requireAuth, async (req: Request, res: Response) => {
    const members = await storage.getServiceMembers();
    res.json(members.map(toSafeUser));
  });

  app.get("/api/users", requireAdmin, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(toSafeUser));
  });

  app.get("/api/users/:id", requireAuth, async (req: Request, res: Response) => {
    const requestingUser = await storage.getUser(req.session.userId!);
    if (!requestingUser) return res.status(401).json({ message: "Unauthorized" });
    const targetId = pid(req.params.id);
    // Members can only view their own profile; admins can view any
    if (requestingUser.role !== "admin" && requestingUser.id !== targetId) {
      return res.status(403).json({ message: "Access denied" });
    }
    const user = await storage.getUser(targetId);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(toSafeUser(user));
  });

  const createUserSchema = z.object({
    username: z.string().min(1, "Username is required").max(50),
    password: PASSWORD_POLICY,
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Invalid email address"),
    role: z.enum(["admin", "service_member"]),
    assignedAdminId: z.string().nullable().optional(),
  });

  const updateUserSchema = z.object({
    username: z.string().min(1).max(50).optional(),
    password: PASSWORD_POLICY.optional(),
    name: z.string().min(1).max(100).optional(),
    email: z.string().email().optional(),
    role: z.enum(["admin", "service_member"]).optional(),
    assignedAdminId: z.string().nullable().optional(),
  });

  app.post("/api/users", requireAdmin, async (req: Request, res: Response) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const { username, password, name, email, role, assignedAdminId } = parsed.data;
    const existing = await storage.getUserByUsername(username);
    if (existing) {
      return res.status(400).json({ message: "Username already exists" });
    }
    const hashedPassword = await hashPassword(password);
    const user = await storage.createUser({
      username,
      password: hashedPassword,
      name,
      email,
      role,
      assignedAdminId: assignedAdminId || null,
    });
    res.status(201).json(toSafeUser(user));
  });

  app.patch("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const existingUser = await storage.getUser(pid(req.params.id) as string);
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    const { username, password, name, email, role, assignedAdminId } = parsed.data;

    if (username && username !== existingUser.username) {
      const dup = await storage.getUserByUsername(username);
      if (dup) return res.status(400).json({ message: "Username already exists" });
    }

    const updateData: Partial<Pick<typeof existingUser, "name" | "email" | "role" | "username" | "assignedAdminId" | "password">> = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (username) updateData.username = username;
    if (assignedAdminId !== undefined) updateData.assignedAdminId = assignedAdminId || null;
    if (password) updateData.password = await hashPassword(password);

    const user = await storage.updateUser(pid(req.params.id) as string, updateData);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(toSafeUser(user));
  });

  app.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const user = await storage.getUser(pid(req.params.id) as string);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.id === req.session.userId) {
      return res.status(400).json({ message: "Cannot delete yourself" });
    }

    await storage.deleteUser(pid(req.params.id) as string);
    res.json({ message: "User deleted" });
  });

  app.get("/api/feedback", requireAdmin, async (req: Request, res: Response) => {
    const [responses, inspections, allUsers] = await Promise.all([
      storage.getNpsResponses(),
      storage.getInspections(),
      storage.getAllUsers(),
    ]);

    const inspectionMap = new Map(inspections.map((i) => [i.id, i]));
    const userMap = new Map(allUsers.map((u) => [u.id, u]));

    const grouped = new Map<string, { responses: typeof responses; inspectionId: string }>();
    for (const r of responses) {
      if (!grouped.has(r.inspectionId)) {
        grouped.set(r.inspectionId, { responses: [], inspectionId: r.inspectionId });
      }
      grouped.get(r.inspectionId)!.responses.push(r);
    }

    const rows = Array.from(grouped.values()).map(({ inspectionId, responses: resps }) => {
      const inspection = inspectionMap.get(inspectionId);
      const firstResp = resps[0];
      const member = userMap.get(firstResp.serviceMemberId);

      const reportScores = resps.map((r) => r.reportScore);
      const serviceScores = resps.filter((r) => r.serviceScore !== null).map((r) => r.serviceScore!);

      const reportAvg = Math.round((reportScores.reduce((a, b) => a + b, 0) / reportScores.length) * 10) / 10;
      const serviceAvg = serviceScores.length > 0
        ? Math.round((serviceScores.reduce((a, b) => a + b, 0) / serviceScores.length) * 10) / 10
        : null;

      return {
        inspectionId,
        companyName: inspection?.companyName ?? "",
        tenantId: inspection?.tenantId ?? null,
        memberId: firstResp.serviceMemberId,
        memberName: member?.name ?? "Unknown",
        inspectionDate: inspection?.inspectionDate ?? null,
        reportAvg,
        serviceAvg,
        responseCount: resps.length,
        responses: resps.map((r) => ({
          id: r.id,
          reportScore: r.reportScore,
          serviceScore: r.serviceScore,
          comment: r.comment,
          respondentEmail: r.respondentEmail,
          createdAt: r.createdAt,
        })),
      };
    });

    res.json(rows);
  });

  app.get("/api/tenants", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role === "admin") {
      return res.json(await storage.getTenants());
    }

    const inspections = await storage.getInspectionsByServiceMember(user.id);
    const tenantIds = Array.from(new Set(inspections.map(i => i.tenantId).filter(Boolean) as string[]));
    return res.json(await storage.getTenantsByIds(tenantIds));
  });

  app.get("/api/tenants/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const tenant = await storage.getTenant(pid(req.params.id));
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });

    if (user.role !== "admin") {
      const inspections = await storage.getInspectionsByServiceMember(user.id);
      const allowed = inspections.some(i => i.tenantId === tenant.id);
      if (!allowed) return res.status(403).json({ message: "Access denied" });
    }

    res.json(tenant);
  });

  app.post("/api/tenants", requireAdmin, async (req: Request, res: Response) => {
    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const tenant = await storage.createTenant(parsed.data);

    await notify({
      type: "tenant_added",
      title: "New tenant added",
      message: `${tenant.companyName} has been added to the system.`,
      targetUrl: "/tenants",
      relatedTenantId: tenant.id,
      isRead: false,
      deduplicationKey: `tenant_added:${tenant.id}`,
    });

    res.status(201).json(tenant);
  });

  // Members may only update contact fields for tenants linked to their inspections.
  // Admins may update all fields (full tenantSchema).
  const tenantMemberSchema = tenantSchema.pick({
    contactPerson1: true, phone1: true, email1: true,
    contactPerson2: true, phone2: true, email2: true,
  });

  app.patch("/api/tenants/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const existing = await storage.getTenant(pid(req.params.id));
    if (!existing) return res.status(404).json({ message: "Tenant not found" });

    if (user.role !== "admin") {
      const inspections = await storage.getInspectionsByServiceMember(user.id);
      const allowed = inspections.some(i => i.tenantId === existing.id);
      if (!allowed) return res.status(403).json({ message: "Access denied" });

      // Members can only update contact info, not company identifiers
      const parsed = tenantMemberSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }
      const tenant = await storage.updateTenant(pid(req.params.id), { ...existing, ...parsed.data });
      return res.json(tenant);
    }

    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const tenant = await storage.updateTenant(pid(req.params.id), parsed.data);
    res.json(tenant);
  });

  app.delete("/api/tenants/:id", requireAdmin, async (req: Request, res: Response) => {
    const tenant = await storage.getTenant(pid(req.params.id));
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    await storage.deleteTenant(pid(req.params.id));
    res.json({ message: "Tenant deleted" });
  });

  app.get("/api/inspections", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let inspections;
    if (user.role === "admin") {
      inspections = await storage.getInspections();
    } else {
      inspections = await storage.getInspectionsByServiceMember(user.id);
    }
    res.json(inspections);
  });

  app.get("/api/inspections/:id", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Not found" });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role !== "admin" && inspection.assignedServiceMemberId !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(inspection);
  });

  app.post("/api/inspections", requireAdmin, async (req: Request, res: Response) => {
    const parsed = createInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    const data = parsed.data;

    const tenant = await storage.getTenant(data.tenantId);
    if (!tenant) return res.status(400).json({ message: "Tenant not found" });

    const user = await storage.getUser(req.session.userId!);
    const hasAssignment = !!(data.assignedServiceMemberId && data.inspectionDate);
    const status = hasAssignment ? "scheduled" : "new";

    let assignmentStatus: "pending" | "accepted" | "rejected" | "expired" | null = null;
    let assignmentExpiresAt: Date | null = null;
    if (hasAssignment) {
      assignmentStatus = "pending";
      const expiryHours = data.isEmergency ? 12 : 24;
      assignmentExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    }

    const inspection = await storage.createInspection({
      tenantId: tenant.id,
      companyName: tenant.companyName,
      contactPerson1: tenant.contactPerson1,
      contactPerson2: tenant.contactPerson2,
      phone1: tenant.phone1,
      phone2: tenant.phone2,
      email1: tenant.email1,
      email2: tenant.email2,
      notes: data.notes || null,
      status,
      assignedServiceMemberId: data.assignedServiceMemberId || null,
      assignedByAdminId: user!.id,
      inspectionDate: data.inspectionDate || null,
      inspectionTime: data.inspectionTime || null,
      isEmergency: data.isEmergency,
      recurringDays: data.recurringDays || null,
      assignmentStatus,
      assignmentExpiresAt,
    });

    res.status(201).json(inspection);
  });

  app.patch("/api/inspections/:id", requireAdmin, async (req: Request, res: Response) => {
    const parsed = editInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }

    const existing = await storage.getInspection(pid(req.params.id));
    if (!existing) return res.status(404).json({ message: "Not found" });

    if (existing.status === "final_closed") {
      return res.status(400).json({ message: "Cannot edit a final closed inspection" });
    }

    const data = parsed.data;
    const serviceMemberChanged = data.assignedServiceMemberId !== existing.assignedServiceMemberId;

    const updateData: Partial<InspectionRequest> = {
      notes: data.notes || null,
      isEmergency: data.isEmergency,
      recurringDays: data.recurringDays || null,
      inspectionDate: data.inspectionDate || null,
      inspectionTime: data.inspectionTime || null,
    };

    if (serviceMemberChanged) {
      updateData.assignedServiceMemberId = data.assignedServiceMemberId || null;
      if (data.assignedServiceMemberId && data.inspectionDate) {
        updateData.status = "scheduled";
        updateData.assignmentStatus = "pending";
        const expiryHours = data.isEmergency ? 12 : 24;
        updateData.assignmentExpiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
        updateData.assignmentRespondedAt = null;
      } else if (!data.assignedServiceMemberId) {
        updateData.status = "new";
        updateData.assignmentStatus = null;
        updateData.assignmentExpiresAt = null;
        updateData.assignmentRespondedAt = null;
      }
    }

    const inspection = await storage.updateInspection(pid(req.params.id), updateData);

    if (serviceMemberChanged && data.assignedServiceMemberId) {
      // TODO: Send assignment notification email to service member
    }

    res.json(inspection);
  });

  app.patch("/api/inspections/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Service member and date are required" });
    }
    const { assignedServiceMemberId, inspectionDate, inspectionTime } = parsed.data;

    const existingInspection = await storage.getInspection(pid(req.params.id));
    if (!existingInspection) return res.status(404).json({ message: "Not found" });

    const isEmergency = existingInspection.isEmergency;
    const expiryHours = isEmergency ? 12 : 24;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const inspection = await storage.updateInspection(pid(req.params.id), {
      assignedServiceMemberId,
      inspectionDate,
      inspectionTime: inspectionTime || null,
      assignedByAdminId: req.session.userId!,
      status: "scheduled",
      assignmentStatus: "pending",
      assignmentExpiresAt: expiresAt,
      assignmentRespondedAt: null,
    });

    res.json(inspection);
  });

  app.patch("/api/inspections/:id/accept-assignment", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Not found" });

    if (inspection.assignedServiceMemberId !== req.session.userId) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }
    if (inspection.assignmentStatus !== "pending") {
      return res.status(400).json({ message: "Assignment is not pending" });
    }
    if (inspection.assignmentExpiresAt && inspection.assignmentExpiresAt < new Date()) {
      return res.status(400).json({ message: "Assignment has expired" });
    }

    const updated = await storage.updateInspection(pid(req.params.id), {
      assignmentStatus: "accepted",
      assignmentRespondedAt: new Date(),
    });

    const member = await storage.getUser(req.session.userId!);
    await notify({
      type: "assignment_accepted",
      title: "Assignment accepted",
      message: `${member?.name ?? "A team member"} accepted the inspection for ${inspection.companyName}${inspection.inspectionDate ? ` on ${inspection.inspectionDate}` : ""}.`,
      targetUrl: `/inspections/${inspection.id}`,
      relatedInspectionId: inspection.id,
      isRead: false,
      deduplicationKey: `assignment_accepted:${inspection.id}`,
    });

    res.json(updated);
  });

  app.patch("/api/inspections/:id/reject-assignment", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Not found" });

    if (inspection.assignedServiceMemberId !== req.session.userId) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }
    if (inspection.assignmentStatus !== "pending") {
      return res.status(400).json({ message: "Assignment is not pending" });
    }

    const updated = await storage.updateInspection(pid(req.params.id), {
      assignmentStatus: "rejected",
      assignmentRespondedAt: new Date(),
      status: "new",
      assignedServiceMemberId: null,
      inspectionDate: null,
      inspectionTime: null,
    });

    const rejectingMember = await storage.getUser(req.session.userId!);
    await notify({
      type: "assignment_rejected",
      title: "Assignment rejected",
      message: `${rejectingMember?.name ?? "A team member"} rejected the inspection assignment for ${inspection.companyName}.`,
      targetUrl: `/inspections/${inspection.id}`,
      relatedInspectionId: inspection.id,
      isRead: false,
      deduplicationKey: `assignment_rejected:${inspection.id}:${new Date().toISOString().split("T")[0]}`,
    });

    res.json(updated);
  });

  app.patch("/api/inspections/:id/close", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Not found" });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role !== "admin" && inspection.assignedServiceMemberId !== user.id) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }

    const reports = await storage.getReportsByInspection(pid(req.params.id));
    if (reports.length === 0) {
      return res.status(400).json({ message: "An inspection report file must be uploaded before closing" });
    }

    const { completionNotes } = req.body;
    const updated = await storage.updateInspection(pid(req.params.id), {
      status: "closed",
      completionNotes: completionNotes || null,
    });

    await notify({
      type: "inspection_completed",
      title: "Inspection completed",
      message: `${user.name} completed the inspection for ${inspection.companyName}.`,
      targetUrl: `/inspections/${inspection.id}`,
      relatedInspectionId: inspection.id,
      isRead: false,
      deduplicationKey: `inspection_completed:${inspection.id}`,
    });

    res.json(updated);
  });

  app.patch("/api/inspections/:id/final-close", requireAdmin, async (req: Request, res: Response) => {
    const { adminNotes } = req.body;

    if (!adminNotes || !adminNotes.trim()) {
      return res.status(400).json({ message: "Admin notes are required for final close" });
    }

    const existing = await storage.getInspection(pid(req.params.id));
    if (!existing) return res.status(404).json({ message: "Not found" });

    if (existing.status !== "closed") {
      return res.status(400).json({ message: "Inspection must be closed before final close" });
    }

    const reports = await storage.getReportsByInspection(pid(req.params.id));
    if (reports.length === 0) {
      return res.status(400).json({ message: "No reports found for this inspection" });
    }

    const inspection = await storage.updateInspection(pid(req.params.id), {
      status: "final_closed",
      adminNotes: adminNotes.trim(),
    });

    let npsSurveyUrl = "";
    const existingSurvey = await storage.getNpsSurveyByInspection(pid(req.params.id));
    if (!existingSurvey) {
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createNpsSurvey({
        inspectionId: pid(req.params.id),
        token,
        expiresAt,
      });
      npsSurveyUrl = `/survey/${token}`;
    } else {
      npsSurveyUrl = `/survey/${existingSurvey.token}`;
    }

    const reportNames = reports.map(r => r.originalName).join(", ");
    // TODO: Send final close email to contacts with NPS survey link

    res.json({ ...inspection, npsSurveyUrl });
  });

  app.patch("/api/inspections/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Inspection not found" });
    if (inspection.status === "final_closed") {
      return res.status(400).json({ message: "Final closed inspections cannot be cancelled" });
    }
    const updated = await storage.updateInspection(inspection.id, { status: "canceled" });
    res.json(updated);
  });

  app.post("/api/inspections/:id/trigger-nps", requireAdmin, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) return res.status(404).json({ message: "Inspection not found" });

    const existing = await storage.getNpsSurveyByInspection(inspection.id);
    if (existing) {
      return res.status(400).json({ message: "NPS survey already triggered for this inspection" });
    }

    const token = randomUUID();
    const survey = await storage.createNpsSurvey({
      inspectionId: inspection.id,
      token,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      triggeredBy: req.session.userId!,
      isManual: true,
    });

    // TODO: Send NPS survey email to inspection contacts

    res.json({ survey, surveyUrl: `/survey/${token}` });
  });

  app.get("/api/inspections/:id/nps-survey", requireAdmin, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByInspection(pid(req.params.id));
    if (!survey) return res.status(404).json({ message: "No NPS survey found" });

    const isActive = new Date(survey.expiresAt) > new Date();
    const fullUrl = `/survey/${survey.token}`;
    res.json({ survey, surveyUrl: fullUrl, isActive });
  });

  app.post("/api/inspections/:id/reactivate-nps", requireAdmin, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByInspection(pid(req.params.id));
    if (!survey) return res.status(404).json({ message: "No NPS survey found" });

    if (survey.completedAt) {
      return res.status(400).json({ message: "Cannot reactivate a completed survey" });
    }

    if (new Date(survey.expiresAt) > new Date()) {
      return res.status(400).json({ message: "Survey is still active" });
    }

    const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await storage.updateNpsSurvey(survey.id, { expiresAt: newExpiresAt });

    const fullUrl = `/survey/${survey.token}`;
    res.json({ survey: { ...survey, expiresAt: newExpiresAt }, surveyUrl: fullUrl, isActive: true });
  });

  app.get("/api/survey/:token", surveyLimiter, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByToken(pid(req.params.token));
    if (!survey) return res.status(404).json({ message: "Survey not found" });

    const inspection = await storage.getInspection(survey.inspectionId);
    if (!inspection) return res.status(404).json({ message: "Inspection not found" });

    const expired = survey.expiresAt < new Date();
    const completed = !!survey.completedAt;

    let serviceMember = null;
    if (inspection.assignedServiceMemberId) {
      const member = await storage.getUser(inspection.assignedServiceMemberId);
      if (member) {
        serviceMember = { id: member.id, name: member.name };
      }
    }

    res.json({
      inspection: {
        companyName: inspection.companyName,
        inspectionDate: inspection.inspectionDate,
        contactPerson1: inspection.contactPerson1,
        contactPerson2: inspection.contactPerson2,
        email1: inspection.email1,
        email2: inspection.email2,
      },
      serviceMember: serviceMember || { id: "", name: "Unknown" },
      expired,
      completed,
    });
  });

  app.post("/api/survey/:token/respond", surveyLimiter, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByToken(pid(req.params.token));
    if (!survey) return res.status(404).json({ message: "Survey not found" });
    if (survey.completedAt) return res.status(400).json({ message: "Survey already completed" });
    if (survey.expiresAt < new Date()) return res.status(400).json({ message: "Survey expired" });

    const parsed = npsResponseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid survey data", errors: parsed.error.flatten() });
    }
    const { reportScore, serviceScore, comment, respondentEmail } = parsed.data;

    const inspection = await storage.getInspection(survey.inspectionId);

    await storage.createNpsResponse({
      surveyId: survey.id,
      inspectionId: survey.inspectionId,
      serviceMemberId: inspection?.assignedServiceMemberId || "",
      reportScore,
      serviceScore: serviceScore ?? null,
      comment: comment || null,
      respondentEmail: respondentEmail || inspection?.email1 || "",
    });

    await storage.updateNpsSurvey(survey.id, { completedAt: new Date() });

    const respondedInspection = await storage.getInspection(survey.inspectionId);
    if (respondedInspection) {
      await notify({
        type: "feedback_received",
        title: "Feedback received",
        message: `A feedback form was submitted for ${respondedInspection.companyName}.`,
        targetUrl: "/analytics",
        relatedInspectionId: respondedInspection.id,
        isRead: false,
        deduplicationKey: `feedback_received:${survey.id}`,
      });
    }

    res.json({ message: "Response recorded" });
  });

  app.get("/api/nps/responses", requireAdmin, async (req: Request, res: Response) => {
    const responses = await storage.getNpsResponses();
    res.json(responses);
  });

  app.post("/api/inspections/:id/reports", requireAuth, upload.single("file"), async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const inspection = await storage.getInspection(pid(req.params.id));
    if (!inspection) {
      return res.status(404).json({ message: "Inspection not found" });
    }

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (inspection.status === "final_closed") {
      return res.status(400).json({ message: "Cannot upload reports for a final closed inspection" });
    }

    if (user.role !== "admin" && inspection.assignedServiceMemberId !== user.id) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }

    // Magic byte validation — verify actual file content matches declared MIME type
    const uploadedFilePath = path.join(uploadsDir, req.file.filename);
    if (!validateMagicBytes(uploadedFilePath, req.file.mimetype)) {
      fs.unlinkSync(uploadedFilePath);
      return res.status(400).json({ message: "File content does not match its declared type." });
    }

    const report = await storage.createInspectionReport({
      inspectionId: pid(req.params.id),
      uploadedById: req.session.userId!,
      fileName: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
    });

    res.status(201).json(report);
  });

  app.get("/api/inspections/:id/reports", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let reports;
    if (user.role === "admin") {
      reports = await storage.getReportsByInspection(pid(req.params.id));
    } else {
      reports = await storage.getReportsByUploader(pid(req.params.id), user.id);
    }
    res.json(reports);
  });

  app.get("/api/reports/:id/download", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const report = await storage.getReport(pid(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (user.role !== "admin" && report.uploadedById !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    // Directory traversal guard — ensure resolved path stays inside uploadsDir
    const filePath = path.resolve(uploadsDir, report.fileName);
    if (!filePath.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return res.status(400).json({ message: "Invalid file path" });
    }
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    const safeFileName = report.originalName.replace(/[^\w\s.\-()]/g, "_");
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName}"`);
    res.setHeader("Content-Type", report.mimeType);
    res.sendFile(filePath);
  });

  app.delete("/api/reports/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const report = await storage.getReport(pid(req.params.id));
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (report.uploadedById !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const inspection = await storage.getInspection(report.inspectionId);
    if (inspection?.status === "final_closed") {
      return res.status(400).json({ message: "Cannot delete reports from a final closed inspection" });
    }

    const filePath = path.resolve(uploadsDir, report.fileName);
    if (!filePath.startsWith(path.resolve(uploadsDir) + path.sep)) {
      return res.status(400).json({ message: "Invalid file path" });
    }
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await storage.deleteReport(report.id);
    res.json({ message: "Report deleted" });
  });

  app.get("/api/notifications", requireAdmin, async (req: Request, res: Response) => {
    const notifs = await storage.getNotifications();
    res.json(notifs);
  });

  app.patch("/api/notifications/read-all", requireAdmin, async (req: Request, res: Response) => {
    await storage.markAllNotificationsRead();
    res.json({ message: "All notifications marked as read" });
  });

  app.patch("/api/notifications/:id/read", requireAdmin, async (req: Request, res: Response) => {
    await storage.markNotificationRead(pid(req.params.id));
    res.json({ message: "Notification marked as read" });
  });

  return httpServer;
}

