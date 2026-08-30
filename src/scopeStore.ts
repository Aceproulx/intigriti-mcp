import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import type { ProgramScope, ScopeAsset, ScopeDiff, ScopeSnapshot } from "./types.js";

/**
 * Persists a snapshot of each program's scope to a local JSON file so we
 * can diff "what changed since last time we checked." Swap this out for
 * SQLite later if the snapshot file gets large or you want query support.
 */
export class ScopeStore {
  private path: string;
  private cache: Record<string, ScopeSnapshot> | null = null;

  constructor(path = "./data/scope-snapshots.json") {
    this.path = path;
  }

  private async load(): Promise<Record<string, ScopeSnapshot>> {
    if (this.cache) return this.cache;
    try {
      const raw = await readFile(this.path, "utf-8");
      this.cache = JSON.parse(raw);
    } catch {
      this.cache = {};
    }
    return this.cache!;
  }

  private async save(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    await writeFile(this.path, JSON.stringify(this.cache, null, 2), "utf-8");
  }

  async getSnapshot(programId: string): Promise<ScopeSnapshot | null> {
    const all = await this.load();
    return all[programId] ?? null;
  }

  /** Compare a freshly fetched scope against the stored snapshot, then update the snapshot. */
  async diffAndUpdate(scope: ProgramScope): Promise<ScopeDiff> {
    const previous = await this.getSnapshot(scope.programId);

    const beforeById = previous?.assetsById ?? {};
    const afterById: Record<string, ScopeAsset> = {};
    for (const a of scope.assets) afterById[a.id] = a;

    const added: ScopeAsset[] = [];
    const removed: ScopeAsset[] = [];
    const modified: { before: ScopeAsset; after: ScopeAsset }[] = [];
    let unchanged = 0;

    for (const id of Object.keys(afterById)) {
      const after = afterById[id];
      const before = beforeById[id];
      if (!before) {
        added.push(after);
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        modified.push({ before, after });
      } else {
        unchanged++;
      }
    }
    for (const id of Object.keys(beforeById)) {
      if (!afterById[id]) removed.push(beforeById[id]);
    }

    const diff: ScopeDiff = {
      programId: scope.programId,
      previousSnapshotAt: previous?.savedAt ?? null,
      added,
      removed,
      modified,
      unchanged,
    };

    const all = await this.load();
    all[scope.programId] = {
      programId: scope.programId,
      savedAt: scope.fetchedAt,
      assetsById: afterById,
    };
    await this.save();

    return diff;
  }
}
