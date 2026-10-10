import { clear, h } from "../dom";
import { ipc, message } from "../ipc";
import type { Overview } from "../types";

/** First run: what Kenning is, what it does not do, and one choice. */
export function welcomeView(main: HTMLElement, overview: Overview, done: () => Promise<void>) {
  let watch = false;
  const error = h("div");
  const option = (value: boolean, title: string, text: string) =>
    h(
      "label",
      { class: "option" },
      h("input", { type: "radio", name: "mode", checked: value === watch, onchange: () => (watch = value) }),
      h("span", {}, h("strong", {}, title), h("span", { class: "muted" }, text)),
    );

  clear(
    main,
    h(
      "div",
      { class: "welcome" },
      h("h1", {}, "Know what you copied."),
      h(
        "p",
        { class: "lead" },
        "Kenning names the crypto addresses you copy and tells you when one only looks like an address you know. Most of the time it stays quiet.",
      ),
      h(
        "div",
        { class: "trust-line" },
        ["MIT, open source", "Runs locally", "No account", "No telemetry", "Network: off", "Never writes to your clipboard unless you click"].map((t) =>
          h("span", {}, t),
        ),
      ),
      h("h2", { style: "font-size:15px;margin-top:8px" }, "When should Kenning look at your clipboard?"),
      option(false, `Only when I press ${overview.config.shortcut}`, " Recommended to start. Kenning reads nothing until you ask."),
      option(true, "Every time I copy", " Kenning checks each copy. Single addresses only; nothing else is read further or stored."),
      h(
        "p",
        { class: "muted" },
        "You can change this any time from the tray icon. Next, add the addresses you use to your book: Kenning recognises lookalikes of the names you give it.",
      ),
      error,
      h(
        "div",
        {},
        h(
          "button",
          {
            class: "btn primary",
            onclick: async () => {
              try {
                await ipc.finishOnboarding(watch);
                await done();
              } catch (e) {
                clear(error, h("div", { class: "notice error" }, message(e)));
              }
            },
          },
          "Start",
        ),
      ),
    ),
  );
}
