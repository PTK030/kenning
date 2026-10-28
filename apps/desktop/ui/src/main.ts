// Main window: book, check, protection, journal and settings.

import { $, clear, h } from "./dom";
import { ipc, on } from "./ipc";
import type { Overview } from "./types";
import { bookView } from "./views/book";
import { checkView } from "./views/check";
import { journalView } from "./views/journal";
import { protectionView } from "./views/protection";
import { settingsView } from "./views/settings";
import { welcomeView } from "./views/welcome";
import { icon, type IconName } from "./icons";
import { move, rise, SPRING, stagger } from "./motion";
import { titlebar } from "./titlebar";
import { closeSheet, sheetOpen, toggleSheet } from "./shortcutSheet";
import { keycaps, matches } from "./shortcuts";
import { toast } from "./toast";
import "./guard";

type View = (main: HTMLElement, overview: Overview, refresh: () => Promise<void>) => Promise<void> | void;

const TABS: { id: string; title: string; icon: IconName; view: View }[] = [
  { id: "book", title: "Address book", icon: "book", view: bookView },
  { id: "check", title: "Check", icon: "search", view: checkView },
  { id: "protection", title: "Protection", icon: "shield", view: protectionView },
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
/** Set when the onboarding hands over: the panel arrives instead of appearing. */
let arriving = false;
/** A gentle ease in and out, for the one change of scene. */
const HANDOVER = [0.4, 0, 0.2, 1] as const;

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
      // The panel's data is ready before anything moves, so there is no
      // empty beat between the onboarding leaving and the panel arriving.
      const next = await ipc.overview();
      await Promise.all([
        move(main, { opacity: [1, 0] }, { duration: 0.45, ease: HANDOVER }),
        move(bar.el.querySelector(".tb-sub"), { opacity: [1, 0] }, { duration: 0.45, ease: HANDOVER }),
      ]);
      overview = next;
      arriving = true;
      if (currentTab() === "book" && location.hash === "#book") void render();
      else location.hash = "book";
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
  // After the onboarding, the panel is in the page before its data is
  // (the view awaits the shell): it waits there unseen, or it would show
  // at full strength, vanish as its entrance starts, and fade back in.
  if (arriving) {
    nav.style.opacity = "0";
    main.style.opacity = "0";
    bar.el.querySelector<HTMLElement>(".tb-sub")?.style.setProperty("opacity", "0");
  }
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
void refresh();
