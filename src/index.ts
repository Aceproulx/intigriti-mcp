#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { IntigritiClient } from "./intigritiClient.js";
import { ScopeStore } from "./scopeStore.js";
import { loadSkillsManifest } from "./skillsManifest.js";
import { rankPrograms, scoreProgram } from "./scoring.js";

const TOKEN = process.env.INTIGRITI_API_TOKEN;
if (!TOKEN) {
  console.error("Missing INTIGRITI_API_TOKEN environment variable");
  process.exit(1);
}

const SKILLS_PATH = process.env.INTIGRITI_SKILLS_PATH ?? "./skills.json";
const SNAPSHOT_PATH = process.env.INTIGRITI_SNAPSHOT_PATH ?? "./data/scope-snapshots.json";

const client = new IntigritiClient({ token: TOKEN });
const store = new ScopeStore(SNAPSHOT_PATH);

const server = new McpServer({
  name: "intigriti-mcp",
  version: "1.0.0",
});

server.tool(
  "list_programs",
  "List Intigriti bug bounty programs visible to this researcher account, with status and reward info.",
  {},
  async () => {
    const programs = await client.listPrograms();
    return {
      content: [{ type: "text", text: JSON.stringify(programs, null, 2) }],
    };
  }
);

server.tool(
  "get_program_scope",
  "Fetch the full in-scope/out-of-scope asset list and metadata (headers, rate limits) for a single program.",
  { programId: z.string().describe("The Intigriti program ID or handle") },
  async ({ programId }) => {
    const scope = await client.getProgramScope(programId);
    return {
      content: [{ type: "text", text: JSON.stringify(scope, null, 2) }],
    };
  }
);

server.tool(
  "diff_scope",
  "Fetch a program's current scope and compare it against the last stored snapshot, returning added/removed/modified assets. Updates the stored snapshot.",
  { programId: z.string().describe("The Intigriti program ID or handle") },
  async ({ programId }) => {
    const scope = await client.getProgramScope(programId);
    const diff = await store.diffAndUpdate(scope);
    return {
      content: [{ type: "text", text: JSON.stringify(diff, null, 2) }],
    };
  }
);

server.tool(
  "recommend_program",
  "Score all active programs against your skills manifest (INTIGRITI_SKILLS_PATH) and return them ranked best-fit first. Programs whose scope was recently published get a decaying recency boost so newly-updated programs surface higher.",
  {
    topN: z.number().int().positive().optional().describe("Limit to top N results (default: all)"),
    recencyWindowDays: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Recency boost window in days (default: 14)"),
    maxRecencyBoost: z
      .number()
      .gt(1)
      .optional()
      .describe("Max score multiplier for a just-updated scope, decays to 1.0 over the window (default: 1.25)"),
  },
  async ({ topN, recencyWindowDays, maxRecencyBoost }) => {
    const [programs, manifest] = await Promise.all([
      client.listPrograms(),
      loadSkillsManifest(SKILLS_PATH),
    ]);

    const recency = {
      windowDays: recencyWindowDays,
      maxBoost: maxRecencyBoost,
    };

    const breakdowns = await Promise.all(
      programs.map(async (program) => {
        try {
          const scope = await client.getProgramScope(program.id);
          return scoreProgram(program, scope, manifest, recency);
        } catch (err) {
          return {
            program,
            score: 0,
            matchedSkills: [],
            notes: [`Failed to fetch scope: ${(err as Error).message}`],
          };
        }
      })
    );

    let ranked = rankPrograms(breakdowns);
    if (topN) ranked = ranked.slice(0, topN);

    return {
      content: [{ type: "text", text: JSON.stringify(ranked, null, 2) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("intigriti-mcp server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting intigriti-mcp:", err);
  process.exit(1);
});
