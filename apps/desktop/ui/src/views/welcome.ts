// First run, in eight short steps: what Kenning is, how it speaks, a
// sandbox to try it with your own hands, its keys, when it reads the clipboard, your
// first addresses, a few preferences, and a test on the real clipboard.
// Each step slides in from the direction you are going; the panel on the
// right shows the thing being described rather than describing it.
// Enter continues, the left arrow goes back.

import { addressWithDiff, CHAIN_NAME } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { ipc, message } from "../ipc";
import { draw, EASE_IN, EASE_OUT, move, POP, rise, SPRING, stagger } from "../motion";
import type { Overview, Recognition } from "../types";
import { group, KNOWN, POISON, shortAddr, spans } from "./demo";
import { sandbox } from "./sandbox";
import { keysStep } from "./keys";
import { playIntro } from "./intro";
import { cue } from "../sound";
import iconUrl from "../../../src-tauri/icons/128x128@2x.png";

/** A real stablecoin contract, recognised by its public label. */
const SAMPLE = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
/** Shares its first 6 and last 4 characters with SAMPLE. */
const SAMPLE_LOOKALIKE = "0xa0b869111111111111111111111111111111eb48";

const STEPS = ["hello", "how", "try", "keys", "clipboard", "book", "prefs", "done"] as const;
type Step = (typeof STEPS)[number];

type Added = { label: string; address: string; chain: string };

