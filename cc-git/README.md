# cc-git

Git-like project memory system for Claude Code sessions.

## Concept

Captures development context at intentional checkpoints — like git commits, but for decisions, architecture, and session summaries.

## Commands

| Command | Description |
|---------|-------------|
| `/cc-git:init` | Initialize project memory in `.claude/cc-git/` |
| `/cc-git:commit` | Save current session snapshot |
| `/cc-git:feat <name>` | Start feature development with relevant context loaded |
| `/cc-git:fix <name>` | Start bug fix with relevant context loaded |

## Storage Structure (per project)

```
.claude/cc-git/
├── INDEX.md        # Project overview + features index
├── COMMITS.md      # Commit log (brief, ordered)
├── commits/        # Per-commit detail files
│   └── 001-*.md
└── features/       # Living feature context docs
    └── *.md
```

## Installation

Add the local marketplace to `~/.claude/settings.json`:
```json
{
  "extraKnownMarketplaces": {
    "local": {
      "source": { "source": "directory", "path": "/path/to/claude-plugins" }
    }
  },
  "enabledPlugins": {
    "cc-git@local": true
  }
}
```

Or for a single session:
```bash
cc --plugin-dir /path/to/claude-plugins/cc-git
```
