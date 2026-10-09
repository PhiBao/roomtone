# Roomtone — submission writeup

**Live demo:** https://roomtone.fly.dev · **Repo:** https://github.com/PhiBao/roomtone · Apache-2.0

---

## What it is

Roomtone reads a live-music venue as a taste object using Qloo's cultural graph. For any
room it returns the audience that is actually there — expressed as the acts whose audiences
sit closest to that venue's own crowd — and everything that follows from it: whether a given
act belongs to that crowd, which set of acts covers it, which rooms share it, and which
brands already reach it.

## What makes it Qloo-powered

Not a wrapper. Five distinct Qloo capabilities compose into one coherent read, and every
number on screen is traceable to the request that produced it:

| Capability | Used for |
|---|---|
| `/v2/insights` · `urn:entity:artist` | room → acts, act → acts, act → room |
| `/v2/insights` · `urn:entity:place` | room → culturally adjacent rooms |
| `/v2/insights` · `urn:entity:brand` | composable brand reach, anchored on an act |
| `/search` + geocode verification | entity resolution without silent mis-matching |
| `filter.results.entities` | single-act affinity against a room |

There is no path from any surface to a measurement whose request was not logged, and the
`Evidence` panel renders each call verbatim: endpoint, parameters, resolved entity ids,
status, latency, result count, cache state. A taste *claim* becomes a taste *measurement*
only if the request underneath it is inspectable.

## What we found — and why it changed the product

We tested the product's central assumption against documentary evidence rather than against
itself.

**Ground truth:** 943 documented shows from 57 Wikipedia tour-date tables, resolved to 34
Qloo entities and verified against each entity's own geocode. 29 venues carried enough
history to test — 149 measurable plays, plus 620 shows re-scraped with their opening acts.

**The result:** zero of the 149 documented touring acts appear in the audience Qloo assigns
to the room they played. Ranking by popularity scores **0.995 AUC** on the same question;
the taste read scores **0.000**. We then tested the obvious escape hatch — that the read
might predict the *support* bill rather than the headline — and it failed the same way: 0 of
26 documented support slots, from Sabrina Carpenter with Taylor Swift to Griff with Dua Lipa.

**The mechanism.** The read describes a room's **local audience**, not the touring draw that
fills it. AFAS Live in Amsterdam is documented to host Harry Styles and Halsey; Qloo's read of
that room is Dutch-language pop — Nielson, Gers Pardoel, Bløf. Oslo Spektrum hosts Dua Lipa;
its read is Norwegian-language acts. Touring is draw-driven at every level, and draw is a
different variable from fit.

**So we corrected the product claim to match the evidence**, then tested the corrected claim —
and that one holds:

- Median audience overlap across **231 room pairs is 0.000.** The read is specific; a generic
  one would trend toward 1.
- The strongest overlaps land exactly where a booker would put them: **Bowery Ballroom ~
  Saint Vitus Bar at 0.47** (both New York indie rooms), **KOKO ~ Village Underground at 0.22**
  (both London grime), **Barclays ~ Radio City at 0.22** (both New York rap arenas).
- Two rooms in the same city share **3.7%** of their audience; two rooms in different cities
  share **0.2%**. A **19× difference**, and the strongest true cross-city overlap anywhere is
  0.04.

That last number is the product. **Genre alone does not carry across cities** — so a booking
decision researched in one market does not transfer to another, and a tool showing you a genre
match is not showing you an audience.

## The business

**The problem worth money.** A promoter commits a guarantee — venue hire, artist fee,
production — before a single ticket sells. Live Nation told the UK Parliament in January 2026
that the only third-party reporting available is *"self-reported, selective and incomplete."*
The decision rests on two variables: **draw** (will people come) and **fit** (are they *this
room's* people). Only the first has data.

**What Roomtone sells is the second one**, per market, and what follows from it — which acts
belong to a crowd, which bill covers it, which brands already reach it.

**Why the pricing is naturally per-market.** The 19× gap is the argument. If audience transfer
between markets were inferable from a national popularity number, one chart would be enough. It
isn't. Every market has to be read separately, which means the unit of value is the market, and
that is the unit of price.

**Who pays.**

- **Independent promoters.** The April 2026 antitrust verdict found Ticketmaster unlawfully
  monopolising ticketing, and NIVA is pressing for a remedy capping Live Nation's promotion
  share. If it lands, hundreds of promoters get routes into rooms they never had — with no
  demand data behind them. That is the market-opening event.
- **Venue programming directors** choosing a season for their own crowd.
- **Sponsorship desks.** Live Nation Media & Sponsorship booked 95% of its 2026 commitments
  before the year began, against $1.3B of revenue, with no independent measure of whether those
  brands reached the audience they were sold. Roomtone sells no sponsorship — the only position
  from which that can be measured. Pier 36's crowd returns Flight Club, Mitchell & Ness and
  Billionaire Boys Club; KOKO's returns Trapstar, Footasylum and JD.

**Model.** Free to read any room — the read is specific, surprising and shareable, so it carries
its own distribution. Paid per market: saved rooms, watchlists, the Brief, the bill builder,
sponsorship reach. An agency tier for teams running several markets.

**Why it can last.** Not the data — Qloo licenses it to anyone. The accumulating assets are the
geography-verified venue→audience mappings (34 resolved, 31 candidates dropped rather than
shipped wrong), the measurement discipline that makes every number auditable, and a benchmark
methodology a competitor would have to reproduce to make the same claims.

**Where it goes.** The most defensible shape is not a dashboard — it is infrastructure.
Ticketmaster shipped an MCP integration into Gemini in August 2026. Every booking agent that
gets wired up needs the same missing primitive: *who is this room's audience.* Roomtone already
exposes its measurements over MCP. The wedge is a promoter's shortlist; the platform is the
taste layer other booking systems call.

**What we are not.** We do not predict draw, and we say so on every page. Popularity predicts
draw at 0.995 AUC; that problem is solved. Ours is the one beside it.

## Traps we hit and handled

Each of these silently produced wrong answers before it was caught; they are listed because a
reader should know which failure modes this work actually has.

| Trap | What happened | Handling |
|---|---|---|
| Same-named venues | A dozen venues are called "The Stone". Qloo's own `/v2/analysis/compare` silently resolved ours to a **Denver club**. | Every room pinned by id and verified against its own geocode. Four candidates dropped. |
| Entity mis-resolution | Qloo mapped **"Nate Barbrack" → "Nate Dogg"**. | Weak matches are labelled and never auto-selected. |
| Rate limits read as data | A `429` was reported as "not measured" — a transport failure masquerading as a confident result. | Failure and absence are separate states. |
| A hollow endpoint | `/v2/analysis/compare` returns only "Place", "Tourist Attraction" — true of every venue. | Dropped; overlap measured on act lists and the shared acts named. |
| Malformed tags | Qloo can return a tag with a type and no name, which 500s any page rendering it. | Dropped at the client boundary. |
| A capability that wasn't there | `urn:entity:heatmap` is unsupported in this environment. | Cut rather than faked. |

## What it does not do

Audience alignment from aggregate cultural affinity — not draw, not ticket sales, not capacity,
pricing or guarantee maths. No statement about any individual person. No profile is produced
for a room Qloo has no signal for.

## Stack

Next.js 15 + TypeScript on Fly.io. Typed Qloo client with retry, a two-tier cache with
stale-serving, and a provenance ledger. Deterministic engine — no model in the scoring path.
Booking Desk agent over six typed tools, no LLM, so a verdict cannot change because a model had
a bad afternoon. MCP server over the same tool surface. 15 tests, `typecheck` clean.
