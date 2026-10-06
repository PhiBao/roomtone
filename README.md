# Roomtone

**Every room has an audience. Almost nobody can tell you what it is.**

Roomtone is a cultural read of live-music rooms. It uses
[Qloo's](https://qloo.com) taste graph to turn a venue from a capacity number
into a measurable audience — then tells a promoter whether the act they are
considering belongs in that room, who else does, and which brands actually reach
that crowd.

Built for the **Qloo Agentic Hackathon**. Apache-2.0.

---

## The problem

A promoter commits an artist guarantee on a feeling — usually their own. The
documented failure mode is not bad taste, it is *substituted* taste: booking the
artist you love into a market that does not share it. Audience Republic's founder
booked a 1,200-cap room, sold 400 of the 700 tickets he needed, **lost $20,000**,
and named the reason in writing.

The gap is admitted by the industry itself. In a January 2026 submission to the
UK Parliament Business & Trade Select Committee, Live Nation wrote that the only
third-party reporting available is *"self-reported, selective and incomplete."*
Box office tells you what happened last night. Nothing tells you what tonight's
room is.

## What it does

1. **Reads a room.** For a venue, Qloo returns the 50 acts whose audiences sit
   closest to that venue's own crowd. That list *is* the room's audience,
   expressed as names rather than segments.
2. **Places an act in it.** Where does that act fall inside *that room's* own
   distribution of top acts? The Stone draws a jazz canon — Coltrane Quartet,
   Vijay Iyer, Wayne Shorter, Ahmad Jamal. Bill Frisell sits **#6 of 50**. Bad
   Bunny is **not in the top 50**.
3. **Shows the same act everywhere else.** Yves Tumor is **#1 at Webster Hall**
   and **0th percentile** at Radio City Music Hall, The Stone, Beacon Theatre and
   Music Hall of Williamsburg. An act's quality is fixed; its fit in a room is
   not. That gap is the whole product.
4. **Maps the scene.** Rooms that share an audience are found by intersecting
   their top-act lists. The Stone shares **34 of 50 acts** with Scholes Street
   Studio and **33** with Sear Sound — the actual downtown New York jazz circuit.
5. **Finds the sponsors.** Brands measured from an *act's* audience are sharp:
   Bad Bunny returns Adidas, Puma, Nike and Converse; Bill Frisell returns Fender,
   Gibson and Reverb. Roomtone sells no sponsorship, which is the only position
   from which it can say whether a brand reaches a room at all.
6. **Prints the Brief.** A one-page document with the room, the read, the
   cross-room comparison and the sponsorable categories.

## Quick start

```bash
pnpm install
cp .env.local.example .env.local   # add your QLOO_API_KEY
pnpm warm                          # pre-fetch every room so the demo can't stall
pnpm dev                           # http://localhost:3000
```

The Qloo hackathon credential only works against
`https://hackathon.api.qloo.com`, which is the default in `.env.local.example`.

### Tests

```bash
pnpm typecheck
pnpm test      # exercises the real Qloo client through its cache
```

### Deploy

```bash
fly launch --no-deploy          # or edit fly.toml directly
fly volumes create roomtone_data --size 1
fly secrets set QLOO_API_KEY=hack_...
fly deploy
```

A container rather than a serverless function: Roomtone holds a warm Qloo
response cache on disk and can spawn the MCP subprocess, both of which need a
long-lived process with a real filesystem.

### MCP server

Roomtone's measurement tools are exposed over the Model Context Protocol, so any
MCP client can ask "who draws this room" and get a measured answer with its
provenance attached:

```bash
pnpm mcp     # stdio server
```

```json
{
  "mcpServers": {
    "roomtone": { "command": "node", "args": ["dist/mcp/server.js"] }
  }
}
```

Tools: `list_rooms`, `read_room`, `measure_fit`, `find_act`, `sponsor_fit`.

---

## Architecture

```
src/lib/qloo/      typed Qloo client — retry/backoff, two-tier cache, provenance ledger
src/lib/roomtone/  the engine — room profiles, fit percentiles, scene overlap, catalog
src/lib/agent/     the Booking Desk: tool registry + deterministic planner
src/mcp/           stdio MCP server over the tool surface
src/app/           pages: /, /rooms, /rooms/[id], /read, /two-rooms, /brief, /desk, /method
```

**The evidence layer is not a debug view — it is the product.** Every number
Roomtone renders is produced by a logged Qloo request, and the `Evidence` panel
shows each one verbatim: endpoint, parameters, resolved entity ids, status,
latency, result count and cache state. A taste *claim* becomes a taste
*measurement* only if the request underneath it is inspectable.

### Why the agent is not a language model

The Booking Desk (`/desk`) parses a booking question, resolves the room and act
against Qloo's graph, runs a fixed plan of typed tools, and narrates the result
— including what it could not establish. There is no model behind it.

A booking verdict that changes because a model had a bad afternoon is worse than
no verdict, and this product's entire claim is that the number is measured
rather than generated. The tool surface lives in `src/lib/agent/tools.ts` behind
an interface that a model *could* be dropped into; shipping without one keeps the
demo deterministic and reproducible. The limitation — it will not answer outside
its plan — is stated on the page rather than hidden.

---

## Method, and limits

Full detail at **`/method`**. The short version:

**Measured:** an act's percentile within a room's own distribution of top acts;
a room's audience as a named act list; room-to-room audience overlap; brand
affinity from an act's audience.

**Not measured:** ticket sales, capacity, pricing or guarantee maths; anything
about an individual person; rooms Qloo has no taste signal for; causation.

Raw Qloo affinities are tightly banded — every room's top 50 lands in roughly the
top 0.03 of the 0–1 scale — so a raw `0.94` means little alone. The percentile
does not, because *an act outside the top 50 is below all 50 acts that most
belong there*, which is a bounded, checkable statement.

### Traps found while building this

Each of these silently produced wrong answers before it was caught:

| Trap | What happened | How it's handled now |
|---|---|---|
| **Same-named venues** | There is a dozen venues called "The Stone". `/v2/analysis/compare` silently resolved ours to a **Denver club**. | Every room is pinned by id and verified against its own geocode. Four candidates were dropped rather than shipped mislabelled. |
| **Entity mis-resolution** | Qloo mapped **"Nate Barbrack" → "Nate Dogg"**. An auto-selected top hit produces a confidently wrong booking read. | The picker labels weak matches and never auto-selects; the warm script refuses to cache one. |
| **Rate limits read as data** | A `429` was reported as "not measured" — a transport failure masquerading as a confident result. | Failure and absence are separate states. A failed request throws. |
| **`/v2/analysis/compare` is hollow here** | It returns only "Place", "Tourist Attraction" — true of every venue. | Dropped. Room overlap is measured directly on act lists, and the shared acts are **named on the page**. |
| **`urn:entity:heatmap` unavailable** | Not supported in the hackathon environment. | Removed from scope rather than faked. |
| **Entity returned as its own signal** | Passing an act as both signal and pinned result returns nothing — Qloo excludes self. | The act's own record is fetched with no signal at all. |
| **Silently ignored parameters** | Qloo ignores invalid parameters instead of erroring. | Ids are pinned explicitly and every request is shown in the Evidence panel. |

## Data handling

Qloo affinities describe **aggregate cultural co-occurrence**, not individuals.
Roomtone sends no names, email addresses, device ids, account ids or location
histories to Qloo — only public entity names and venue localities, which are
themselves public cultural facts. Nothing Roomtone produces is used for any
decision about a person.

Per Qloo's safe-use guidance, results are presented with their source and limits,
affinities are never described as causal claims about individuals, and the
product refuses to output a profile when the underlying signal is missing.

## Acknowledgements

Cultural data by [Qloo](https://qloo.com). Vibe, taste and verification by the
judges.