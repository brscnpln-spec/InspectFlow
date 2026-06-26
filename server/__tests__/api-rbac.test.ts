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

process.env.SESSION_SECRET = "test-rbac-secret-min-32-chars-ok!!";

const TEST_PASSWORD = "TestPass1!secure";
let adminUser: any;
let memberUser: any;
let app: express.Express;
let server: http.Server;
let adminAgent: ReturnType<typeof supertest.agent>;
let memberAgent: ReturnType<typeof supertest.agent>;
let adminCsrf: string;
let memberCsrf: string;

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
  (storage.getPendingExpiredAssignments as any).mockResolvedValue([]);
  (storage.getOverdueInspections as any).mockResolvedValue([]);
  (storage.getExpiredUncompletedSurveys as any).mockResolvedValue([]);
  (storage.getScheduledInspectionsByDate as any).mockResolvedValue([]);
  (storage.createNotification as any).mockResolvedValue({});
});

describe("GET /api/users", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await supertest(app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.get("/api/users");
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getAllUsers as any).mockResolvedValue([adminUser, memberUser]);
    const res = await adminAgent.get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("admin response does not include passwords", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getAllUsers as any).mockResolvedValue([adminUser]);
    const res = await adminAgent.get("/api/users");
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty("password");
  });
});

describe("GET /api/users/:id — profile isolation", () => {
  it("member cannot view another member's profile", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.get("/api/users/other-member-id");
    expect(res.status).toBe(403);
  });

  it("member can view their own profile", async () => {
    (storage.getUser as any).mockResolvedValueOnce(memberUser).mockResolvedValueOnce(memberUser);
    const res = await memberAgent.get(`/api/users/${memberUser.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(memberUser.id);
  });

  it("admin can view any user profile", async () => {
    (storage.getUser as any).mockResolvedValueOnce(adminUser).mockResolvedValueOnce(memberUser);
    const res = await adminAgent.get(`/api/users/${memberUser.id}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 when user does not exist", async () => {
    (storage.getUser as any).mockResolvedValueOnce(adminUser).mockResolvedValueOnce(null);
    const res = await adminAgent.get("/api/users/no-such-user");
    expect(res.status).toBe(404);
  });
});

describe("POST /api/users", () => {
  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.post("/api/users").set("X-CSRF-Token", memberCsrf).send({
      username: "newuser", password: "TestPass1!secure", name: "New", email: "new@test.com", role: "service_member",
    });
    expect(res.status).toBe(403);
  });

  it("returns 400 when username already exists", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getUserByUsername as any).mockResolvedValue(memberUser);
    const res = await adminAgent.post("/api/users").set("X-CSRF-Token", adminCsrf).send({
      username: "member", password: "TestPass1!secure", name: "Dup", email: "dup@test.com", role: "service_member",
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already exists/i);
  });

  it("returns 400 for weak password", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    const res = await adminAgent.post("/api/users").set("X-CSRF-Token", adminCsrf).send({
      username: "weakpw", password: "weak", name: "Weak", email: "weak@test.com", role: "service_member",
    });
    expect(res.status).toBe(400);
  });

  it("admin can create a new user", async () => {
    const newUser = { ...memberUser, id: "new-id", username: "brandnew" };
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getUserByUsername as any).mockResolvedValue(null);
    (storage.createUser as any).mockResolvedValue(newUser);
    const res = await adminAgent.post("/api/users").set("X-CSRF-Token", adminCsrf).send({
      username: "brandnew", password: "TestPass1!secure", name: "Brand New", email: "new@test.com", role: "service_member",
    });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe("brandnew");
    expect(res.body).not.toHaveProperty("password");
  });
});

