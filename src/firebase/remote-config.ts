import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from "firebase/remote-config";
import { firebaseApp } from "./app";

// The cloud model is the one thing in the app that changes without a deploy:
// Remote Config can point it at another Gemini model, and the app keeps
// working on the default whenever the fetch fails (offline, blocked, no
// project id). Nothing here ever throws, so a caller cannot break the app by
// asking for the model name.

export const DEFAULT_CLOUD_MODEL = "gemini-3.8-flash";

const CLOUD_MODEL_KEY = "cloud_model";

let instance: RemoteConfig | null = null;
let unavailable = false;

// The Remote Config SDK is browser only: it needs a project id and IndexedDB.
// In Node (the tests) there is neither, so no instance is ever created and the
// default model is used.
function getInstance(): RemoteConfig | null {
  if (instance) return instance;
  if (unavailable) return null;

  try {
    instance = getRemoteConfig(firebaseApp);
    // The in-app default is what the SDK reports before the first fetch, and
    // what it falls back to whenever the remote value is missing.
    instance.defaultConfig = { [CLOUD_MODEL_KEY]: DEFAULT_CLOUD_MODEL };
    return instance;
  } catch {
    unavailable = true;
    return null;
  }
}

// The name of the cloud model to use, or the default when Remote Config has
// nothing to say.
export function getCloudModelName(): string {
  try {
    const rc = getInstance();
    if (!rc) return DEFAULT_CLOUD_MODEL;

    const name = getValue(rc, CLOUD_MODEL_KEY).asString().trim();
    return name || DEFAULT_CLOUD_MODEL;
  } catch {
    return DEFAULT_CLOUD_MODEL;
  }
}

// Fetches the remote values once and activates them, then reports the model
// name the cloud calls should use. Safe to call in a browser at startup.
export async function initRemoteConfig(): Promise<string> {
  try {
    const rc = getInstance();
    if (rc) await fetchAndActivate(rc);
  } catch {
    // Remote Config is an optimisation, not a requirement: the default model
    // stays in place.
  }

  return getCloudModelName();
}
