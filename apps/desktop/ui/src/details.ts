// The details window: everything Kenning knows about the address you
// selected, in the middle of the screen. The details shortcut opens it;
// Esc, the close button or clicking elsewhere closes it. A lookalike never
// lands here: it gets its own warning window.

import { detailsEnter, fillDetails } from "./alerts";
import { $, clear, h } from "./dom";
import type { FactList } from "./facts";
import { ipc, on, win } from "./ipc";
import { LEAVE, move } from "./motion";
import { titlebar } from "./titlebar";
import type { DetailsView, Fact } from "./types";
import "./guard";

const root = $("#details");
$("#chrome").replaceWith(titlebar({ title: "Address details", sign: "search", onClose: () => ipc.closeDetails() }).el);

let view: DetailsView | null = null;
/** The facts of the current render; its on-chain rows fill as answers arrive. */
let facts: FactList | null = null;

function render(next: DetailsView | null, fresh = true) {
  view = next;
  if (!view) {
    clear(root, h("p", { class: "muted" }, "Nothing to show."));
    return fit(fresh);
  }
  const r = view.recognition;
  // The whole window takes the state's colour (detailsCard.css), title bar too.
  for (const c of [...document.body.classList]) if (c.startsWith("k-")) document.body.classList.remove(c);
  document.body.classList.add(`k-${r.state}`);
  // The content is built in alerts.ts, where the onboarding's picture of
  // this window comes from too.
  facts = fillDetails(root, view, {
    copy: () => ipc.copyDetailsAddress(),
    add: (label, owner) => ipc.addDetailsAddress(label, owner).then((v) => render(v, false)),
    explorer: () => ipc.openExplorer(),
    close: () => void ipc.closeDetails(),
    changed: () => fit(false),
  });
  if (view.network) {
    const address = r.address.text;
    const shown = facts;
    void ipc.getOnchain([address]).then((known) => {
      if (facts === shown && known[address]) shown.paintChain(known[address]);
    });
  }
  root.focus();
  fit(fresh);
  if (fresh) whenVisible(() => detailsEnter(root));
}

/** Size the window to the page. Layout is measured right away, which
 *  works while the window is still hidden. */
function fit(reveal: boolean) {
  const height = Math.ceil(document.body.getBoundingClientRect().height);
  void ipc.fitDetails(height, reveal);
}

/** The window is still hidden when the page renders; animate once it shows. */
function whenVisible(run: () => void) {
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    document.removeEventListener("visibilitychange", go);
    requestAnimationFrame(run);
  };
  if (document.visibilityState === "visible") go();
  else {
    document.addEventListener("visibilitychange", go);
    setTimeout(go, 400);
  }
}

// Fonts arriving, an on-chain answer or the add form change the height.
new ResizeObserver(() => fit(false)).observe(document.body);

void on<{ address: string; fact: Fact }>("onchain", ({ address, fact: f }) => {
  if (view?.recognition.address.text === address) facts?.paintChain(f);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
    e.preventDefault();
    void ipc.closeDetails();
  }
});

// A peek: clicking anywhere else puts it away.
void win.onFocusChanged((focused) => {
  if (!focused && view) void ipc.closeDetails();
});

void on<null>("details", () => void ipc.getDetails().then((v) => render(v)));
// Closing, by any way: the window leaves the way it came, then the shell
// closes it.
void on<null>("leave", () => void move(root, { opacity: 0, y: 10, scale: 0.985 }, LEAVE));
root.tabIndex = -1;
void ipc.getDetails().then((v) => render(v));
