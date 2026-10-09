import { affinity, insights } from "../qloo/client";
import type { QlooCall } from "../qloo/types";
import { getRoomProfile } from "./engine";
import { ROOMS } from "./catalog";

/**
 * Which brands reach the crowd that is actually in the room.
 *
 * This is the composition the local-audience finding made possible. Qloo's brand
 * affinity is sharp when anchored on an act and diffuse or empty when anchored on
 * a venue — we verified both directly. But a room's *local audience* is exactly
 * the set of acts Qloo returns for it, so the sponsorable categories for that
 * crowd are recoverable by composition: room → its local acts → the brands whose
 * audiences overlap those acts.
 *
 * The distinction this preserves matters commercially. A sponsorship desk doesn't
 * want brands that match the touring headline; it wants brands that reach the
 * people locally who actually buy into this room. Those are different sets, and
 * the benchmark showed why conflating them produces the wrong answer.
 *
 * Live Nation Media & Sponsorship booked 95% of its 2026 commitments before the
 * year began and, by its own account, has no independent measure of whether those
 * brands reached the audience they were sold. Being independent — selling no
 * sponsorship — is the only credible position to measure it from.
 */

export interface RoomSponsor {
  name: string;
  id: string;
  /** How much of the room's local audience this brand's audiences overlap. */
  reach: number;
  /** Names of the room's local acts that connect this brand to the crowd. */
  via: string[];
}

export interface RoomSponsorRead {
  roomName: string;
  roomCity: string;
  /** Number of the room's local acts the read is built from. */
  actsSampled: number;
  sponsors: RoomSponsor[];
  confidence: "high" | "low" | "none";
  calls: QlooCall[];
  note: string;
}

export async function readRoomSponsors(roomId: string, sampleSize = 8): Promise<RoomSponsorRead> {
  const room = ROOMS.find((r) => r.id === roomId);
  const calls: QlooCall[] = [];

  const profile = await getRoomProfile(roomId, 50);
  calls.push(...profile.calls);

  const sample = profile.acts.slice(0, sampleSize);
  if (profile.unmeasured || sample.length === 0) {
    return {
      roomName: room?.name ?? "room",
      roomCity: [room?.neighborhood, room?.city].filter(Boolean).join(", "),
      actsSampled: 0,
      sponsors: [],
      confidence: "none",
      calls,
      note: profile.unmeasured
        ? "Qloo has no taste signal for this room, so the sponsorship read cannot be composed."
        : "No local acts available to compose from.",
    };
  }

  // Reach weight: the room's own affinity ordering, normalised to sum to 1.
  const total = sample.reduce((s, a) => s + a.affinity, 0) || 1;

  // brand name -> accumulated reach > 1 (a brand can arrive via several acts).
  const acc = new Map<string, { id: string; reach: number; via: string[] }>();

  for (const act of sample) {
    try {
      const res = await insights(
        "urn:entity:brand",
        { entities: [act.entity_id] },
        { label: `${act.name} → sponsorable categories`, take: 12 },
      );
      calls.push(...res.calls);

      const share = act.affinity / total;
      for (const b of res.entities.slice(0, 12)) {
        const aff = affinity(b);
        if (aff === null) continue;
        const contribution = aff * share;
        const cur = acc.get(b.name);
        if (cur) {
          cur.reach += contribution;
          if (cur.via.length < 3 && !cur.via.includes(act.name)) cur.via.push(act.name);
        } else {
          acc.set(b.name, { id: b.entity_id, reach: contribution, via: [act.name] });
        }
        if (cur && !cur.id) cur.id = b.entity_id;
      }
    } catch {
      /* one unreachable act must not sink the whole read */
    }
  }

  const sponsors = [...acc.entries()]
    .map(([name, v]) => ({ name, id: v.id, reach: v.reach, via: v.via }))
    .sort((a, b) => b.reach - a.reach);

  // Confidence from concentration: a shortlist worth acting on clusters.
  const top = sponsors.slice(0, 12);
  const spread = top.length >= 2 ? top[0]!.reach - top[top.length - 1]!.reach : 1;
  const concentration = top.reduce((s, x) => s + x.reach, 0);
  const confidence: RoomSponsorRead["confidence"] =
    sponsors.length === 0
      ? "none"
      : spread <= Math.max(0.6, concentration * 0.55) && top.length >= 5
        ? "high"
        : "low";

  return {
    roomName: room?.name ?? "room",
    roomCity: [room?.neighborhood, room?.city].filter(Boolean).join(", "),
    actsSampled: sample.length,
    sponsors: top,
    confidence,
    calls,
    note:
      confidence === "high"
        ? "Composed from the room's own local acts. Reach is the affinity-weighted share of this room's audience that overlaps each brand's audiences."
        : "The brand list is diffuse enough that presenting it as a shortlist would be padding.",
  };
}