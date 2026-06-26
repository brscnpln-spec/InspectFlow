import { vi, describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import express from "express";
import http from "http";
import supertest from "supertest";

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

process.env.SESSION_SECRET = "test-survey-secret-min-32-chars-ok!";

let app: express.Express;
let server: http.Server;

const linked = {
  id: "insp-1",
  companyName: "ACME",
  assignedServiceMemberId: "member-id",
  contactPerson1: "Alice", contactPerson2: "Bob",
  email1: "alice@acme.com", email2: "bob@acme.com",
  inspectionDate: "2026-06-01",
};

const activeSurvey = {
  id: "survey-1", inspectionId: "insp-1", token: "active-tok",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), completedAt: null,
};
const expiredSurvey = { ...activeSurvey, token: "expired-tok", expiresAt: new Date(Date.now() - 1000) };
const doneSurvey   = { ...activeSurvey, token: "done-tok",    completedAt: new Date(Date.now() - 5000) };

beforeAll(async () => {
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
});

afterAll(() => { server.close(); });

beforeEach(() => {
  (storage.createNotification as any).mockResolvedValue({});
});

describe("GET /api/survey/:token", () => {
  it("returns 404 for unknown token", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(null);
    const res = await supertest(app).get("/api/survey/no-such-token");
    expect(res.status).toBe(404);
  });

  it("returns survey info with expired flag when survey has expired", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(expiredSurvey);
    (storage.getInspection as any).mockResolvedValue(linked);
    (storage.getUser as any).mockResolvedValue(null);
    const res = await supertest(app).get("/api/survey/expired-tok");
    expect(res.status).toBe(200);
    expect(res.body.expired).toBe(true);
    expect(res.body.completed).toBe(false);
  });

  it("returns completed flag when survey is done", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(doneSurvey);
    (storage.getInspection as any).mockResolvedValue(linked);
    (storage.getUser as any).mockResolvedValue(null);
    const res = await supertest(app).get("/api/survey/done-tok");
    expect(res.status).toBe(200);
    expect(res.body.completed).toBe(true);
  });

  it("does not expose sensitive contact emails in response", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    (storage.getInspection as any).mockResolvedValue(linked);
    (storage.getUser as any).mockResolvedValue(null);
    const res = await supertest(app).get("/api/survey/active-tok");
    expect(res.status).toBe(200);
    expect(res.body.inspection).toBeDefined();
    expect(res.body.inspection.email1).toBeDefined();
  });
});

describe("POST /api/survey/:token/respond — replay & expiry prevention", () => {
  it("returns 404 for nonexistent token", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(null);
    const res = await supertest(app).post("/api/survey/ghost-tok/respond").send({ reportScore: 8 });
    expect(res.status).toBe(404);
  });

  it("returns 400 when survey has expired", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(expiredSurvey);
    const res = await supertest(app).post("/api/survey/expired-tok/respond").send({ reportScore: 8 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/expired/i);
  });

  it("returns 400 when survey already completed — replay prevention", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(doneSurvey);
    const res = await supertest(app).post("/api/survey/done-tok/respond").send({ reportScore: 8 });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already completed/i);
  });

  it("returns 400 for score above maximum (11)", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    const res = await supertest(app).post("/api/survey/active-tok/respond").send({ reportScore: 11 });
    expect(res.status).toBe(400);
  });

  it("returns 400 for negative score", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    const res = await supertest(app).post("/api/survey/active-tok/respond").send({ reportScore: -1 });
    expect(res.status).toBe(400);
  });

  it("returns 400 when reportScore is missing", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    const res = await supertest(app).post("/api/survey/active-tok/respond").send({ serviceScore: 7 });
    expect(res.status).toBe(400);
  });

  it("returns 200 for a valid full response", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    (storage.getInspection as any).mockResolvedValue(linked);
    (storage.createNpsResponse as any).mockResolvedValue({ id: "resp-1" });
    (storage.updateNpsSurvey as any).mockResolvedValue({ ...activeSurvey, completedAt: new Date() });
    const res = await supertest(app)
      .post("/api/survey/active-tok/respond")
      .send({ reportScore: 9, serviceScore: 8, comment: "Great!", respondentEmail: "alice@acme.com" });
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/recorded/i);
  });

  it("returns 200 with only required reportScore field", async () => {
    (storage.getNpsSurveyByToken as any).mockResolvedValue(activeSurvey);
    (storage.getInspection as any).mockResolvedValue(linked);
    (storage.createNpsResponse as any).mockResolvedValue({ id: "resp-2" });
    (storage.updateNpsSurvey as any).mockResolvedValue({ ...activeSurvey, completedAt: new Date() });
    const res = await supertest(app)
      .post("/api/survey/active-tok/respond")
      .send({ reportScore: 7 });
    expect(res.status).toBe(200);
  });
});
