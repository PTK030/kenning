// Main window: book, check, journal and settings.

import { $, clear, h } from "./dom";
import { ipc, on } from "./ipc";
import type { Overview } from "./types";
import { bookView } from "./views/book";
import { checkView } from "./views/check";
import { journalView } from "./views/journal";
import { settingsView } from "./views/settings";
import { welcomeView } from "./views/welcome";
import { icon, type IconName } from "./icons";
import { move, rise, SPRING } from "./motion";
import { titlebar } from "./titlebar";
import { closeSheet, sheetOpen, toggleSheet } from "./shortcutSheet";
import { keycaps, matches } from "./shortcuts";
import "./guard";

type View = (main: HTMLElement, overview: Overview, refresh: () => Promise<void>) => Promise<void> | void;

const TABS: { id: string; title: string; icon: IconName; view: View }[] = [
  { id: "book", title: "Address book", icon: "book", view: bookView },
  { id: "check", title: "Check", icon: "search", view: checkView },
  { id: "journal", title: "Journal", icon: "journal", view: journalView },
  { id: "settings", title: "Settings", icon: "sliders", view: settingsView },
];

const app = $("#app");
const bar = titlebar({ title: "Kenning", minimize: true, maximize: true });
$("#chrome").replaceWith(bar.el);
let overview: Overview;
/** The tab drawn last, and where its highlight sat, so a change can glide. */
let lastTab = "";
let lastPillTop: number | null = null;

function currentTab(): string {
  return location.hash.replace("#", "") || "book";
}

async function refresh() {
  overview = await ipc.overview();
  await render();
}

async function render() {
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
      location.hash = "book";
      await refresh();
    });
    return;
  }
  app.style.display = "";
  document.body.classList.remove("immersive");
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  bar.setSubtitle(active.title);
  const c = overview.config;
  const nav = h(
    "nav",
    {},
    TABS.map((t) =>
      h("a", { href: `#${t.id}`, "aria-current": t.id === active.id ? "page" : false }, icon(t.icon, 16), t.title),
    ),
    h(
      "div",
      { class: "facts" },
      h("button", { class: "keys-hint", onclick: () => toggleSheet(c) }, "Shortcuts", keycaps(c.keys.help)),
      h("span", { class: "facts-meta" }, `Kenning ${overview.version}, MIT licence`),
    ),
  );
  const pill = h("div", { class: "pill", "aria-hidden": "true" });
  nav.prepend(pill);
  const main = h("main");
  clear(app, nav, main);
  if (overview.warnings.length) {
    main.appendChild(h("div", { class: "notice error" }, overview.warnings.join(" ")));
  }
  await active.view(main, overview, refresh);

  // The highlight slides from the previous tab; the page lifts into place.
  // A refresh of the same tab (after an edit) does not replay anything.
  const link = nav.querySelector<HTMLElement>('a[aria-current="page"]');
  if (link) {
    pill.style.top = `${link.offsetTop}px`;
    pill.style.height = `${link.offsetHeight}px`;
    if (lastPillTop !== null && lastPillTop !== link.offsetTop) {
      void move(pill, { y: [lastPillTop - link.offsetTop, 0] }, SPRING);
    }
    lastPillTop = link.offsetTop;
  }
  if (active.id !== lastTab) void rise(main.children, { y: 10, gap: 0.035 });
  lastTab = active.id;
  focusPending();
}

window.addEventListener("hashchange", () => void render());

// Keyboard: Ctrl+1…4 sections, and the add / search / help keys from the
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
  // Development builds only: Ctrl+Shift+O starts the onboarding over.
  if (import.meta.env.DEV && e.ctrlKey && e.shiftKey && !e.altKey && e.code === "KeyO") {
    e.preventDefault();
    document.querySelector("main.onboarding")?.remove();
    if (currentTab() === "welcome") void render();
    else location.hash = "welcome";
    return;
  }
  if (!overview?.config.onboarded || currentTab() === "welcome") return;
  // Recording a new shortcut in Settings: leave the keys to the recorder.
  if (document.querySelector(".recorder.recording")) return;
  const keys = overview.config.keys;
  const digit = /^Digit([1-4])$/.exec(e.code);
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
void refresh();
