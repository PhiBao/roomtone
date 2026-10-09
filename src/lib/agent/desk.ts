import { TOOL_MAP, type ToolResult } from "./tools";
import { ROOMS } from "../roomtone/catalog";
import type { QlooCall } from "../qloo/types";

/**
 * The Booking Desk: Roomtone's agent.
 *
 * It is deliberately **not** a language model. A booking verdict that changes
 * because a model had a bad afternoon is worse than no verdict, and the whole
 * claim of this product is that the number is measured rather than generated.
 * So the agent does exactly what it says: it parses the question, resolves
 * entities against Qloo's graph, runs a fixed plan of tools, and narrates what
 * came back — including what it could not measure.
 *
 * The trade-off is stated rather than hidden: it will not answer questions
 * outside its plan. That is a feature for a decision tool.
 */

export type StepStatus = "ok" | "empty" | "failed" | "skipped";

export interface Step {
  tool: string;
  args: Record<string, unknown>;
  status: StepStatus;
  summary: string;
  calls: QlooCall[];
}

export interface DeskAnswer {
  question: string;
  /** Short, human verdict. The first thing shown. */
  headline: string;
  /** The reasoning, as short paragraphs. */
  detail: string[];
  /** Named recommendations, when the question asked for any. */
  recommendations: { name: string; why: string }[];
  /** Things we could not establish. Always populated when relevant. */
  caveats: string[];
  steps: Step[];
  calls: QlooCall[];
}

interface RoomLike { id: string; name: string; city: string; neighborhood: string | null; genre: string | null }

