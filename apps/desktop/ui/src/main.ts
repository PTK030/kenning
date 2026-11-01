// Main window: book, check, journal and protection; settings at the foot.

import { $, clear, h } from "./dom";
import { ipc, on } from "./ipc";
import type { Overview, UpdateInfo } from "./types";
import { bookView } from "./views/book";
import { checkView } from "./views/check";
import { journalView } from "./views/journal";
import { protectionView } from "./views/protection";
import { settingsView } from "./views/settings";
import { updateSheet } from "./views/updateSheet";
import { welcomeView } from "./views/welcome";
import { icon, type IconName } from "./icons";
import { move, rise, sink, SPRING, stagger } from "./motion";
import { titlebar } from "./titlebar";
import { closeSheet, sheetOpen, toggleSheet } from "./shortcutSheet";
import { matches } from "./shortcuts";
import { toast, toastSounds } from "./toast";
import "./guard";

type View = (main: HTMLElement, overview: Overview, refresh: () => Promise<void>) => Promise<void> | void;

// In the order of use, which Ctrl+1…5 follow. Settings is about Kenning
// rather than your addresses: it sits at the foot of the sidebar, as in
// Windows' own apps.
const TABS: { id: string; title: string; icon: IconName; view: View; foot?: true }[] = [
  { id: "book", title: "Address book", icon: "book", view: bookView },
  { id: "check", title: "Check", icon: "search", view: checkView },
  { id: "journal", title: "Journal", icon: "journal", view: journalView },
  { id: "protection", title: "Protection", icon: "shield", view: protectionView },
  { id: "settings", title: "Settings", icon: "sliders", view: settingsView, foot: true },
];

const app = $("#app");
const bar = titlebar({ title: "Kenning", minimize: true, maximize: true });
// One surface with the sidebar under it, as in Windows: no line between.
bar.el.classList.add("tb-base");
$("#chrome").replaceWith(bar.el);
let overview: Overview;
/** The tab drawn last, and where its highlight sat, so a change can glide. */
let lastTab = "";
let lastPillTop: number | null = null;
/** Counts renders, so a page that waited for the last one to leave can
 *  tell it was overtaken. */
let renders = 0;
/** Set when the onboarding hands over: the panel arrives instead of appearing. */
let arriving = false;
/** A newer Kenning, once a check found one: the sidebar says so. */
let update: UpdateInfo | null = null;
/** Where the sidebar asks for something (watching paused, an update);
 *  repainted when either changes. */
let notices: HTMLElement | null = null;
/** A gentle ease in and out, for the one change of scene. */
const HANDOVER = [0.4, 0, 0.2, 1] as const;

function currentTab(): string {
  return location.hash.replace("#", "") || "book";
}

async function refresh() {
  overview = await ipc.overview();
  toastSounds(overview.config.sounds);
  await render();
}

async function showUpdates() {
  // A window opened from the tray may not have heard of the update yet.
  update ??= await ipc.updateFound();
  paintNotices();
  updateSheet({ version: overview.version, found: update, daily: overview.config.update_check });
}

/** "Watching paused" and "Update to …", each only while it is so: a
 *  notice that is always there stops being read. Pausing goes first, as
 *  the one that leaves you unprotected. */
function paintNotices() {
  if (!notices || !overview) return;
  const paused = overview.paused && overview.config.clipboard === "watch";
  clear(
    notices,
    paused &&
      h(
        "div",
        { class: "paused-card", role: "status" },
        h("div", { class: "paused-head" }, icon("pause", 15), h("strong", {}, "Watching paused")),
        h("p", {}, "Copied addresses are not checked."),
        h("button", { type: "button", class: "btn", onclick: () => void ipc.setPaused(false) }, "Resume"),
      ),
    update &&
      h(
        "button",
        { class: "update-pill", onclick: showUpdates, title: "See what is new and install it" },
        h("span", { class: "update-dot", "aria-hidden": "true" }),
        `Update to ${update.version}`,
      ),
  );
  if (notices.isConnected) placePill();
}

/** Keep the highlight on the current row when the rows move under it:
 *  Settings, at the foot, moves with the window's height and with the
 *  notices above it. */
function placePill() {
  const pill = document.querySelector<HTMLElement>("nav .pill");
  const current = document.querySelector<HTMLElement>('nav a[aria-current="page"]');
  if (!pill || !current) return;
  pill.style.top = `${current.offsetTop}px`;
  pill.style.height = `${current.offsetHeight}px`;
  lastPillTop = current.offsetTop;
}

