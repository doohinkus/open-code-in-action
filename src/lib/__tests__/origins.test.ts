import { test, expect, describe, afterEach, vi } from "vitest";
import {
  getAllowedOrigins,
  isAllowedOrigin,
  allowedOriginFor,
  normalizeOrigin,
} from "@/lib/origins";

const ORIGINAL_URL = process.env.NEXT_PUBLIC_APP_URL;
const ORIGINAL_VERCEL = process.env.VERCEL_URL;

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL_URL;
  if (ORIGINAL_VERCEL === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = ORIGINAL_VERCEL;
  vi.unstubAllEnvs();
});

describe("origin allowlist", () => {
  test("allows localhost and the canonical deployment by default", () => {
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("https://open-code-in-action.vercel.app")).toBe(true);
  });

  test("rejects exact-match lookalikes and wildcard attempts", () => {
    expect(isAllowedOrigin("http://localhost:3000.evil.example")).toBe(false);
    expect(isAllowedOrigin("https://open-code-in-action.vercel.app.evil.example")).toBe(false);
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("http://localhost")).toBe(false);
    expect(isAllowedOrigin("https://open-code-in-action.vercel.app/sub/path")).toBe(false);
  });

  test("rejects malformed values", () => {
    expect(isAllowedOrigin("")).toBe(false);
    expect(isAllowedOrigin("javascript:alert(1)")).toBe(false);
    expect(isAllowedOrigin("not-a-url")).toBe(false);
  });

  test("appends env-provided origins at runtime", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://uigen.example.com/";
    process.env.VERCEL_URL = "preview-uigen.vercel.app";

    expect(isAllowedOrigin("https://uigen.example.com")).toBe(true);
    expect(isAllowedOrigin("https://preview-uigen.vercel.app")).toBe(true);
  });

  test("allowedOriginFor echoes allowed origins and falls back safely", () => {
    expect(allowedOriginFor("http://localhost:3000")).toBe("http://localhost:3000");
    expect(allowedOriginFor("https://evil.example")).toBe(getAllowedOrigins()[0]);
    expect(allowedOriginFor("")).toBe(getAllowedOrigins()[0]);
  });

  test("normalizeOrigin strips trailing slashes", () => {
    expect(normalizeOrigin("https://x.example/")).toBe("https://x.example");
    expect(normalizeOrigin("https://x.example///")).toBe("https://x.example");
    expect(normalizeOrigin("https://x.example/path/")).toBe("https://x.example/path");
  });
});
