---
name: ui-shots
description: Take and inspect screenshots of Kenning's UI (main window tabs, onboarding, badge, lookalike and details windows) in both themes, to verify a visible change. Use after any change to apps/desktop/ui, before saying UI work is done, or when the user asks "how does it look", "take screenshots", "shots", or "/ui-shots".
user-invocable: true
---

# UI shots

Follow **Anything visible** and **Anything that moves** in `docs/qa.md`. It
owns the harness (`apps/desktop/scripts/shots`), the scenes and what to look
for; `docs/design.md` owns the rules the pictures are checked against.

Working rules:

- Make sure the UI is served:
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:1420/`. If it is
  not 200, start `npm run dev` in `apps/desktop` in the background (a running
  `npm run tauri dev` serves it too).
- Write pictures to the scratchpad, not the repo:
  `npm run shots -- <scene...> --out <scratchpad>/shots` in `apps/desktop`
  (`npm run shots -- --list` names the scenes).
- For a before/after, take "before" first and copy it aside before editing.
  Never stash the user's work to get a "before".
- Read the PNGs and check both themes, alignment, overflow, and the empty
  and full states.
- A new view or state gets a scene in `scripts/shots/shots.mjs` and its data
  in `scripts/shots/fixtures.mjs`, with public or made-up addresses only.
- For motion, write a throwaway script in the scratchpad that imports
  `bridge` and `backend` from `scripts/shots/fixtures.mjs`, triggers the
  animation and records `getBoundingClientRect` or a screenshot every
  30–50 ms; compare the last frame with the settled layout.
- The lookalike and details windows are dark in both themes by design.
- The harness cannot show the clipboard, focus, hotkeys or the tray. Say so
  and list those for a manual check (`docs/manual-test.md`).
- Never take screenshots of the user's desktop and never take focus from
  their apps.
- When you learn something the next capture needs, fix `docs/qa.md` rather
  than this skill.
