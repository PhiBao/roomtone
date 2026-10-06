"""Scan candidate music venues: does each one have taste-signal coverage for artist insights?"""
import json, time, urllib.parse, urllib.request, urllib.error, os

KEY = os.environ["QLOO_API_KEY"]
BASE = "https://hackathon.api.qloo.com"
CITY = {"ny": "New York City", "la": "Los Angeles", "chi": "Chicago", "ldn": "London"}

VENUES = {
    "ny": ["Brooklyn Steel", "Music Hall of Williamsburg", "Webster Hall", "The Marlin Room at Webster Hall",
           "Knockdown Center", "Madison Square Garden", "Barclays Center", "The Fillmore New York",
           "Radio City Music Hall", "Bowery Ballroom", "The Stone", "Elsewhere", "Saint Vitus",
           "Terminal 5", "Navy Yard", "Pier 36 NYC", "Sony Hall", "Beacon Theatre"],
    "la": ["The Roxy Theatre", "The Troubadour", "The Echo", "Hollywood Palladium", "The Greek Theatre",
           "The Novo", "The Independent", "Zebulba"],
    "chi": ["The Salt Shed", "Concord Music Hall", "The Empty Bottle", "Navy Pier Music Shed",
            "The Vic Theatre", "Lincoln Hall", "Prysm"],
    "ldn": ["The O2 Academy Brixton", "Alexandra Palace", "The Roundhouse", "Village Underground",
            "O2 Academy Islington", "KOKO"],
}

def get(path, **params):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())

def post(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
                                 headers={"X-Api-Key": KEY, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())

out = []
for ck, names in VENUES.items():
    city = CITY[ck]
    for qn in names:
        try:
            d = get("/search", query=qn, types="urn:entity:place", limit=4)
        except Exception as e:
            print(f"  SEARCH FAIL {qn}: {e}"); continue
        cands = [e for e in d.get("results", [])]
        best = None
        for e in cands:
            g = (e.get("properties", {}).get("primary_genre", {}) or {}).get("name", "") or ""
            n = e.get("name", "")
            if any(k in g.lower() for k in ("venue", "club", "theater", "theatre", "arena", "amphitheater",
                                             "auditorium", "hall", "lounge", "bar", "music", "night")):
                best = e; break
            if best is None and qn.lower() in n.lower():
                best = e
        if not best:
            print(f"  -- {qn}: no place match"); continue
        p = best.get("properties", {})
        genre = (p.get("primary_genre", {}) or {}).get("name", "")
        eid = best["entity_id"]
        try:
            r = get("/v2/insights", **{"filter.type": "urn:entity:artist",
                                       "signal.interests.entities": eid, "take": 12})
            arts = [(x["name"], x.get("query", {}).get("affinity")) for x in r["results"]["entities"]]
            status = "OK " if arts else "EMPTY"
        except urllib.error.HTTPError as ex:
            arts, status = [], "NOSIG"
        except Exception as ex:
            arts, status = [], "ERR"
        row = {"city": city, "query": qn, "name": best["name"], "id": eid, "genre": genre,
               "hood": p.get("neighborhood"), "status": status,
               "acts": [a[0] for a in arts[:8]]}
        out.append(row)
        print(f"{status:6s} {city[:14]:14s} {best['name'][:32]:32s} | {genre[:18]:18s} | {p.get('neighborhood','')[:14]:14s} | {', '.join(a[0] for a in arts[:5])}")
        time.sleep(0.4)

with open("venue_scan.json", "w") as f:
    json.dump(out, f, indent=2)
print(f"\nscanned={len(out)} ok={sum(1 for r in out if r['status']=='OK ')}")