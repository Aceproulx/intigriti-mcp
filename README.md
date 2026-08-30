# intigriti-mcp

MCP server for the [Intigriti](https://www.intigriti.com/) bug bounty platform.
Lists programs, pulls scope details, diffs scope changes over time, and
recommends the best-fit programs based on your skills profile — with a boost
for programs whose scope was recently updated.

Implements the [Intigriti Researcher API v1](https://api.intigriti.com/external/researcher/swagger/index.html).
Endpoint paths (`/v1/programs`, `/v1/programs/{id}`), response shapes
(pagination envelope, enum/money view-models), and field mappings are verified
against Intigriti's published OpenAPI spec.

## Tools

| Tool | Description |
| --- | --- |
| `list_programs` | All programs visible to your token, with status, rewards, confidentiality level, and industry. |
| `get_program_scope(programId)` | Full asset list with endpoint, type, tier, description, and in/out-of-scope flag + scope version timestamp. |
| `diff_scope(programId)` | Fetch current scope, diff against the last stored snapshot (added/removed/modified), update snapshot. |
| `recommend_program(topN?, recencyWindowDays?, maxRecencyBoost?)` | Score all active programs against your skills manifest, ranked best-fit first. |

## Setup

```bash
npm install
npm run build
```

Set environment variables:

```bash
export INTIGRITI_API_TOKEN="your-researcher-api-token"          # required
export INTIGRITI_SKILLS_PATH="./skills.json"                    # optional, default shown
export INTIGRITI_SNAPSHOT_PATH="./data/scope-snapshots.json"    # optional, default shown
```

Generate a Personal Access Token (PAT) from your Intigriti profile:
**Personal access tokens**. Auth is `Authorization: Bearer <PAT>`.

Copy `skills.example.json` to `skills.json` and edit it to reflect your
strengths — each entry is a skill/vuln-class, a confidence weight (0–1), and
the asset types it applies to:

```json
{ "skill": "ssrf", "weight": 0.8, "appliesTo": ["api", "url"] }
```

`skills.json` is git-ignored since it's personal.

## Running

Standalone:

```bash
npm start
```

As an MCP server in your client config (point at the built entry point with
the env vars above):

```json
{
  "mcp": {
    "intigriti": {
      "type": "local",
      "command": ["node", "/path/to/intigriti-mcp/dist/index.js"],
      "enabled": true,
      "environment": {
        "INTIGRITI_API_TOKEN": "{env:INTIGRITI_API_TOKEN}",
        "INTIGRITI_SKILLS_PATH": "/path/to/skills.json",
        "INTIGRITI_SNAPSHOT_PATH": "/path/to/scope-snapshots.json"
      }
    }
  }
}
```

## How scoring works

`recommend_program` fetches every active program's scope, then for each skill
in your manifest counts how many in-scope assets match that skill's declared
asset types (`appliesTo`):

```
score = Σ(skill weight × matching asset count) / total in-scope assets
```

Normalizing by asset count means a program isn't favored just for being
bigger. See `src/scoring.ts`; the matching logic is intentionally simple to
start — extend it there as your manifest gets richer.

### Recency boost

Intigriti publishes a scope version timestamp per program
(`domains.createdAt`). If it's within the recency window (default 14 days),
the score is multiplied by a factor that decays linearly from a max boost
(default **1.25×** for a just-updated scope) down to 1.0 at the window edge.
This surfaces freshly-changed programs before they cool off. Boosted results
include a note like:

```
Recency boost 1.214x — scope published 2.0d ago (window 14d, max 1.25x)
```

Tune it per call: `recommend_program(topN=10, recencyWindowDays=7, maxRecencyBoost=1.5)`.

### Scope fidelity

- Asset types are normalized to the manifest's vocabulary
  (`website`/`wildcard` → `url`, `web_service` → `api`).
- Out-of-scope assets (tier `"Out Of Scope"`) are excluded from scoring.

## Persistence

Scope snapshots are stored as flat JSON at `INTIGRITI_SNAPSHOT_PATH`
(default `./data/scope-snapshots.json`), keyed by program ID. Swap
`ScopeStore` for a SQLite-backed version if this grows large or you want
historical diff queries instead of just "since last check".

## Project layout

- `src/intigritiClient.ts` — API client + response mapping
- `src/scoring.ts` — program scoring and recency boost
- `src/scopeStore.ts` — scope snapshot persistence and diffing
- `src/skillsManifest.ts` — loads your `skills.json`
- `src/index.ts` — MCP tool wiring