import { z } from "zod";
import { getRoomProfile, getFit, getActProfile, getSponsorFit, getScenePeers, resolveAct, requireRoom } from "../roomtone/engine";
import { ROOMS } from "../roomtone/catalog";
import type { QlooCall } from "../qloo/types";

/**
 * Roomtone's tool surface.
 *
 * Every tool is a thin, typed wrapper over the Qloo layer and returns both data
 * and the Qloo calls that produced it. The Booking Desk agent can only reach
 * Qloo through these, so the provenance shown to a user is complete by
 * construction — there is no path from the agent to a number whose request we
 * have not logged.
 */
export interface ToolResult<T = unknown> {
  ok: boolean;
  data: T;
  calls: QlooCall[];
  /** Set when the tool could not run. Never conflated with an empty result. */
  error?: string;
}

export interface Tool {
  name: string;
  description: string;
  input: z.ZodTypeAny;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
}

const idField = z.string().min(1).describe("Qloo entity id");

export const TOOLS: Tool[] = [
  {
    name: "find_act",
    description:
      "Resolve an artist name to a Qloo entity id. Returns candidates with a match-strength flag; Qloo can resolve a name to the wrong artist, so never assume the first hit is correct.",
    input: z.object({ name: z.string().min(2) }),
    run: async ({ name }) => {
      try {
        const r = await resolveAct(String(name));
        return {
          ok: r.match === "strong",
          data: { resolved: r, note: r.match === "weak" ? "Top hit is a weak match — confirm before relying on it." : undefined },
          calls: [],
        };
      } catch (e) {
        return { ok: false, data: null, calls: [], error: msg(e) };
      }
    },
  },
  {
    name: "read_room",
    description:
      "Read a room's audience: the acts whose audiences sit closest to this venue's own crowd, plus the taste tags that describe it and the rooms it shares a crowd with.",
    input: z.object({ roomId: idField }),
    run: async ({ roomId }) => {
      try {
        const p = await getRoomProfile(String(roomId), 50);
        if (p.unmeasured) {
          return { ok: false, data: { unmeasured: true, room: p.room.name }, calls: p.calls, error: `Qloo has no taste signal for ${p.room.name}.` };
        }
        let peers: Awaited<ReturnType<typeof getScenePeers>>["peers"] = [];
        try {
          const r = await getScenePeers(String(roomId), 4);
          peers = r.peers;
          p.calls.push(...r.calls);
        } catch {
          /* scene is an enrichment */
        }
        return {
          ok: true,
          data: {
            room: p.room,
            acts: p.acts.slice(0, 20),
            totalActs: p.acts.length,
            tasteTags: p.tasteTags,
            baseline: p.baseline,
            scenePeers: peers.map((s) => ({ name: s.room.name, sharedActs: s.sharedActs.slice(0, 6), shared: s.sharedActs.length })),
          },
          calls: p.calls,
        };
      } catch (e) {
        return { ok: false, data: null, calls: [], error: msg(e) };
      }
    },
  },
  {
    name: "read_act",
    description: "Read an act: genres, taste tags, and the acts Qloo considers closest to its audience.",
    input: z.object({ actId: idField }),
    run: async ({ actId }) => {
      try {
        const p = await getActProfile(String(actId));
        return {
          ok: !p.unmeasured,
          data: { act: p.name, genres: p.genres, tags: p.tags.slice(0, 24), similar: p.similar.slice(0, 8), monthlyListeners: p.monthlyListeners },
          calls: p.calls,
        };
      } catch (e) {
        return { ok: false, data: null, calls: [], error: msg(e) };
      }
    },
  },
  {
    name: "measure_fit",
    description:
      "Place one act inside one room's audience. Returns the percentile within that room's own top acts and a band (core / edge / outside). This is audience alignment, never a sales forecast.",
    input: z.object({ roomId: idField, actId: idField }),
    run: async ({ roomId, actId }) => {
      try {
        const f = await getFit(String(roomId), String(actId));
        return {
          ok: !f.unmeasured,
          data: { room: f.roomName, act: f.actName, percentile: f.percentile, band: f.band, rankInRoom: f.rankInRoom, rawAffinity: f.rawAffinity, verdict: f.verdict },
          calls: f.calls,
        };
      } catch (e) {
        return { ok: false, data: null, calls: [], error: msg(e) };
      }
    },
  },
  {
    name: "sponsor_fit",
    description:
      "Which brands reach this act's audience. Reliable when anchored on an act; do not use for a venue.",
    input: z.object({ actId: idField }),
    run: async ({ actId }) => {
      try {
        const s = await getSponsorFit(String(actId));
        return {
          ok: s.confidence !== "none",
          data: { brands: s.brands.slice(0, 10), confidence: s.confidence },
          calls: s.calls,
          error: s.confidence === "none" ? "No brand overlap found for this act." : undefined,
        };
      } catch (e) {
        return { ok: false, data: null, calls: [], error: msg(e) };
      }
    },
  },
  {
    name: "list_rooms",
    description: "List every room in the curated catalog, with city, neighbourhood and venue genre.",
    input: z.object({}),
    run: async () => ({
      ok: true,
      data: ROOMS.map((r) => ({ id: r.id, name: r.name, city: r.city, neighborhood: r.neighborhood, genre: r.genre })),
      calls: [],
    }),
  },
];

export const TOOL_MAP = new Map(TOOLS.map((t) => [t.name, t]));

function msg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}