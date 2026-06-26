import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import supertest from "supertest";
import { hashPassword } from "../auth";
import { buildMockStorage, createTestApp } from "./helpers/create-app";

const mockStorage = buildMockStorage();
const app = createTestApp(mockStorage);

const TEST_PASSWORD = "TestPass1!secure";
let testUser: any;

beforeAll(async () => {
  testUser = {
    id: "user-abc-123",
    username: "testadmin",
    name: "Test Admin",
    role: "admin",
    passwordHash: await hashPassword(TEST_PASSWORD),
    assignedAdminId: null,
  };
});

beforeEach(() => {
  mockStorage.getUserByUsername.mockReset();
  mockStorage.getUser.mockReset();
});

describe("POST /api/auth/login", () => {
  it("returns 200 and safe user on valid credentials", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.username).toBe("testadmin");
    expect(res.body.passwordHash).toBeUndefined();
    expect(res.headers["x-csrf-token"]).toBeTruthy();
  });

  it("returns 401 for wrong password", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "testadmin", password: "wrongPassword1!" });

    expect(res.status).toBe(401);
  });

  it("returns 401 for unknown username", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: TEST_PASSWORD });

    expect(res.status).toBe(401);
  });

  it("returns 400 for missing body fields", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "testadmin" });

    expect(res.status).toBe(400);
  });

  it("returns 400 for password over 1024 chars", async () => {
    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "testadmin", password: "a".repeat(1025) });

    expect(res.status).toBe(400);
  });

  it("does not expose passwordHash in response", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    expect(res.body).not.toHaveProperty("passwordHash");
    expect(res.body).not.toHaveProperty("createdAt");
  });
});

describe("GET /api/auth/me", () => {
  it("returns 401 when not authenticated", async () => {
    const res = await supertest(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns current user after login", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);
    mockStorage.getUser.mockResolvedValue(testUser);

    const agent = supertest.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    const res = await agent.get("/api/auth/me");
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("testadmin");
    expect(res.body.passwordHash).toBeUndefined();
  });
});

describe("POST /api/auth/logout", () => {
  it("returns 200 and clears session", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);
    mockStorage.getUser.mockResolvedValue(testUser);

    const agent = supertest.agent(app);

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    const logout = await agent
      .post("/api/auth/logout")
      .set("X-CSRF-Token", loginRes.headers["x-csrf-token"]);

    expect(logout.status).toBe(200);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });
});

describe("CSRF protection", () => {
  it("blocks authenticated POST with wrong X-CSRF-Token (403)", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);

    const agent = supertest.agent(app);

    await agent
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    mockStorage.getUserByUsername.mockResolvedValue(testUser);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", "wrong-token")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    expect(res.status).toBe(403);
  });

  it("allows authenticated POST with correct X-CSRF-Token", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(testUser);

    const agent = supertest.agent(app);

    const loginRes = await agent
      .post("/api/auth/login")
      .send({ username: "testadmin", password: TEST_PASSWORD });

    const csrfToken = loginRes.headers["x-csrf-token"];
    expect(csrfToken).toBeTruthy();

    mockStorage.getUserByUsername.mockResolvedValue(testUser);
    const res = await agent
      .post("/api/auth/login")
      .set("X-CSRF-Token", csrfToken)
      .send({ username: "testadmin", password: TEST_PASSWORD });

    expect(res.status).toBe(200);
  });

  it("allows unauthenticated POST without CSRF token (login endpoint)", async () => {
    mockStorage.getUserByUsername.mockResolvedValue(null);

    const res = await supertest(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: "wrongPassword1!" });

    expect(res.status).toBe(401);
  });
});