export function welcomeView(main: HTMLElement, overview: Overview, done: () => Promise<void>) {
  const c = overview.config;
  const s = {
    step: 0,
    watch: c.clipboard === "watch" || !c.onboarded,
    sounds: c.sounds,
    autostart: c.autostart,
    network: c.network,
    added: [] as Added[],
    saved: false,
  };
  /** Timers and loops owned by the current step, stopped when it leaves. */
  let stops: (() => void)[] = [];
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    stops.push(() => clearTimeout(t));
  };
  const every = (fn: () => void, ms: number) => {
    const t = setInterval(fn, ms);
    stops.push(() => clearInterval(t));
  };

  const stepText = h("span", { class: "ob-count" });
  const bar = h("span");
  const stage = h("div", { class: "ob-stage" });
  const error = h("div", { class: "ob-error", role: "alert" });
  const back = h("button", { class: "btn ghost", onclick: () => void go(s.step - 1) }, icon("arrowLeft", 16), "Back");
  const next = h("button", { class: "btn primary big", onclick: () => void forward() });

  clear(
    main,
    h(
      "div",
      { class: "ob" },
      h(
        "header",
        { class: "ob-top" },
        stepText,
        h("div", { class: "ob-progress", "aria-hidden": "true" }, bar),
      ),
      stage,
      h("footer", { class: "ob-foot" }, back, error, h("span", { class: "spacer" }), next),
    ),
  );

  async function forward() {
    error.textContent = "";
    try {
      if (STEPS[s.step] === "prefs") await savePrefs();
      if (STEPS[s.step] === "done") {
        next.disabled = true;
        await ipc.finishOnboarding(s.watch);
        stops.forEach((f) => f());
        document.removeEventListener("keydown", onKey);
        await done();
        return;
      }
      await go(s.step + 1);
    } catch (e) {
      error.textContent = message(e);
      next.disabled = false;
    }
  }

  /** Settings take effect before the last step, so the test there is real. */
  async function savePrefs() {
    const fresh = (await ipc.overview()).config;
    await ipc.saveConfig({
      ...fresh,
      clipboard: s.watch ? "watch" : "shortcut",
      sounds: s.sounds,
      autostart: s.autostart,
    });
    if (fresh.network !== s.network) await ipc.setNetwork(s.network);
    s.saved = true;
  }

  /** Done with this step: Continue takes focus and breathes, so Enter or
   *  a click moves on. */
  function suggestNext() {
    next.classList.add("ready");
    next.focus({ preventScroll: true });
    void move(next, { scale: [1, 1.05, 1] }, { duration: 0.45, ease: "easeOut" });
  }

  /** A step change in flight; clicks and keys wait for it. */
  let busy = false;

  async function go(n: number) {
    if (busy || n < 0 || n >= STEPS.length) return;
    busy = true;
    next.classList.remove("ready");
    const dir = n >= s.step ? 1 : -1;
    if (s.sounds && s.step !== n && document.querySelector(".ob-panel")) cue(dir > 0 ? "step" : "back");
    stops.forEach((f) => f());
    stops = [];
    const old = stage.firstElementChild;
    if (old) await move(old, { opacity: 0, x: -20 * dir }, { duration: 0.16, ease: EASE_IN });
    s.step = n;

    const step = STEPS[n];
    const panel = BUILD[step]();
    clear(stage, panel);

    stepText.textContent = `Step ${n + 1} of ${STEPS.length}`;
    void move(bar, { scaleX: (n + 1) / STEPS.length }, { duration: 0.6, ease: EASE_OUT });
    back.style.visibility = n === 0 ? "hidden" : "visible";
    clear(next, NEXT_LABEL[step], icon(step === "done" ? "check" : "arrowRight", 16));

    // The panel only slides; its parts fade in one after another. Fading
    // both at once multiplies the opacities and reads as a flicker.
    void move(panel, { x: [28 * dir, 0] }, SPRING);
    void move(panel.querySelectorAll(".ob-copy > *"), { opacity: [0, 1], y: [10, 0] }, { ...SPRING, delay: stagger(0.045) });
    void move(panel.querySelector(".ob-visual"), { opacity: [0, 1], x: [24 * dir, 0], scale: [0.97, 1] }, { ...SPRING, delay: 0.06 });
    ENTER[step]?.(panel);
    busy = false;
  }

  // Enter continues and the left arrow goes back, except while typing.
  const onKey = (e: KeyboardEvent) => {
    // A key during the intro only skips it.
    if (document.querySelector(".intro")) return;
    const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, button");
    if (e.key === "Enter" && !typing) {
      e.preventDefault();
      void forward();
    } else if (e.key === "ArrowLeft" && !typing) {
      void go(s.step - 1);
    }
  };
  document.addEventListener("keydown", onKey);

  const NEXT_LABEL: Record<Step, string> = {
    hello: "Get started",
    how: "Try it",
    try: "Continue",
    keys: "Continue",
    clipboard: "Continue",
    book: "Continue",
    prefs: "Save and continue",
    done: "Open my address book",
  };

  const panel = (copy: (Node | string)[], visual: Node) =>
    h("div", { class: "ob-panel" }, h("div", { class: "ob-copy" }, ...copy), h("div", { class: "ob-visual" }, visual));

  // ---- Steps ---------------------------------------------------------------

  const BUILD: Record<Step, () => HTMLElement> = {
    hello: () =>
      panel(
        [
          h("h1", {}, "Know what you copied."),
          h(
            "p",
            { class: "lead" },
            "Kenning names the crypto addresses you copy and tells you when one only looks like an address you know. The rest of the time it stays quiet.",
          ),
          h(
            "ul",
            { class: "ob-facts" },
            (
              [
                ["fileCheck", "Open source, MIT"],
                ["power", "Runs on this computer"],
                ["user", "No account, no telemetry"],
                ["globe", "Network off unless you turn it on"],
              ] as [IconName, string][]
            ).map(([i, t]) => h("li", {}, icon(i, 16), t)),
          ),
        ],
        h(
          "div",
          { class: "ob-hello" },
          h("img", { class: "ob-logo", src: iconUrl, alt: "" }),
          h(
            "div",
            { class: "ob-spec" },
            h("small", {}, "Your Binance"),
            addressWithDiff(group(KNOWN), spans(KNOWN, POISON)),
            h("small", {}, "You copied"),
            addressWithDiff(group(POISON), spans(POISON, KNOWN)),
          ),
        ),
      ),

    how: () =>
      panel(
        [
          h("h1", {}, "Two signals, never alike."),
          bullet("checkCircle", "mine", "A badge for addresses you know", "It appears in the corner for a few seconds with the name you gave it, and never takes focus from what you are doing."),
          bullet("alert", "look", "A window when one only looks familiar", "Both addresses in full, every difference marked, and one button that puts the right one back. It stays until you choose."),
        ],
        h(
          "div",
          { class: "ob-how" },
          h(
            "div",
            { class: "ob-badge" },
            h("span", { class: "tile" }, icon("checkCircle", 20)),
            h("span", { class: "t" }, h("b", {}, "Binance deposits"), h("code", {}, "0x28C6 c062 … 1d60")),
            h("i", { class: "bar" }),
          ),
          h(
            "div",
            { class: "ob-look" },
            h("div", { class: "top" }, icon("alert", 18), h("b", {}, "This is not your Binance address.")),
            addressWithDiff(group(POISON), spans(POISON, KNOWN)),
            h("span", { class: "fix" }, icon("copy", 14), "Copy the correct address"),
          ),
        ),
      ),

    try: () => {
      const box = sandbox({
        sounds: () => s.sounds,
        later,
        onComplete: () => later(suggestNext, 500),
      });
      return panel(box.copy, box.visual);
    },

    keys: () => {
      const k = keysStep({ config: c, sounds: () => s.sounds, later, own: (stop) => stops.push(stop), onComplete: suggestNext });
      return panel(k.copy, k.visual);
    },

    clipboard: () => {
      const visual = h("div", { class: "ob-mode" });
      const cards = h("div", { class: "ob-choices" });
      const paint = () => {
        clear(
          cards,
          choice(false, "keyboard", `Only when I press ${c.shortcut}`, "Recommended to start. Kenning reads nothing until you ask, then checks what is on the clipboard."),
          choice(true, "clipboard", "Every time I copy", "Kenning checks each copy as it happens. Only single addresses are looked at; other text is ignored and never stored."),
        );
        drawMode(visual);
      };
      const choice = (value: boolean, ic: IconName, title: string, text: string) =>
        h(
          "button",
          {
            class: "ob-choice",
            "aria-pressed": s.watch === value ? "true" : "false",
            onclick: () => {
              if (s.watch === value) return;
              s.watch = value;
              if (s.sounds) cue("on");
              paint();
              void move(visual.firstElementChild, { opacity: [0, 1], scale: [0.94, 1] }, SPRING);
            },
          },
          h("span", { class: "ic" }, icon(ic, 20)),
          h("span", {}, h("strong", {}, title), h("span", { class: "muted" }, text)),
        );
      paint();
      return panel(
        [
          h("h1", {}, "When should Kenning look?"),
          h("p", { class: "lead" }, "Pick one. You can switch any time from the tray icon."),
          cards,
          h("p", { class: "muted small" }, "Content that password managers mark as private is skipped before it is read, in both modes."),
        ],
        visual,
      );
    },

    book: () => {
      const list = h("ul", { class: "ob-book" });
      const label = h("input", { type: "text", placeholder: "Name, e.g. Binance deposits", "aria-label": "Name" });
      const address = h("input", { type: "text", placeholder: "Address", "aria-label": "Address", spellcheck: "false" });
      const preview = h("div", { class: "ob-preview" });
      const add = h("button", { class: "btn primary", disabled: true }, icon("plusCircle", 16), "Add");
      let found: Recognition | null = null;

      const paintList = () => {
        if (!s.added.length) {
          clear(list, h("li", { class: "empty-row" }, "Names you add appear here."));
          return;
        }
        clear(
          list,
          s.added.map((a) => h("li", {}, h("span", { class: "ic" }, icon("checkCircle", 16)), h("b", {}, a.label), h("code", {}, shortAddr(a.address)), h("small", {}, a.chain))),
        );
      };
      const check = async () => {
        const text = address.value.trim();
        found = null;
        add.disabled = true;
        if (!text) return clear(preview);
        try {
          const r = (await ipc.recognizeText(text))[0];
          if (!r) return clear(preview, h("span", { class: "bad" }, "Not an address Kenning knows how to read."));
          found = r;
          add.disabled = !label.value.trim();
          clear(preview, h("span", { class: "chain" }, CHAIN_NAME[r.address.chain]), h("span", { class: "addr" }, r.grouped));
        } catch (e) {
          clear(preview, h("span", { class: "bad" }, message(e)));
        }
      };
      const save = async () => {
        if (!found || !label.value.trim()) return;
        try {
          await ipc.addEntry(found.address.text, label.value.trim(), "me", null);
          s.added.unshift({ label: label.value.trim(), address: found.address.text, chain: CHAIN_NAME[found.address.chain] });
          label.value = address.value = "";
          clear(preview);
          add.disabled = true;
          paintList();
          if (s.sounds) cue("tick");
          void move(list.firstElementChild, { opacity: [0, 1], y: [-12, 0], scale: [0.97, 1] }, POP);
          label.focus();
        } catch (e) {
          clear(preview, h("span", { class: "bad" }, message(e)));
        }
      };
      address.addEventListener("input", () => void check());
      label.addEventListener("input", () => (add.disabled = !found || !label.value.trim()));
      for (const el of [label, address]) el.addEventListener("keydown", (e) => e.key === "Enter" && void save());
      add.addEventListener("click", () => void save());
      paintList();

      return panel(
        [
          h("h1", {}, "Name the addresses you use."),
          h("p", { class: "lead" }, "Kenning catches lookalikes of the addresses it knows, so start with the ones you send to most."),
          h("div", { class: "ob-form" }, label, address, preview, h("div", { class: "row" }, add, h(
            "button",
            {
              class: "btn ghost",
              onclick: async () => {
                try {
                  const r = await ipc.importCsv("me");
                  if (r) {
                    s.added.unshift({ label: `${r.added + r.updated} imported`, address: "", chain: "CSV" });
                    paintList();
                    void move(list.firstElementChild, { opacity: [0, 1], y: [-12, 0] }, POP);
                  }
                } catch (e) {
                  clear(preview, h("span", { class: "bad" }, message(e)));
                }
              },
            },
            icon("upload", 16),
            "Import CSV or Safe export",
          ))),
          h("p", { class: "muted small" }, "You can skip this and add addresses later in the address book."),
        ],
        h("div", { class: "ob-bookwrap" }, h("div", { class: "ob-bookhead" }, icon("book", 16), "Your address book"), list),
      );
    },

    prefs: () => {
      const toggle = (key: "sounds" | "autostart" | "network", ic: IconName, title: string, text: string) => {
        const input = h("input", {
          type: "checkbox",
          role: "switch",
          checked: s[key],
          onchange: (e: Event) => {
            s[key] = (e.target as HTMLInputElement).checked;
            if (s.sounds || key === "sounds") cue(s[key] ? "on" : "off");
            if (key === "network") paintHosts();
          },
        });
        return h("label", { class: "ob-toggle" }, h("span", { class: "ic" }, icon(ic, 18)), h("span", {}, h("strong", {}, title), h("span", { class: "muted" }, text)), input, h("i", { class: "switch" }));
      };
      const hosts = h("div", { class: "ob-hosts" });
      const paintHosts = () => {
        clear(
          hosts,
          h("div", { class: "ob-bookhead" }, icon(s.network ? "globe" : "power", 16), s.network ? "Kenning will ask only these hosts" : "Everything stays on this computer"),
          s.network
            ? h("ul", {}, overview.hosts.map(([chain, host]) => h("li", {}, h("b", {}, chain), h("code", {}, host))))
            : h(
                "ul",
                {},
                ["book.toml", "history.json", "journal.jsonl", "config.toml"].map((f) => h("li", {}, h("b", {}, f), h("code", {}, overview.home))),
              ),
        );
        void rise(hosts.querySelectorAll("li"), { y: 6, gap: 0.04 });
      };
      paintHosts();
      return panel(
        [
          h("h1", {}, "A few preferences."),
          toggle("sounds", "volume", "Soft sounds", "A short chime for a known address, a lower two-note sound for a lookalike."),
          toggle("autostart", "power", "Start with Windows", "Kenning waits in the tray from the moment you sign in."),
          toggle("network", "globe", "On-chain lookups", "Shows whether an address was ever used. Only the address is sent, to one public provider per chain."),
        ],
        hosts,
      );
    },

    done: () => {
      const hint = h("p", { class: "ob-try-hint muted" });
      const tryCopy = (text: string, what: string) => async () => {
        try {
          await navigator.clipboard.writeText(text);
          hint.textContent = s.watch
            ? `Copied ${what}. Watch the ${what === "a lookalike" ? "middle of the screen" : "corner of the screen"}.`
            : `Copied ${what}. Now press ${c.shortcut}.`;
        } catch {
          hint.textContent = `Copy this yourself: ${text}`;
        }
        void move(hint, { opacity: [0, 1], y: [6, 0] }, SPRING);
      };
      return panel(
        [
          h("h1", {}, "Now for real."),
          h("p", { class: "lead" }, "Kenning is running. These buttons put a test address on your actual clipboard, the way copying from a wallet would."),
          h(
            "div",
            { class: "ob-try" },
            h("button", { class: "btn", onclick: tryCopy(SAMPLE, "USDC") }, icon("checkCircle", 16), "Copy a known address"),
            h("button", { class: "btn", onclick: tryCopy(SAMPLE_LOOKALIKE, "a lookalike") }, icon("alert", 16), "Copy a lookalike"),
          ),
          hint,
          h("p", { class: "muted small" }, "Kenning lives in the tray. Right-click its icon for settings, pause and the address book."),
        ],
        h("div", { class: "ob-done" }, h("div", { class: "ring" }), h("div", { class: "seal" }, icon("check", 56))),
      );
    },
  };

  // ---- Entrances that are more than a fade -------------------------------

  const ENTER: Partial<Record<Step, (panel: HTMLElement) => void>> = {
    hello: (p) => {
      void move(p.querySelector(".ob-logo"), { scale: [0.6, 1], rotate: [-8, 0], opacity: [0, 1] }, { ...POP, delay: 0.1 });
      void rise(p.querySelectorAll(".ob-spec > *"), { y: 8, delay: 0.35, gap: 0.08 });
      const diffs = p.querySelectorAll(".addr .diff");
      later(() => {
        diffs.forEach((d) => d.classList.add("lit"));
        void move(diffs, { y: [-3, 0], opacity: [0.3, 1] }, { ...POP, delay: stagger(0.04) });
      }, 900);
    },
    how: (p) => {
      const badge = p.querySelector<HTMLElement>(".ob-badge")!;
      const look = p.querySelector<HTMLElement>(".ob-look")!;
      const cycle = () => {
        void move(badge, { opacity: [0, 1], x: [24, 0] }, SPRING);
        void move(badge.querySelector(".bar"), { scaleX: [1, 0] }, { duration: 3.2, ease: "linear" });
        draw(badge.querySelector("svg"), { delay: 0.1 });
        later(() => void move(badge, { opacity: 0, x: 14 }, { duration: 0.24, ease: EASE_IN }), 3300);
      };
      cycle();
      every(cycle, 4200);
      void move(look, { opacity: [0, 1], y: [18, 0] }, { ...SPRING, delay: 0.3 });
      void move(look.querySelectorAll(".diff"), { opacity: [0.2, 1] }, { duration: 0.3, delay: stagger(0.04, { startDelay: 0.7 }) });
    },
    clipboard: () => undefined,
    done: (p) => {
      draw(p.querySelector(".seal svg"), { delay: 0.2, duration: 0.7 });
      void move(p.querySelector(".seal"), { scale: [0.5, 1] }, { ...POP, delay: 0.05 });
      const ring = p.querySelector(".ring");
      const pulse = () => void move(ring, { scale: [0.8, 1.5], opacity: [0.5, 0] }, { duration: 1.6, ease: EASE_OUT });
      pulse();
      every(pulse, 2200);
    },
  };

  /** The right-hand picture for the clipboard step: keys or a clipboard. */
  function drawMode(visual: HTMLElement) {
    stops.forEach((f) => f());
    stops = [];
    if (!s.watch) {
      const keys = c.shortcut.split("+").map((k) => h("kbd", {}, k));
      clear(visual, h("div", { class: "keys" }, keys), h("p", {}, "Press to check what you copied."));
      const press = () =>
        keys.forEach((k, i) =>
          later(() => void move(k, { y: [0, 4, 0] }, { duration: 0.32, ease: "easeInOut" }), i * 90),
        );
      later(press, 500);
      every(press, 2400);
    } else {
      const sheet = h("div", { class: "clip" }, icon("clipboard", 44));
      const ping = h("span", { class: "ping" });
      clear(visual, h("div", { class: "clipwrap" }, ping, sheet), h("p", {}, "Every copy is checked as it happens."));
      const tick = () => {
        void move(sheet, { scale: [1, 0.92, 1] }, { duration: 0.4 });
        void move(ping, { scale: [0.6, 1.6], opacity: [0.55, 0] }, { duration: 1.1, ease: EASE_OUT });
      };
      later(tick, 400);
      every(tick, 1800);
    }
  }

  // The intro plays over the stage; the first step enters as it leaves.
  void playIntro(main, { sounds: c.sounds, leaving: () => void go(0) });
}

// ---- Helpers ---------------------------------------------------------------

function bullet(ic: IconName, tone: string, title: string, text: string) {
  return h("div", { class: `ob-bullet ${tone}` }, h("span", { class: "ic" }, icon(ic, 18)), h("div", {}, h("strong", {}, title), h("p", { class: "muted" }, text)));
}


