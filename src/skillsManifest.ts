import { readFile } from "node:fs/promises";
import type { SkillsManifest } from "./types.js";

/**
 * Loads the user's skills profile from a JSON file. This is intentionally
 * plain data (not code) so it can be edited without touching the server,
 * and later generated/updated by hackbot itself once it can self-report
 * which vuln categories it's actually strong at.
 */
export async function loadSkillsManifest(path: string): Promise<SkillsManifest> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.skills)) {
    throw new Error(`Invalid skills manifest at ${path}: missing "skills" array`);
  }
  for (const s of parsed.skills) {
    if (typeof s.skill !== "string" || typeof s.weight !== "number") {
      throw new Error(
        `Invalid skill entry in ${path}: each entry needs a "skill" string and numeric "weight"`
      );
    }
  }
  return parsed as SkillsManifest;
}
