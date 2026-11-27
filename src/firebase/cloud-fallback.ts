// Every cloud request also runs a reCAPTCHA Enterprise execute (the App Check
// limited-use token) INSIDE the request's own timeout window, and in Firefox
// that verify alone can take 20-30s. 45s caps starved the model leg; 90s
// leaves it a full minute.
export const CLOUD_TIMEOUT_MS = 90_000;

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

export function isTransientCloudError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /500|502|503|504|429|quota|deadline expired|unavailable|high demand|overloaded|internal|timeout|abort/i.test(
    msg,
  );
}

// Runs the primary cloud model call with timing, and falls back to the secondary
// model on transient server, quota, or timeout errors.
export async function withCloudFallback<T>(
  step: string,
  primary: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  try {
    return await timed(step, primary);
  } catch (err) {
    if (isTransientCloudError(err)) {
      return await timed(`${step}Fallback`, fallback);
    }
    throw err;
  }
}
