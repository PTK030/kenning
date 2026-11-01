// Network marks: a small tile in each network's colour with a simplified
// mark, for lists of networks (the hosts Kenning asks). Built as SVG
// elements like the icons: no innerHTML.

import type { Chain } from "./types";

const NS = "http://www.w3.org/2000/svg";

type Part = { d: string; fill?: string; stroke?: string };

type Mark = { bg: string; parts: Part[]; gradient?: [string, string] };

/** Tokens shown beside the networks (the onboarding's wallet). */
const TOKENS = {
  // Tether's T with the ring across its stem.
  usdt: {
    bg: "#26a17b",
    parts: [
      { d: "M6 6h12v3H6zM10.6 9h2.8v10h-2.8z", fill: "#fff" },
      { d: "M5.5 12.6c0 1.2 2.9 2.2 6.5 2.2s6.5-1 6.5-2.2-2.9-2.2-6.5-2.2-6.5 1-6.5 2.2", stroke: "#fff" },
    ],
  },
} satisfies Record<string, Mark>;

/** A token's mark on its coloured tile, like a network's. */
export function tokenMark(token: keyof typeof TOKENS, size = 28): HTMLElement {
  return markTile(TOKENS[token], size);
}

const MARKS: Record<Chain, Mark> = {
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

/** The EVM networks an address is looked up on, by their id in the config. */
const NETWORKS: Record<string, Mark> = {
  ethereum: MARKS.evm,
  // The blue disc with a bar cut in from the left: on a round tile, the bar.
  base: {
    bg: "#0052ff",
    parts: [{ d: "M-9 10.5h22.4v3H-9z", fill: "#fff" }],
  },
  // The hexagon with the A inside, white and blue.
  arbitrum: {
    bg: "#213147",
    parts: [
      { d: "M12 3.2 19.6 7.6v8.8L12 20.8 4.4 16.4V7.6z", stroke: "#9dcced" },
      { d: "M8.4 16.6 12 9.4", stroke: "#fff" },
      { d: "M12 9.4l3.6 7.2M11.4 16.6l1.9-3.8", stroke: "#28a0f0" },
    ],
  },
  // The letters O and P.
  optimism: {
    bg: "#ff0420",
    parts: [
      { d: "M4.6 12a2.7 3.3 0 1 0 5.4 0 2.7 3.3 0 1 0-5.4 0", stroke: "#fff" },
      { d: "M13.4 15.6V8.4h2.9a2.1 2.1 0 0 1 0 4.2h-2.9", stroke: "#fff" },
    ],
  },
  // Two linked hexagons.
  polygon: {
    bg: "#8247e5",
    parts: [
      {
        d: "M14.6 9.4 12 7.9 9.4 9.4v5.2L7 16l-2.6-1.5v-3L7 10l1.2.7m7.4 2.6 1.2.7 2.6-1.5v-3L17 7.9l-2.4 1.5v5.2L12 16.1l-2.6-1.5",
        stroke: "#fff",
      },
    ],
  },
  // The diamond with four around it.
  bsc: {
    bg: "#f0b90b",
    parts: [
      {
        d: "M12 9.3 14.7 12 12 14.7 9.3 12zM12 3.6l4.3 4.3-1.6 1.6L12 6.8 9.3 9.5 7.7 7.9zM12 20.4l-4.3-4.3 1.6-1.6 2.7 2.7 2.7-2.7 1.6 1.6zM3.6 12l1.6-1.6 1.6 1.6-1.6 1.6zM20.4 12l-1.6 1.6-1.6-1.6 1.6-1.6z",
        fill: "#fff",
      },
    ],
  },
};

let uid = 0;

/** The mark of `chain` on its coloured tile, `size` pixels square. */
export function chainMark(chain: Chain, size = 28): HTMLElement {
  return markTile(MARKS[chain], size);
}

/** The mark of an EVM network (`base`, `arbitrum`, …); Ethereum's for one it does not know. */
export function networkMark(id: string, size = 28): HTMLElement {
  return markTile(NETWORKS[id] ?? MARKS.evm, size);
}

function markTile(m: Mark, size: number): HTMLElement {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(Math.round(size * 0.62)));
  svg.setAttribute("height", String(Math.round(size * 0.62)));
  svg.setAttribute("aria-hidden", "true");
  // A mark may reach past the drawing to the tile's edge (Base's bar); the tile clips it.
  svg.style.overflow = "visible";
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
