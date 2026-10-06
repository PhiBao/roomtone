import json, os, urllib.parse, urllib.request, urllib.error
KEY = os.environ["QLOO_API_KEY"]; BASE = "https://hackathon.api.qloo.com"

def get(path, **p):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in p.items() if v is not None})
    r = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(r, timeout=45) as x: return json.loads(x.read())
def post(path, body):
    r = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(),
        headers={"X-Api-Key": KEY, "Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(r, timeout=45) as x: return json.loads(x.read())
def t(label, fn):
    try:
        v = fn(); print(f"[OK]  {label}"); return v
    except urllib.error.HTTPError as e: print(f"[{e.code}] {label} :: {e.read().decode()[:200]}")
    except Exception as e: print(f"[ERR] {label} :: {e}")
    return None

print("=== audiences: correct shape ===")
d = t("audiences filter.query", lambda: get("/v2/audiences", **{"filter.query":"music festival","limit":6}))
if d:
    r=d.get("results"); r=r if isinstance(r,list) else r.get("audiences",[]) if isinstance(r,dict) else []
    for a in r[:6]: print("    ", a.get("id"), "|", a.get("name"), "|", a.get("type"))
print("--- audience types ---")
d = t("audience types", lambda: get("/v2/audiences/types"))
if d: print("    ", json.dumps(d)[:400])

print("\n=== trending: correct shape ===")
bb = get("/search", query="Bad Bunny", types="urn:entity:artist", limit=1)["results"][0]["entity_id"]
for params in [
  {"filter.type":"urn:entity:artist","signal.interests.entities":bb,"start_date":"2026-09-01","end_date":"2026-09-30"},
  {"filter.type":"urn:entity:artist","signal.interests.entities":bb,"filter.date_range":"2026-09"},
]:
    d = t(f"trending {list(params)[2:4]}", lambda p=params: get("/v2/trending", **p))
    if d: print("    ", json.dumps(d)[:400]); break

print("\n=== find analysis/compare route ===")
for p in ["/v2/analysis/compare", "/v2/insights/compare", "/v2/compare", "/analysis/compare", "/v2/analysis"]:
    d = t(f"  GET {p}", lambda x=p: get(x, **{"filter.type":"urn:tag"}))
    if d is not None: print("     ->", json.dumps(d)[:200])

print("\n=== explainability (provenance) ===")
stone=""; 
d = get("/search", query="The Stone", types="urn:entity:place", limit=1)
stone = d["results"][0]["entity_id"]
d = t("insights + feature.explainability", lambda: get("/v2/insights",
    **{"filter.type":"urn:entity:artist","signal.interests.entities":stone,"take":3,"feature.explainability":"true"}))
if d:
    print("     top-level keys:", list(d.keys()))
    print("     query keys:", list(d.get("query",{}).keys()))
    print("     query:", json.dumps(d.get("query"))[:500])
    e = d["results"]["entities"][0]
    print("     entity.query:", json.dumps(e.get("query"))[:400])

print("\n=== insights POST (multi-signal, richer) ===")
d = t("POST insights multi-signal", lambda: post("/v2/insights", {
  "filter": {"type": "urn:entity:artist"},
  "signal": {"interests": {"entities": [stone, stone]}},
  "take": 5}))
if d:
    for e in d["results"]["entities"][:5]:
        print("     ", round(e.get("query",{}).get("affinity",0),3), e["name"])