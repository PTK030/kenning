// "Try it yourself": a wallet history inside the onboarding where you copy
// rows and Kenning answers exactly as it would on your desktop: a quiet
// badge for the address you know, the lookalike window for the poisoned
// one, and one click to take the right address back. Nothing here touches
// the real clipboard.

import { chainMark, tokenMark } from "../chainMarks";
import { clear, h } from "../dom";
import { icon } from "../icons";
import { draw, EASE_IN, move, POP, rise, SPRING } from "../motion";
import { cue, playFor } from "../sound";
import type { Recognition, State } from "../types";
import { KNOWN, KNOWN_RECOGNITION, LOOKALIKE_RECOGNITION, NEW_ADDRESS, NEW_RECOGNITION, POISON, shortAddr } from "./demo";
import { badgeEnter, badgeLeave, fillBadge, fillLookalike, lookalikeEnter } from "../alerts";
import { titlebar } from "../titlebar";
import { DEFAULT_KEYS } from "../shortcuts";

type Task = "known" | "poison" | "fix";

const TASKS: { id: Task; title: string; hint: string }[] = [
  { id: "known", title: "Copy the address you paid", hint: "The older row: you sent 2,400 USDT there." },
  { id: "poison", title: "Copy the newest row", hint: "A stranger sent you 0 USDT. It looks the same at a glance." },
  { id: "fix", title: "Take the right address back", hint: "One click in the window that opens." },
];

export type Sandbox = { copy: HTMLElement[]; visual: HTMLElement };

