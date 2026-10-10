import { clear, h } from "../dom";
import { ipc } from "../ipc";
import { recognitionCard } from "./card";

/** Paste anything; every address in it is recognised. Nothing is recorded. */
export function checkView(main: HTMLElement) {
  const input = h("textarea", {
    rows: 5,
    style: "width:100%",
    placeholder: "Paste an address, a transaction, a chat message…",
    "aria-label": "Text to check",
  });
  const results = h("div", { style: "margin-top:16px" });

  input.addEventListener("input", async () => {
    const found = await ipc.recognizeText(input.value);
    if (!input.value.trim()) clear(results);
    else if (!found.length) clear(results, h("div", { class: "empty" }, "No address found."));
    else clear(results, found.map(recognitionCard));
  });

  clear(
    main,
    h("header", {}, h("h1", {}, "Check"), h("span", { class: "muted" }, "Nothing you paste here is stored.")),
    input,
    results,
  );
  input.focus();
}