export async function ask(question: string): Promise<DeskAnswer> {
  const steps: Step[] = [];
  const calls: QlooCall[] = [];
  const caveats: string[] = [];
  const recommendations: { name: string; why: string }[] = [];

  const q = question.trim();
  const run = async (tool: string, args: Record<string, unknown>, label: string): Promise<ToolResult> => {
    const t = TOOL_MAP.get(tool);
    if (!t) {
      steps.push({ tool, args, status: "failed", summary: `Unknown tool ${tool}`, calls: [] });
      return { ok: false, data: null, calls: [], error: `Unknown tool ${tool}` };
    }
    const res = await t.run(args);
    calls.push(...res.calls);
    const status: StepStatus = !res.ok && res.error ? (res.error.includes("no taste signal") ? "empty" : "failed") : res.ok ? "ok" : "empty";
    steps.push({ tool, args, status, summary: label, calls: res.calls });
    return res;
  };

  /* ------------------------------------------------ 1. resolve the room */

  const listRes = await run("list_rooms", {}, "catalog lookup");
  const rooms = (listRes.data as RoomLike[] | null) ?? [];
  const intent = detectIntent(q);
  const roomRef = extractRoom(q, rooms);
  const room = matchRoom(roomRef, rooms);

  /* ------------------------------------------------ 2. resolve the act */

  const actRef = extractAct(q, roomRef, intent);
  let act: { id: string; name: string; match: string } | null = null;
  if (actRef) {
    const find = await run("find_act", { name: actRef }, `resolving “${actRef}”`);
    const resolved = (find.data as { resolved?: { id: string; name: string; match: string; disambiguation?: string } } | null)?.resolved;
    if (resolved?.id) {
      if (resolved.match === "weak") {
        caveats.push(
          `Qloo's closest match for “${actRef}” was ${resolved.name}${resolved.disambiguation ? ` (${resolved.disambiguation})` : ""}. I measured that, but confirm it's the act you meant.`,
        );
      }
      act = { id: resolved.id, name: resolved.name, match: resolved.match };
    } else {
      caveats.push(`Qloo's graph has no artist matching “${actRef}”, so I could not measure that act.`);
    }
  }

  /* ------------------------------- sponsor path: needs an act, not a room */

  if (intent === "sponsor") {
    if (!act) {
      return {
        question: q,
        headline: actRef
          ? `Qloo has no artist matching “${actRef}”.`
          : "Tell me which act you want the sponsorship read for.",
        detail: [
          "Brand affinity is measured from an act's audience, because that is where Qloo's brand data is sharp. Give me an artist name and I'll read their sponsorable categories.",
        ],
        recommendations: [],
        caveats: ["A room is not required for this — a venue-level brand list would be unreliable."],
        steps,
        calls,
      };
    }

    const sp = await run("sponsor_fit", { actId: act.id }, `${act.name} → sponsorable brands`);
    const spData = sp.data as { brands: { name: string; affinity: number }[]; confidence: string } | null;
    if (!spData?.brands.length) {
      return {
        question: q,
        headline: `No brand overlap found for ${act.name}.`,
        detail: ["Qloo returned no brands whose audiences overlap this act. That is a real absence, not a gap in the tool."],
        recommendations: [],
        caveats: [],
        steps,
        calls,
      };
    }

    const spread = spData.brands[0]!.affinity - spData.brands[spData.brands.length - 1]!.affinity;
    if (spData.confidence !== "high") {
      caveats.push(
        `Qloo's brand list for ${act.name} is too diffuse to be a shortlist (affinity spread ${spread.toFixed(2)} across ${spData.brands.length} brands), so I won't present it as one.`,
      );
    }

    return {
      question: q,
      headline:
        spData.confidence === "high"
          ? `${act.name}'s audience is sponsorable territory: ${spData.brands.slice(0, 4).map((b) => b.name).join(", ")}.`
          : `Qloo returns brands for ${act.name}, but too spread out to be a shortlist.`,
      detail: [
        spData.confidence === "high"
          ? `Strongest overlaps: ${spData.brands.slice(0, 8).map((b) => `${b.name} (${b.affinity.toFixed(3)})`).join(", ")}. These are categories whose audiences already sit close to ${act.name}'s — the natural sponsorship pitch for this booking.`
          : `Raw result: ${spData.brands.slice(0, 8).map((b) => b.name).join(", ")}.`,
        "This is audience overlap between an act and a brand. It is not a value estimate, and it says nothing about deal terms.",
      ],
      recommendations: spData.confidence === "high"
        ? spData.brands.slice(0, 8).map((b) => ({ name: b.name, why: `affinity ${b.affinity.toFixed(3)} to ${act!.name}'s audience` }))
        : [],
      caveats: [
        "Audience alignment from aggregate cultural affinity. Not a sales forecast, and no statement about any individual.",
      ],
      steps,
      calls,
    };
  }

  if (!room) {
    const unknownVenue = findUncataloguedVenue(q, roomRef);
    return {
      question: q,
      headline: unknownVenue
        ? `Roomtone can't read ${unknownVenue} — it isn't in our catalog.`
        : "Tell me which room you're booking into.",
      detail: unknownVenue
        ? [
            `Roomtone measures ${rooms.length} rooms, and every one of them is pinned to a Qloo entity that was verified against its own location. I won't read a room I haven't verified — a wrong venue would quietly corrupt every number downstream.`,
            `Name one of the ${rooms.length} catalogued rooms, or open the catalog to see them.`,
          ]
        : [
            `I can read any room in Roomtone's catalog of ${rooms.length} verified venues. Ask like: “Should I book Bad Bunny at Webster Hall?”`,
          ],
      recommendations: rooms.slice(0, 6).map((r) => ({ name: r.name, why: [r.neighborhood, r.city].filter(Boolean).join(", ") })),
      caveats: [],
      steps,
      calls,
    };
  }

  /* ------------------------------------------------ 3. read the room */

  const readRoom = await run("read_room", { roomId: room.id }, `reading ${room.name}`);
  if (!readRoom.ok) {
    return {
      question: q,
      headline: `Roomtone can't measure ${room.name}.`,
      detail: [String((readRoom.data as { unmeasured?: boolean })?.unmeasured ? "" : readRoom.error)],
      recommendations: [],
      caveats: ["This room has no taste coverage in Qloo. Reporting a profile anyway would be guessing."],
      steps,
      calls,
    };
  }

  const profile = readRoom.data as {
    acts: { entity_id: string; name: string; rank: number; affinity: number }[];
    totalActs: number;
    tasteTags: { name: string; type: string; weight: number }[];
    scenePeers: { name: string; shared: number; sharedActs: { name: string }[] }[];
  };

  const detail: string[] = [];
  const roomTop = profile.acts.slice(0, 5).map((a) => a.name);

  detail.push(
    `${room.name} — ${room.neighborhood ? `${room.neighborhood}, ` : ""}${room.city}. The acts closest to its local crowd are ${roomTop.join(", ")}.`,
  );

  const audienceTags = profile.tasteTags.filter((t) => t.type.includes("audience")).slice(0, 6);
  const genreTags = profile.tasteTags.filter((t) => t.type.includes("genre")).slice(0, 6);
  if (audienceTags.length || genreTags.length) {
    detail.push(
      `Across that local crowd the dominant taste is ${[...genreTags, ...audienceTags].slice(0, 8).map((t) => t.name).join(", ")}.`,
    );
  }

  if (profile.scenePeers.length) {
    const p = profile.scenePeers[0]!;
    detail.push(
      `Its nearest neighbour by audience is ${p.name}, which shares ${p.shared} of the same acts${p.sharedActs[0] ? ` — including ${p.sharedActs.slice(0, 3).map((a) => a.name).join(", ")}` : ""}.`,
    );
  }

  /* ------------------------------------------------ 4. no act: room read only */

  if (!act) {
    recommendations.push(...profile.acts.slice(0, 6).map((a) => ({ name: a.name, why: `#${a.rank} of the ${profile.totalActs} acts closest to this room` })));

    return {
      question: q,
      headline: `${room.name}'s audience, read from Qloo's graph.`,
      detail,
      recommendations,
      caveats: [
        "This is audience alignment from aggregate cultural affinity. It is not a ticket-sales forecast, and it describes no individual person.",
      ],
      steps,
      calls,
    };
  }

  const fit = await run("measure_fit", { roomId: room.id, actId: act.id }, `measuring ${act.name} against ${room.name}`);
  const fitData = fit.data as {
    percentile: number | null;
    band: string;
    rankInRoom: number | null;
    rawAffinity: number | null;
    verdict: string;
  } | null;

  let headline: string;
  if (fit.ok && fitData) {
    const pct = fitData.percentile === null ? null : Math.round(fitData.percentile * 100);
    headline =
      fitData.band === "core"
        ? `${act.name} is core to ${room.name} — #${fitData.rankInRoom} of the acts closest to its crowd.`
        : fitData.band === "edge"
          ? `${act.name} is an edge fit at ${room.name} (#${fitData.rankInRoom} of ${profile.totalActs}).`
          : pct === 0
            ? `${act.name} sits outside ${room.name}'s audience — below all ${profile.totalActs} acts that most belong there.`
            : `${act.name} falls at the ${pct}th percentile inside ${room.name}'s audience.`;
    detail.push(fitData.verdict);
  } else {
    headline = `Couldn't measure ${act.name} against ${room.name}.`;
    caveats.push(String(fit.error ?? "Qloo did not return a usable result."));
  }

  // If this is a mismatch, do the useful thing and name who does fit.
  if (fitData && fitData.band === "outside") {
    recommendations.push(
      ...profile.acts.slice(0, 5).map((a) => ({ name: a.name, why: `#${a.rank} of the acts closest to ${room.name}'s crowd` })),
    );
    detail.push(
      `${act.name} and ${room.name} sit in different taste space. That is a statement about audience, not about sales — draw is a separate question, and ranking by popularity answers it (see the benchmark). Acts whose audiences do sit in this room include ${profile.acts.slice(0, 5).map((a) => a.name).join(", ")}.`,
    );
  }

  caveats.push(
    "Audience alignment from aggregate cultural affinity. Not a sales forecast, and no statement about any individual.",
  );

  return { question: q, headline, detail, recommendations, caveats, steps, calls };
}

