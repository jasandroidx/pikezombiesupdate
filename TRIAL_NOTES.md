# Trial run notes — Pike County Zombies improvement set
Date: 2026-09-27 · Build: patched `main` @ f6c4514 · Method: headless Chromium bot, Survival mode, all 3 mutators on

## Verified working
- Title screen renders clean. Winslow Eskimos badge shows as a tilted circular patch, top-right of the title. Doesn't collide with the icon buttons on desktop.
- Mutator chips (Rich ground / Dry county / Bottom fog) render and toggle; run started with all three active.
- Bottom fog mutator visibly darkens the lower screen in gameplay.
- **Salt line** and **Storm jar** both appear in level-up drafts, are selectable by click and by Digit1/2/3, and cause no crashes. Long run: reached **wave 4 / level 12**, 10+ boons picked (Salt line ×3, Storm jar ×3 among them), zero page errors, zero failed game requests.
- Wave progression works with all patches applied. Typecheck and production build clean.
- "Stuck draft" scare was a false alarm: `takeBoon` re-opens the draft while `queuedLevels > 0`, so 4 chained level-ups with identical offers looked like one stuck draft. Designed mechanic, working as intended — but see note 1 below about why so many levels queued.
- Elite pipeline code-verified: 12% spawn from wave 2, 2.2× HP, 1.15× speed, 3× score / 2× scrap, gold ring drawn under the zombie, chest on kill, and the pre-existing heavy-chest path is guarded so elites don't double-drop.
- Low-HP pulsing red vignette is in the engine's canvas render path (after the fog block).

## What I'd change before release
1. **Early XP economy is too hot.** With Rich ground doubling grit, plus streak grit payouts, plus lucky grit procs, the bot hit its 2nd draft 14s into the run and its 5th by t+60s. Drafts pause the game ("THE NIGHT STOPS"), so the rhythm becomes: play ~7s, draft, play ~7s, draft. Suggest: halve the streak payout values, stop streak payouts from double-dipping the Rich ground multiplier, or raise the first few level thresholds.
2. **Drafts can chain with no breathing room.** When several level-ups queue, they open back-to-back. A short grace period (~3s of live play) before a queued draft opens would fix the stutter.
3. **Evolution recipe is still a rumor, not a UI.** It's one line in the revolver description. If recipes should be visible, this needs a real codex/panel, not a tooltip.
4. **Bomber / riot / elite visuals need human eyes.** Code paths are verified, but nobody has yet seen a bomber telegraph, a riot wall, or a gold-ringed elite live. A playtest to wave 5+ should confirm the bomber's explosion reads clearly and the riot feels distinct from a miner brute (right now it's mostly a slower, tankier sprite-swap).
5. **Salt line vs. orbit overlap.** Salt line is another proximity aura in a game that already has orbit/traps. Fine mechanically, but watch that it doesn't make positioning brainless once stacked.

## Open questions (need Jason)
- Is the Winslow Eskimos badge placement/size right, or should it be smaller / elsewhere?
- Keep the streak fire-rate bonus at +6% per combo tier, or is the early game already too easy?
- Survival milestone (chest + 30 HP every 5 waves) — generous? It stacks with the new elite chests.

## Test gaps
- The two `ERR_EMPTY_RESPONSE` failures are **environmental, not game bugs**: Google Fonts CSS and `grok.com/grok-app-builder/extensions.js` are blocked from this sandbox. The game itself made zero failed requests and threw zero page errors across the whole run.
- Low-HP vignette never triggered visibly (bot rarely took heavy damage).
- Mobile layout not tested (badge is hidden on small screens by design; mutator chip wrapping untested).
- Bomber/riot/elite visuals not seen live by a human eye (bot reached wave 4 where bombers spawn; elites at 12% from wave 2 certainly spawned and died across ~100+ kills with no errors — code paths verified, but telegraph readability wants a human pass).
