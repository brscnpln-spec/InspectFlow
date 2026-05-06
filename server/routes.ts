import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { comparePasswords, hashPassword } from "./auth";
import { seedDatabase } from "./seed";
import { randomUUID } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { z } from "zod";
import { loginSchema, type InspectionRequest } from "@shared/schema";

const uploadsDir = path.join("/tmp", "inspection-uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
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
  comment: z.string().optional().nullable(),
  respondentEmail: z.string().optional().nullable(),
});

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function requireAuth(req: Request, res: Response, next: Function) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

async function requireAdmin(req: Request, res: Response, next: Function) {
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

  app.use(
    session({
      store: new PgStore({
        pool: pool,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "inspectflow-secret-key",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: false,
        sameSite: "lax",
      },
    })
  );

  await pushSchema();
  await seedDatabase();

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
      }
    } catch (e) {
      console.error("Error checking expired assignments:", e);
    }
  }, 60 * 1000);

  app.post("/api/auth/login", async (req: Request, res: Response) => {
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
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/auth/me", async (req: Request, res: Response) => {
    if (!req.session.userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.json({ message: "Logged out" });
    });
  });

  app.get("/api/users/service-members", requireAuth, async (req: Request, res: Response) => {
    const members = await storage.getServiceMembers();
    res.json(members.map(({ password: _, ...m }) => m));
  });

  app.get("/api/users", requireAdmin, async (req: Request, res: Response) => {
    const allUsers = await storage.getAllUsers();
    res.json(allUsers.map(({ password: _, ...u }) => u));
  });

  app.get("/api/users/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  const createUserSchema = z.object({
    username: z.string().min(1, "Username is required").max(50),
    password: z.string().min(6, "Password must be at least 6 characters"),
    name: z.string().min(1, "Name is required").max(100),
    email: z.string().email("Invalid email address"),
    role: z.enum(["admin", "service_member"]),
    assignedAdminId: z.string().nullable().optional(),
  });

  const updateUserSchema = z.object({
    username: z.string().min(1).max(50).optional(),
    password: z.string().min(6).optional(),
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
    const { password: _, ...safeUser } = user;
    res.status(201).json(safeUser);
  });

  app.patch("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const existingUser = await storage.getUser(req.params.id as string);
    if (!existingUser) return res.status(404).json({ message: "User not found" });

    const { username, password, name, email, role, assignedAdminId } = parsed.data;

    if (username && username !== existingUser.username) {
      const dup = await storage.getUserByUsername(username);
      if (dup) return res.status(400).json({ message: "Username already exists" });
    }

    const updateData: any = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (role) updateData.role = role;
    if (username) updateData.username = username;
    if (assignedAdminId !== undefined) updateData.assignedAdminId = assignedAdminId || null;
    if (password) updateData.password = await hashPassword(password);

    const user = await storage.updateUser(req.params.id as string, updateData);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.delete("/api/users/:id", requireAdmin, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.params.id as string);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.id === req.session.userId) {
      return res.status(400).json({ message: "Cannot delete yourself" });
    }

    await storage.deleteUser(req.params.id as string);
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
    const tenantIds = [...new Set(inspections.map(i => i.tenantId).filter(Boolean) as string[])];
    return res.json(await storage.getTenantsByIds(tenantIds));
  });

  app.get("/api/tenants/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const tenant = await storage.getTenant(req.params.id);
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
    res.status(201).json(tenant);
  });

  app.patch("/api/tenants/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const existing = await storage.getTenant(req.params.id);
    if (!existing) return res.status(404).json({ message: "Tenant not found" });

    if (user.role !== "admin") {
      const inspections = await storage.getInspectionsByServiceMember(user.id);
      const allowed = inspections.some(i => i.tenantId === existing.id);
      if (!allowed) return res.status(403).json({ message: "Access denied" });
    }

    const parsed = tenantSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: parsed.error.errors[0].message });
    }
    const tenant = await storage.updateTenant(req.params.id, parsed.data);
    res.json(tenant);
  });

  app.delete("/api/tenants/:id", requireAdmin, async (req: Request, res: Response) => {
    const tenant = await storage.getTenant(req.params.id);
    if (!tenant) return res.status(404).json({ message: "Tenant not found" });
    await storage.deleteTenant(req.params.id);
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
    const inspection = await storage.getInspection(req.params.id);
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

    let assignmentStatus: string | null = null;
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

    const existing = await storage.getInspection(req.params.id);
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

    const inspection = await storage.updateInspection(req.params.id, updateData);

    if (serviceMemberChanged && data.assignedServiceMemberId) {
      const newMember = await storage.getUser(data.assignedServiceMemberId);
      if (newMember) {
        console.log(`[EMAIL NOTIFICATION] New assignment for ${newMember.name} (${newMember.email}): Inspection ${existing.companyName} has been assigned to you.`);
      }
    }

    res.json(inspection);
  });

  app.patch("/api/inspections/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Service member and date are required" });
    }
    const { assignedServiceMemberId, inspectionDate, inspectionTime } = parsed.data;

    const existingInspection = await storage.getInspection(req.params.id);
    if (!existingInspection) return res.status(404).json({ message: "Not found" });

    const isEmergency = existingInspection.isEmergency;
    const expiryHours = isEmergency ? 12 : 24;
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);

    const inspection = await storage.updateInspection(req.params.id, {
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
    const inspection = await storage.getInspection(req.params.id);
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

    const updated = await storage.updateInspection(req.params.id, {
      assignmentStatus: "accepted",
      assignmentRespondedAt: new Date(),
    });

    res.json(updated);
  });

  app.patch("/api/inspections/:id/reject-assignment", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(req.params.id);
    if (!inspection) return res.status(404).json({ message: "Not found" });

    if (inspection.assignedServiceMemberId !== req.session.userId) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }
    if (inspection.assignmentStatus !== "pending") {
      return res.status(400).json({ message: "Assignment is not pending" });
    }

    const updated = await storage.updateInspection(req.params.id, {
      assignmentStatus: "rejected",
      assignmentRespondedAt: new Date(),
      status: "new",
      assignedServiceMemberId: null,
      inspectionDate: null,
      inspectionTime: null,
    });

    res.json(updated);
  });

  app.patch("/api/inspections/:id/close", requireAuth, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(req.params.id);
    if (!inspection) return res.status(404).json({ message: "Not found" });

    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    if (user.role !== "admin" && inspection.assignedServiceMemberId !== user.id) {
      return res.status(403).json({ message: "You are not assigned to this inspection" });
    }

    const reports = await storage.getReportsByInspection(req.params.id);
    if (reports.length === 0) {
      return res.status(400).json({ message: "An inspection report file must be uploaded before closing" });
    }

    const { completionNotes } = req.body;
    const updated = await storage.updateInspection(req.params.id, {
      status: "closed",
      completionNotes: completionNotes || null,
    });
    res.json(updated);
  });

  app.patch("/api/inspections/:id/final-close", requireAdmin, async (req: Request, res: Response) => {
    const { adminNotes } = req.body;

    if (!adminNotes || !adminNotes.trim()) {
      return res.status(400).json({ message: "Admin notes are required for final close" });
    }

    const existing = await storage.getInspection(req.params.id);
    if (!existing) return res.status(404).json({ message: "Not found" });

    if (existing.status !== "closed") {
      return res.status(400).json({ message: "Inspection must be closed before final close" });
    }

    const reports = await storage.getReportsByInspection(req.params.id);
    if (reports.length === 0) {
      return res.status(400).json({ message: "No reports found for this inspection" });
    }

    const inspection = await storage.updateInspection(req.params.id, {
      status: "final_closed",
      adminNotes: adminNotes.trim(),
    });

    let npsSurveyUrl = "";
    const existingSurvey = await storage.getNpsSurveyByInspection(req.params.id);
    if (!existingSurvey) {
      const token = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await storage.createNpsSurvey({
        inspectionId: req.params.id,
        token,
        expiresAt,
      });
      npsSurveyUrl = `/survey/${token}`;
    } else {
      npsSurveyUrl = `/survey/${existingSurvey.token}`;
    }

    const reportNames = reports.map(r => r.originalName).join(", ");
    console.log(`[EMAIL NOTIFICATION] Final Close - To: ${existing.email1}${existing.email2 ? `, ${existing.email2}` : ""}`);
    console.log(`  Company: ${existing.companyName}`);
    console.log(`  Inspection Date: ${existing.inspectionDate} ${existing.inspectionTime || ""}`);
    console.log(`  Service Member: ${existing.assignedServiceMemberId}`);
    console.log(`  Reports: ${reportNames}`);
    console.log(`  Admin Notes: ${adminNotes.trim()}`);
    console.log(`  NPS Survey: ${npsSurveyUrl}`);

    res.json({ ...inspection, npsSurveyUrl });
  });

  app.patch("/api/inspections/:id/cancel", requireAdmin, async (req: Request, res: Response) => {
    const inspection = await storage.updateInspection(req.params.id, {
      status: "canceled",
    });
    res.json(inspection);
  });

  app.post("/api/inspections/:id/trigger-nps", requireAdmin, async (req: Request, res: Response) => {
    const inspection = await storage.getInspection(req.params.id);
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

    console.log(`[EMAIL NOTIFICATION] NPS Survey - To: ${inspection.email1}, ${inspection.email2}`);
    console.log(`  Company: ${inspection.companyName}`);
    console.log(`  Contacts: ${inspection.contactPerson1}, ${inspection.contactPerson2}`);
    console.log(`  NPS Survey: /survey/${token}`);

    res.json({ survey, surveyUrl: `/survey/${token}` });
  });

  app.get("/api/inspections/:id/nps-survey", requireAdmin, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByInspection(req.params.id);
    if (!survey) return res.status(404).json({ message: "No NPS survey found" });

    const isActive = new Date(survey.expiresAt) > new Date();
    const fullUrl = `/survey/${survey.token}`;
    res.json({ survey, surveyUrl: fullUrl, isActive });
  });

  app.post("/api/inspections/:id/reactivate-nps", requireAdmin, async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByInspection(req.params.id);
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
    console.log(`[NPS REACTIVATED] Inspection: ${req.params.id}, New Expiry: ${newExpiresAt.toISOString()}`);
    res.json({ survey: { ...survey, expiresAt: newExpiresAt }, surveyUrl: fullUrl, isActive: true });
  });

  app.get("/api/survey/:token", async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByToken(req.params.token);
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

  app.post("/api/survey/:token/respond", async (req: Request, res: Response) => {
    const survey = await storage.getNpsSurveyByToken(req.params.token);
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

    const inspection = await storage.getInspection(req.params.id);
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

    const report = await storage.createInspectionReport({
      inspectionId: req.params.id,
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
      reports = await storage.getReportsByInspection(req.params.id);
    } else {
      reports = await storage.getReportsByUploader(req.params.id, user.id);
    }
    res.json(reports);
  });

  app.get("/api/reports/:id/download", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const report = await storage.getReport(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (user.role !== "admin" && report.uploadedById !== user.id) {
      return res.status(403).json({ message: "Access denied" });
    }

    const filePath = path.join(uploadsDir, report.fileName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "File not found on server" });
    }

    res.setHeader("Content-Disposition", `attachment; filename="${report.originalName}"`);
    res.setHeader("Content-Type", report.mimeType);
    res.sendFile(filePath);
  });

  app.delete("/api/reports/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.session.userId!);
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    const report = await storage.getReport(req.params.id);
    if (!report) return res.status(404).json({ message: "Report not found" });

    if (report.uploadedById !== user.id && user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }

    const inspection = await storage.getInspection(report.inspectionId);
    if (inspection?.status === "final_closed") {
      return res.status(400).json({ message: "Cannot delete reports from a final closed inspection" });
    }

    const filePath = path.join(uploadsDir, report.fileName);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await storage.deleteReport(report.id);
    res.json({ message: "Report deleted" });
  });

  return httpServer;
}

