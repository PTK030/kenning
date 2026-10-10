import { useEffect, useState } from "react";

const FINE = "(hover: hover) and (pointer: fine)";

/** True on devices with a mouse or trackpad, where a custom cursor and
 *  scrollbar make sense. Touch screens keep the system ones. */
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(() => matchMedia(FINE).matches);
  useEffect(() => {
    const m = matchMedia(FINE);
    const on = () => setFine(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return fine;
}

/** Show a short label next to the cursor, e.g. "Copied" after a copy. */
export function flashCursor(text: string, icon = "copy") {
  window.dispatchEvent(new CustomEvent("cursor:flash", { detail: { text, icon } }));
}
