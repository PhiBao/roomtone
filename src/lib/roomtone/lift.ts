/**
 * Lift: removing popularity bias from Qloo's affinity.
 *
 * Two teams in this field independently found the same thing — raw Qloo
 * affinities are tightly banded at the top of the 0–1 scale, and within that
 * band the score largely tracks *local popularity* rather than taste fit. Any
 * popular act scores ~0.95 for any room, so raw strength cannot discriminate.
 *
 * The fix is the standard epidemiological one: compare against what is expected.
 * For a room we compute the affinity the top acts *of a given popularity tier*
 * score on average, then report an act's lift over that expectation. A slack
 * act can score 1.0 and still show negative lift, because everyone scores 1.0.
 *
 * This is what makes the Fit number mean something rather than restate fame.
 */
import { affinity, insights } from "../qloo/client";
import type { QlooCall } from "../qloo/types";
import { getRoomProfile, type RoomAct } from "./engine";

export interface LiftedAct {
  entity_id: string;
  name: string;
  rank: number;
  rawAffinity: number;
  popularity: number;
  /** Affinity minus the room's expected affinity at this popularity. */
  lift: number;
  /** Popularity-agnostic position within the room, 0–100. */
  liftPercentile: number;
}

export interface LiftResult {
  roomName: string;
  acts: LiftedAct[];
  /** Spearman ρ between raw affinity and popularity, within this room. */
  popularityCorrelation: number;
  calls: QlooCall[];
}

function rankArray(values: number[]): number[] {
  const order = values.map((v, i) => i).sort((a, b) => values[a]! - values[b]!);
  const ranks = new Array<number>(values.length).fill(0);
  order.forEach((idx, i) => { ranks[idx] = i + 1; });
  return ranks;
}

function spearmanOn(x: number[], y: number[]): number {
  if (x.length < 3) return Number.NaN;
  const rx = rankArray(x);
  const ry = rankArray(y);
  const n = x.length;
  const d2 = rx.reduce((s, v, i) => s + (v - ry[i]!) ** 2, 0);
  const denom = n * (n * n - 1);
  return denom === 0 ? Number.NaN : 1 - (6 * d2) / denom;
}

/**
 * Compute lift for a room's top acts.
 *
 * `bins` controls how finely we slice popularity; with 50 acts, 4 bins keeps
 * each bin's expectation meaningful (12–13 acts) rather than noisy.
 */
export async function computeLift(roomId: string, bins = 4): Promise<LiftResult> {
  const profile = await getRoomProfile(roomId, 50);
  const roomName = profile.room.name;

  const withPop = profile.acts.map((a) => {
    const pop = (a as RoomAct & { popularity?: number }).popularity ?? 0;
    return { ...a, popularity: pop };
  });

  const correlation = spearmanOn(
    withPop.map((a) => a.popularity),
    withPop.map((a) => a.affinity),
  );

  const pops = withPop.map((a) => a.popularity);
  const min = Math.min(...pops);
  const max = Math.max(...pops);
  const width = (max - min) / bins || 1;
  const binOf = (p: number) => Math.min(bins - 1, Math.floor((p - min) / width));

  const sums = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  for (const a of withPop) {
    const b = binOf(a.popularity);
    sums[b] += a.affinity;
    counts[b] += 1;
  }
  const expected = sums.map((s, i) => (counts[i] ? s / counts[i] : Number.NaN));

  const acts: LiftedAct[] = withPop.map((a) => {
    const exp = expected[binOf(a.popularity)] ?? a.affinity;
    return {
      entity_id: a.entity_id,
      name: a.name,
      rank: a.rank,
      rawAffinity: a.affinity,
      popularity: a.popularity,
      lift: a.affinity - exp,
      liftPercentile: 0,
    };
  });

  const lifts = acts.map((a) => a.lift);
  const ranks = rankArray(lifts);
  acts.forEach((a, i) => {
    a.liftPercentile = (((ranks[i] ?? 1) - 1) / Math.max(1, acts.length - 1)) * 100;
  });

  acts.sort((x, y) => y.lift - x.lift);

  return { roomName, acts, popularityCorrelation: correlation, calls: profile.calls };
}

/**
 * Fetch an act's lift without needing it in the room's top 50.
 *
 * Used when the Booking Desk is asked about an act the room's list does not
 * contain: we compare its affinity against the room's own affinity distribution
 * for popularity-comparable acts.
 */
export async function liftForAct(roomId: string, actId: string): Promise<{
  actName: string;
  rawAffinity: number | null;
  popularity: number | null;
  expected: number;
  lift: number | null;
  calls: QlooCall[];
}> {
  const profile = await getRoomProfile(roomId, 50);
  const calls: QlooCall[] = [...profile.calls];

  // Direct affinity for the one act.
  const { qloo } = await import("../qloo/client");
  let raw: number | null = null;
  let name: string | undefined;
  let popularity: number | null = null;
  try {
    const { data, call } = await qloo<{ results?: { entities?: { name: string; popularity?: number; query?: { affinity?: number } }[] } }>(
      "/v2/insights",
      {
        "filter.type": "urn:entity:artist",
        "signal.interests.entities": roomId,
        "filter.results.entities": actId,
        take: 1,
      },
      { label: "affinity of one act to one room" },
    );
    calls.push(call);
    const e = data.results?.entities?.[0];
    raw = e?.query?.affinity ?? null;
    name = e?.name;
    popularity = e?.popularity ?? null;
  } catch {
    /* leave null */
  }

  // Expected affinity at the act's popularity, interpolated across bins.
  const withPop = profile.acts.map((a) => ({ ...a, popularity: (a as RoomAct & { popularity?: number }).popularity ?? 0 }));
  const pops = withPop.map((a) => a.popularity);
  const min = Math.min(...pops, popularity ?? 0);
  const max = Math.max(...pops, popularity ?? 1);
  const bins = 4;
  const width = (max - min) / bins || 1;
  const binOf = (p: number) => Math.min(bins - 1, Math.floor((p - min) / width));
  const sums = new Array(bins).fill(0);
  const counts = new Array(bins).fill(0);
  for (const a of withPop) {
    const b = binOf(a.popularity);
    sums[b] += a.affinity;
    counts[b] += 1;
  }
  const target = binOf(popularity ?? min);
  const bucket = counts[target] ?? 0;
  const expected = bucket > 0 ? (sums[target] ?? 0) / bucket : profile.baseline.mean || raw || 0;

  return {
    actName: name ?? actId,
    rawAffinity: raw,
    popularity,
    expected,
    lift: raw === null ? null : raw - expected,
    calls,
  };
}

/** Ignored by callers that need a plain list; kept for symmetry. */
export { insights as _insights, affinity as _affinity };