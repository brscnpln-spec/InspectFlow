import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import { storage } from "./storage";
import { comparePasswords } from "./auth";
import { seedDatabase } from "./seed";
import { randomUUID } from "crypto";
import connectPgSimple from "connect-pg-simple";
import { pool } from "./db";
import { z } from "zod";
import { loginSchema } from "@shared/schema";

const createInspectionSchema = z.object({
  companyName: z.string().min(1),
  contactPerson1: z.string().min(1),
  contactPerson2: z.string().optional().nullable(),
  phone1: z.string().min(1),
  phone2: z.string().optional().nullable(),
  email1: z.string().email(),
  email2: z.string().email().optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
  isEmergency: z.boolean().optional().default(false),
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
  respondentEmail: z.string().email(),
  serviceMemberId: z.string().optional(),
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

  app.get("/api/users/:id", requireAuth, async (req: Request, res: Response) => {
    const user = await storage.getUser(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
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
    res.json(inspection);
  });

  app.post("/api/inspections", requireAdmin, async (req: Request, res: Response) => {
    const parsed = createInspectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid data", errors: parsed.error.flatten() });
    }
    const data = parsed.data;
    const user = await storage.getUser(req.session.userId!);
    const status = data.assignedServiceMemberId && data.inspectionDate ? "scheduled" : "new";

    const inspection = await storage.createInspection({
      companyName: data.companyName,
      contactPerson1: data.contactPerson1,
      contactPerson2: data.contactPerson2 || null,
      phone1: data.phone1,
      phone2: data.phone2 || null,
      email1: data.email1,
      email2: data.email2 || null,
      notes: data.notes || null,
      status,
      assignedServiceMemberId: data.assignedServiceMemberId || null,
      assignedByAdminId: user!.id,
      inspectionDate: data.inspectionDate || null,
      inspectionTime: data.inspectionTime || null,
      isEmergency: data.isEmergency,
      recurringDays: data.recurringDays || null,
    });

    res.status(201).json(inspection);
  });

  app.patch("/api/inspections/:id/assign", requireAdmin, async (req: Request, res: Response) => {
    const parsed = assignSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Service member and date are required" });
    }
    const { assignedServiceMemberId, inspectionDate, inspectionTime } = parsed.data;

    const inspection = await storage.updateInspection(req.params.id, {
      assignedServiceMemberId,
      inspectionDate,
      inspectionTime: inspectionTime || null,
      assignedByAdminId: req.session.userId!,
      status: "scheduled",
    });

    res.json(inspection);
  });

  app.patch("/api/inspections/:id/close", requireAuth, async (req: Request, res: Response) => {
    const { completionNotes } = req.body;
    const inspection = await storage.updateInspection(req.params.id, {
      status: "closed",
      completionNotes: completionNotes || null,
    });
    res.json(inspection);
  });

  app.patch("/api/inspections/:id/final-close", requireAdmin, async (req: Request, res: Response) => {
    const { adminNotes } = req.body;
    const inspection = await storage.updateInspection(req.params.id, {
      status: "final_closed",
      adminNotes: adminNotes || null,
    });
    res.json(inspection);
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

    res.json({ survey, surveyUrl: `/survey/${token}` });
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

    const allMembers = await storage.getServiceMembers();
    const serviceMembers = allMembers.map((m) => ({ id: m.id, name: m.name }));

    res.json({
      inspection: {
        companyName: inspection.companyName,
        inspectionDate: inspection.inspectionDate,
        contactPerson1: inspection.contactPerson1,
      },
      serviceMember: serviceMember || { id: "", name: "Unknown" },
      serviceMembers,
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
    const { reportScore, serviceScore, comment, respondentEmail, serviceMemberId } = parsed.data;

    const inspection = await storage.getInspection(survey.inspectionId);

    await storage.createNpsResponse({
      surveyId: survey.id,
      inspectionId: survey.inspectionId,
      serviceMemberId: serviceMemberId || inspection?.assignedServiceMemberId || "",
      reportScore,
      serviceScore: serviceScore ?? null,
      comment: comment || null,
      respondentEmail,
    });

    await storage.updateNpsSurvey(survey.id, { completedAt: new Date() });

    res.json({ message: "Response recorded" });
  });

  app.get("/api/nps/responses", requireAdmin, async (req: Request, res: Response) => {
    const responses = await storage.getNpsResponses();
    res.json(responses);
  });

  return httpServer;
}

async function pushSchema() {
  const { execSync } = await import("child_process");
  try {
    execSync("npm run db:push --force", { stdio: "pipe" });
    console.log("Database schema pushed successfully");
  } catch (e: any) {
    console.error("Schema push failed, trying force:", e.message);
    try {
      execSync("npx drizzle-kit push --force", { stdio: "pipe" });
      console.log("Database schema pushed with force");
    } catch (e2: any) {
      console.error("Force push also failed:", e2.message);
    }
  }
}
