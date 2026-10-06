import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createHash } from "node:crypto";
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
    mem = new Map();
    filePath;
    dirty = false;
    flushTimer = null;
    constructor(filePath) {
        this.filePath = filePath ?? null;
        if (this.filePath)
            this.load();
    }
    static key(path, params) {
        const norm = Object.keys(params)
            .filter((k) => params[k] !== undefined && params[k] !== null && params[k] !== "")
            .sort()
            .map((k) => `${k}=${String(params[k])}`)
            .join("&");
        return createHash("sha1").update(`${path}?${norm}`).digest("hex").slice(0, 24);
    }
    load() {
        try {
            const raw = readFileSync(this.filePath, "utf8");
            const parsed = JSON.parse(raw);
            const cutoff = Date.now() - STALE_MS;
            for (const [k, v] of Object.entries(parsed)) {
                if (v.storedAt >= cutoff)
                    this.mem.set(k, v);
            }
        }
        catch {
            /* no cache yet — fine */
        }
    }
    scheduleFlush() {
        if (!this.filePath || this.flushTimer)
            return;
        this.dirty = true;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            if (this.dirty)
                this.flush();
        }, 1500);
        this.flushTimer.unref?.();
    }
    flush() {
        if (!this.filePath)
            return;
        try {
            mkdirSync(dirname(this.filePath), { recursive: true });
            writeFileSync(this.filePath, JSON.stringify(Object.fromEntries(this.mem)));
            this.dirty = false;
        }
        catch {
            /* cache is an optimisation; never fail a request because of it */
        }
    }
    get(key) {
        const e = this.mem.get(key);
        if (!e)
            return null;
        return { value: e.value, ageMs: Date.now() - e.storedAt, fresh: Date.now() - e.storedAt < FRESH_MS };
    }
    set(key, value) {
        this.mem.set(key, { value, storedAt: Date.now() });
        this.scheduleFlush();
    }
    get size() {
        return this.mem.size;
    }
}
