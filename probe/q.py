import os, json, urllib.parse, urllib.request, sys
KEY = os.environ["QLOO_API_KEY"]; BASE = "https://hackathon.api.qloo.com"
def get(path, **params):
    url = f"{BASE}{path}?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    req = urllib.request.Request(url, headers={"X-Api-Key": KEY})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.loads(r.read())
def aff(e): return e.get("query", {}).get("affinity")
def names(d): return [(e["name"], round(aff(e) or 0, 3)) for e in d.get("results", {}).get("entities", [])]
def tagtypes(tags, prefix):
    return [t["name"] for t in tags if t.get("type","").startswith(prefix)][:14]
