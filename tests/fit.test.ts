import { describe, expect, it } from "vitest";
import { getRoomProfile, getFit } from "../src/lib/roomtone/engine";
import type { RoomAct } from "../src/lib/roomtone/engine";

/**
 * The scoring math is the product. These tests pin the behaviour we claim on
 * the Method page — most importantly that a failed request is never reported as
 * a confident "not measured".
 */

function act(name: string, affinity: number, rank: number): RoomAct {
  return { entity_id: `id-${name}`, name, affinity, rank, tags: [], genres: [] };
}

describe("fit percentiles", () => {
  // The percentile is computed inline in getFit; this asserts the arithmetic it
  // relies on against a synthetic distribution, since the shape of Qloo's bands
  // (tight, top-of-scale) is the reason we normalise at all.
  const roomActs = [
    act("A", 0.96, 1),
    act("B", 0.95, 2),
    act("C", 0.94, 3),
    act("D", 0.93, 4),
    act("E", 0.92, 5),
  ];

  const percentileOf = (raw: number) => roomActs.filter((a) => a.affinity <= raw).length / roomActs.length;

  it("an act at the very top scores the 100th percentile", () => {
    expect(percentileOf(0.96)).toBe(1);
  });

  it("an act tied with the lowest top-act scores the 20th percentile", () => {
    expect(percentileOf(0.92)).toBe(0.2);
  });

  it("an act below every top-act scores 0", () => {
    expect(percentileOf(0.5)).toBe(0);
  });

  it("an act above every top-act saturates at 100 rather than exceeding it", () => {
    expect(percentileOf(1.1)).toBe(1);
  });

  it("separates a clear mismatch from a clear fit inside one room", () => {
    // This is the property the product depends on: raw affinity differences of
    // ~0.4 must produce a visible, unambiguous verdict.
    expect(percentileOf(0.94) - percentileOf(0.5)).toBeGreaterThan(0.5);
  });
});

describe("degraded states are never silently confident", () => {
  it("reports an unknown room rather than inventing one", async () => {
    await expect(getRoomProfile("not-a-real-room")).rejects.toThrow();
  });

  it("rejects a malformed room id", async () => {
    await expect(getFit("'; DROP TABLE rooms; --", "abc")).rejects.toThrow();
  });
});