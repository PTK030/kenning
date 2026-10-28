// Network marks: a small tile in each network's colour with a simplified
// mark, for lists of networks (the hosts Kenning asks). Built as SVG
// elements like the icons: no innerHTML.

import type { Chain } from "./types";

const NS = "http://www.w3.org/2000/svg";

type Part = { d: string; fill?: string; stroke?: string };

const MARKS: Record<Chain, { bg: string; parts: Part[]; gradient?: [string, string] }> = {
  // Ethereum's diamond: the network most EVM addresses are first used on.
  evm: {
    bg: "#627eea",
    parts: [
      { d: "M12 2.5 6 12.3l6 3.5 6-3.5z", fill: "#fff" },
      { d: "M12 17.2 6 13.6l6 8 6-8z", fill: "rgb(255 255 255 / 75%)" },
    ],
  },
  // Three slanted bars, purple to green.
  solana: {
    bg: "#111318",
    gradient: ["#9945ff", "#14f195"],
    parts: [
      { d: "M7.2 5.5h12.6l-3 3H4.2z", fill: "url(#g)" },
      { d: "M4.2 10.5h12.6l3 3H7.2z", fill: "url(#g)" },
      { d: "M7.2 15.5h12.6l-3 3H4.2z", fill: "url(#g)" },
    ],
  },
  // The B with its two strokes through.
  bitcoin: {
    bg: "#f7931a",
    parts: [
      {
        d: "M11.77 19.09c4.92.87 6.14-6.03 1.21-6.9m-1.21 6.9-5.91-1.04m5.91 1.04-.35 1.97m1.56-8.87c4.93.87 6.14-6.02 1.22-6.89m-1.22 6.89-3.94-.69m5.16-6.2L8.29 4.26m5.91 1.04.35-1.97M7.48 20.36l3.13-17.72",
        stroke: "#fff",
      },
    ],
  },
  // The triangle with its inner fold.
  tron: {
    bg: "#eb0029",
    parts: [{ d: "M4 4.5 20.5 8 11 20.5zM4 4.5l9 8.3L20.5 8M13 12.8 11 20.5", stroke: "#fff" }],
  },
};

let uid = 0;

/** The mark of `chain` on its coloured tile, `size` pixels square. */
export function chainMark(chain: Chain, size = 28): HTMLElement {
  const m = MARKS[chain];
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(Math.round(size * 0.62)));
  svg.setAttribute("height", String(Math.round(size * 0.62)));
  svg.setAttribute("aria-hidden", "true");
  // Gradient ids are document-wide; each mark gets its own.
  const id = `chain-g${uid++}`;
  if (m.gradient) {
    const defs = document.createElementNS(NS, "defs");
    const g = document.createElementNS(NS, "linearGradient");
    g.setAttribute("id", id);
    g.setAttribute("x1", "0");
    g.setAttribute("y1", "1");
    g.setAttribute("x2", "1");
    g.setAttribute("y2", "0");
    m.gradient.forEach((color, i) => {
      const stop = document.createElementNS(NS, "stop");
      stop.setAttribute("offset", String(i));
      stop.setAttribute("stop-color", color);
      g.appendChild(stop);
    });
    defs.appendChild(g);
    svg.appendChild(defs);
  }
  for (const part of m.parts) {
    const p = document.createElementNS(NS, "path");
    p.setAttribute("d", part.d);
    p.setAttribute("fill", part.fill === "url(#g)" ? `url(#${id})` : (part.fill ?? "none"));
    if (part.stroke) {
      p.setAttribute("stroke", part.stroke);
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
    }
    svg.appendChild(p);
  }
  const tile = document.createElement("span");
  tile.className = "chain-mark";
  tile.style.setProperty("--mark-bg", m.bg);
  tile.style.width = tile.style.height = `${size}px`;
  tile.appendChild(svg);
  return tile;
}

/** The network a host serves, from its description ("EVM addresses …"). */
export function chainOf(description: string): Chain | null {
  const name = description.split(" ")[0].toLowerCase();
  return name in MARKS ? (name as Chain) : null;
}
