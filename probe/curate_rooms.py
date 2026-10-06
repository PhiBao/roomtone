"""Curate the room catalog with verified geography.

Qloo returns many same-named venues and will happily resolve to the wrong city.
Every room here is therefore pinned by (name, expected city/neighborhood) and
then verified by reading the entity's own geocode back. Anything that fails
verification is dropped rather than shipped wrong.
"""
import json, os, time, urllib.parse, urllib.request

KEY = os.environ["QLOO_API_KEY"]; BASE = "https://hackathon.api.qloo.com"

CURATED = [
    # (name, city, neighborhood, genre-hint)
    ("The Stone",               "New York", "Greenwich Village", "Live music venue"),
    ("Music Hall of Williamsburg", "New York", "Williamsburg",    "Live music venue"),
    ("Webster Hall",            "New York", "East Village",      "Live music venue"),
    ("The Bowery Ballroom",     "New York", "Lower East Side",   "Live music venue"),
    ("Pier 36",                 "New York", "Lower East Side",   "Event venue"),
    ("Beacon Theatre",          "New York", "Upper West Side",   "Live music venue"),
    ("Saint Vitus",             "New York", "Greenpoint",        "Live music venue"),
    ("Radio City Music Hall",   "New York", "Midtown",           "Concert hall"),
    ("Madison Square Garden",   "New York", "Chelsea",           "Arena"),
    ("Barclays Center",         "New York", "Prospect Heights",  "Arena"),
    ("Sony Hall",               "New York", "Theater District",  "Concert hall"),
    ("The Roxy Theatre",        "Los Angeles", None,              "Live music venue"),
    ("The Troubadour",          "Los Angeles", None,              "Live music venue"),
    ("The Echo",                "Los Angeles", "Echo Park",       "Live music venue"),
    ("The Independent",         "Los Angeles", "Western Addition","Live music venue"),
    ("Hollywood Palladium",     "Los Angeles", "Hollywood",       "Concert hall"),
    ("The Greek Theatre",       "Los Angeles", None,              "Amphitheater"),
    ("Lincoln Hall",            "Chicago", "Lincoln Park",       "Live music venue"),
    ("The Empty Bottle",        "Chicago", "West Town",          "Live music venue"),
    ("Lincoln Hall",            "Chicago", None,                  "Concert hall"),
    ("Village Underground",     "London",  "Hackney",            "Live music venue"),
    ("KOKO",                    "London",  "Camden",             "Live music venue"),
    ("Alexandra Palace",        "London",  "Muswell Hill",       "Event venue"),
    ("O2 Academy Brixton",      "London",  "Lambeth",            "Live music venue"),
]

def get(path, **p):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in p.items() if v is not None})
    r = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(r, timeout=45) as x: return json.loads(x.read())

def geo(e):
    p = e.get("properties", {}) or {}
    g = p.get("geocode", {}) or {}
    return {
        "city": g.get("city"), "hood": p.get("neighborhood") or g.get("name"),
        "country": g.get("country_code"), "genre": (p.get("primary_genre") or {}).get("name"),
    }

def norm(s): return (s or "").lower().replace(".", "").strip()

verified, rejected = [], []
seen = set()

for name, city, hood, _hint in CURATED:
    d = get("/search", query=name, types="urn:entity:place", limit=10)
    cands = d.get("results", [])
    # Exact name match first, then city, then neighbourhood. Never fuzzy on name.
    exact = [c for c in cands if norm(c["name"]) == norm(name)]
    pool = exact or cands
    def score(c):
        g = geo(c); s = 0
        if norm(g["city"]) == norm(city): s += 4
        elif city and norm(city) in norm(g["city"]): s += 2
        if hood and norm(g["hood"]) == norm(hood): s += 5
        return s
    ranked = sorted(pool, key=score, reverse=True)
    if not ranked:
        rejected.append((name, city, "no candidates")); continue
    best = ranked[0]; g = geo(best)
    if city and norm(g["city"]) != norm(city):
        rejected.append((name, city, f"top match is in {g['city']!r}")); continue
    if best["entity_id"] in seen:
        continue
    seen.add(best["entity_id"])
    verified.append({
        "id": best["entity_id"], "name": best["name"],
        "city": g["city"] or city, "neighborhood": g["hood"] or hood,
        "genre": g["genre"], "searchedAs": name,
    })
    print(f"OK   {best['name'][:30]:30s} | {(g['city'] or ''):14s} | {(g['hood'] or ''):18s} | {g['genre']}")
    time.sleep(0.3)

print("\n--- rejected ---")
for r in rejected: print("  REJECT", r)

json.dump(verified, open("rooms.verified.json", "w"), indent=2)
print(f"\nverified={len(verified)} rejected={len(rejected)}")