// "What's new": the version you have, a newer one if there is, and the
// changelog. Checking asks github.com for the latest release's manifest;
// installing downloads it, checks its signature and restarts Kenning.
//
// Laid out like Windows Update: one status row (sign, what is so, what it
// means, the one thing to do), then the notes, in the sheet's single
// scrolling area.

import { CHANGELOG, changelogView } from "../changelog";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message, on } from "../ipc";
import { modal } from "../modal";
import type { UpdateInfo } from "../types";
import markUrl from "../../../src-tauri/icons/32x32.png";

/** Show the sheet. `found` is a newer version already known, if any. */
export function updateSheet(opts: { version: string; found: UpdateInfo | null; daily: boolean }) {
  let found = opts.found;
  const status = h("div", { class: "update-status", role: "status" });
  const log = h("div", { class: "update-log" });
  const titleId = `sheet-${Math.random().toString(36).slice(2)}`;

  const check = async () => {
    paint({ state: "checking" });
    try {
      found = await ipc.updateCheck();
      paint(found ? { state: "found", update: found } : { state: "current" });
    } catch (e) {
      paint({ state: "error", text: message(e) });
    }
  };
  const install = async (u: UpdateInfo) => {
    paint({ state: "installing", update: u, done: 0, total: null });
    const stop = await on<[number, number | null]>("update-progress", ([done, total]) => paint({ state: "installing", update: u, done, total }));
    try {
      // On Windows the installer closes Kenning and starts the new version.
      await ipc.updateInstall();
    } catch (e) {
      paint({ state: "error", text: message(e) });
    } finally {
      stop();
    }
  };
  const toSettings = () => {
    void sheet.close();
    location.hash = "settings";
  };

  type State =
    | { state: "idle" | "checking" | "current" }
    | { state: "found"; update: UpdateInfo }
    | { state: "installing"; update: UpdateInfo; done: number; total: number | null }
    | { state: "error"; text: string };

  /** The status row: a sign, a sentence, a quieter line under it, and the
   *  action on the right. */
  const row = (sign: IconName, tone: string, title: string, sub: (Node | string | false | null | undefined)[], action?: HTMLElement | false) =>
    h(
      "div",
      { class: `update-row ${tone}` },
      h("span", { class: "update-sign" }, icon(sign, 18)),
      h("div", { class: "update-text" }, h("strong", {}, title), h("span", {}, ...sub)),
      action || null,
    );
  const button = (label: string, onclick: () => unknown, primary = false) =>
    h("button", { type: "button", class: primary ? "btn primary" : "btn", onclick }, label);

  function paint(s: State) {
    // The notes of a newer version come first, above the ones you have.
    paintLog(s.state === "found" || s.state === "installing" ? s.update : null);
    if (s.state === "found") {
      return clear(
        status,
        row(
          "download",
          "brand",
          `Kenning ${s.update.version} is available`,
          [s.update.date ? `Released ${s.update.date}. ` : "", "Installed only if its signature is valid."],
          button("Install and restart", () => void install(s.update), true),
        ),
      );
    }
    if (s.state === "installing") {
      const share = s.total ? Math.min(1, s.done / s.total) : null;
      return clear(
        status,
        row("download", "brand", `Installing Kenning ${s.update.version}…`, [
          share === null ? "Kenning closes and opens again when it is done." : `${Math.round(share * 100)}%. Kenning closes and opens again when it is done.`,
        ]),
        h("div", { class: `update-bar${share === null ? " busy" : ""}` }, h("i", { style: share === null ? "" : `width: ${share * 100}%` })),
      );
    }
    if (s.state === "checking") {
      return clear(status, row("refresh", "busy", "Checking for updates…", ["Asking github.com for the latest release."]));
    }
    if (s.state === "current") {
      return clear(status, row("check", "ok", "Kenning is up to date", [`${opts.version} is the latest version.`], button("Check again", () => void check())));
    }
    if (s.state === "error") {
      return clear(status, row("alert", "warn", "Could not check for updates", [s.text], button("Try again", () => void check())));
    }
    clear(
      status,
      row(
        "refresh",
        "",
        "Updates",
        opts.daily
          ? ["Kenning checks at start and every 12 hours."]
          : ["Automatic checks are off. ", h("button", { type: "button", class: "link", onclick: toSettings }, "Turn them on")],
        button("Check now", () => void check()),
      ),
    );
  }

  /** The changelog, newest first: a newer version's notes (given a heading
   *  of their own if they come without one) above the bundled ones. */
  function paintLog(next: UpdateInfo | null) {
    const notes = next && (next.notes?.trimStart().startsWith("## ") ? next.notes : `## ${next.version}\n\n${next.notes || "No notes for this release."}`);
    // Only the newest release starts open: a newer version's, or else the
    // one you have. The rest fold to a line each.
    clear(log, h("h3", { class: "update-log-title" }, "What's new"), notes && changelogView(notes), changelogView(CHANGELOG, { open: notes ? 0 : 1 }));
  }

  paint(found ? { state: "found", update: found } : { state: "idle" });

  const card = h(
    "section",
    { class: "sheet-card update-sheet", role: "dialog", "aria-modal": "true", "aria-labelledby": titleId },
    h(
      "header",
      { class: "update-head" },
      h("img", { src: markUrl, alt: "" }),
      h("div", {}, h("h2", { id: titleId }, "Kenning"), h("span", { class: "muted" }, `Version ${opts.version} · MIT licence`)),
    ),
    status,
    log,
    h("div", { class: "sheet-actions" }, button("Close", () => void sheet.close())),
  );
  // Nothing to lose here, unless an install is running.
  const busy = () => !!status.querySelector(".update-bar");
  const sheet = modal(
    card,
    () => !busy() && void sheet.close(),
    () => !busy() && void sheet.close(),
  );
  card.querySelector<HTMLButtonElement>(".update-status .btn")?.focus();
}