async function render() {
  // The tray's "Update to …" opens the window here: the book, with the
  // update in front of it.
  if (location.hash === "#update") {
    history.replaceState(null, "", "#book");
    if (overview.config.onboarded) queueMicrotask(() => void showUpdates());
  }
  const tab = currentTab();
  if (tab === "welcome" || !overview.config.onboarded) {
    // Already running: a redraw (tray click, navigate event) must not
    // start it over.
    if (document.querySelector("main.onboarding")) return;
    app.style.display = "block";
    lastTab = "welcome";
    document.body.classList.add("immersive");
    bar.setSubtitle("Welcome");
    const main = h("main", { class: "onboarding" });
    clear(app, main);
    await welcomeView(main, overview, async () => {
      // The panel's data is ready before anything moves, so there is no
      // empty beat between the onboarding leaving and the panel arriving.
      const next = await ipc.overview();
      await Promise.all([
        move(main, { opacity: [1, 0] }, { duration: 0.45, ease: HANDOVER }),
        move(bar.el.querySelector(".tb-sub"), { opacity: [1, 0] }, { duration: 0.45, ease: HANDOVER }),
      ]);
      overview = next;
      toastSounds(next.config.sounds);
      arriving = true;
      if (currentTab() === "book" && location.hash === "#book") void render();
      else location.hash = "book";
    });
    return;
  }
  app.style.display = "";
  document.body.classList.remove("immersive");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  // Another tab: the highlight sets off at once, and the page leaves the
  // way it came (sinking back) before the next one rises. Only the last of
  // quick switches is drawn.
  const mine = ++renders;
  const leaving = app.querySelector<HTMLElement>(":scope > main:not(.onboarding)");
  if (leaving && lastTab && lastTab !== "welcome" && active.id !== lastTab && !arriving) {
    const oldNav = app.querySelector("nav");
    const oldPill = oldNav?.querySelector<HTMLElement>(".pill");
    const target = oldNav?.querySelector<HTMLElement>(`a[href="#${active.id}"]`);
    if (oldNav && oldPill && target) {
      for (const a of oldNav.querySelectorAll("a[aria-current]")) a.setAttribute("aria-current", "false");
      target.setAttribute("aria-current", "page");
      const from = oldPill.getBoundingClientRect().top - oldNav.getBoundingClientRect().top;
      oldPill.style.top = `${target.offsetTop}px`;
      oldPill.style.height = `${target.offsetHeight}px`;
      void move(oldPill, { y: [from - target.offsetTop, 0] }, SPRING);
    }
    await sink(leaving.children, { y: 10 });
    if (mine !== renders) return;
  }
  // Where the highlight is right now, mid-glide or at rest: the new one
  // carries on from there.
  const shownPill = app.querySelector<HTMLElement>("nav .pill");
  const shownNav = app.querySelector("nav");
  const pillFrom = shownPill && shownNav ? shownPill.getBoundingClientRect().top - shownNav.getBoundingClientRect().top : null;
  bar.setSubtitle(active.title);
  const c = overview.config;
  const link = (t: (typeof TABS)[number]) =>
    h(
      "a",
      { href: `#${t.id}`, "aria-current": t.id === active.id ? "page" : false, title: `Ctrl+${TABS.indexOf(t) + 1}` },
      icon(t.icon, 16),
      t.title,
    );
  // Two zones: what you do with Kenning, then Kenning itself. Between
  // them, the notices, empty on most days.
  const nav = h(
    "nav",
    {},
    TABS.filter((t) => !t.foot).map(link),
    h("div", { class: "nav-gap" }),
    (notices = h("div", { class: "nav-notices" })),
    h(
      "div",
      { class: "nav-foot" },
      TABS.filter((t) => t.foot).map(link),
      h("button", { type: "button", class: "nav-row", title: c.keys.help, onclick: () => toggleSheet(c) }, icon("keyboard", 16), "Shortcuts"),
      h(
        "button",
        { type: "button", class: "nav-meta", onclick: showUpdates, title: "What's new and updates" },
        icon("info", 16),
        h("span", {}, h("strong", {}, `Version ${overview.version}`), h("small", {}, "MIT licence")),
      ),
    ),
  );
  paintNotices();
  const pill = h("div", { class: "pill", "aria-hidden": "true" });
  nav.prepend(pill);
  const main = h("main");
  // After the onboarding, the panel is in the page before its data is
  // (the view awaits the shell): it waits there unseen, or it would show
  // at full strength, vanish as its entrance starts, and fade back in.
  if (arriving) {
    nav.style.opacity = "0";
    main.style.opacity = "0";
    bar.el.querySelector<HTMLElement>(".tb-sub")?.style.setProperty("opacity", "0");
  }
  clear(app, nav, main);

  // The highlight slides from the previous tab at once, while the page
  // loads: placed only after it, it would show unplaced at the top of the
  // sidebar (its bar is drawn even with no height), then jump back.
  // A refresh of the same tab (after an edit) does not replay anything.
  const current = nav.querySelector<HTMLElement>('a[aria-current="page"]');
  if (current) {
    pill.style.top = `${current.offsetTop}px`;
    pill.style.height = `${current.offsetHeight}px`;
    const from = pillFrom ?? lastPillTop;
    if (from !== null && Math.abs(from - current.offsetTop) > 0.5) {
      void move(pill, { y: [from - current.offsetTop, 0] }, SPRING);
    }
    lastPillTop = current.offsetTop;
  }
  if (overview.warnings.length) {
    main.appendChild(h("div", { class: "notice error" }, overview.warnings.join(" ")));
  }
  await active.view(main, overview, refresh);

  // The page lifts into place.
  if (arriving) {
    // After the onboarding: the sidebar slides in as the page rises, while
    // the title bar and the light settle (CSS transitions).
    // A scene change, once: slow and eased, no spring.
    arriving = false;
    // The page's children take over the fade from the page itself, in the
    // same frame, so nothing is painted in between.
    main.style.opacity = "";
    void move(nav, { opacity: [0, 1], x: [-12, 0] }, { duration: 0.7, ease: HANDOVER });
    void move(bar.el.querySelector(".tb-sub"), { opacity: [0, 1] }, { duration: 0.7, ease: HANDOVER, delay: 0.15 });
    void move(main.children, { opacity: [0, 1], y: [12, 0] }, { duration: 0.7, ease: HANDOVER, delay: stagger(0.07, { startDelay: 0.15 }) });
  } else if (active.id !== lastTab) void rise(main.children, { y: 10, gap: 0.035 });
  lastTab = active.id;
  focusPending();
}

