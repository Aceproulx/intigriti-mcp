import type {
  ProgramScope,
  ProgramScoreBreakdown,
  ProgramSummary,
  SkillsManifest,
} from "./types.js";

export interface RecencyBoostOptions {
  /** How recent a scope version must be to receive a boost, in days. */
  windowDays?: number;
  /** Max score multiplier applied to a program updated right now (decays to 1.0 over the window). */
  maxBoost?: number;
}

const DEFAULT_WINDOW_DAYS = 14;
const DEFAULT_MAX_BOOST = 1.25;

/**
 * Score a single program against the skills manifest.
 *
 * Matching is done at the asset-type level: each skill entry declares which
 * asset types it applies to (e.g. "api-abuse" -> ["api"], "mobile-android"
 * -> ["android"]). We score how much of the program's in-scope surface
 * overlaps with skills you're strong in, weighted by your confidence.
 *
 * Recency: if the program's scope version was published recently, the score
 * gets a boost that decays linearly from `maxBoost` (updated right now) down
 * to 1.0 at `windowDays`. This surfaces freshly-changed programs — e.g.
 * scope additions your skills are relevant to — before they cool off.
 *
 * This is deliberately simple to start. As the skills manifest gets richer
 * (e.g. per-tech-stack tags once hackbot can self-report), extend the
 * matching here rather than bolting on separate scoring paths.
 */
export function scoreProgram(
  program: ProgramSummary,
  scope: ProgramScope,
  manifest: SkillsManifest,
  recency: RecencyBoostOptions = {}
): ProgramScoreBreakdown {
  const notes: string[] = [];

  // Intigriti researcher API returns status enum values like "open",
  // "suspended", "paused", "closed".
  if (!["active", "open"].includes(program.status)) {
    return {
      program,
      score: 0,
      matchedSkills: [],
      notes: [`Program status is "${program.status}", not active — excluded`],
    };
  }

  const inScopeAssets = scope.assets.filter((a) => a.inScope);
  if (inScopeAssets.length === 0) {
    return { program, score: 0, matchedSkills: [], notes: ["No in-scope assets found"] };
  }

  const assetTypeCounts: Record<string, number> = {};
  for (const a of inScopeAssets) {
    assetTypeCounts[a.type] = (assetTypeCounts[a.type] ?? 0) + 1;
  }

  const matchedSkills: { skill: string; weight: number; reason: string }[] = [];
  let rawScore = 0;

  for (const skill of manifest.skills) {
    const appliesTo = skill.appliesTo ?? [];
    let overlapCount = 0;
    for (const type of appliesTo) {
      overlapCount += assetTypeCounts[type] ?? 0;
    }
    if (overlapCount > 0) {
      const contribution = skill.weight * overlapCount;
      rawScore += contribution;
      matchedSkills.push({
        skill: skill.skill,
        weight: skill.weight,
        reason: `${overlapCount} in-scope asset(s) of type [${appliesTo.join(", ")}]`,
      });
    }
  }

  // Normalize by total in-scope asset count so bigger programs don't
  // automatically win just by having more assets.
  let score = rawScore / inScopeAssets.length;

  if (matchedSkills.length === 0) {
    notes.push("No skill in your manifest matches this program's asset types");
  }

  // --- Recency boost for newly updated programs ---
  if (scope.scopeVersionAt) {
    const nowMs = Date.now();
    const publishedMs = Date.parse(scope.scopeVersionAt);
    const windowDays = recency.windowDays ?? DEFAULT_WINDOW_DAYS;
    const maxBoost = recency.maxBoost ?? DEFAULT_MAX_BOOST;

    if (Number.isFinite(publishedMs) && windowDays > 0 && maxBoost > 1) {
      const daysAgo = (nowMs - publishedMs) / 86_400_000;
      if (daysAgo >= 0 && daysAgo < windowDays) {
        const factor = maxBoost - (daysAgo / windowDays) * (maxBoost - 1);
        score *= factor;
        notes.push(
          `Recency boost ${factor.toFixed(3)}x — scope published ${daysAgo.toFixed(1)}d ago (window ${windowDays}d, max ${maxBoost.toFixed(2)}x)`
        );
      }
    }
  }

  return { program, score, matchedSkills, notes: notes.length ? notes : undefined };
}

export function rankPrograms(
  breakdowns: ProgramScoreBreakdown[]
): ProgramScoreBreakdown[] {
  return [...breakdowns].sort((a, b) => b.score - a.score);
}
