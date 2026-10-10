// Two small things: the hero comparison, and the copy button.

// The hero shows two addresses in groups of four. Shortly after load, the
// characters that differ light up, the way the app marks them.
function groups(text) {
  return text.startsWith("0x") ? ["0x", ...text.slice(2).match(/.{1,4}/g)] : text.match(/.{1,4}/g);
}

for (const el of document.querySelectorAll(".spec-addr")) {
  const a = el.dataset.addr;
  const b = el.dataset.other;
  const body = a.slice(2);
  const other = b.slice(2);
  let prefix = 0;
  while (prefix < body.length && body[prefix].toLowerCase() === other[prefix].toLowerCase()) prefix++;
  let suffix = 0;
  while (suffix < body.length - prefix && body.at(-1 - suffix).toLowerCase() === other.at(-1 - suffix).toLowerCase()) suffix++;

  let i = -2; // the "0x" prefix counts as matching
  groups(a).forEach((g, n) => {
    if (n > 0) el.append(" ");
    for (const ch of g) {
      const span = document.createElement("span");
      const same = i < 0 || i < prefix || i >= body.length - suffix;
      span.className = `c ${same ? "s" : "d"}`;
      span.textContent = ch;
      el.append(span);
      i++;
    }
  });
}

const specimen = document.querySelector(".specimen");
if (specimen) {
  const reveal = () => specimen.classList.add("revealed");
  const still = new URLSearchParams(location.search).has("still");
  if (still) document.documentElement.classList.add("still");
  if (still || matchMedia("(prefers-reduced-motion: reduce)").matches) reveal();
  else setTimeout(reveal, 900);
}

for (const button of document.querySelectorAll("[data-copy]")) {
  const hint = button.querySelector(".command-hint");
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      hint.textContent = "Copied";
    } catch {
      hint.textContent = "Select and copy";
    }
    setTimeout(() => (hint.textContent = "Copy"), 1800);
  });
}
