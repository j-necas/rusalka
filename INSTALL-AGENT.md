# Installing the Rusalka skills for an AI agent (Claude Code, Codex)

These instructions are written for an agent that a user has asked to "install Rusalka" or "the Rusalka skills".
Rusalka itself is a website (Chrome or Edge) and needs no installation. There are two skills:

- **`rusalka-sheet-music`** – turns sheet music from PDFs and photos into Rusalka's text notation (checks bar lengths and
  compares a rendered picture with the original), and adapts songs (easier, five fingers, own left hand);
- **`rusalka-progress`** – a short summary for parents from the results copied from Rusalka.

Explain the steps briefly in the user's language and ask before installing anything besides the two skills.
Rusalka's repository is https://github.com/j-necas/rusalka.

## 1. Prerequisites
- `node -v` 18 or newer for the skill's helper script (checking and rendering sheet music). If Node is missing,
  tell the user to install it (https://nodejs.org) – don't install it without their consent.

## 2. The skills (Claude Code and Codex)
Get the repository once and link both skill folders where the agent looks for skills – `~/.claude/skills` for
Claude Code, `~/.agents/skills` for Codex (link to whichever the user has):
```
git clone https://github.com/j-necas/rusalka.git ~/.local/share/rusalka/zdroj
mkdir -p ~/.claude/skills ~/.agents/skills
for s in rusalka-sheet-music rusalka-progress; do
  ln -s ~/.local/share/rusalka/zdroj/plugin/skills/$s ~/.claude/skills/$s
  ln -s ~/.local/share/rusalka/zdroj/plugin/skills/$s ~/.agents/skills/$s
done
```
The skills load in the agent's next session. Updating later: `git -C ~/.local/share/rusalka/zdroj pull`.

## 3. Rendering libraries
The sheet-music skill renders the result for comparison with the original with Verovio and resvg. It installs them
itself on first use (`npm install --prefix <skill folder>`, described in SKILL.md).

## 4. Using it
- The user's songs and results stay in their browser or in the folder chosen in Rusalka (**Save to folder…**,
  usually `~/Rusalka`). With access to that folder, `node <skill>/scripts/sheet.mjs add song.txt` adds a song
  directly; otherwise the answer is the notation for **AI → Paste notes from the AI chat**.
- For a summary, ask the user to copy the results from Rusalka (**AI → Week overview → Copy results**).

## What the skills do not do
They send nothing anywhere and never change the players' data; the only thing they may write is a new song file.