/* ------------------------------------------------------------------ */
/* Question parsing — intentionally small and inspectable               */
/* ------------------------------------------------------------------ */

const STOPWORDS = new Set([
  "should", "would", "could", "i", "we", "the", "a", "an", "is", "are", "do", "does", "did",
  "book", "booking", "put", "on", "at", "in", "into", "for", "to", "and", "or", "if", "me",
  "my", "our", "us", "room", "venue", "hall", "theater", "theatre", "club", "show", "concert",
  "fit", "make", "makes", "think", "say", "any", "them", "it", "this", "that", "what", "who",
  "whom", "whose", "draw", "draws", "draws?", "bring", "get", "gets", "there", "here", "about",
  "sponsor", "sponsors", "sponsorship", "brand", "brands", "partner", "partners", "sell",
  "sellable", "sellable?", "does", "work", "works", "good", "bad", "right", "wrong", "think",
  "want", "wants", "looking", "look", "consider", "maybe", "perhaps", "still", "also", "just",
  "can", "will", "would?", "who's", "how", "why", "when", "where", "which", "know", "tell",
]);

/** Verbs that signal the user is actually asking whether an act belongs in a room. */
const BOOKING_INTENT = /\b(book|booking|fit|fits|put|belt|line|headline|support|opener|programme|program)\b/i;
const SPONSOR_INTENT = /\b(sponsor|sponsors|sponsorship|brand|brands|partner|partners)\b/i;

