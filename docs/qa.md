# QA

What it takes to call a change done. Tests and a clean build come first
(see [development.md](development.md)); this page covers what they cannot
see.

## Anything visible

A visible change is done when it has been seen, in both themes, before and
after. "It builds" is not evidence.

1. Serve the UI: `npm run dev` in `apps/desktop`.
2. Take the pictures:

   ```bash
   npm run shots                          # every scene, both themes
   npm run shots -- check journal         # just these
   npm run shots -- --theme dark --out ../../before settings
   npm run shots -- --list                # the scenes there are
   ```

   The harness (`apps/desktop/scripts/shots`) opens each page in Chrome (or
   Edge) with the Tauri bridge replaced by canned answers from
   `fixtures.mjs`: a small book, a journal, guard events, on-chain answers.
   It fails if a page logs an error. Pictures go to `apps/desktop/shots`,
   which is not committed.
3. Compare before and after, and put both in the pull request.

CI takes the same pictures on every push (the **desktop UI** job) and keeps
them for two weeks as the run's `screenshots` artifact.

A new view, state or window gets a scene in `shots.mjs`, and its data in
`fixtures.mjs`. Fixtures use only public or made-up addresses.

### What to look for

- **Both themes.** Text readable on every surface, nothing that only works
  in dark. (`check-contrast.mjs` covers the tokens, not what you combine.)
- **Alignment.** Edges, baselines and icon centres line up with their
  neighbours; spacing follows the steps in [design.md](design.md).
- **Overflow.** Long names, long addresses, many items: at 880×640 (the
  default window) and maximised. Nothing clipped that should wrap, nothing
  wrapped that should not.
- **Empty and full.** The empty state, one item and many.
- **Alerts unchanged.** If you touched `alerts.ts` or a card stylesheet,
  check the real windows (`badge`, `lookalike`, `details` scenes) and the
  onboarding's pictures together: they are the same code.

## Anything that moves

A still picture cannot show a jump. For an animation, check:

- it plays on the way out as well as in, and the way out mirrors the way in;
- the last frame matches the layout after the animation (no snap of a few
  pixels when inline styles are removed);
- the first frame is the first keyframe (no flash of the final state);
- clicking again mid-way turns it round;
- with reduced motion it jumps straight to the end.

To see the frames, have the harness take pictures at intervals during the
animation (`page.screenshot` every 30–50 ms), or measure the element with
`getBoundingClientRect` before, during and after: an end-of-animation jump
shows up as a difference between the last frame and the settled layout.

## What only the real app shows

The harness has no clipboard, no focus, no global shortcuts, no tray and no
window sizing by Windows. For those, run the app (`npm run tauri dev`, which
uses `~/.kenning-dev`) and go through the relevant part of
[manual-test.md](manual-test.md). In particular:

- badges never take focus from the app you are in;
- the lookalike and details windows size themselves to their content;
- the guard catches a swap (Protection › Run the test) and
  stays silent for your own copies.

Say in the pull request which of these you checked, and how.
