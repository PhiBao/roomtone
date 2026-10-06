import json,os,urllib.parse,urllib.request,urllib.error
KEY=os.environ["QLOO_API_KEY"];BASE="https://hackathon.api.qloo.com"
def get(p,**q):
    u=f"{BASE}{p}?"+urllib.parse.urlencode({k:v for k,v in q.items() if v is not None})
    r=urllib.request.Request(u,headers={"X-Api-Key":KEY})
    with urllib.request.urlopen(r,timeout=45) as x: return json.loads(x.read())
def t(l,f):
    try: v=f();print(f"[OK]  {l}");return v
    except urllib.error.HTTPError as e: print(f"[{e.code}] {l} :: {e.read().decode()[:160]}");return None
    except Exception as e: print(f"[ERR] {l} :: {e}");return None
sid=lambda q: get("/search",query=q,types="urn:entity:place",limit=1)["results"][0]["entity_id"]
aid=lambda q: get("/search",query=q,types="urn:entity:artist",limit=1)["results"][0]["entity_id"]
stone,bowery = sid("The Stone"), sid("The Bowery Ballroom")
bb, kamasi = aid("Bad Bunny"), aid("Kamasi Washington")
print("=== COMPARE (room vs act) ===")
d=t("compare The Stone vs Bad Bunny",lambda: get("/v2/analysis/compare",
  **{"a.signal.interests.entities":stone,"b.signal.interests.entities":bb,"filter.type":"urn:tag"}))
if d: print("   ",json.dumps(d)[:900])
print("\n=== TRENDING ===")
d=t("trending w/ filter.start_date",lambda: get("/v2/trending",
  **{"filter.type":"urn:entity:artist","signal.interests.entities":bb,
     "filter.start_date":"2026-08-01","filter.end_date":"2026-10-01"}))
if d: print("   ",json.dumps(d)[:600])
print("\n=== AUDIENCE AS SIGNAL (cold start) ===")
d=t("artists for audience urn:audience:leisure:music_festivals",lambda: get("/v2/insights",
  **{"filter.type":"urn:entity:artist","signal.demographics.audiences":"urn:audience:leisure:music_festivals","take":6}))
if d:
    for e in d["results"]["entities"]: print("   ",round(e["query"].get("affinity",0),3),e["name"])
print("\n=== SCENE: acts similar to Kamasi, no location ===")
d=t("kamasi->artists",lambda: get("/v2/insights",**{"filter.type":"urn:entity:artist","signal.interests.entities":kamasi,"take":6}))
if d:
    for e in d["results"]["entities"]: print("   ",round(e["query"].get("affinity",0),3),e["name"])
print("\n=== The Stone vs Bowery: do these two rooms' audiences overlap? ===")
d=t("compare room vs room",lambda: get("/v2/analysis/compare",
  **{"a.signal.interests.entities":stone,"b.signal.interests.entities":bowery,"filter.type":"urn:tag"}))
if d: print("   ",json.dumps(d)[:600])
