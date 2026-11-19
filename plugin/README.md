# Rusalka skills

Two skills for Rusalka – a piano trainer for children and adults that runs in the browser. Rusalka itself has no AI;
these skills make an AI chat better at Rusalka's tasks. Without them, Rusalka's **AI → Copy instructions** works in
any chat.

- **`rusalka-sheet-music`** (`skills/rusalka-sheet-music`): turns sheet music from a PDF, photo or scan into Rusalka's text
  notation (`references/format.md`) – transcription, a check of bar lengths and, where code can run, a rendering to
  compare with the original (`scripts/sheet.mjs`, Node 18+, Verovio and resvg installed on first use). The answer is
  one block of notation for **Paste notes from the AI chat**. It also adapts songs copied from Rusalka (easier,
  five fingers, own left hand).
- **`rusalka-progress`** (`skills/rusalka-progress`): a short, warm summary for parents from the results copied from
  Rusalka (**AI → Week overview → Copy results**).

## Where they run
- **Claude** (web, desktop, mobile): upload `rusalka-sheet-music.zip` and `rusalka-progress.zip` (from Rusalka's AI
  window, Releases, or `npm run skills`) in Settings → Skills.
- **ChatGPT**: upload the same zips in Skills → Create → Upload from your computer.
- **Claude Code / Codex**: link the skill folders into the agent's skills folder; see
  [INSTALL-AGENT.md](../INSTALL-AGENT.md).

The skill keeps copies of `static/lib/song.js`, `note_names.js` and `notation.js` (`npm run skill`; a test checks
they are current).