export function sandbox(opts: {
  sounds: () => boolean;
  later: (fn: () => void, ms: number) => void;
  onComplete: () => void;
}): Sandbox {
  const done = new Set<Task>();
  const sound = (state: State) => opts.sounds() && playFor(state);

  // ---- Left: the task list --------------------------------------------
  const items = new Map<Task, HTMLElement>();
  const list = h(
    "ol",
    { class: "sbx-tasks" },
    TASKS.map((t, i) => {
      const li = h(
        "li",
        { class: i === 0 ? "now" : "" },
        h("span", { class: "mark" }, String(i + 1)),
        h("span", {}, h("strong", {}, t.title), h("span", { class: "muted" }, t.hint)),
      );
      items.set(t.id, li);
      return li;
    }),
  );
  const finale = h("p", { class: "sbx-finale", hidden: true }, "That is all there is to it: quiet when the address is right, impossible to miss when it is not.");

  const complete = (task: Task) => {
    if (done.has(task)) return;
    done.add(task);
    const li = items.get(task)!;
    li.classList.remove("now");
    li.classList.add("done");
    if (opts.sounds()) opts.later(() => cue("tick"), 420);
    const mark = li.querySelector(".mark")!;
    mark.replaceChildren(icon("check", 14));
    void move(mark, { scale: [0.4, 1] }, POP);
    draw(mark.querySelector("svg"), { duration: 0.35 });
    const next = TASKS.find((t) => !done.has(t.id));
    for (const [id, el] of items) el.classList.toggle("now", id === next?.id);
    if (!next) {
      finale.hidden = false;
      void move(finale, { opacity: [0, 1], y: [8, 0] }, { ...SPRING, delay: 0.3 });
      opts.onComplete();
    }
  };

  // ---- Right: the wallet, the badge and the lookalike window ------------
  const stage = h("div", { class: "sbx" });
  const badgeSlot = h("div", { class: "sbx-badge-slot" });
  let badgeTimer = 0;

  // The real badge (alerts.ts) for what was copied, coming and going as
  // the real one does, its bar counting down.
  const showBadge = (recognition: Recognition) => {
    clearTimeout(badgeTimer);
    const badge = h("div");
    const bar = fillBadge(badge, { kind: "recognition", recognition, seconds: 4, sounds: false });
    clear(badgeSlot, badge);
    badgeEnter(badge);
    void move(bar, { scaleX: [1, 0] }, { duration: 3.4, ease: "linear" });
    badgeTimer = window.setTimeout(() => void badgeLeave(badge), 3500);
  };

  const wallet = h("div", { class: "sbx-wallet" });
  const row = (dir: "in" | "out", what: string, who: string, amount: string, when: string, onCopy: () => void) => {
    const copy = h("button", { class: "sbx-copy", "aria-label": `Copy ${who}`, title: "Copy address" }, icon("copy", 15));
    copy.addEventListener("click", () => {
      copy.classList.add("copied");
      clear(copy, icon("check", 15));
      void move(copy, { scale: [0.85, 1] }, POP);
      opts.later(() => {
        copy.classList.remove("copied");
        clear(copy, icon("copy", 15));
      }, 1400);
      onCopy();
    });
    return h(
      "li",
      { class: "sbx-row" },
      h("span", { class: `sbx-dir ${dir}` }, icon(dir === "in" ? "arrowLeft" : "arrowRight", 15)),
      h("span", { class: "sbx-main" }, h("b", {}, what), h("code", {}, `${dir === "in" ? "from" : "to"} ${shortAddr(who)}`)),
      h("span", { class: "sbx-side" }, h("b", {}, amount), h("span", {}, when)),
      copy,
    );
  };

  let look: HTMLElement | null = null;
  const closeLook = async () => {
    if (!look) return;
    const el = look;
    look = null;
    void move(wallet, { scale: 1, opacity: 1, filter: "blur(0px)" }, SPRING);
    await move(el, { opacity: 0, y: 16, scale: 0.97 }, { duration: 0.22, ease: EASE_IN });
    el.remove();
  };
  // The real lookalike window (alerts.ts) over the wallet: its title bar,
  // its content, its entrance. Its buttons work as in the app: the right
  // address goes back on the clipboard (and, with every copy watched, its
  // badge follows), or the window goes.
  const openLook = () => {
    if (look) return;
    const bar = titlebar({ title: "Not the address you know", sign: "alert", onClose: () => void closeLook() }).el;
    for (const el of [bar, ...bar.querySelectorAll("[data-tauri-drag-region]")]) el.removeAttribute("data-tauri-drag-region");
    const card = h("div");
    fillLookalike(card, { recognition: LOOKALIKE_RECOGNITION, variant: 0, sounds: false }, DEFAULT_KEYS, {
      copy: async () => {
        void closeLook();
        sound("mine");
        showBadge(KNOWN_RECOGNITION);
        complete("fix");
      },
      mine: async () => void closeLook(),
      dismiss: () => void closeLook(),
    }, false);
    look = h("div", { class: "sbx-look" }, h("div", { class: "look-window", role: "alertdialog", "aria-label": "Not the address you know" }, bar, card));
    stage.appendChild(look);
    void move(wallet, { scale: 0.95, opacity: 0.4, filter: "blur(2px)" }, SPRING);
    void move(look, { opacity: [0, 1] }, { duration: 0.2 });
    lookalikeEnter(card, 0);
    card.querySelector<HTMLButtonElement>(".actions .primary")?.focus();
  };

  clear(
    wallet,
    h("div", { class: "sbx-head" }, h("b", {}, "Activity"), h("span", { class: "chips" }, h("span", { class: "meta-chip" }, tokenMark("usdt", 14), "USDT"), h("span", { class: "meta-chip" }, chainMark("evm", 14), "Ethereum"))),
    h(
      "ul",
      {},
      row("in", "Received", POISON, "0 USDT", "just now", () => {
        sound("lookalike");
        openLook();
        complete("poison");
      }),
      row("out", "Sent", KNOWN, "2,400 USDT", "3 days ago", () => {
        void closeLook();
        sound("mine");
        showBadge(KNOWN_RECOGNITION);
        complete("known");
      }),
      row("out", "Sent", NEW_ADDRESS, "120 USDT", "last week", () => {
        void closeLook();
        sound("new");
        showBadge(NEW_RECOGNITION);
      }),
    ),
  );
  clear(stage, wallet, badgeSlot);

  const enter = () => {
    void rise(wallet.querySelectorAll(".sbx-row"), { y: 10, delay: 0.25, gap: 0.08 });
    void rise(list.children, { y: 8, delay: 0.15, gap: 0.07 });
  };
  opts.later(enter, 0);

  return {
    copy: [
      h("h1", {}, "Try it yourself."),
      h("p", { class: "lead" }, "This is a wallet history like yours. Copy rows from it and watch what Kenning does."),
      list,
      finale,
    ],
    visual: stage,
  };
}
