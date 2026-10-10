// Line icons (24×24, 2px stroke), built as SVG elements: no innerHTML.
// Shapes follow the Lucide set (ISC licence).

import type { State } from "./types";

type Shape =
  | ["path", string]
  | ["circle", number, number, number]
  | ["rect", number, number, number, number, number];

const ICONS = {
  minimize: [["path", "M5 12h14"]],
  maximize: [["rect", 5, 5, 14, 14, 2]],
  restore: [
    ["rect", 4, 8, 12, 12, 2],
    ["path", "M8 8V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2"],
  ],
  keyboard: [
    ["rect", 2, 4, 20, 16, 2],
    ["path", "M6 8h.01"],
    ["path", "M10 8h.01"],
    ["path", "M14 8h.01"],
    ["path", "M18 8h.01"],
    ["path", "M8 12h.01"],
    ["path", "M12 12h.01"],
    ["path", "M16 12h.01"],
    ["path", "M7 16h10"],
  ],
  clipboard: [
    ["rect", 8, 2, 8, 4, 1],
    ["path", "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"],
  ],
  arrowRight: [["path", "M5 12h14"], ["path", "m12 5 7 7-7 7"]],
  arrowLeft: [["path", "m12 19-7-7 7-7"], ["path", "M19 12H5"]],
  volume: [
    ["path", "M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z"],
    ["path", "M16 9a5 5 0 0 1 0 6"],
    ["path", "M19.4 18.4a9 9 0 0 0 0-12.8"],
  ],
  power: [["path", "M12 2v10"], ["path", "M18.4 6.6a9 9 0 1 1-12.77.04"]],
  upload: [["path", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"], ["path", "m17 8-5-5-5 5"], ["path", "M12 3v12"]],
  check: [["path", "M20 6 9 17l-5-5"]],
  checkCircle: [["circle", 12, 12, 10], ["path", "m8.5 12.5 2.5 2.5 4.5-5"]],
  users: [
    ["path", "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"],
    ["circle", 9, 7, 4],
    ["path", "M22 21v-2a4 4 0 0 0-3-3.87"],
    ["path", "M16 3.13a4 4 0 0 1 0 7.75"],
  ],
  user: [["path", "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"], ["circle", 12, 7, 4]],
  landmark: [
    ["path", "M3 22h18"],
    ["path", "M6 18v-7"],
    ["path", "M10 18v-7"],
    ["path", "M14 18v-7"],
    ["path", "M18 18v-7"],
    ["path", "M12 2 20 7H4z"],
  ],
  history: [["path", "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"], ["path", "M3 3v5h5"], ["path", "M12 7v5l4 2"]],
  plusCircle: [["circle", 12, 12, 10], ["path", "M8 12h8"], ["path", "M12 8v8"]],
  alert: [
    ["path", "m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"],
    ["path", "M12 9v4"],
    ["path", "M12 17h.01"],
  ],
  info: [["circle", 12, 12, 10], ["path", "M12 16v-4"], ["path", "M12 8h.01"]],
  globe: [["circle", 12, 12, 10], ["path", "M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"], ["path", "M2 12h20"]],
  x: [["path", "M18 6 6 18"], ["path", "m6 6 12 12"]],
  copy: [
    ["rect", 8, 8, 14, 14, 2],
    ["path", "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"],
  ],
  book: [["path", "M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"]],
  search: [["circle", 11, 11, 8], ["path", "m21 21-4.3-4.3"]],
  journal: [
    ["path", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"],
    ["path", "M14 2v4a2 2 0 0 0 2 2h4"],
    ["path", "M16 13H8"],
    ["path", "M16 17H8"],
    ["path", "M10 9H8"],
  ],
  sliders: [
    ["path", "M21 4h-7"],
    ["path", "M10 4H3"],
    ["path", "M21 12h-9"],
    ["path", "M8 12H3"],
    ["path", "M21 20h-5"],
    ["path", "M12 20H3"],
    ["path", "M14 2v4"],
    ["path", "M8 10v4"],
    ["path", "M16 18v4"],
  ],
  fileCheck: [
    ["path", "M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"],
    ["path", "M14 2v4a2 2 0 0 0 2 2h4"],
    ["path", "m9 15 2 2 4-4"],
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

const NS = "http://www.w3.org/2000/svg";

export function icon(name: IconName, size = 18, cls = ""): SVGSVGElement {
  const svg = document.createElementNS(NS, "svg");
  for (const [k, v] of Object.entries({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    "stroke-width": 2,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    "aria-hidden": "true",
    class: `icon ${cls}`.trim(),
  })) {
    svg.setAttribute(k, String(v));
  }
  for (const shape of ICONS[name] as Shape[]) {
    const el = document.createElementNS(NS, shape[0]);
    if (shape[0] === "path") el.setAttribute("d", shape[1]);
    else if (shape[0] === "circle") {
      el.setAttribute("cx", String(shape[1]));
      el.setAttribute("cy", String(shape[2]));
      el.setAttribute("r", String(shape[3]));
    } else {
      el.setAttribute("x", String(shape[1]));
      el.setAttribute("y", String(shape[2]));
      el.setAttribute("width", String(shape[3]));
      el.setAttribute("height", String(shape[4]));
      el.setAttribute("rx", String(shape[5]));
    }
    svg.appendChild(el);
  }
  return svg;
}

/** Each state has its own icon (and word), never colour alone. */
export const STATE_ICON: Record<State, IconName> = {
  mine: "checkCircle",
  team: "users",
  contact: "user",
  public: "landmark",
  seen: "history",
  new: "plusCircle",
  lookalike: "alert",
};
