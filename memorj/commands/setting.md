---
description: View or change memorj settings (language, …) — user default or per-project override
argument-hint: "[key value] [--project]"
---

# memorj settings

Settings are plain JSON files, merged at read time — a project file overrides the user default, which overrides built-in defaults:

- User default: `~/.memorj/config.json` — applies to every project. Set once.
- Project override: `<project root>/.memorj/config.json` — pins a value for this project's store (useful when the store is shared via git and must stay consistent regardless of who works on it).

Known keys:

- `language` — language for stored entry titles/bodies and user-facing capture receipts (free string, e.g. `"Korean"`, `"English"`, `"Japanese"`). Built-in default: `English`. Keep one language per store — memorj search is grep-based, so a mixed-language store silently breaks recall. Agent-facing instructions are always English regardless of this key.

## Task

Arguments: "$ARGUMENTS"

1. Read both config files (a missing file counts as empty).
2. **No arguments** → show the current effective settings as a small table: each known key, its effective value, and its provenance (project override / user default / built-in default). If `language` is still at the built-in default, offer to set it now (this doubles as initial setup). Ask before writing.
3. **`<key> <value>` given** → write it to the user default file — or to the project file if the arguments include `--project` or the user asks for project scope. Create the file and directory if missing; preserve any other keys already in the file. Reject keys not listed above rather than writing them silently.
4. Confirm what changed, in which file, and note: the manifest and hooks pick the new value up immediately at the next session start; the MCP tool descriptions bake the language at server startup, so they refresh on the next session as well.

Respond to the user in the conversation language.
