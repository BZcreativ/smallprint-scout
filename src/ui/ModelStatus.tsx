import type { DeviceStatus } from "../firebase/device";

// The one-line status of the on-device model, and the button that downloads
// it.
//
// The "Enable" button calls `onEnable` straight from the click handler: the
// Prompt API needs the user's activation, so nothing may be awaited first.

const HOW_TO_ENABLE = "https://github.com/BZcreativ/smallprint-scout#enable-on-device-ai";

export interface ModelStatusProps {
  status: DeviceStatus;
  onEnable: () => void;
  progress?: number;
}

export function ModelStatus({ status, onEnable, progress }: ModelStatusProps) {
  if (status === "unsupported") {
    return (
      <section className="model-status">
        <p>On-device AI isn't available in this browser. You can still scan with redacted cloud analysis.</p>
        <a href={HOW_TO_ENABLE} target="_blank" rel="noopener noreferrer">
          How to enable
        </a>
      </section>
    );
  }

  if (status === "downloadable") {
    return (
      <section className="model-status">
        <button onClick={onEnable}>Enable private on-device AI</button>
      </section>
    );
  }

  if (status === "downloading") {
    const pct = progress ?? 0;
    return (
      <section className="model-status">
        <p>Downloading the private on-device model… {pct}%</p>
        <progress max={100} value={pct} />
      </section>
    );
  }

  return (
    <section className="model-status">
      <p>Private on-device AI ready</p>
    </section>
  );
}

export default ModelStatus;
