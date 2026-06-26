import express, { type Express, type Request, type Response, type NextFunction } from "express";
import session from "express-session";
import { randomUUID } from "crypto";
import { vi } from "vitest";
import { comparePasswords } from "../../auth";
import { loginSchema } from "@shared/schema";

declare module "express-session" {
  interface SessionData {
    userId: string;
    csrfToken: string;
  }
}

export interface MockStorage {
  getUserByUsername: (username: string) => Promise<any>;
  getUser: (id: string) => Promise<any>;
  mockReset?: () => void;
}

export function buildMockStorage() {
  const getUserByUsername = vi.fn() as unknown as (username: string) => Promise<any>;
  const getUser = vi.fn() as unknown as (id: string) => Promise<any>;
  return { getUserByUsername, getUser };
}

export function createTestApp(mockStorage: MockStorage): Express {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(
    session({
      secret: "test-secret-do-not-use-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: { secure: false },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    if (!req.session.userId) return next();
    if (req.path === "/api/auth/logout") return next();
    const token = req.headers["x-csrf-token"];
    if (!token || token !== req.session.csrfToken) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }
    next();
  });

  function requireAuth(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  }

  async function requireAdmin(req: Request, res: Response, next: NextFunction) {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await mockStorage.getUser(req.session.userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  }

  function toSafeUser(u: any) {
    return { id: u.id, username: u.username, name: u.name, role: u.role, assignedAdminId: u.assignedAdminId };
  }

  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ message: "Invalid input" });

    const { username, password } = parsed.data;
    const user = await mockStorage.getUserByUsername(username);
    if (!user || !(await comparePasswords(password, user.passwordHash))) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const csrfToken = randomUUID();
    req.session.userId = user.id;
    req.session.csrfToken = csrfToken;
    res.setHeader("X-CSRF-Token", csrfToken);
    return res.json(toSafeUser(user));
  });

  app.post("/api/auth/logout", (req: Request, res: Response) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, async (req: Request, res: Response) => {
    const user = await mockStorage.getUser(req.session.userId!);
    if (!user) return res.status(404).json({ message: "Not found" });
    res.json(toSafeUser(user));
  });

  app.get("/api/admin-only", requireAdmin, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.get("/api/member-only", requireAuth, (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  return app;
}
