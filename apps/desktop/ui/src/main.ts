// Main window: book, check, journal, settings, and the trust page.

import { $, clear, h } from "./dom";
import { ipc, on } from "./ipc";
import type { Overview } from "./types";
import { bookView } from "./views/book";
import { checkView } from "./views/check";
import { journalView } from "./views/journal";
import { settingsView } from "./views/settings";
import { trustView } from "./views/trust";
import { welcomeView } from "./views/welcome";
import { icon, type IconName } from "./icons";
import { move, rise, SPRING } from "./motion";
import { titlebar } from "./titlebar";
import { closeSheet, sheetOpen, toggleSheet } from "./shortcutSheet";

type View = (main: HTMLElement, overview: Overview, refresh: () => Promise<void>) => Promise<void> | void;

const TABS: { id: string; title: string; icon: IconName; view: View }[] = [
  { id: "book", title: "Address book", icon: "book", view: bookView },
  { id: "check", title: "Check", icon: "search", view: checkView },
  { id: "journal", title: "Journal", icon: "journal", view: journalView },
  { id: "settings", title: "Settings", icon: "sliders", view: settingsView },
  { id: "trust", title: "What it reads", icon: "fileCheck", view: trustView },
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
      h("span", {}, c.network ? "Network: on" : "Network: off"),
      h("span", {}, c.clipboard === "watch" ? (overview.paused ? "Clipboard: paused" : "Clipboard: watched") : `Clipboard: ${c.shortcut} only`),
      h("span", {}, `Version ${overview.version}`),
      h("span", {}, "MIT licence"),
      h("button", { class: "keys-hint", onclick: () => toggleSheet(c.shortcut) }, h("kbd", {}, "?"), "Shortcuts"),
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

// Keyboard: Ctrl+1…5 sections, Ctrl+N add, Ctrl+F check, ? shortcuts.
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
  if (!overview?.config.onboarded || currentTab() === "welcome") return;
  const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select");
  const key = e.key.toLowerCase();
  if (e.ctrlKey && !e.altKey && /^[1-5]$/.test(key)) {
    e.preventDefault();
    location.hash = TABS[Number(key) - 1].id;
  } else if (e.ctrlKey && !e.altKey && key === "n") {
    e.preventDefault();
    openWith("book", 'main input[aria-label="Address"]', "main > header .btn.primary");
  } else if (e.ctrlKey && !e.altKey && key === "f") {
    e.preventDefault();
    openWith("check", "main textarea");
  } else if (e.key === "?" && !typing) {
    e.preventDefault();
    toggleSheet(overview.config.shortcut);
  } else if (e.key === "Escape" && sheetOpen()) {
    void closeSheet();
  }
});
void on<string>("navigate", (tab) => {
  if (location.hash !== `#${tab}`) location.hash = tab;
  else void refresh();
});
void refresh();
