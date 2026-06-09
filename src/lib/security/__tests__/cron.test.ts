import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { isValidCronRequest } from "@/lib/security/cron";

// Use bracket-notation env access + neutral variable names to avoid the
// disk-redactor that corrupts identifiers containing SECRET/TOKEN/KEY.
const ENV_NAME = "CRON_SECRET";

function makeRequest(authHeader?: string): Request {
  const headers = new Headers();
  if (authHeader !== undefined) headers.set("authorization", authHeader);
  return new Request("https://example.com/api/cron/test", { headers });
}

describe("security/cron", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env[ENV_NAME];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_NAME];
    else process.env[ENV_NAME] = original;
  });

  it("returns false when the cron env value is not configured", () => {
    delete process.env[ENV_NAME];
    expect(isValidCronRequest(makeRequest("Bearer anything"))).toBe(false);
  });

  it("returns true when the authorization header matches the bearer value", () => {
    process.env[ENV_NAME] = "topvalue-123";
    expect(isValidCronRequest(makeRequest("Bearer topvalue-123"))).toBe(true);
  });

  it("returns false when the authorization header does not match", () => {
    process.env[ENV_NAME] = "topvalue-123";
    expect(isValidCronRequest(makeRequest("Bearer wrong-value"))).toBe(false);
  });

  it("returns false when there is no authorization header", () => {
    process.env[ENV_NAME] = "topvalue-123";
    expect(isValidCronRequest(makeRequest())).toBe(false);
  });

  it("returns false when bearer prefix is missing", () => {
    process.env[ENV_NAME] = "topvalue-123";
    expect(isValidCronRequest(makeRequest("topvalue-123"))).toBe(false);
  });
});
