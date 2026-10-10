// "Try it yourself": a wallet history inside the onboarding where you copy
// rows and Kenning answers exactly as it would on your desktop: a quiet
// badge for the address you know, the lookalike window for the poisoned
// one, and one click to take the right address back. Nothing here touches
// the real clipboard.

import { addressWithDiff } from "../address";
import { clear, h } from "../dom";
import { icon, type IconName } from "../icons";
import { draw, EASE_IN, move, POP, rise, SPRING, stagger } from "../motion";
import { playFor } from "../sound";
import type { State } from "../types";
import { group, KNOWN, POISON, shortAddr, spans } from "./demo";

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

  const showBadge = (ic: IconName, title: string, line: string, tone: "mine" | "info") => {
    clearTimeout(badgeTimer);
    const bar = h("i", { class: "bar" });
    const badge = h(
      "div",
      { class: `sbx-badge ${tone}` },
      h("span", { class: "tile" }, icon(ic, 18)),
      h("span", { class: "t" }, h("b", {}, title), h("span", {}, line)),
      bar,
    );
    clear(badgeSlot, badge);
    void move(badge, { opacity: [0, 1], x: [24, 0], scale: [0.96, 1] }, SPRING);
    draw(badge.querySelector(".tile svg"), { delay: 0.08 });
    void move(bar, { scaleX: [1, 0] }, { duration: 3.4, ease: "linear" });
    badgeTimer = window.setTimeout(() => void move(badge, { opacity: 0, x: 14 }, { duration: 0.24, ease: EASE_IN }), 3500);
  };

  const wallet = h("div", { class: "sbx-wallet" });
  const row = (dir: "in" | "out", what: string, who: string, amount: string, when: string, onCopy: () => void) => {
    const copy = h("button", { class: "sbx-copy" }, icon("copy", 13), "Copy");
    copy.addEventListener("click", () => {
      clear(copy, icon("check", 13), "Copied");
      void move(copy, { scale: [0.92, 1] }, POP);
      opts.later(() => clear(copy, icon("copy", 13), "Copy"), 1400);
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
  const openLook = () => {
    if (look) return;
    const fix = h("button", { class: "btn primary" }, icon("copy", 14), "Copy the correct address");
    const dismiss = h("button", { class: "link muted" }, "Dismiss");
    look = h(
      "div",
      { class: "sbx-look", role: "alertdialog", "aria-label": "Not the address you know" },
      h("div", { class: "head" }, h("span", { class: "sign" }, icon("alert", 18)), h("div", {}, h("b", {}, "This is not your Binance address."), h("span", {}, "Matches 6 + 4 characters, 30 differ"))),
      h("small", {}, "You copied"),
      addressWithDiff(group(POISON), spans(POISON, KNOWN)),
      h("small", {}, "Your Binance"),
      addressWithDiff(group(KNOWN), spans(KNOWN, POISON)),
      h("div", { class: "actions" }, fix, dismiss),
    );
    fix.addEventListener("click", () => {
      void closeLook();
      sound("mine");
      showBadge("checkCircle", "Binance deposits", "Copied the correct address", "mine");
      complete("fix");
    });
    dismiss.addEventListener("click", () => void closeLook());
    stage.appendChild(look);
    void move(wallet, { scale: 0.95, opacity: 0.4, filter: "blur(2px)" }, SPRING);
    void move(look, { opacity: [0, 1], y: [-16, 0], scale: [0.96, 1] }, SPRING);
    void move(look.querySelector(".sign"), { rotate: [0, -12, 10, -6, 4, 0] }, { duration: 0.6, delay: 0.12 });
    void move(look.querySelectorAll(".diff"), { opacity: [0.2, 1], y: [-3, 0] }, { ...POP, delay: stagger(0.035, { startDelay: 0.25 }) });
    fix.focus();
  };

  clear(
    wallet,
    h("div", { class: "sbx-head" }, h("b", {}, "Activity"), h("span", {}, "USDT · Ethereum")),
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
        showBadge("checkCircle", "Binance deposits", "Yours · sent 3 days ago", "mine");
        complete("known");
      }),
      row("out", "Sent", "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed", "120 USDT", "last week", () => {
        void closeLook();
        sound("new");
        showBadge("plusCircle", "New address", "First time you copied it", "info");
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
