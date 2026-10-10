// Kenning's own title bar, in place of the system one: the mark, the window's
// title, and minimise / maximise / close drawn to match the app. The bar is
// the drag handle; double-clicking it maximises, as on any Windows window.

import { h } from "./dom";
import { icon, type IconName } from "./icons";
import { win } from "./ipc";
import markUrl from "../../src-tauri/icons/32x32.png";

type Options = {
  title: string;
  /** Small icon before the title instead of Kenning's mark. */
  sign?: IconName;
  minimize?: boolean;
  maximize?: boolean;
  /** What closing means for this window; defaults to closing it. */
  onClose?: () => unknown;
};

export type Titlebar = { el: HTMLElement; setSubtitle: (text: string) => void };

export function titlebar(opts: Options): Titlebar {
  const subtitle = h("span", { class: "tb-sub", "data-tauri-drag-region": true });
  const button = (name: IconName, label: string, cls: string, onclick: () => unknown) =>
    h("button", { class: `tb-btn ${cls}`, "aria-label": label, title: label, onclick }, icon(name, 14));

  const maxButton = opts.maximize ? button("maximize", "Maximise", "max", () => win.toggleMaximize()) : null;
  const el = h(
    "header",
    { class: "titlebar", "data-tauri-drag-region": true },
    opts.sign
      ? h("span", { class: "tb-sign", "data-tauri-drag-region": true }, icon(opts.sign, 15))
      : h("img", { class: "tb-mark", src: markUrl, alt: "", "data-tauri-drag-region": true }),
    h("span", { class: "tb-title", "data-tauri-drag-region": true }, opts.title),
    subtitle,
    h(
      "div",
      { class: "tb-buttons" },
      opts.minimize && button("minimize", "Minimise", "min", () => win.minimize()),
      maxButton,
      button("x", "Close", "close", () => (opts.onClose ? opts.onClose() : win.close())),
    ),
  );

  // Swap the maximise icon for "restore" while maximised.
  if (maxButton) {
    const sync = async () => {
      const max = await win.isMaximized();
      maxButton.replaceChildren(icon(max ? "restore" : "maximize", 14));
      maxButton.setAttribute("aria-label", max ? "Restore" : "Maximise");
      maxButton.title = max ? "Restore" : "Maximise";
      document.documentElement.classList.toggle("maximized", max);
    };
    void sync();
    void win.onResized(() => void sync());
  }
  // Dim the bar while another window has focus, like the system does.
  void win.onFocusChanged((focused) => el.classList.toggle("blurred", !focused));

  return {
    el,
    setSubtitle: (text) => {
      subtitle.textContent = text;
    },
  };
}
