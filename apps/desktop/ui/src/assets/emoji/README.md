# Emoji artwork

The pictures a book entry can carry (`ui/src/emoji.ts`). Any PNG put here is
bundled and used in place of the system emoji font; an emoji without a file
here is drawn by the font (Segoe UI Emoji on Windows).

The files here are Google's Noto Emoji 3D artwork, from the `3dpng` branch of
[googlefonts/noto-emoji](https://github.com/googlefonts/noto-emoji/tree/3dpng/3D/png)
(commit `d6a792cb12e3`, the 128 px PNGs). Their licence is in
[LICENSE-noto-emoji.txt](LICENSE-noto-emoji.txt), as distributed with them.

They are prepared by `scripts/emoji-art.py`, which also picks each emoji's
default tile background (`ui/src/emojiTints.ts`). To add or replace
artwork, put the source PNGs in a folder and run it again:

    python scripts/emoji-art.py <folder>

- The script crops each picture to its ink, centres it and scales it to the
  same share of a 72×72 px square, so none sits low or crowds its tile.
- Files are named by the emoji's code points in lower-case hex, joined by
  `-`, without the variation selector `fe0f`: 🏦 → `1f3e6.png`, ❤️ →
  `2764.png`. Noto's `emoji_u1f3e6.png` names are accepted as they are.
- The picker offers the emoji in `EMOJI_GROUPS` in `emoji.ts`; each needs a
  file here. Noto 3D does not draw sequences such as 👪 or 👨‍👩‍👧 yet (they are
  grey placeholders), so the picker keeps to single emoji.

Only add artwork whose licence allows shipping it inside Kenning, and record
it here. Apple's and WhatsApp's emoji are proprietary and are not licensed
for use outside their own products.
