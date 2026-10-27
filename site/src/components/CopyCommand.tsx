import { useState } from "react";
import { INSTALL_CLI } from "../links";
import { flashCursor } from "./pointer";

/** The CLI install command, copied with one click. */
export function CopyCommand() {
  const [hint, setHint] = useState("Copy");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CLI);
      setHint("Copied");
      flashCursor("Copied");
    } catch {
      setHint("Select and copy");
    }
    setTimeout(() => setHint("Copy"), 1800);
  };
  return (
    <button className="command" type="button" onClick={copy} data-cursor="Copy" data-cursor-icon="copy">
      <code>{INSTALL_CLI}</code>
      <span className="command-hint" aria-live="polite">
        {hint}
      </span>
    </button>
  );
}
