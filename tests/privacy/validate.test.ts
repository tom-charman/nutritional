import { describe, expect, it } from "vitest";
import { validatePrivacyRequest } from "@/lib/privacy/requests";

const valid = {
  requestType: "deletion",
  email: "Person@Example.com",
  message: "Please delete my account.",
};

describe("validatePrivacyRequest", () => {
  it("accepts a valid request and normalises the email", () => {
    const r = validatePrivacyRequest(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.email).toBe("person@example.com");
      expect(r.value.requestType).toBe("deletion");
      expect(r.value.message).toBe("Please delete my account.");
    }
  });

  it("flags a filled honeypot as spam (silently, no error text)", () => {
    const r = validatePrivacyRequest({ ...valid, honeypot: "buy-now" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.spam).toBe(true);
      expect(r.error).toBe("");
    }
  });

  it("rejects an unknown request type", () => {
    const r = validatePrivacyRequest({ ...valid, requestType: "hack" });
    expect(r.ok).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(validatePrivacyRequest({ ...valid, email: "not-an-email" }).ok).toBe(false);
    expect(validatePrivacyRequest({ ...valid, email: "" }).ok).toBe(false);
  });

  it("rejects an empty message", () => {
    expect(validatePrivacyRequest({ ...valid, message: "   " }).ok).toBe(false);
  });

  it("rejects an over-long message", () => {
    const r = validatePrivacyRequest({ ...valid, message: "x".repeat(5001) });
    expect(r.ok).toBe(false);
  });
});
