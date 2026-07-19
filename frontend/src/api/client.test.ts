import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiRequestError, apiGet, shouldRetryQuery } from "./client";

afterEach(() => vi.unstubAllGlobals());

describe("apiGet", () => {
  it("normalizes network failures without exposing the browser error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiGet("/api/example")).rejects.toMatchObject({
      kind: "network",
      message: "Local API is unavailable. PocketCoin will retry automatically.",
    });
  });

  it("preserves HTTP status and distinguishes aborted requests", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ message: "Temporarily unavailable." }) }));
    await expect(apiGet("/api/example")).rejects.toMatchObject({ kind: "http", status: 503 });
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("Aborted", "AbortError")));
    await expect(apiGet("/api/example", { signal: controller.signal })).rejects.toMatchObject({ kind: "aborted" });
  });
});

describe("query retry policy", () => {
  it("retries network and 5xx reads once, but not 4xx, aborts, or a second failure", () => {
    expect(shouldRetryQuery(0, new ApiRequestError("network", "offline"))).toBe(true);
    expect(shouldRetryQuery(0, new ApiRequestError("http", "server", 503))).toBe(true);
    expect(shouldRetryQuery(0, new ApiRequestError("http", "invalid", 422))).toBe(false);
    expect(shouldRetryQuery(0, new ApiRequestError("aborted", "cancelled"))).toBe(false);
    expect(shouldRetryQuery(1, new ApiRequestError("network", "offline"))).toBe(false);
  });
});
