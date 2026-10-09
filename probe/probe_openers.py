"""Does the Wikipedia date table carry support acts?

The benchmark found 0 of 149 documented HEADLINE acts in their venue's Qloo
top-50. But a support act is typically smaller and genre-specific — closer to a
room's local audience cluster than a global headliner is. That is the population
this product actually claims to serve, and it was never tested.

Before building on it, confirm the column exists and how it is shaped.
"""
import re, urllib.request, urllib.parse

UA = "Mozilla/5.0 (compatible; RoomtoneHackathonResearch/1.0)"
BASE = "https://en.wikipedia.org/api/rest_v1/page/html/"


def get(u):
    r = urllib.request.Request(u, headers={"User-Agent": UA})
    with urllib.request.urlopen(r, timeout=45) as x:
        return x.read().decode("utf-8", "replace")


for title in ["The Eras Tour", "Music of the Spheres World Tour", "Future Nostalgia Tour",
              "Happier Than Ever, The World Tour", "Sour Tour", "Special Tour"]:
    try:
        h = get(BASE + urllib.parse.quote(title.replace(" ", "_")))
    except Exception as e:
        print(f"!! {title}: {e}")
        continue

    tables = re.findall(r"<table[^>]*wikitable[^>]*>(.*?)</table>", h, re.S)
    print(f"\n=== {title} ===")
    for tb in tables:
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
        if len(rows) < 8:
            continue
        header = [re.sub(r"<[^>]+>", "", c, flags=re.S).strip()
                  for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rows[0], re.S)]
        if not header or not re.match(r"(?i)^date", header[0]):
            continue
        oi = next((i for i, x in enumerate(header) if re.match(r"(?i).*opening", x)), None)
        vi = next((i for i, x in enumerate(header) if re.match(r"(?i)^venue$", x)), None)
        if oi is None or vi is None:
            continue
        print("  header:", header[:7], f"| opener col={oi} venue col={vi}")
        for r in rows[1:5]:
            cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c, flags=re.S)).strip()
                     for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
            if len(cells) <= max(oi, vi):
                continue
            print(f"    venue={cells[vi][:28]:28s} openers={cells[oi][:70]!r}")
        break
