// Primary cloud calls fail fast at 35s if the flagship model stalls; the
// secondary fallback keeps 90s because slow Firefox reCAPTCHA Enterprise verify
// (20-30s) plus inference share the same @firebase/ai timeout window.
export const PRIMARY_CLOUD_TIMEOUT_MS = 35_000;
export const CLOUD_TIMEOUT_MS = 90_000;

const TRANSIENT_COOLDOWN_MS = 3 * 60 * 1000;
const DAILY_QUOTA_COOLDOWN_MS = 10 * 60 * 1000;
let primaryCooldownUntil = 0;

export function resetCloudFallbackState(): void {
  primaryCooldownUntil = 0;
}

// "Timeout has expired." from @firebase/ai does not say whether the reCAPTCHA
// verify or the model call consumed the window, so each step logs its own
// duration and failure for diagnosis.
export async function timed<T>(step: string, call: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await call();
  } catch (e) {
    console.warn(`[SmallPrint] ${step} failed after ${Math.round(performance.now() - started)}ms:`, e);
    throw e;
  }
}

export function isDailyQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /GenerateRequestsPerDay|PerDay.*FreeTier|requests per day limit exceeded/i.test(msg);
}

export function isTransientCloudError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /500|502|503|504|429|quota|deadline expired|unavailable|high demand|overloaded|internal|timeout|abort/i.test(
    msg,
  );
}

// Runs the primary cloud model call with timing, and falls back to the secondary
// model on transient server, quota, or timeout errors. When the primary hits
// a daily limit (10 min cooldown) or stalls/errors (3 min cooldown), subsequent
// calls in this session skip straight to the fast fallback model.
export async function withCloudFallback<T>(
  step: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  if (Date.now() < primaryCooldownUntil) {
    return await timed(`${step}Fallback`, fallback);
  }
  try {
    return await timed(step, primary);
  } catch (err) {
    if (isDailyQuotaError(err)) {
      primaryCooldownUntil = Math.max(primaryCooldownUntil, Date.now() + DAILY_QUOTA_COOLDOWN_MS);
      return await timed(`${step}Fallback`, fallback);
    }
    if (isTransientCloudError(err)) {
      primaryCooldownUntil = Math.max(primaryCooldownUntil, Date.now() + TRANSIENT_COOLDOWN_MS);
      return await timed(`${step}Fallback`, fallback);
    }
    throw err;
  }
}