describe("DELETE /api/users/:id", () => {
  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.delete("/api/users/some-id").set("X-CSRF-Token", memberCsrf);
    expect(res.status).toBe(403);
  });

  it("returns 400 when admin tries to delete themselves", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    const res = await adminAgent.delete(`/api/users/${adminUser.id}`).set("X-CSRF-Token", adminCsrf);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/yourself/i);
  });

  it("admin can delete another user", async () => {
    (storage.getUser as any).mockResolvedValueOnce(adminUser).mockResolvedValueOnce(memberUser);
    (storage.deleteUser as any).mockResolvedValue(undefined);
    const res = await adminAgent.delete(`/api/users/${memberUser.id}`).set("X-CSRF-Token", adminCsrf);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/tenants", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await supertest(app).get("/api/tenants");
    expect(res.status).toBe(401);
  });

  it("admin receives all tenants", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getTenants as any).mockResolvedValue([{ id: "t1", companyName: "ACME" }]);
    const res = await adminAgent.get("/api/tenants");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("service member receives only their tenants", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    (storage.getInspectionsByServiceMember as any).mockResolvedValue([{ tenantId: "t1" }]);
    (storage.getTenantsByIds as any).mockResolvedValue([{ id: "t1", companyName: "ACME" }]);
    const res = await memberAgent.get("/api/tenants");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("POST /api/tenants", () => {
  const tenantBody = {
    companyName: "ACME Corp", klx: "KLX-001", klCustomerNumber: "CUST-001",
    contactPerson1: "Alice", phone1: "+1-555-0001", email1: "alice@acme.com",
    contactPerson2: "Bob",   phone2: "+1-555-0002", email2: "bob@acme.com",
  };

  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.post("/api/tenants").set("X-CSRF-Token", memberCsrf).send(tenantBody);
    expect(res.status).toBe(403);
  });

  it("admin can create a tenant", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.createTenant as any).mockResolvedValue({ id: "t-new", ...tenantBody });
    const res = await adminAgent.post("/api/tenants").set("X-CSRF-Token", adminCsrf).send(tenantBody);
    expect(res.status).toBe(201);
    expect(res.body.companyName).toBe("ACME Corp");
  });
});

describe("GET /api/inspections", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await supertest(app).get("/api/inspections");
    expect(res.status).toBe(401);
  });

  it("admin receives all inspections", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getInspections as any).mockResolvedValue([{ id: "i1" }, { id: "i2" }]);
    const res = await adminAgent.get("/api/inspections");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("service member receives only assigned inspections", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    (storage.getInspectionsByServiceMember as any).mockResolvedValue([{ id: "i1" }]);
    const res = await memberAgent.get("/api/inspections");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("GET /api/inspections/:id — access control", () => {
  it("member cannot access inspection assigned to someone else", async () => {
    (storage.getInspection as any).mockResolvedValue({ id: "i-other", assignedServiceMemberId: "other-member" });
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.get("/api/inspections/i-other");
    expect(res.status).toBe(403);
  });

  it("member can access their own assigned inspection", async () => {
    (storage.getInspection as any).mockResolvedValue({ id: "i-mine", assignedServiceMemberId: memberUser.id });
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.get("/api/inspections/i-mine");
    expect(res.status).toBe(200);
  });

  it("admin can access any inspection", async () => {
    (storage.getInspection as any).mockResolvedValue({ id: "i-any", assignedServiceMemberId: memberUser.id });
    (storage.getUser as any).mockResolvedValue(adminUser);
    const res = await adminAgent.get("/api/inspections/i-any");
    expect(res.status).toBe(200);
  });

  it("returns 404 for nonexistent inspection", async () => {
    (storage.getInspection as any).mockResolvedValue(null);
    const res = await adminAgent.get("/api/inspections/does-not-exist");
    expect(res.status).toBe(404);
  });
});

describe("GET /api/notifications", () => {
  it("returns 401 when unauthenticated", async () => {
    const res = await supertest(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });

  it("returns 403 for service member", async () => {
    (storage.getUser as any).mockResolvedValue(memberUser);
    const res = await memberAgent.get("/api/notifications");
    expect(res.status).toBe(403);
  });

  it("returns 200 for admin", async () => {
    (storage.getUser as any).mockResolvedValue(adminUser);
    (storage.getNotifications as any).mockResolvedValue([]);
    const res = await adminAgent.get("/api/notifications");
    expect(res.status).toBe(200);
  });
});