type Intent = "sponsor" | "booking" | "room-read";

function detectIntent(q: string): Intent {
  if (SPONSOR_INTENT.test(q)) return "sponsor";
  if (BOOKING_INTENT.test(q)) return "booking";
  return "room-read";
}

/**
 * Detect a venue the user named that isn't in the catalog.
 *
 * "Should I book X at the Moonstruck Barn?" is a question about a specific room
 * we cannot measure, which is a different situation from a question with no
 * room at all. Telling someone to "tell me which room" when they already did is
 * a small failure that makes the agent look like it wasn't listening.
 */
function findUncataloguedVenue(q: string, roomRef: string | null): string | null {
  if (roomRef) return null;
  const afterAt = q.match(/\b(?:at|into|in|to)\s+((?:the\s+)?[\p{Lu}][\p{L}\p{N}'’.-]*(?:\s+[\p{L}\p{N}'’.-]+){0,3})/u);
  if (!afterAt) return null;
  const phrase = afterAt[1]!.trim().replace(/\s+(show|concert|room|venue)$/i, "");
  if (phrase.length < 4) return null;
  // A single generic capitalised word at the start of a sentence isn't a venue.
  if (!/\s/.test(phrase) && !/^the\s/i.test(phrase)) return null;
  return phrase;
}

/** Best-effort room mention: the longest catalog name that appears in the text. */
function extractRoom(q: string, rooms: RoomLike[]): string | null {
  const lower = q.toLowerCase();
  let best: { name: string; len: number } | null = null;
  for (const r of rooms) {
    const variants = [r.name.toLowerCase(), r.name.toLowerCase().replace(/^the /, "")];
    for (const v of variants) {
      if (v.length >= 4 && lower.includes(v) && (!best || v.length > best.len)) {
        best = { name: r.name, len: v.length };
      }
    }
  }
  return best?.name ?? null;
}

/**
 * Pull an act name out of the question.
 *
 * We prefer runs of capitalised words from the original text, because English
 * questions capitalise proper nouns and not verbs. The earlier version filtered
 * a stopword list and guessed — which turned "Who draws The Stone?" into an act
 * called "drawstring". When the question is typed all-lowercase there is no
 * capitalisation signal, so in that case we only accept an explicit booking verb
 * before guessing.
 */
function extractAct(q: string, roomRef: string | null, intent: Intent): string | null {
  let cleaned = q;
  if (roomRef) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(esc(roomRef), "gi"), " ");
    cleaned = cleaned.replace(new RegExp(esc(roomRef.replace(/^the /i, "")), "gi"), " ");
  }

  // Capitalised runs, ignoring a capitalised first word (sentence start).
  const proper = cleaned.match(/\b[A-Z][\p{L}\p{N}'’.-]*(?:\s+[A-Z][\p{L}\p{N}'’.-]*)*/gu) ?? [];
  const candidates = proper
    .filter((run) => !/^(what|who|which|when|where|why|how|should|would|could|is|are|do|does|book|fit|tell|can)$/i.test(run))
    .map((run) => run.trim())
    .filter((run) => run.length > 2);

  if (candidates.length) {
    // Prefer the longest proper-noun run: "Bill Frisell" over a stray capital.
    candidates.sort((a, b) => b.length - a.length);
    return candidates[0]!;
  }

  // No capitalisation available. Only guess when the question is unambiguous
  // about wanting a fit measurement, and only from short trailing words.
  if (intent !== "booking") return null;
  const words = cleaned
    .replace(/[^\p{L}\p{N}\s'.-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w.toLowerCase()))
    .filter((w) => w.length > 1);
  if (!words.length || words.length > 3) return null;
  return words.join(" ");
}

function matchRoom(ref: string | null, rooms: RoomLike[]): RoomLike | null {
  if (!ref) return null;
  return rooms.find((r) => r.name.toLowerCase() === ref.toLowerCase()) ?? null;
}