window.addEventListener("hashchange", () => void render());
window.addEventListener("resize", placePill);

// Keyboard: Ctrl+1…5 sections, and the add / search / help keys from the
// config (Alt+N, Ctrl+F, Ctrl+/ unless changed in Settings).
/** An input to focus once the next render is done, and the button that
 *  reveals it if it is folded away (the book's add form). */
let pendingFocus: { selector: string; opener?: string } | null = null;

function focusPending() {
  if (!pendingFocus) return;
  const { selector, opener } = pendingFocus;
  pendingFocus = null;
  if (!document.querySelector(selector) && opener) document.querySelector<HTMLElement>(opener)?.click();
  document.querySelector<HTMLElement>(selector)?.focus();
}

function openWith(tab: string, selector: string, opener?: string) {
  pendingFocus = { selector, opener };
  if (currentTab() === tab) focusPending();
  else location.hash = tab;
}

document.addEventListener("keydown", (e) => {
  // Development builds only: Ctrl+Shift+L pins the light theme, then the
  // dark one, then follows the system again.
  const dev = (letter: string) =>
    import.meta.env.DEV && e.ctrlKey && e.shiftKey && !e.altKey && (e.code === `Key${letter.toUpperCase()}` || e.key.toLowerCase() === letter);
  if (dev("l")) {
    e.preventDefault();
    const root = document.documentElement;
    const next = { "": "light", light: "dark", dark: "" }[root.dataset.theme ?? ""] ?? "";
    if (next) root.dataset.theme = next;
    else delete root.dataset.theme;
    toast(`Theme: ${next || "system"} (development)`);
    return;
  }
  // Development builds only: Ctrl+Shift+O opens the onboarding from the
  // start, and leaves it again (nothing is saved unless it is finished).
  if (dev("o")) {
    e.preventDefault();
    document.querySelector("main.onboarding")?.remove();
    document.querySelector(".intro")?.remove();
    location.hash = currentTab() === "welcome" ? "book" : "welcome";
    return;
  }
  if (!overview?.config.onboarded || currentTab() === "welcome") return;
  // Recording a new shortcut in Settings: leave the keys to the recorder.
  if (document.querySelector(".recorder.recording")) return;
  const keys = overview.config.keys;
  const digit = /^Digit([1-5])$/.exec(e.code);
  if (digit && e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    location.hash = TABS[Number(digit[1]) - 1].id;
  } else if (matches(e, keys.add)) {
    e.preventDefault();
    openWith("book", 'main input[aria-label="Address"]', "main > header .btn.primary");
  } else if (matches(e, keys.find)) {
    e.preventDefault();
    openWith("book", 'main input[aria-label="Filter"]');
  } else if (matches(e, keys.help)) {
    e.preventDefault();
    toggleSheet(overview.config);
  } else if (e.key === "Escape" && sheetOpen()) {
    void closeSheet();
  }
});
void on<string>("navigate", (tab) => {
  if (location.hash !== `#${tab}`) location.hash = tab;
  else void refresh();
});
// A check, automatic or from the sheet, answered.
void on<UpdateInfo | null>("update", (u) => {
  update = u;
  paintNotices();
});
// Paused or resumed, from the tray menu or the card.
void on<boolean>("paused", (on) => {
  if (!overview) return;
  overview.paused = on;
  paintNotices();
});
void refresh().then(async () => {
  // The window was created hidden: show it once this first page is on
  // screen (two frames: laid out, then painted), never blank.
  requestAnimationFrame(() => requestAnimationFrame(() => void ipc.mainReady()));
  // One found before this window opened.
  update = await ipc.updateFound();
  paintNotices();
});
