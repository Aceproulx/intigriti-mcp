export interface ProgramSummary {
  id: string;
  handle: string;
  name: string;
  status: "active" | "paused" | "closed" | string;
  confidentialityLevel?: string;
  maxBounty?: number;
  minBounty?: number;
  tags?: string[];
}

export interface ScopeAsset {
  id: string;
  type: string; // e.g. "url", "android", "ios", "api", "other"
  endpoint: string; // domain, package name, description, etc.
  tier?: string; // reward tier / severity ceiling if provided
  description?: string;
  inScope: boolean;
}

export interface ProgramScope {
  programId: string;
  fetchedAt: string; // ISO timestamp
  assets: ScopeAsset[];
  requiredHeaders?: Record<string, string>;
  rateLimit?: string;
  /** ISO timestamp of when the program's scope version was last published (recency signal). */
  scopeVersionAt?: string;
}

export interface ScopeSnapshot {
  programId: string;
  savedAt: string;
  // hash per asset id -> asset, for cheap diffing
  assetsById: Record<string, ScopeAsset>;
}

export interface ScopeDiff {
  programId: string;
  previousSnapshotAt: string | null;
  added: ScopeAsset[];
  removed: ScopeAsset[];
  modified: { before: ScopeAsset; after: ScopeAsset }[];
  unchanged: number;
}

// --- Skills manifest (user-supplied) ---

export interface SkillEntry {
  // e.g. "idor", "ssrf", "auth-bypass", "api-abuse", "mobile-android"
  skill: string;
  // 0-1 confidence/strength in this skill
  weight: number;
  // asset types this skill applies well to, e.g. ["api", "url"]
  appliesTo?: string[];
}

export interface SkillsManifest {
  skills: SkillEntry[];
}

export interface ProgramScoreBreakdown {
  program: ProgramSummary;
  score: number;
  matchedSkills: { skill: string; weight: number; reason: string }[];
  notes?: string[];
}
