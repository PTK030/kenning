// A drop-down in Kenning's own style, in place of the native <select>: a
// field-like button, and a raised list with an icon, a name and one line
// for each choice. The list unfolds from the button, its choices follow
// one after another, and one highlight glides between them. Keys: arrows,
// Home/End, Enter or Space to choose, Esc or Tab to close. It opens
// upwards when there is no room below (the details window is only as tall
// as its content).

import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { EASE_IN, move, stagger } from "./motion";

export type Choice<T extends string> = { value: T; label: string; hint?: string; icon?: IconName };

export interface Dropdown<T extends string> {
  el: HTMLElement;
  readonly value: T;
}

/** Fast out, long settle: things arrive quickly and come to rest softly. */
const SETTLE = [0.22, 1, 0.36, 1] as const;

export function dropdown<T extends string>(opts: { label: string; choices: Choice<T>[]; value: T; onChange?: (value: T) => void }): Dropdown<T> {
  let value = opts.value;
  const current = () => opts.choices.find((c) => c.value === value) ?? opts.choices[0];

  const shown = h("span", { class: "dd-value" });
  const button = h(
    "button",
    { type: "button", class: "dd-button", "aria-haspopup": "listbox", "aria-expanded": "false", "aria-label": opts.label },
    shown,
    icon("chevronDown", 16, "dd-chevron"),
  );
  const items = opts.choices.map((c) =>
    h(
      "li",
      { role: "option", tabindex: "-1", "data-value": c.value },
      c.icon && h("span", { class: "dd-ic" }, icon(c.icon, 15)),
      h("span", { class: "dd-text" }, h("span", {}, c.label), c.hint && h("span", { class: "dd-hint" }, c.hint)),
      icon("check", 15, "dd-tick"),
    ),
  );
  // One highlight for the whole list, moved under the choice in reach.
  const glide = h("li", { class: "dd-hl", role: "presentation", "aria-hidden": "true" });
  const list = h("ul", { class: "dd-list", role: "listbox", "aria-label": opts.label, hidden: true }, glide, items);
  const el = h("div", { class: "dropdown" }, button, list);

  const paint = () => {
    const c = current();
    shown.replaceChildren(...(c.icon ? [icon(c.icon, 15)] : []), h("span", {}, c.label));
    items.forEach((li, i) => li.setAttribute("aria-selected", String(opts.choices[i].value === value)));
  };
  paint();

  /** Put the highlight under `li`; `instant` skips the glide. */
  const highlight = (li: HTMLElement | undefined, instant = false) => {
    if (!li) return;
    if (instant) glide.style.transition = "none";
    glide.style.height = `${li.offsetHeight}px`;
    glide.style.transform = `translateY(${li.offsetTop}px)`;
    glide.style.opacity = "1";
    if (instant) {
      void glide.offsetHeight;
      glide.style.transition = "";
    }
  };

  let open = false;
  let up = false;
  const outside = (e: PointerEvent) => !el.contains(e.target as Node) && close();

  const show = () => {
    if (open) return;
    open = true;
    list.hidden = false;
    button.setAttribute("aria-expanded", "true");
    // Below if it fits, else above; right edges aligned if it would run out.
    const r = button.getBoundingClientRect();
    up = r.bottom + list.offsetHeight + 8 > window.innerHeight && r.top > list.offsetHeight + 8;
    el.classList.toggle("up", up);
    el.classList.toggle("end", r.left + list.offsetWidth + 8 > window.innerWidth);

    const chosen = items[opts.choices.findIndex((c) => c.value === value)];
    highlight(chosen, true);
    // It unfolds from the button: a mask opens from the edge nearest to it.
    const from = up ? "inset(100% 0% 0% 0% round 12px)" : "inset(0% 0% 100% 0% round 12px)";
    void move(list, { opacity: [0, 1], y: [up ? 6 : -6, 0], scale: [0.97, 1], clipPath: [from, "inset(0% 0% 0% 0% round 12px)"] }, { duration: 0.28, ease: SETTLE });
    void move(items, { opacity: [0, 1], y: [up ? 4 : -4, 0] }, { duration: 0.24, ease: SETTLE, delay: stagger(0.03, { startDelay: 0.05, from: up ? "last" : "first" }) });
    chosen?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", outside, true);
  };

  function close(refocus = false) {
    if (!open) return;
    open = false;
    button.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", outside, true);
    // Back the way it came, folding towards the button.
    void move(list, { opacity: 0, y: up ? 4 : -4, scale: 0.98 }, { duration: 0.16, ease: EASE_IN }).then(() => {
      if (!open) list.hidden = true;
    });
    if (refocus) button.focus();
  }

  const choose = (i: number) => {
    const changed = opts.choices[i].value !== value;
    value = opts.choices[i].value;
    paint();
    close(true);
    if (changed) {
      // The new choice settles into the button.
      void move(shown, { opacity: [0, 1], y: [up ? -6 : 6, 0] }, { duration: 0.26, ease: SETTLE });
      opts.onChange?.(value);
    }
  };

  button.addEventListener("click", () => (open ? close() : show()));
  button.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      show();
    }
  });
  items.forEach((li, i) => {
    li.addEventListener("click", () => choose(i));
    li.addEventListener("pointerenter", () => highlight(li));
    li.addEventListener("focus", () => highlight(li));
  });
  list.addEventListener("keydown", (e) => {
    const at = items.indexOf(document.activeElement as HTMLLIElement);
    const go = (i: number) => items[(i + items.length) % items.length].focus();
    if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(items.length - 1);
    else if (e.key === "Enter" || e.key === " ") choose(Math.max(0, at));
    else if (e.key === "Escape") close(true);
    else if (e.key === "Tab") return close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  return {
    el,
    get value() {
      return value;
    },
  };
}
