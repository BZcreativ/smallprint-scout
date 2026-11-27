import { beforeEach, expect, test, vi } from "vitest";
import {
  isDailyQuotaError,
  isTransientCloudError,
  resetCloudFallbackState,
  withCloudFallback,
} from "../../src/firebase/cloud-fallback";

beforeEach(() => {
  resetCloudFallbackState();
});

test("isTransientCloudError matches transient server, quota, and timeout errors", () => {
  expect(isTransientCloudError(new Error("[500 ] This model is currently experiencing high demand."))).toBe(true);
  expect(isTransientCloudError(new Error("[503 ] Deadline expired before operation could complete."))).toBe(true);
  expect(isTransientCloudError(new Error("[429 ] You exceeded your current quota"))).toBe(true);
  expect(isTransientCloudError(new Error("Timeout has expired."))).toBe(true);
});

test("isTransientCloudError rejects client/auth errors", () => {
  expect(isTransientCloudError(new Error("[400 ] Request contains an invalid argument."))).toBe(false);
  expect(isTransientCloudError(new Error("[401 ] Firebase App Check token is invalid."))).toBe(false);
});

test("isDailyQuotaError detects per-day free tier quota exhaustion", () => {
  expect(
    isDailyQuotaError(
      new Error("Generate content requests per day limit exceeded on Free Tier. GenerateRequestsPerDayPerProjectPerModel-FreeTier"),
    ),
  ).toBe(true);
  expect(isDailyQuotaError(new Error("[500 ] high demand"))).toBe(false);
});

test("withCloudFallback returns primary result when primary succeeds", async () => {
  const primary = vi.fn().mockResolvedValue("ok");
  const fallback = vi.fn().mockResolvedValue("fallback");

  await expect(withCloudFallback("grounded", primary, fallback)).resolves.toBe("ok");
  expect(fallback).not.toHaveBeenCalled();
});

test("withCloudFallback calls fallback on transient errors", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const primary = vi.fn().mockRejectedValue(new Error("[500 ] high demand"));
  const fallback = vi.fn().mockResolvedValue("fallback-ok");

  await expect(withCloudFallback("grounded", primary, fallback)).resolves.toBe("fallback-ok");
  expect(fallback).toHaveBeenCalledTimes(1);
});

test("withCloudFallback short-circuits primary after daily quota 429", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const primary = vi
    .fn()
    .mockRejectedValue(
      new Error("[429 ] Generate content requests per day limit exceeded on Free Tier. GenerateRequestsPerDay"),
    );
  const fallback = vi.fn().mockResolvedValue("fallback-ok");

  await expect(withCloudFallback("cloudTriage", primary, fallback)).resolves.toBe("fallback-ok");
  await expect(withCloudFallback("cloudTriage", primary, fallback)).resolves.toBe("fallback-ok");

  expect(primary).toHaveBeenCalledTimes(1);
  expect(fallback).toHaveBeenCalledTimes(2);
});

test("withCloudFallback rethrows non-transient errors without calling fallback", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const primary = vi.fn().mockRejectedValue(new Error("[400 ] invalid argument"));
  const fallback = vi.fn().mockResolvedValue("fallback-ok");

  await expect(withCloudFallback("draftCloud", primary, fallback)).rejects.toThrow("400");
  expect(fallback).not.toHaveBeenCalled();
});
