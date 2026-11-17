declare const LanguageModel:
  | {
      availability(options?: unknown): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
      create?(options?: { monitor?: (m: EventTarget) => void }): Promise<{ destroy?: () => void }>;
    }
  | undefined;
