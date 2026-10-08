# DESIGN.md — Jarvis Arena

**Vibe: the arena at night.** A dark screening room where the videos are the light. Watching
comes first: vertical recordings in a reel you swipe, the one in view plays (muted until you
tap), scores in big condensed numerals like a scoreboard. Simple: one reel, one list, one line
of explanation.

Phone first (390 px, thumb). Desktop is the same reel showing more cards.

## Tokens

The video stage (`--stage`) is dark in both themes, like a theater screen.

| token | light | dark | use |
|---|---|---|---|
| `--bg` | `#ffffff` | `#08090b` | page |
| `--surface` | `#f1f2f4` | `#131519` | rows, buttons |
| `--surface-2` | `#e4e6ea` | `#1c1f25` | pressed, tracks |
| `--line` | `#dfe2e6` | `#23262d` | hairlines |
| `--fg` | `#0e1013` | `#f2f3f5` | text |
| `--dim` | `#5b626c` | `#9aa1ab` | secondary text |
| `--accent` | `#e2461a` | `#ff5c2b` | the spotlight: active, vote, links, play |
| `--pass` | `#128a5a` | `#3ddc97` | all checks passed |
| `--miss` | `#c8283d` | `#ff5c6c` | a check missed, errors |
| `--stage` | `#08090b` | `#08090b` | behind every video |

- **Type:** Bricolage Grotesque, condensed (`font-stretch: 75%`) at 700–800, for the wordmark,
  headings and scores; IBM Plex Sans 400/500 for everything else. Self-hosted. Tabular numbers
  for scores, counts, durations, money.
- **Spacing:** 4, 8, 12, 16, 24, 32, 48. Page gutter 16 px.
- **Radius:** 18 px video cards, 12 px rows and buttons, 6 px badges. No pills.
- **Motion:** 160 ms ease-out on state (vote, sound, play). Scroll-snap does the rest. Nothing
  fades in on scroll.
- **Touch:** every target ≥ 44 px.

## Components

- **Reel card** (9:16, vertical recordings only): poster until in view, then plays muted; tap
  toggles sound. Nothing on the recording but the sound button (the recording has its own UI).
  Under it: the title (the link into the run), then model, score, duration, cost; the vote button
  to the right. Next card peeks (84vw). Wide (16:9) runs live in the list only, with 16:9 thumbs.
- **Score badge:** condensed numerals `4/4`, green when everything passed, red with a miss.
- **Vote:** an up-triangle and the count; filled accent when it's yours.

## Rules

- No freshbars (Eyal, 2026-10-08): plain "2h ago".
- Section headings sentence case; no eyebrows, no numbered labels, no `A · B` strings.
- Never fake numbers: votes are real and start at zero.
