// The changelog, as the repository keeps it (CHANGELOG.md), bundled with
// the app so "What's new" needs no network. Release notes of a newer
// version arrive in the same format and are drawn the same way.

import { h } from "./dom";
import { icon } from "./icons";
import { fold } from "./motion";
import text from "../../../../CHANGELOG.md?raw";

/** The bundled changelog, without its title and introduction. */
export const CHANGELOG = text.slice(Math.max(0, text.indexOf("\n## ") + 1));

/** Markdown the changelog uses, and no more: "## version", "### part",
 *  "- item" (continued on indented lines) and plain paragraphs. Everything
 *  goes in as text, never as HTML.
 *
 *  Each version is a release that folds: its heading (and the line under
 *  it, usually the date) stays, the notes fold away. The first `open`
 *  releases start open, so a long history stays a short list. */
export function changelogView(markdown: string, { open = 1 } = {}): HTMLElement {
  const root = h("div", { class: "changelog" });
  let target: HTMLElement = root;
  let list: HTMLElement | null = null;
  let last: HTMLElement | null = null;
  let para: HTMLElement | null = null;
  /** The line under a release's heading, until its notes begin. */
  let sub: HTMLElement | null = null;
  let releases = 0;
  const end = () => {
    list = null;
    last = null;
    para = null;
    sub = null;
  };
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      para = null;
      continue;
    }
    if (line.startsWith("## ")) {
      end();
      const body = h("div", { class: "release-body" });
      const toggle = h(
        "button",
        { type: "button", class: "release-toggle", "aria-expanded": "true" },
        icon("chevronDown", 16, "chev"),
        h("span", {}, h("h3", {}, line.slice(3).trim()), (sub = h("span", { class: "release-sub" }))),
      );
      toggle.addEventListener("click", () => fold(toggle, body, toggle.getAttribute("aria-expanded") !== "true"));
      fold(toggle, body, releases++ < open, false);
      root.append(h("section", { class: "release" }, toggle, body));
      target = body;
    } else if (line.startsWith("### ")) {
      end();
      target.append(h("h4", {}, line.slice(4).trim()));
    } else if (/^[-*] /.test(line.trim()) && !/^\s{2,}/.test(raw)) {
      para = null;
      sub = null;
      if (!list) target.append((list = h("ul")));
      list.append((last = h("li", {}, line.trim().slice(2))));
    } else if (last && /^\s{2,}/.test(raw)) {
      last.append(` ${line.trim()}`);
    } else if (sub) {
      sub.append(`${sub.textContent ? " " : ""}${line.trim()}`);
    } else if (para) {
      para.append(` ${line.trim()}`);
    } else {
      list = null;
      last = null;
      target.append((para = h("p", {}, line.trim())));
    }
  }
  return root;
}
