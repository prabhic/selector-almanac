---
name: selector-browse
description: Browse recent Lev Selector AI-Updates weeks — open interactive TUI in cmux tab or CLI. Use when the user asks to open lev selector browse, selector-browse, or browse Lev's AI updates.
disable-model-invocation: true
---

# Selector Browse

Browse the last **5 AI-Updates weeks** and open YouTube / deck / links.

**Scope:** This repo only. No outreach.

## Open from chat (cmux)

When the user asks to **open** browse (not list in chat), run:

```bash
npm run browse:open
```

**Launch behavior:**

| Environment | What happens |
|-------------|----------------|
| **cmux** (running) | New tab in current workspace → `npm run browse` |
| **Normal Mac terminal** (interactive) | TUI runs in the **current** terminal |
| **Agent / non-TTY shell** (no cmux) | Opens **Terminal.app** with browse (macOS only) |
| **Linux, no cmux, non-TTY** | Prints error — user must run `npm run browse` |

Do not use chat menus for browsing.

## Interactive TUI (user-facing)

```bash
npm run browse
```

| Key | Action |
|-----|--------|
| ↑↓ | Move |
| ←→ | Weeks ↔ content pane |
| Tab | Chapters (YouTube) / Slides / Links (flat: Slide N · label) |
| y | Full YouTube |
| d | Deck |
| q | Quit |

## Non-interactive CLI (automation only)

```bash
npm run browse:cli -- weeks --count 5 --json
npm run browse:cli -- open youtube 1 --chapter 3
```

Do not walk the user through weeks in chat when they want to browse — use `browse:open` or `browse`.

## Invocation

| Tool | Open browse | Navigate yourself |
|------|-------------|-------------------|
| Cursor / Claude / Codex | `npm run browse:open` | `/selector-browse` then browse:open |

Stale data: suggest `npm run ingest:refresh` only with permission.