async function pushSchema() {
  const { pool: dbPool } = await import("./db");
  try {
    const tableCheck = await dbPool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'inspection_requests', 'nps_surveys', 'nps_responses', 'inspection_reports')
    `);
    const existingTables = tableCheck.rows.map((r: any) => r.table_name);

    if (!existingTables.includes("users")) {
      await dbPool.query(`
        CREATE TYPE IF NOT EXISTS user_role AS ENUM ('admin', 'service_member');
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          username TEXT NOT NULL UNIQUE,
          password TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          role user_role NOT NULL DEFAULT 'service_member',
          assigned_admin_id VARCHAR
        );
      `);
    }

    if (!existingTables.includes("inspection_requests")) {
      await dbPool.query(`
        CREATE TYPE IF NOT EXISTS inspection_status AS ENUM ('new', 'scheduled', 'closed', 'final_closed', 'canceled');
        CREATE TABLE IF NOT EXISTS inspection_requests (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          company_name TEXT NOT NULL,
          contact_person_1 TEXT NOT NULL,
          contact_person_2 TEXT,
          phone_1 TEXT NOT NULL,
          phone_2 TEXT,
          email_1 TEXT NOT NULL,
          email_2 TEXT,
          notes TEXT,
          status inspection_status NOT NULL DEFAULT 'new',
          assigned_service_member_id VARCHAR,
          assigned_by_admin_id VARCHAR,
          inspection_date TEXT,
          inspection_time TEXT,
          report_url TEXT,
          completion_notes TEXT,
          admin_notes TEXT,
          is_emergency BOOLEAN DEFAULT false,
          recurring_days INTEGER,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    if (!existingTables.includes("nps_surveys")) {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS nps_surveys (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          inspection_id VARCHAR NOT NULL,
          token TEXT NOT NULL UNIQUE,
          sent_at TIMESTAMP DEFAULT NOW(),
          completed_at TIMESTAMP,
          expires_at TIMESTAMP NOT NULL,
          triggered_by VARCHAR,
          is_manual BOOLEAN DEFAULT false
        );
      `);
    }

    if (!existingTables.includes("nps_responses")) {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS nps_responses (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          survey_id VARCHAR NOT NULL,
          inspection_id VARCHAR NOT NULL,
          service_member_id VARCHAR NOT NULL,
          report_score INTEGER NOT NULL,
          service_score INTEGER,
          comment TEXT,
          respondent_email TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    if (!existingTables.includes("inspection_reports")) {
      await dbPool.query(`
        CREATE TABLE IF NOT EXISTS inspection_reports (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          inspection_id VARCHAR NOT NULL,
          uploaded_by_id VARCHAR NOT NULL,
          file_name TEXT NOT NULL,
          original_name TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          file_size INTEGER NOT NULL,
          uploaded_at TIMESTAMP DEFAULT NOW()
        );
      `);
    }

    await dbPool.query(`
      DO $$ BEGIN
        CREATE TYPE assignment_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await dbPool.query(`
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_status assignment_status;
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_expires_at TIMESTAMP;
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS assignment_responded_at TIMESTAMP;
    `);

    await dbPool.query(`
      UPDATE inspection_requests
      SET assignment_status = 'accepted'
      WHERE assigned_service_member_id IS NOT NULL
        AND assignment_status IS NULL
        AND status IN ('scheduled', 'closed', 'final_closed');
    `);

    await dbPool.query(`
      CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        company_name TEXT NOT NULL,
        klx TEXT NOT NULL DEFAULT '',
        kl_customer_number TEXT NOT NULL DEFAULT '',
        contact_person_1 TEXT NOT NULL,
        phone_1 TEXT NOT NULL,
        email_1 TEXT NOT NULL,
        contact_person_2 TEXT NOT NULL DEFAULT '',
        phone_2 TEXT NOT NULL DEFAULT '',
        email_2 TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await dbPool.query(`
      ALTER TABLE inspection_requests ADD COLUMN IF NOT EXISTS tenant_id VARCHAR;
    `);

    console.log("Database schema verified successfully");
  } catch (e: any) {
    console.error("Schema verification error:", e.message);
  }
}
