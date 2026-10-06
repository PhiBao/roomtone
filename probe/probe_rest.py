"""Probe the remaining Qloo capabilities Roomtone depends on."""
import json, os, time, urllib.parse, urllib.request, urllib.error

KEY = os.environ["QLOO_API_KEY"]; BASE = "https://hackathon.api.qloo.com"

def get(path, **p):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in p.items() if v is not None})
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=45) as r: return json.loads(r.read())

def post(path, body):
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
          headers={"X-Api-Key": KEY, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=45) as r: return json.loads(r.read())

def try_(label, fn):
    try:
        r = fn(); print(f"[OK]   {label}"); return r
    except urllib.error.HTTPError as e:
        print(f"[{e.code}] {label} :: {e.read().decode()[:180]}"); return None
    except Exception as e:
        print(f"[ERR]  {label} :: {e}"); return None

VENUES = json.load(open("venue_scan.json"))
OK = [v for v in VENUES if v["status"].strip() == "OK"]
print(f"usable venues in scan: {len(OK)}\n")

print("=== 1. VENUE x VENUE (does room A like room B?) ===")
stone = next(v for v in OK if v["name"] == "The Stone")
msg = next(v for v in OK if v["name"] == "Madison Square Garden")
for label, sig in [("The Stone as signal", stone["id"]), ("MSG as signal", msg["id"])]:
    d = try_(f"  places near {label}", lambda s=sig: get("/v2/insights",
        **{"filter.type": "urn:entity:place", "signal.interests.entities": s,
           "filter.location.query": "New York City", "take": 8}))
    if d:
        for e in d["results"]["entities"]:
            print(f"      {e['query'].get('affinity',0):.3f} {e['name']}")

print("\n=== 2. HEATMAP: artist x city (the technical wedge) ===")
for art in ["Bad Bunny", "Kamasi Washington"]:
    a = try_(f"  search {art}", lambda q=art: get("/search", query=q, types="urn:entity:artist", limit=1))
    if not a or not a.get("results"): continue
    aid = a["results"][0]["entity_id"]
    d = try_(f"  heatmap {art} in NYC", lambda i=aid: get("/v2/insights",
        **{"filter.type": "urn:entity:heatmap", "filter.location.query": "New York City",
           "signal.interests.entities": i, "take": 12}))
    if d:
        cells = d["results"].get("entities", [])
        print(f"      cells={len(cells)}  sample_keys={list(cells[0].keys()) if cells else None}")
        for c in cells[:8]:
            print("      ", {k: (round(v,3) if isinstance(v,(int,float)) else v)
                             for k, v in c.items() if k not in ("properties","tags")})

print("\n=== 3. AUDIENCES ===")
d = try_("  audience search 'music festival'", lambda: get("/v2/audiences", query="music festival", limit=6))
if d:
    for a in d.get("results", [])[:6]:
        print("      ", a.get("id"), "|", a.get("name"))

print("\n=== 4. ANALYSIS/COMPARE: room vs act ===")
bb = try_("  search Bad Bunny", lambda: get("/search", query="Bad Bunny", types="urn:entity:artist", limit=1))
if bb and bb.get("results"):
    bb_id = bb["results"][0]["entity_id"]
    d = try_("  compare act vs room", lambda: post("/v2/analysis/compare",
        {"a.signal.interests.entities": [bb_id], "b.signal.interests.entities": [msg["id"]],
         "filter.type": ["urn:tag"]}))
    if d: print("      ", json.dumps(d)[:700])

print("\n=== 5. TRENDING (velocity) ===")
d = try_("  trending Bad Bunny", lambda: get("/v2/trending",
    **{"filter.entities.query": "Bad Bunny", "start_date": "2026-09-01", "end_date": "2026-09-30"}))
if d: print("      ", json.dumps(d)[:500])