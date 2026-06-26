import { describe, it, expect, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { validateMagicBytes } from "../routes";

function writeTempFile(bytes: number[]): string {
  const filePath = path.join(os.tmpdir(), `test-${Date.now()}-${Math.random()}.bin`);
  fs.writeFileSync(filePath, Buffer.from(bytes));
  return filePath;
}

const tempFiles: string[] = [];

function tempFile(bytes: number[]): string {
  const p = writeTempFile(bytes);
  tempFiles.push(p);
  return p;
}

afterEach(() => {
  for (const f of tempFiles.splice(0)) {
    try { fs.unlinkSync(f); } catch {}
  }
});

describe("validateMagicBytes", () => {
  describe("PDF", () => {
    it("accepts valid PDF magic bytes (%PDF)", () => {
      const f = tempFile([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      expect(validateMagicBytes(f, "application/pdf")).toBe(true);
    });

    it("rejects wrong bytes declared as PDF", () => {
      const f = tempFile([0xFF, 0xD8, 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(f, "application/pdf")).toBe(false);
    });
  });

  describe("JPEG", () => {
    it("accepts valid JPEG magic bytes", () => {
      const f = tempFile([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      expect(validateMagicBytes(f, "image/jpeg")).toBe(true);
    });

    it("rejects PDF bytes declared as JPEG", () => {
      const f = tempFile([0x25, 0x50, 0x44, 0x46, 0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(f, "image/jpeg")).toBe(false);
    });
  });

  describe("PNG", () => {
    it("accepts valid PNG magic bytes", () => {
      const f = tempFile([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(validateMagicBytes(f, "image/png")).toBe(true);
    });

    it("rejects wrong bytes declared as PNG", () => {
      const f = tempFile([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
      expect(validateMagicBytes(f, "image/png")).toBe(false);
    });
  });

  describe("GIF", () => {
    it("accepts valid GIF magic bytes (GIF8)", () => {
      const f = tempFile([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x00]);
      expect(validateMagicBytes(f, "image/gif")).toBe(true);
    });
  });

  describe("Word / OOXML (.docx)", () => {
    it("accepts PK zip header (docx)", () => {
      const f = tempFile([0x50, 0x4B, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
      expect(validateMagicBytes(f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(true);
    });
  });

  describe("text/plain", () => {
    it("always passes for text/plain (no magic bytes required)", () => {
      const f = tempFile([0x48, 0x65, 0x6C, 0x6C, 0x6F]);
      expect(validateMagicBytes(f, "text/plain")).toBe(true);
    });
  });

  describe("unknown MIME type", () => {
    it("rejects an unrecognised MIME type", () => {
      const f = tempFile([0x00, 0x01, 0x02, 0x03]);
      expect(validateMagicBytes(f, "application/x-unknown")).toBe(false);
    });
  });
});
