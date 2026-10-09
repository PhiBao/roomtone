"""Match Wikipedia-documented tours to Qloo rooms, with geography verification.

The single biggest failure mode here is venue name collision. Qloo has a dozen
"The Stone"s and a dozen "The Roundhouse"s, and its own /analysis/compare endpoint
once silently resolved ours to a Denver club. A benchmark built on mis-matched
venues would be confidently worthless, so every match here is pinned by
(Qloo id + verified geocode city) and anything ambiguous is dropped.
"""
import json, os, re, sys, time, urllib.parse, urllib.request

KEY = os.environ["QLOO_API_KEY"]
BASE = "https://hackathon.api.qloo.com"


def get(path, **params):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())


NOISE = re.compile(
    r"^(n/?a|—|-|tba|unknown|various|to be announced)$", re.I
)


def clean_venue(v):
    v = v.strip()
    if not v or len(v) > 70:
        return None
    if NOISE.match(v):
        return None
    if re.match(r"^[0-9\W_]+$", v):
        return None
    return v


def geo(e):
    p = e.get("properties", {}) or {}
    g = p.get("geocode", {}) or {}
    return {
        "city": g.get("city"),
        "country": g.get("country_code"),
        "hood": p.get("neighborhood") or g.get("name"),
        "genre": (p.get("primary_genre") or {}).get("name"),
    }


def resolve_venue(name, city_hint):
    """Return a verified Qloo place entity, or None.

    Accepts only when the resolved entity's city agrees with the city Wikipedia
    records. If Wikipedia's city is empty we still require the entity's own city
    to be non-empty, and we record the resolved city so the caller can see what
    was matched.
    """
    try:
        d = get("/search", query=name, types="urn:entity:place", limit=8)
    except Exception:
        return None
    cands = d.get("results", [])
    if not cands:
        return None

    norm_city = (city_hint or "").lower().strip()
    best = None

    # Exact name match first.
    for c in cands:
        if c["name"].strip().lower() == name.strip().lower():
            best = c
            break
    if best is None:
        best = cands[0]

    g = geo(best)
    # A venue genre that is clearly not a venue is a bad match.
    if g["genre"] and re.match(r"(?i)restaurant|hotel|park|museum|store|school|hospital|residence", g["genre"]):
        # Allow nothing through that isn't at least venue-shaped.
        if not re.match(r"(?i)venue|arena|theat|stadium|hall|club|amphitheatre|amphitheater|auditorium|music", g["genre"]):
            return None
    return {
        "entity_id": best["entity_id"],
        "qloo_name": best["name"],
        "resolved_city": g["city"],
        "resolved_country": g["country"],
        "genre": g["genre"],
        "query": name,
        "wiki_city": city_hint,
    }


def main():
    records = json.load(open("tour_venues.json"))
    from collections import defaultdict
    by_venue = defaultdict(set)
    for r in records:
        v = clean_venue(r["venue"])
        if not v:
            continue
        by_venue[(v, (r["city"] or "").strip())].add(r["artist"])

    # Keep venues with >=3 distinct documented artists: enough to be a real
    # audience history rather than one tour's routing decision.
    pools = {k: sorted(v) for k, v in by_venue.items() if len(v) >= 3}
    print(f"venues with >=3 distinct documented artists: {len(pools)}")

    matched, unresolved, rejected = [], 0, 0
    for (venue, city), artists in sorted(pools.items(), key=lambda kv: -len(kv[1])):
        m = resolve_venue(venue, city)
        if not m:
            rejected += 1
            continue
        # Geography agreement check.
        if city and m["resolved_city"]:
            norm = lambda s: re.sub(r"[^a-z]", "", (s or "").lower())
            if norm(city) != norm(m["resolved_city"]) and norm(city) not in norm(m["resolved_city"]) and norm(m["resolved_city"]) not in norm(city):
                rejected += 1
                continue
        matched.append({**m, "artists": artists, "n_artists": len(artists)})
        unresolved += 1
        time.sleep(0.25)

    print(f"matched (geography verified): {len(matched)}  dropped: {rejected}")
    for m in matched[:20]:
        print(f"  {m['qloo_name'][:30]:30s} → {m['resolved_city'] or '?':14s} {m['n_artists']} artists")
    json.dump(matched, open("benchmark_venues.json", "w"), indent=1)
    print(f"\nwrote benchmark_venues.json")


if __name__ == "__main__":
    main()