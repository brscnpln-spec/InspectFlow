import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import http from "http";
import supertest from "supertest";
import { hashPassword } from "../auth";

vi.mock("express-rate-limit", () => ({ default: () => (_r: any, _s: any, n: any) => n() }));
vi.mock("../db", () => ({ pool: {} }));
vi.mock("../db-migrate", () => ({ pushSchema: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../seed", () => ({ seedDatabase: vi.fn().mockResolvedValue(undefined) }));
vi.mock("connect-pg-simple", () => ({
  default: (session: any) => {
    class MockPgStore extends session.Store {
      _s = new Map();
      get(k: string, cb: Function) { cb(null, this._s.get(k) ?? null); }
      set(k: string, v: unknown, cb: Function) { this._s.set(k, v); cb(); }
      destroy(k: string, cb: Function) { this._s.delete(k); cb(); }
      touch(_k: string, _v: unknown, cb: Function) { cb(); }
    }
    return MockPgStore;
  },
}));
vi.mock("../storage", () => ({
  storage: {
    getUser: vi.fn(),
    getUserByUsername: vi.fn(),
    getAllUsers: vi.fn(),
    getServiceMembers: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    getTenants: vi.fn(),
    getTenant: vi.fn(),
    getTenantsByIds: vi.fn(),
    createTenant: vi.fn(),
    updateTenant: vi.fn(),
    deleteTenant: vi.fn(),
    getInspections: vi.fn(),
    getInspection: vi.fn(),
    getInspectionsByServiceMember: vi.fn(),
    getScheduledInspectionsByDate: vi.fn(),
    createInspection: vi.fn(),
    updateInspection: vi.fn(),
    getReportsByInspection: vi.fn(),
    getReportsByUploader: vi.fn(),
    getReport: vi.fn(),
    createInspectionReport: vi.fn(),
    deleteReport: vi.fn(),
    getNpsSurveyByInspection: vi.fn(),
    getNpsSurveyByToken: vi.fn(),
    createNpsSurvey: vi.fn(),
    updateNpsSurvey: vi.fn(),
    createNpsResponse: vi.fn(),
    getNpsResponses: vi.fn(),
    getNotifications: vi.fn(),
    createNotification: vi.fn(),
    markNotificationRead: vi.fn(),
    markAllNotificationsRead: vi.fn(),
    getPendingExpiredAssignments: vi.fn(),
    getOverdueInspections: vi.fn(),
    getExpiredUncompletedSurveys: vi.fn(),
  },
  toSafeUser: (u: any) => ({ id: u.id, username: u.username, name: u.name, role: u.role, assignedAdminId: u.assignedAdminId ?? null }),
}));

import { registerRoutes } from "../routes";
import { storage } from "../storage";

process.env.SESSION_SECRET = "test-flow-secret-min-32-chars-ok!!!";

const TEST_PASSWORD = "TestPass1!secure";
let adminUser: any;
let memberUser: any;
let app: express.Express;
let server: http.Server;
let adminAgent: ReturnType<typeof supertest.agent>;
let memberAgent: ReturnType<typeof supertest.agent>;
let adminCsrf: string;
let memberCsrf: string;

const pendingInspection = {
  id: "insp-1",
  companyName: "ACME",
  assignedServiceMemberId: "member-id",
  assignmentStatus: "pending",
  assignmentExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  status: "scheduled",
  inspectionDate: "2026-07-01",
};

beforeAll(async () => {
  const hash = await hashPassword(TEST_PASSWORD);
  adminUser = { id: "admin-id", username: "admin", name: "Admin", role: "admin", password: hash, assignedAdminId: null, email: "admin@test.com" };
  memberUser = { id: "member-id", username: "member", name: "Member", role: "service_member", password: hash, assignedAdminId: "admin-id", email: "member@test.com" };

  (storage.getPendingExpiredAssignments as any).mockResolvedValue([]);
  (storage.getOverdueInspections as any).mockResolvedValue([]);
  (storage.getExpiredUncompletedSurveys as any).mockResolvedValue([]);
  (storage.getScheduledInspectionsByDate as any).mockResolvedValue([]);
  (storage.createNotification as any).mockResolvedValue({});

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  server = http.createServer(app);
  await registerRoutes(server, app);

  (storage.getUserByUsername as any).mockResolvedValue(adminUser);
  adminAgent = supertest.agent(app);
  const r1 = await adminAgent.post("/api/auth/login").send({ username: "admin", password: TEST_PASSWORD });
  adminCsrf = r1.headers["x-csrf-token"];

  (storage.getUserByUsername as any).mockResolvedValue(memberUser);
  memberAgent = supertest.agent(app);
  const r2 = await memberAgent.post("/api/auth/login").send({ username: "member", password: TEST_PASSWORD });
  memberCsrf = r2.headers["x-csrf-token"];
});

afterAll(() => { server.close(); });

beforeEach(() => {
  (storage.createNotification as any).mockResolvedValue({});
  (storage.getPendingExpiredAssignments as any).mockResolvedValue([]);
  (storage.getOverdueInspections as any).mockResolvedValue([]);
  (storage.getExpiredUncompletedSurveys as any).mockResolvedValue([]);
  (storage.getScheduledInspectionsByDate as any).mockResolvedValue([]);
});

describe("PATCH /api/inspections/:id/accept-assignment", () => {
  it("returns 403 when member is not the assigned person", async () => {
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, assignedServiceMemberId: "other-member" });
    const res = await memberAgent.patch("/api/inspections/insp-1/accept-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/not assigned/i);
  });

  it("returns 400 when assignment is not pending", async () => {
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, assignmentStatus: "accepted" });
    const res = await memberAgent.patch("/api/inspections/insp-1/accept-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not pending/i);
  });

  it("returns 400 when assignment has expired", async () => {
    (storage.getInspection as any).mockResolvedValue({
      ...pendingInspection,
      assignmentExpiresAt: new Date(Date.now() - 1000),
    });
    const res = await memberAgent.patch("/api/inspections/insp-1/accept-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("returns 200 on successful accept", async () => {
    (storage.getInspection as any).mockResolvedValue(pendingInspection);
    (storage.updateInspection as any).mockResolvedValue({ ...pendingInspection, assignmentStatus: "accepted" });
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.patch("/api/inspections/insp-1/accept-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(200);
    expect(res.body.assignmentStatus).toBe("accepted");
  });
});

describe("PATCH /api/inspections/:id/reject-assignment", () => {
  it("returns 403 when member is not the assigned person", async () => {
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, assignedServiceMemberId: "other-member" });
    const res = await memberAgent.patch("/api/inspections/insp-1/reject-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(403);
  });

  it("returns 400 when assignment is not pending", async () => {
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, assignmentStatus: "accepted" });
    const res = await memberAgent.patch("/api/inspections/insp-1/reject-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(400);
  });

  it("returns 200 and resets inspection on reject", async () => {
    (storage.getInspection as any).mockResolvedValue(pendingInspection);
    (storage.updateInspection as any).mockResolvedValue({ ...pendingInspection, assignmentStatus: "rejected", status: "new" });
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.patch("/api/inspections/insp-1/reject-assignment").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(200);
    expect(res.body.assignmentStatus).toBe("rejected");
  });
});

describe("PATCH /api/inspections/:id/close", () => {
  it("returns 403 when member is not assigned to this inspection", async () => {
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, assignedServiceMemberId: "other-id" });
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.patch("/api/inspections/insp-1/close").set("X-CSRF-Token", memberCsrf).send({});
    expect(res.status).toBe(403);
  });

  it("returns 400 when no report has been uploaded", async () => {
    (storage.getInspection as any).mockResolvedValue(pendingInspection);
    (storage.getUser as any).mockResolvedValue(memberUser);
    (storage.getReportsByInspection as any).mockResolvedValue([]);
    const res = await memberAgent.patch("/api/inspections/insp-1/close").set("X-CSRF-Token", memberCsrf).send({ completionNotes: "Done" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/report/i);
  });

  it("returns 200 when report exists and member is assigned", async () => {
    (storage.getInspection as any).mockResolvedValue(pendingInspection);
    (storage.getUser as any).mockResolvedValue(memberUser);
    (storage.getReportsByInspection as any).mockResolvedValue([{ id: "r1", fileName: "report.pdf" }]);
    (storage.updateInspection as any).mockResolvedValue({ ...pendingInspection, status: "closed" });
    const res = await memberAgent.patch("/api/inspections/insp-1/close").set("X-CSRF-Token", memberCsrf).send({ completionNotes: "Done" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("closed");
  });
});

describe("PATCH /api/inspections/:id/final-close", () => {
  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.patch("/api/inspections/insp-1/final-close").set("X-CSRF-Token", memberCsrf).send({ adminNotes: "OK" });
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin notes are missing or blank", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    const res = await adminAgent.patch("/api/inspections/insp-1/final-close").set("X-CSRF-Token", adminCsrf).send({ adminNotes: "  " });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/notes/i);
  });

  it("returns 400 when inspection is not in closed status", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, status: "scheduled" });
    const res = await adminAgent.patch("/api/inspections/insp-1/final-close").set("X-CSRF-Token", adminCsrf).send({ adminNotes: "All good" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/must be closed/i);
  });

  it("returns 400 when no reports exist", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, status: "closed" });
    (storage.getReportsByInspection as any).mockResolvedValue([]);
    const res = await adminAgent.patch("/api/inspections/insp-1/final-close").set("X-CSRF-Token", adminCsrf).send({ adminNotes: "All good" });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/no reports/i);
  });

  it("returns 200 and creates NPS survey token", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, status: "closed" });
    (storage.getReportsByInspection as any).mockResolvedValue([{ id: "r1", originalName: "report.pdf" }]);
    (storage.updateInspection as any).mockResolvedValue({ ...pendingInspection, status: "final_closed" });
    (storage.getNpsSurveyByInspection as any).mockResolvedValue(null);
    (storage.createNpsSurvey as any).mockResolvedValue({ id: "s1", token: "tok-abc" });
    const res = await adminAgent.patch("/api/inspections/insp-1/final-close").set("X-CSRF-Token", adminCsrf).send({ adminNotes: "All good" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("final_closed");
    expect(res.body.npsSurveyUrl).toContain("/survey/");
  });
});

