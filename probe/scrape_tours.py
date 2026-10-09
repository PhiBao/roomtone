"""Collect real tour -> venue ground truth from Wikipedia.

The benchmark question: does Roomtone's read of a room rank the acts that
ACTUALLY played there higher than the popularity heuristic does?

Wikipedia tour pages carry date tables with venue and city. A venue that appears
across several tours has a real, documented act history, which is exactly the
ground truth we need — and it is public, citable and independent of Qloo.
"""
import json, re, time, urllib.parse, urllib.request, os, sys

UA = "Mozilla/5.0 (compatible; RoomtoneHackathonResearch/1.0)"
from html import unescape as html_unescape

# Tours whose Wikipedia pages carry large, well-structured date tables.
CURATED_TOURS = [
    "The Eras Tour", "Music of the Spheres World Tour", "Where We Are Tour",
    "÷ Tour", "Harry Styles: Live on Tour", "Love on Tour",
    "Happier Than Ever, The World Tour", "Future Nostalgia Tour",
    "Special Tour", "Witness: The Tour", "PTX Summer Tour 2018",
    "Melodrama World Tour", "Reputation Stadium Tour", "Beautiful Trauma World Tour",
    "World War Joy Tour", "Wonder World Tour", "The Formation World Tour",
    "Revival Tour", "Bangerz Tour", "Born and Raised World Tour",
    "Electric Tour", "World Tour 2022", "A Head Full of Dreams Tour",
    "On the Run II Tour", "Delta Tour", "Longterm Tour", "The Wild Youth Tour",
    "Where Do We Go? World Tour", "Chemtrails Over the Country Club Tour",
    "Norman Fucking Rockwell! Tour", "Sour Tour", "Mosquito Coast Tour",
    "Solar Power Tour", "Melodrama World Tour",
]

def get_json(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=45) as r:
                return json.loads(r.read())
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))

def get_html(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))

BASE = "https://en.wikipedia.org/api/rest_v1/page/html/"
SEARCH = "https://en.wikipedia.org/w/api.php"


def search_tours(limit=70):
    """Prominent concert tours, via MediaWiki search + the highest-grossing list."""
    titles = set()

    # 1. The highest-grossing tours table: Rank|Peak|Gross|AdjGross|Artist|Tour title
    try:
        html = get_html("https://en.wikipedia.org/wiki/List_of_highest-grossing_concert_tours")
        rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S)
        for r in rows:
            cells = [html_unescape(re.sub(r"<[^>]+>", "", c, flags=re.S)).strip()
                     for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
            if len(cells) < 6:
                continue
            for c in cells[4:]:
                if re.search(r"tour", c, re.I) and 6 < len(c) < 80:
                    titles.add(c)
    except Exception as e:
        print("! grossing-list fetch failed:", e, file=sys.stderr)

    # 2. Curated well-documented tours: date tables on these are large and clean,
    #    which matters far more than total breadth for a venue benchmark.
    for c in CURATED_TOURS:
        titles.add(c)

    # 2. Category members as a supplement.
    try:
        url = SEARCH + "?" + urllib.parse.urlencode({
            "action": "query", "list": "categorymembers",
            "cmtitle": "Category:Concert tours", "cmlimit": "500", "format": "json",
        })
        d = get_json(url)
        for m in d.get("query", {}).get("categorymembers", []):
            t = m.get("title", "")
            if "Tour" in t and not t.startswith("Category:"):
                titles.add(t)
    except Exception as e:
        print("! category fetch failed:", e, file=sys.stderr)

    out = sorted(titles)[:limit]
    print(f"candidate tour pages: {len(out)}")
    return out


def venue_from_row(row):
    """Pull venue and city out of one date-table row, tolerating layout drift."""
    cells = [re.sub(r"<[^>]+>", "", c, flags=re.S).strip() for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row, re.S)]
    cells = [re.sub(r"\s+", " ", c) for c in cells]
    # Look for a [bracketed] wikilink-free venue string and a plausible city.
    for i, c in enumerate(cells):
        if not c or len(c) > 90:
            continue
        if re.match(r"^[A-Z][\p{L}\p{N} .'&\-/]*$".replace("p{L}", "A-Za-z"), c) or c[0:1].isupper():
            pass
    return cells


def collect(pairs):
    """For each tour page, grab (artist, venue, city) triples from date tables."""
    records = []
    for artist, title in pairs:
        try:
            html = get_html(BASE + urllib.parse.quote(title.replace(" ", "_")))
        except Exception:
            continue

        tables = re.findall(r"<table[^>]*wikitable[^>]*>(.*?)</table>", html, re.S)
        found = 0
        for tb in tables:
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
            if len(rows) < 8:
                continue
            header = [re.sub(r"<[^>]+>", "", c, flags=re.S).strip()
                      for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rows[0], re.S)]
            if not header or len(header) < 5:
                continue

            # Only real date tables: a venue column AND a place column. Tour pages
            # also carry a "record notes" table whose venue column holds sentences
            # like "First act to perform three shows on a single tour" — scraping
            # that instead of the date table silently produced garbage.
            ven = next((i for i, h in enumerate(header) if re.match(r"(?i)^(venue|location|place)$", h)), None)
            place = next((i for i, h in enumerate(header)
                          if re.match(r"(?i)^(city|town|country|location)$", h)), None)
            if ven is None or place is None or ven == place:
                continue
            # Reject tables whose first column is not a date.
            if not re.match(r"(?i)^date", header[0]):
                continue

            for r in rows[1:]:
                cells = [re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", c, flags=re.S)).strip()
                         for c in re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)]
                if len(cells) <= max(ven, place):
                    continue
                venue = cells[ven]
                place_name = cells[place]
                if not venue or len(venue) > 70 or len(venue) < 3:
                    continue
                # A venue name is a proper noun, not a sentence.
                if re.search(r"\b(to|perform|act|shows?|tour)\b", venue, re.I):
                    continue
                if not re.match(r"^[A-Za-z0-9 .'&/!,()\-]*$", venue) or not venue[0].isupper():
                    continue
                venue = re.sub(r"\[.*?\]|†|‡|\*", "", venue).strip()
                place_name = re.sub(r"\[.*?\]|†|‡|\*", "", place_name).strip()
                records.append({
                    "artist": artist, "tour": title,
                    "venue": venue, "city": place_name,
                })
                found += 1
                if found > 80:
                    break
        if found:
            print(f"  {title[:44]:44s} -> {found} shows")
        time.sleep(0.15)
    return records


def main():
    from tours import TOURS
    records = collect(TOURS)
    print(f"\ntotal (tour, venue) records: {len(records)}")
    json.dump(records, open("tour_venues.json", "w"), indent=1)
    # Show the venue frequency distribution — we need venues with several tours.
    from collections import Counter
    c = Counter(r["venue"] for r in records)
    multi = [(v, n) for v, n in c.items() if n >= 2]
    multi.sort(key=lambda x: -x[1])
    print("venues with >=2 distinct documented shows:", len(multi))
    for v, n in multi[:15]:
        print(f"   {n}x  {v}")


if __name__ == "__main__":
    main()