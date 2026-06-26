import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { hashPassword } from "../auth";
import { buildMockStorage, createTestApp } from "./helpers/create-app";

const mockStorage = buildMockStorage();
const app = createTestApp(mockStorage);

const TEST_PASSWORD = "TestPass1!secure";
let adminUser: any;
let memberUser: any;

beforeAll(async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);

  adminUser = {
    id: "admin-id",
    username: "admin",
    name: "Admin User",
    role: "admin",
    passwordHash,
    assignedAdminId: null,
  };

  memberUser = {
    id: "member-id",
    username: "member",
    name: "Service Member",
    role: "service_member",
    passwordHash,
    assignedAdminId: "admin-id",
  };
});

beforeEach(() => {
  mockStorage.getUserByUsername.mockReset();
  mockStorage.getUser.mockReset();
});

async function loginAs(user: any) {
  const sessionAgent = supertest.agent(app);
  mockStorage.getUserByUsername.mockResolvedValue(user);
  mockStorage.getUser.mockResolvedValue(user);

  const res = await sessionAgent
    .post("/api/auth/login")
    .send({ username: user.username, password: TEST_PASSWORD });

  return { agent: sessionAgent, csrfToken: res.headers["x-csrf-token"] as string };
}

describe("requireAuth — unauthenticated access", () => {
  it("returns 401 on GET /api/auth/me without session", async () => {
    const res = await supertest(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 on GET /api/member-only without session", async () => {
    const res = await supertest(app).get("/api/member-only");
    expect(res.status).toBe(401);
  });

  it("returns 401 on GET /api/admin-only without session", async () => {
    const res = await supertest(app).get("/api/admin-only");
    expect(res.status).toBe(401);
  });
});

describe("requireAuth — authenticated access", () => {
  it("allows service member to reach requireAuth-gated route", async () => {
    const { agent } = await loginAs(memberUser);
    const res = await agent.get("/api/member-only");
    expect(res.status).toBe(200);
  });

  it("allows admin to reach requireAuth-gated route", async () => {
    const { agent } = await loginAs(adminUser);
    const res = await agent.get("/api/member-only");
    expect(res.status).toBe(200);
  });
});

describe("requireAdmin — role enforcement", () => {
  it("returns 403 when service member hits admin-only route", async () => {
    const { agent } = await loginAs(memberUser);
    const res = await agent.get("/api/admin-only");
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/admin/i);
  });

  it("allows admin to reach admin-only route", async () => {
    const { agent } = await loginAs(adminUser);
    const res = await agent.get("/api/admin-only");
    expect(res.status).toBe(200);
  });
});
