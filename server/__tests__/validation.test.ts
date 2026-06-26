import { describe, it, expect } from "vitest";
import { loginSchema } from "@shared/schema";
import { PASSWORD_POLICY } from "../routes";

describe("loginSchema", () => {
  it("accepts valid credentials", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "correctPassword1!" }).success).toBe(true);
  });

  it("rejects empty username", () => {
    expect(loginSchema.safeParse({ username: "", password: "correctPassword1!" }).success).toBe(false);
  });

  it("rejects empty password", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "" }).success).toBe(false);
  });

  it("rejects password over 1024 chars (DoS guard)", () => {
    const result = loginSchema.safeParse({ username: "admin", password: "a".repeat(1025) });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toMatch(/too long/i);
  });

  it("accepts password at exactly 1024 chars", () => {
    expect(loginSchema.safeParse({ username: "admin", password: "a".repeat(1024) }).success).toBe(true);
  });

  it("rejects missing fields", () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ username: "admin" }).success).toBe(false);
    expect(loginSchema.safeParse({ password: "pw" }).success).toBe(false);
  });
});

describe("PASSWORD_POLICY", () => {
  it("rejects passwords shorter than 12 chars", () => {
    expect(PASSWORD_POLICY.safeParse("Short1!").success).toBe(false);
  });

  it("rejects passwords with no uppercase letter", () => {
    expect(PASSWORD_POLICY.safeParse("alllowercase1!").success).toBe(false);
  });

  it("rejects passwords with no digit", () => {
    expect(PASSWORD_POLICY.safeParse("NoDigitsHere!").success).toBe(false);
  });

  it("rejects passwords with no special character", () => {
    expect(PASSWORD_POLICY.safeParse("NoSpecialChar1A").success).toBe(false);
  });

  it("accepts a strong password meeting all requirements", () => {
    expect(PASSWORD_POLICY.safeParse("StrongPass1!xy").success).toBe(true);
  });

  it("accepts another valid strong password", () => {
    expect(PASSWORD_POLICY.safeParse("S3cur3P@ssword").success).toBe(true);
  });
});