describe("PATCH /api/inspections/:id — final_closed lock", () => {
  it("returns 400 when attempting to edit a final_closed inspection", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, status: "final_closed" });
    const res = await adminAgent
      .patch("/api/inspections/insp-1")
      .set("X-CSRF-Token", adminCsrf)
      .send({ notes: "change", isEmergency: false });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/final closed/i);
  });
});

describe("PATCH /api/inspections/:id/assign", () => {
  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.patch("/api/inspections/insp-1/assign").set("X-CSRF-Token", memberCsrf).send({
      assignedServiceMemberId: "member-id", inspectionDate: "2026-07-01",
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when required fields are missing", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    const res = await adminAgent.patch("/api/inspections/insp-1/assign").set("X-CSRF-Token", adminCsrf).send({});
    expect(res.status).toBe(400);
  });

  it("returns 200 when admin assigns a service member", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspection as any).mockResolvedValue({ ...pendingInspection, status: "new", isEmergency: false });
    (storage.updateInspection as any).mockResolvedValue({ ...pendingInspection, status: "scheduled", assignmentStatus: "pending" });
    const res = await adminAgent.patch("/api/inspections/insp-1/assign").set("X-CSRF-Token", adminCsrf).send({
      assignedServiceMemberId: "member-id", inspectionDate: "2026-07-01",
    });
    expect(res.status).toBe(200);
    expect(res.body.assignmentStatus).toBe("pending");
  });
});
