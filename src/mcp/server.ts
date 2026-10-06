#!/usr/bin/env node
/**
 * Roomtone as an MCP server.
 *
 * Exposes Roomtone's measurement tools over the Model Context Protocol so any
 * MCP-compatible client — Claude Desktop, an agent harness, an internal tool —
 * can ask "who draws this room" and get a measured, provenance-carrying answer
 * instead of a generated one.
 *
 * Transport is stdio, launched as a subprocess:
 *   { "mcpServers": { "roomtone": { "command": "node", "args": ["dist/mcp/server.js"] } } }
 *
 * QLOO_API_KEY must be in the server's environment. Roomtone's own MCP tools
 * call the Qloo API directly rather than through `qloo mcp`, because the
 * official harness ships no hosted endpoint and its stdio server is not
 * available from a deployed container. This server is the complement: it puts
 * *Roomtone's* measurement in front of any client, and every tool response
 * carries the Qloo calls that produced it.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

import { ROOMS } from "../lib/roomtone/catalog.js";
import { getRoomProfile, getFit, getActProfile, getSponsorFit, resolveAct } from "../lib/roomtone/engine.js";

const server = new Server(
  { name: "roomtone", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

type Tool = { name: string; description: string; inputSchema: unknown; run: (a: never) => Promise<unknown> };

const TOOLS: Tool[] = [
  {
    name: "list_rooms",
    description:
      "List the curated rooms whose audiences Roomtone can measure. Every id is pinned to a Qloo entity verified against its own location.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    run: async () => ({
      rooms: ROOMS.map((r) => ({
        id: r.id,
        name: r.name,
        city: r.city,
        neighborhood: r.neighborhood,
        venue_genre: r.genre,
      })),
    }),
  },
  {
    name: "read_room",
    description:
      "Read a room's audience: the acts whose audiences sit closest to this venue's own crowd, the taste tags describing that crowd, and nearby rooms sharing acts with it.",
    inputSchema: {
      type: "object",
      properties: { roomId: { type: "string", description: "Qloo entity id from list_rooms" } },
      required: ["roomId"],
      additionalProperties: false,
    },
    run: async ({ roomId }: { roomId: string }) => {
      const p = await getRoomProfile(roomId, 50);
      if (p.unmeasured) {
        return { room: p.room.name, unmeasured: true, note: "Qloo has no taste signal for this room." };
      }
      return {
        room: { name: p.room.name, city: p.room.city, neighborhood: p.room.neighborhood, venue_genre: p.room.genre },
        measured_acts: p.acts.length,
        affinity_band: { min: p.baseline.min, max: p.baseline.max },
        acts: p.acts.slice(0, 20).map((a) => ({ rank: a.rank, name: a.name, affinity: a.affinity })),
        taste_tags: p.tasteTags.map((t) => ({ name: t.name, namespace: t.type })),
        qloo_calls: p.calls.map(prov),
      };
    },
  },
  {
    name: "measure_fit",
    description:
      "Place one act inside one room's audience and return the percentile within that room's own top acts plus a band (core / edge / outside). Measures audience alignment only — never ticket sales.",
    inputSchema: {
      type: "object",
      properties: {
        roomId: { type: "string" },
        actId: { type: "string" },
      },
      required: ["roomId", "actId"],
      additionalProperties: false,
    },
    run: async ({ roomId, actId }: { roomId: string; actId: string }) => {
      const f = await getFit(roomId, actId);
      return {
        act: f.actName,
        room: f.roomName,
        band: f.band,
        percentile: f.percentile,
        rank_in_room: f.rankInRoom,
        raw_affinity: f.rawAffinity,
        verdict: f.verdict,
        caveat: "Audience alignment from aggregate cultural affinity. Not a ticket-sales forecast and not a statement about any individual.",
        qloo_calls: f.calls.map(prov),
      };
    },
  },
  {
    name: "find_act",
    description:
      "Resolve an artist name to a Qloo entity id. Returns a match-strength flag — Qloo can resolve a name to the wrong artist, so check it before trusting the id.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    run: async ({ name }: { name: string }) => {
      const r = await resolveAct(name);
      return {
        resolved: { id: r.id, name: r.name, match: r.match, disambiguation: r.disambiguation },
        alternatives: r.alternatives,
      };
    },
  },
  {
    name: "sponsor_fit",
    description:
      "Which brands reach an act's audience. Reliable when anchored on an act; the result is dropped if the affinity spread is too wide to be a shortlist.",
    inputSchema: {
      type: "object",
      properties: { actId: { type: "string" } },
      required: ["actId"],
      additionalProperties: false,
    },
    run: async ({ actId }: { actId: string }) => {
      const s = await getSponsorFit(actId);
      return {
        confidence: s.confidence,
        brands: s.brands.map((b) => ({ name: b.name, affinity: b.affinity })),
        note:
          s.confidence === "high"
            ? "Tight enough to present as a shortlist."
            : "Too diffuse to be a shortlist; presenting it as one would be padding.",
        qloo_calls: s.calls.map(prov),
      };
    },
  },
];

function prov(c: { method: string; path: string; params: Record<string, string>; status: number; durationMs: number; resultCount: number; cache: string }) {
  return {
    method: c.method,
    endpoint: c.path,
    params: c.params,
    status: c.status,
    duration_ms: c.durationMs,
    results: c.resultCount,
    cache: c.cache,
  };
}

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const tool = TOOLS.find((t) => t.name === req.params.name);
  if (!tool) {
    return { content: [{ type: "text" as const, text: `Unknown tool: ${req.params.name}` }], isError: true };
  }
  try {
    const result = await tool.run(req.params.arguments as never);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: err instanceof Error ? err.message : String(err) }],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
// stdout is the protocol channel; diagnostics must go to stderr.
process.stderr.write("roomtone mcp server ready\n");