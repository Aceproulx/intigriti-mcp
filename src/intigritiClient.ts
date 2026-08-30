import type { ProgramSummary, ProgramScope, ScopeAsset } from "./types.js";

/**
 * Thin client for the Intigriti Researcher API (v1).
 *
 * Paths and field shapes below were verified against the published OpenAPI
 * spec at
 * https://api.intigriti.com/external/researcher/swagger/v1.0/swagger.json:
 *
 *   GET /v1/programs            -> PaginationViewModelOfProgramOverviewViewModel
 *                                  { maxCount, records: ProgramOverviewViewModel[] }
 *   GET /v1/programs/{id}       -> ProgramDetailViewModel
 *                                  { ..., domains: VersionViewModelOfListOfDomainViewModel
 *                                    { id, createdAt, content: DomainViewModel[] } }
 *
 * Auth: `Authorization: Bearer <PAT>` (Personal Access Token).
 */

const DEFAULT_BASE_URL = "https://api.intigriti.com/external/researcher";
const V1 = "/v1";

export interface IntigritiClientOptions {
  token: string;
  baseUrl?: string;
}

export class IntigritiClient {
  private token: string;
  private baseUrl: string;

  constructor(opts: IntigritiClientOptions) {
    this.token = opts.token;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
  }

  private async request<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Intigriti API error ${res.status} ${res.statusText} on ${path}: ${body}`
      );
    }
    return (await res.json()) as T;
  }

  /** List all programs visible to this token (active, paused, private invites). */
  async listPrograms(): Promise<ProgramSummary[]> {
    const raw = await this.request<any>(
      `${V1}/programs?limit=500&offset=0`
    );
    const records: any[] = Array.isArray(raw)
      ? raw
      : (raw.records ?? []);
    return records.map(mapProgramSummary);
  }

  /** Fetch full scope + metadata for one program. */
  async getProgramScope(programId: string): Promise<ProgramScope> {
    const raw = await this.request<any>(`${V1}/programs/${programId}`);
    return mapProgramScope(programId, raw);
  }
}

/** Enum/view-model helper: fields are objects { id, value }. */
function enumValue(e: unknown): string | undefined {
  if (e == null) return undefined;
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const obj = e as { value?: unknown; id?: unknown };
    if (obj.value != null) return String(obj.value);
    if (obj.id != null) return String(obj.id);
  }
  return undefined;
}

/** Money/view-model helper: fields are objects { value, currency }. */
function moneyValue(m: unknown): number | undefined {
  if (m == null) return undefined;
  if (typeof m === "number") return m;
  if (typeof m === "object") {
    const v = (m as { value?: unknown }).value;
    if (typeof v === "number") return v;
    if (typeof v === "string") return Number(v);
  }
  return undefined;
}

function mapProgramSummary(raw: any): ProgramSummary {
  return {
    id: String(raw.id ?? raw.handle),
    handle: raw.handle ?? raw.name,
    name: raw.name ?? raw.handle,
    status: (enumValue(raw.status) ?? "unknown").toLowerCase(),
    confidentialityLevel: enumValue(raw.confidentialityLevel),
    maxBounty: moneyValue(raw.maxBounty),
    minBounty: moneyValue(raw.minBounty),
    tags: raw.industry ? [String(raw.industry)] : undefined,
  };
}

function mapProgramScope(programId: string, raw: any): ProgramScope {
  /** Normalize Intigriti's asset-type names to the manifest's vocabulary. */
  const NORMALIZE_TYPE: Record<string, string> = {
    website: "url",
    web: "url",
    web_service: "api",
    url: "url",
    wildcard: "url",
  };
  // Intigriti marks out-of-scope assets via tier = "Out Of Scope".
  const OUT_OF_SCOPE_TIER = "out of scope";

  const domains: any[] = raw.domains?.content ?? raw.domains ?? [];
  const assets: ScopeAsset[] = domains.map((a) => {
    const rawType = (enumValue(a.type) ?? "other").toLowerCase();
    const rawTier = (enumValue(a.tier) ?? "").toLowerCase();
    return {
      id: String(a.id ?? a.endpoint),
      type: NORMALIZE_TYPE[rawType] ?? rawType,
      endpoint: a.endpoint ?? a.value ?? a.domain ?? "",
      tier: enumValue(a.tier),
      description: a.description,
      inScope: rawTier !== OUT_OF_SCOPE_TIER,
    };
  });

  // domains.createdAt is a Unix epoch in seconds (verified against live API).
  const versionAtSec = raw.domains?.createdAt;
  const scopeVersionAt =
    typeof versionAtSec === "number" && versionAtSec > 0
      ? new Date(versionAtSec * 1000).toISOString()
      : undefined;

  return {
    programId,
    fetchedAt: new Date().toISOString(),
    assets,
    requiredHeaders: raw.requiredHeaders,
    rateLimit: raw.rateLimit,
    scopeVersionAt,
  };
}
