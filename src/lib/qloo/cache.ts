import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";

export interface CacheEntry<T> {
  value: T;
  storedAt: number;
  /** Captured when the call succeeded; used to serve stale data if Qloo is unreachable. */
  providerCalls?: unknown;
}

const FRESH_MS = 1000 * 60 * 60 * 12;
const STALE_MS = 1000 * 60 * 60 * 24 * 30;

/**
 * Two-tier cache: process memory for hot reads, a JSON file for warm restarts.
 *
 * The demo must survive Qloo rate limiting, so every read is cached aggressively
 * and stale entries are served rather than failing. `ageMs` is surfaced in the
 * Evidence panel so nobody is misled about freshness.
 */
export class ResponseCache {
  private mem = new Map<string, CacheEntry<unknown>>();
  private filePath: string | null;
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(filePath?: string) {
    this.filePath = filePath ?? null;
    if (this.filePath) this.load();
  }

  static key(path: string, params: Record<string, unknown>): string {
    const norm = Object.keys(params)
      .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
      .sort()
      .map((k) => `${k}=${String(params[k])}`)
      .join("&");
    return createHash("sha1").update(`${path}?${norm}`).digest("hex").slice(0, 24);
  }

  private load() {
    try {
      const raw = readFileSync(this.filePath!, "utf8");
      const parsed = JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
      const cutoff = Date.now() - STALE_MS;
      for (const [k, v] of Object.entries(parsed)) {
        if (v.storedAt >= cutoff) this.mem.set(k, v);
      }
    } catch {
      /* no cache yet — fine */
    }
  }

  private scheduleFlush() {
    if (!this.filePath || this.flushTimer) return;
    this.dirty = true;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      if (this.dirty) this.flush();
    }, 1500);
    this.flushTimer.unref?.();
  }

  flush() {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.mem)));
      this.dirty = false;
    } catch {
      /* cache is an optimisation; never fail a request because of it */
    }
  }

  get<T>(key: string): { value: T; ageMs: number; fresh: boolean } | null {
    const e = this.mem.get(key) as CacheEntry<T> | undefined;
    if (!e) return null;
    return { value: e.value, ageMs: Date.now() - e.storedAt, fresh: Date.now() - e.storedAt < FRESH_MS };
  }

  set<T>(key: string, value: T) {
    this.mem.set(key, { value, storedAt: Date.now() });
    this.scheduleFlush();
  }

  get size() {
    return this.mem.size;
  }
}