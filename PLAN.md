# Qloo Agentic Hackathon — Decision Memo & Product Spec

**Status:** pre-coding. Prepared 2026-10-02. Submission deadline 2026-10-30 23:45 ET (28 days).

---

## 0. IMMEDIATE ACTIONS (do before anything else)

| # | Action | Why urgent |
|---|---|---|
| 1 | Submit Qloo hackathon API-key form: https://forms.gle/zz12orkLHTAneLGz6 | Keys take "a few business days." This gates ALL build work. Do it today. |
| 2 | Register on Devpost (https://qloo.devpost.com/register) | Draft submissions allowed; registration required |
| 3 | Join Qloo Discord https://discord.gg/rF9PKsD5Q7 (`#api-help`) | Fastest path to venue-coverage answers |
| 4 | Install harness: `npm i -g @qloo/qloo-harness && qloo setup --qloo` | Sanctioned integration surface |
| 5 | **KILL-CRITERION TEST (see §8): verify `urn:entity:place` coverage for music venues** | If venues are absent, pivot to locality-level rooms (§8 fallback) |

---

## 1. THE COMPETITION (Phase 1)

**Qloo Agentic Hackathon** — challenge id 31054. No tracks. Single prize table.

- **Submission:** Sep 30 – Oct 30 2026, 11:45pm ET. **Judging:** Nov 2–16. **Winners:** ~Nov 23.
- **Participants:** 202 (Oct 2). 2025 edition had 2,893 participants / 344 submissions → expect **500–1500 submissions**.
- **Prizes:** $15,000 / $6,000 / $4,000. One prize per project.
- **Requirements:** live external demo URL (web app / hosted build), public repo with OSS license visible in About, text description. **No video** — judges are given a working app.
- **Stage 1:** pass/fail viability — "reasonably fits the theme and reasonably applies the required APIs."
- **Stage 2 — equally weighted:**
  1. **Technological Implementation** — how thoroughly and *skillfully* Qloo is used; genuine, working, non-trivial code.
  2. **Design** — complete coherent product experience, not a technical PoC.
  3. **Potential Impact** — credible, specific case for a real problem for a real audience, actually addressed by what is demonstrated.
  4. **Quality of the Idea** — creative, non-obvious use of Qloo; genuine understanding of the problem space.

**Judges and what each one actually rewards**

| Judge | Verified read | How we win them |
|---|---|---|
| Mike Diolosa, CTO Qloo | Will audit API correctness, parameter validity, SAFE_USE compliance | Deep, correct, multi-endpoint usage; visible provenance; refuse overclaiming |
| Todd Boehly, Eldridge | "Do they know the answer or are they just making stuff up?" Values saying "I don't know" and "no" | Explicitly state what affinity does *not* prove; ship a falsifiable test |
| Jason Calacanis | #1 investor in Entertainment & Sports seed→B; top-5 Food & Beverage, Retail | A real company with a real buyer and a wedge he could fund |
| Nicole Seligman, OpenAI board | Director-level; board risk lens | Credible unit economics, honest scope, responsible AI posture |
| Michael Abrams, EVP Strategic Initiatives, Live Nation | The buyer. No public statements — treat as unverified but strategically central | The product should be something his org would actually deploy |
| Cedric the Entertainer | Broadway + live touring + two consumer brands; "live is where my audience shows up" | Emotional, human framing about rooms and who fills them |

**Required tech:** Qloo API (`https://hackathon.api.qloo.com`, `X-Api-Key` header). Agentic tool, agent framework, or Qloo wired into an existing agent.

**Official tooling:** `@qloo/qloo-harness` → `qloo explore` (chat agent), `qloo exec`/`qloo api` (CLI), `qloo mcp` (local stdio MCP server; **no hosted endpoint**). No official SDKs exist.

---

## 2. COMPETITIVE INTELLIGENCE (Phase 2)

**2025 Qloo LLM Hackathon (2,893 participants, 344 submissions) winners:**
- 🥇 **GeoTaste** — agentic market/business research from a location. React + Flask + Mapbox + Plotly.
- 🥉 **Alloy** — *Cultural Due Diligence Engine*: M&A "Cultural Compatibility Score" between two companies' fan bases.
- 🥉 **Resonance AI** — culturally authentic political campaign messaging (Google ADK).
- 🥉 **Zesty** — the *Unrecommendation* Engine: recommend the farthest point from your taste.

**The lesson:** winners escaped the recommender box into **high-budget decision categories with a named executive buyer**. None were consumer chatbots.

**2026 field (repos created Sep 30–Oct 2, visible in the rush):** PalateCare (nutrition), palatable / tastebridge-ai / afterhours-qloo (group & outing planning), tastebridge (relocation), tasteloop (week planner), dealdesk (creator sponsorship inbox), qloo-mcp / qloo-taste-mcp (MCP + "Taste Match" for artists), event-mosaic, event-scanner, resonance-qloo.
→ **Recommendation, group planning, and relocation are crowded. Avoid.**

**What 2026 hackathon winners (verified, ~15 events) share:**
1. Problem in one sentence, from lived experience, before any tech.
2. **Deliberate anti-consensus wedge** (ProxyCall took the *inverse* of the crowded cold-caller market).
3. **Deterministic core + AI layer, with the boundary stated out loud.**
4. **A falsifiable number** (Sim Francisco: 81.3% predicted vs 83.8% actual).
5. **Verifiability as the wow moment** (Tekton's "evidence chain").
6. Live, judge-drivable URL; ~90 seconds to first working output.
7. **Scope down to one thing that works end to end.** "If the demo runs long, it's a scope problem."
8. Honest disclosure of what doesn't work "reads as confidence."
9. Boring verticals, unglamorous pain (permitting letters, home repair, MCP governance).
10. Domain expertise beats coding ability.

**What loses:** AI slop with polished front-ends and no proof of function; unverifiable claims; overloaded demos; anything that "would work the same without the sponsor."

---

## 3. THE DECISION (Phases 3–7)

There are **no tracks**. Track selection reduces to choosing the *problem domain*. Evaluated:

| Domain | Density | Whitespace | Judge fit | Verdict |
|---|---|---|---|---|
| Consumer taste recommender | **High** | Low | Medium | Reject — commoditized; 2025's winner explicitly avoided it |
| Group/family taste consensus | **High** | Low | Medium | Reject — 3+ entrants in first 3 days |
| Relocation / city fit | Medium | Low | Medium | Reject — tastebridge already built |
| Filter-bubble escape (anti-recommender) | Medium | Medium | Medium | Reject — Zesty already took it |
| Sponsorship/brand fit scoring | Medium | **High** | Medium | Backup — B2B, no emotional demo |
| **Live-music room & booking intelligence** | **Low–Medium** | **High** | **High** | **PRIMARY** |
| Film/series audience targeting | Low | Medium | Medium | Reject — long sales cycle, slow demo |

**Primary: live-music booking intelligence. Backup: sponsorship fit measurement** (same engine, second buyer).

**Why not the others:**
- Every consumer/recommender idea either has a 2026 entrant already or is a chatbot wrapper (fails Stage 1's "reasonably applies the required API" and criterion 4).
- Sponsorship scoring is the same computation with a worse demo; ship it as expansion, not MVP.
- B2B market-research was GeoTaste's 2025 win; repeating it is a copy, not a wedge.

---

## 4. THE THESIS (Phase 8)

### Product
**Roomtone** — *Every room has an audience. Now it has a number.*

A cultural-alignment agent for the people who decide who plays in a room and who sponsors it. It reads any venue or neighborhood as a **taste object** — who is actually there, what they do, what they're listening to — then tells a promoter or programming director whether a given act belongs in that room, who else does, and which brands actually reach that crowd.

- **Target user:** the promoter / venue programming director / festival booker / artist manager. A real, named, budget-owning job.
- **Job to be done:** *"Before I commit a guarantee, tell me whether these people are actually in my room."*
- **Current alternative:** gut feel + Pollstar box office + agent relationships. Live Nation has stated publicly that no decision-grade third-party data exists.
- **Unique value:** the first time a room's *audience* — not its capacity, not its ticket price — is a measurable, comparable object.
- **Wedge:** **artist × street-level locality affinity.** Qloo's heatmap + cross-domain affinity computes, for any artist and any city, which neighborhoods and which venues their audience actually occupies. Nobody uses this for booking.
- **Key insight:** promoters do not fail on *taste*. They fail when *their* taste substitutes for *the room's* taste. That is a measurable gap — and it is the one variable every incumbent proxy (streams, box office, follower counts) structurally cannot see.

### Why now
- Live Nation is a Qloo customer (announced Sep 15, 2026).
- The April 15, 2026 antitrust verdict found Ticketmaster monopolizing ticketing; NIVA is pressing for a promotion-cap remedy that would create **hundreds of new independent promoters with no data infrastructure**.
- Live Nation itself is now shipping consumer agents (Melody, Venue Agent via Agentforce, Sept 2026) — the fan side is being automated while the *money* side stays unmeasured.

### Innovation — stated precisely
Not "it uses AI." What becomes newly possible:
1. **A venue becomes a taste object.** Today a room is capacity + address + price tier. Qloo lets a room have a measurable audience: its tags, its age/gender/audience composition, its neighboring cultural density — at street granularity.
2. **A promoter's taste bias becomes a measurable number.** Given act X and room Y, the agent reports the alignment between X's audience and Y's actual crowd. Before, this was only knowable *after* the show, from a bad attendance report.
3. **The bill becomes derivable.** Given a room's audience, the set of acts who draw that audience is computable. Booking stops being relationship-first and taste-first.
4. **Independent sponsorship measurement** — the expansion. Because we are not selling sponsorship, we are the only party that can credibly say whether a sponsorship reached the room.

### Technology
- Qloo: `/v2/insights` (artist / place / brand / tag / destination), `/v2/search`, `/v2/entities` (external ID resolution incl. Spotify/IMDb), `/v2/tags`, `/v2/audiences`, `/v2/trending` (velocity), `/v2/analysis/compare`, `urn:entity:heatmap` with `heatmap.dimensions`.
- Signals: `signal.interests.entities`, `signal.interests.tags` (weighted), `signal.demographics.age/gender/audiences`, `signal.location`. Filters: `filter.location.query`, `filter.location.radius`, `filter.popularity`, `filter.tags`, `feature.explainability=true`.
- Agent: typed tool-calling loop. **Deterministic core** (affinity math, scoring, provenance) + **LLM layer** (intent, entity/tag/audience resolution with disambiguation, narrative). Boundary stated in-product.
- Qloo access: one typed client with caching, bounded retry, and a **provenance ledger** that records every call (endpoint, params, IDs, timestamps, result counts) and renders in the UI.
- MCP: wire `@qloo/qloo-harness`'s `qloo mcp` as the agent's tool surface; direct REST as the reliable production path.

---

## 5. DESIGN FOR PROOF (Phase 9)

The product must make its claims falsifiable on screen.

| Claim | How it is proven in-product |
|---|---|
| "This room has a measurable audience" | Room profile rendered with actual tag IDs, audience URNs, and affinity ranks — click-through to provenance |
| "This act doesn't fit this room" | **Tone Score** = `/v2/analysis/compare` between act audience and room crowd; stated with its own limits |
| "The model is sensitive to the room, not just the city" | **Two Rooms Test** — two venues 3–8 miles apart in the same city produce visibly different profiles and bills. One click. Judges verify against their own knowledge. |
| "Where this act actually draws in this city" | Artist heatmap over the city, geohash cells, highlighted vs the venue's location |
| "Qloo is really doing the work" | Evidence panel: every request, every resolved entity/tag/audience ID, every latency, raw affinity values |
| "We are not predicting box office" | Stated explicitly in-product. We report **audience alignment**, not ticket sales. |

**Live vs deterministic:** all ranking and scoring is deterministic and cached. Only prose is generated. Cached responses mean the demo cannot be broken by rate limits or latency spikes.

---

## 6. MINIMUM WINNING PRODUCT (Phase 10)

### Must ship
1. **Room read** — enter a venue (or locality); get its audience profile: taste tags, audience segments, age/gender skew, neighborhood density. Live Qloo.
2. **Act read** — enter an act; get its audience profile and its city-level locality heatmap.
3. **Tone Score** — alignment between the two, with the shared/divergent taste space spelled out.
4. **The Bill** — acts ranked for *this room* (excluding the act itself and recent plays), each with its fit to the room.
5. **Evidence panel** — full Qloo provenance for every number on screen.
6. **Two Rooms Test** — one-click side-by-side of two nearby rooms.
7. **The Brief** — an exportable one-page artifact (shareable URL) of the room read + Tone Score + proposed bill.
8. Public repo, Apache-2.0, deployed demo, README with setup.

### Should ship
9. Trending velocity for the act (is demand in this city rising or falling?).
10. Sponsor overlap panel (stretch-adjacent, high narrative value for Abrams).
11. Saved rooms / watchlist.
12. Honest "what this does not establish" surface.

### Stretch
13. Booking pipeline tracker.
14. MCP server exposure of Roomtone's own tools.
15. Festival multi-room programming view.

### Explicit non-goals
- Ticket sales, payments, or any transaction.
- Social feed, chat between users, or messaging.
- Artist marketing copy generation.
- User accounts/auth as a gate (single shared workspace; identity kept out of Qloo by design).
- Mobile app.
- Anything about safety/eligibility decisions (prohibited by Qloo SAFE_USE).

---

## 7. WINNING DEMO (Phase 11)

**Boringly reliable path to the wow:** one click on a curated room-pair preset that pre-loads a cached, pre-computed comparison. Judges who click once and do nothing else still see the entire thesis.

**The 3-minute arc:**
1. **Hook (0:00).** "Every room has an audience. Right now nobody can tell you what it is — except after it's too late."
2. **Problem (0:15).** A promoter's documented mistake: booking an artist they loved into a market that didn't share the taste. Named failure, real money.
3. **First interaction (0:30).** Type a venue name → **Room read** returns in seconds. Tags, audiences, neighborhood profile.
4. **Moment of surprise (1:00) — "Two rooms, three miles apart."** Same city, same act. Room A: high tone score. Room B: low. The bills are completely different. Judges verify against what they already know about those rooms.
5. **Technical proof (1:45).** Open the Evidence panel. Every entity ID, tag URN, audience URN, affinity value, latency. Then: the artist heatmap over the city, showing the venue sitting outside the act's actual core.
6. **Real-world proof (2:15).** The Brief — the artifact a promoter would actually send.
7. **Differentiation (2:30).** Pollstar reports box office after the fact. Streaming counts describe one platform. This measures the room's audience, before the commitment, independently.
8. **Payoff (2:45).** "Who actually reaches this crowd?" — sponsor overlap. Then the honest closer: *"We are not predicting box office. We're telling you who is in the room — and refusing to claim more than that."*

---

## 8. RISKS AND THE KILL CRITERION (Phases 12, 14)

**Kill criterion (test in the first 48 hours, before building):** does `urn:entity:place` return credible music venues via `/search`? If venue coverage is restaurant/hotel-only, then:
- **Fallback A:** make the *locality* the room (neighborhood-level rooms via `filter.location.query` + heatmaps). Robust — heatmaps need no venue entity.
- **Fallback B:** make the room an explicit *user-defined* taste profile (a curator selects 3–5 reference acts for the room) — which is also how real promoters actually think. This removes the dependency entirely and is arguably a more honest model.
Both fallbacks preserve the full thesis. They must not be discovered late.

**Other risks:**
| Risk | Mitigation |
|---|---|
| Venue data sparse or stale | Fallbacks above; neighborhood-level operation |
| Affinity ≠ ticket sales | Never claim prediction. Reframe as *audience alignment*. Falsifiable test is room discrimination, not sales. |
| "B2B dashboard" reading | Conversational front-end, named human protagonist, one decision per screen, exported artifact |
| LLM flakiness in demo | Cache all Qloo responses; deterministic ranking; generated prose only; pre-seeded preset |
| Rate limits | Aggressive caching, bounded retry, pre-warmed cache for the demo preset |
| SAFE_USE violation | Zero PII to Qloo. Only public entities, localities, and free-text taste concepts. No individual-level inference. Publish a data-handling note. |
| 28-day scope | Cut Should-ship items first; never cut the Evidence panel or the Two Rooms Test |

---

## 9. VALIDATION (Phases 9, 12)

- **Discrimination test:** rooms with obviously different cultural character must produce visibly different profiles. Judge-verifiable.
- **Convergence check:** the act's neighborhood heatmap core should land on the venue's location for a plausibly well-matched show, and miss for a mismatched one. Qualitative, and stated as such.
- **Backtest (optional, public data only):** a small set of documented real shows with known outcomes. Published methodology, honest limitations. Only if it can be done with defensible public data — otherwise skip rather than overclaim.
- **Design metrics:** time-to-first-insight < 20s; one-click completion of the Two Rooms Test; evidence panel opened by ≥half of demo viewers.

---

## 10. BUILD ORDER (Phase 13)

1. **Foundation (day 1–2):** key in hand; spike every endpoint against real data; validate or kill the venue hypothesis; repo scaffold.
2. **Qloo core (day 2–4):** typed client, cache, provenance ledger, entity/tag/audience resolvers, scoring functions. Tests against captured fixtures.
3. **Product logic (day 4–6):** room read, act read, Tone Score, Bill, Two Rooms Test — as pure functions over cached Qloo data.
4. **Agent (day 6–8):** tool-calling loop, disambiguation flow, grounded narrative; MCP wiring.
5. **UX (day 8–12):** the flow above. Story-led, not dashboard. Evidence panel is a first-class surface.
6. **The Brief (day 12–13):** shareable, exportable artifact.
7. **Proof (day 13–15):** discrimination test page, determinism, failure states, empty states.
8. **Hardening (day 15–19):** rate limits, caching, cold start, mobile, a11y, error paths.
9. **Deploy (day 19–21):** container, demo preset warm-up, uptime check.
10. **Demo (day 21–26):** script, rehearsal, timing to 3 minutes, offline fallback recording of cached state.
11. **Submission (day 26–28):** README, description, license, screenshots, submission text.

---

## 11. STACK

- **Next.js 15 (App Router) + TypeScript + pnpm + Tailwind**, deployed as a Docker container on Fly.io (needs to spawn a stdio MCP subprocess and hold a warm cache — serverless is the wrong shape).
- **Qloo:** typed REST client (primary, reliable) + official `@qloo/qloo-harness` `qloo mcp` (shown as the agent's tool surface). One interface, two transports.
- **Cache:** Redis (or SQLite on the volume) keyed by normalized request hash.
- **Model:** Claude or GPT-5-class via a thin provider interface; used only for intent, resolution, and prose.
- **License:** Apache-2.0.

---

## 12. WHAT WOULD MAKE US LOSE

1. We cannot get an API key in time → nothing else matters.
2. Venue data is unusable and we discover it on day 12.
3. The demo reads as a B2B dashboard to Cedric and Calacanis.
4. We overclaim prediction and a judge (Boehlly — Boehly) catches it.
5. Scope creep eats the evidence/proof layer.

## 13. WHY WE COULD WIN

1. The incumbent's CEO-equivalent has publicly stated in writing that this data does not exist — and a judge on the panel is that incumbent's EVP of Strategic Initiatives.
2. The core computation (artist × street-level locality affinity) is genuinely Qloo-only and genuinely unused for this purpose.
3. Six-plus Qloo capabilities compose into one coherent loop — hard to fake, easy to verify.
4. The reframe ("a room has an audience") is non-obvious, memorable, and independent of the chat-interface cliché.
5. The proof layer is first-class: falsifiable, judge-drivable, and impossible to run on a slide.