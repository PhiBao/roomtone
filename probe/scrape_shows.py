"""Scrape documented shows from Wikipedia with BOTH populations.

The first benchmark only captured headliners, and found 0 of 149 in their
venue's Qloo top-50. But a support act is typically smaller and genre-specific —
closer to a room's local audience cluster than a global headliner is. Testing
both populations on the same venues is the finding: where the boundary sits.

Output: shows.json — one record per (venue, city, headliner, openers[]).
"""
import json, re, time, urllib.parse, urllib.request
from tours import TOURS

UA = "Mozilla/5.0 (compatible; RoomtoneHackathonResearch/1.0)"
BASE = "https://en.wikipedia.org/api/rest_v1/page/html/"

# Wikipedia injects screen-reader CSS into some cells; strip it before parsing.
JUNK = re.compile(r"\.mw-parser-output.*?}(?=\s|$)|\.sr-only\{[^}]*\}")


def get(url, retries=3):
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=45) as r:
                return r.read().decode("utf-8", "replace")
        except Exception:
            if i == retries - 1:
                raise
            time.sleep(1.5 * (i + 1))


def cell_text(html):
    """Flatten a cell to plain text, dropping style blocks and footnote refs."""
    t = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S)
    t = re.sub(r"<[^>]+>", " ", t)
    t = JUNK.sub("", t)
    t = re.sub(r"\[\d+\]|\[[a-z]\]", "", t)
    return re.sub(r"\s+", " ", t).strip()


def cell_links(html):
    """Individual names inside a cell — one per anchor or list item.

    Openers are separate <td>s or a single cell holding several <a> tags, so
    flattening the cell concatenates them ('Caroline PolachekLolo Zouaï').
    Extracting anchors keeps the names apart.
    """
    t = re.sub(r"<style[^>]*>.*?</style>", "", html, flags=re.S)
    names = []
    for a in re.findall(r"<a\b[^>]*>(.*?)</a>", t, re.S):
        label = cell_text(a)
        if 2 < len(label) < 60 and not label.lower().startswith(("list of", "wikipedia")):
            names.append(label)
    for li in re.findall(r"<li\b[^>]*>(.*?)</li>", t, re.S):
        label = cell_text(li)
        if 2 < len(label) < 60:
            names.append(label)
    # Dedupe, preserve order.
    seen, out = set(), []
    for n in names:
        k = n.lower()
        if k not in seen:
            seen.add(k)
            out.append(n)
    return out


NUMERIC = re.compile(r"^[\d,.\s/×x$€£–-]+$")


def collect(pairs):
    records = []
    for artist, title in pairs:
        try:
            html = get(BASE + urllib.parse.quote(title.replace(" ", "_")))
        except Exception:
            continue

        tables = re.findall(r"<table[^>]*wikitable[^>]*>(.*?)</table>", html, re.S)
        found = 0
        for tb in tables:
            rows = re.findall(r"<tr[^>]*>(.*?)</tr>", tb, re.S)
            if len(rows) < 8:
                continue
            # Header cells carry raw markup; clean before matching.
            hcells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", rows[0], re.S)
            header = [cell_text(c) for c in hcells]
            if not header or len(header) < 5 or not re.match(r"(?i)^date", header[0]):
                continue
            vi = next((i for i, x in enumerate(header) if re.match(r"(?i)^(venue|location|place)$", x)), None)
            pi = next((i for i, x in enumerate(header) if re.match(r"(?i)^(city|country|town|location)$", x)), None)
            oi = next((i for i, x in enumerate(header) if re.match(r"(?i).*opening", x)), None)
            if vi is None or pi is None or vi == pi or oi is None:
                continue

            for r in rows[1:]:
                raw = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", r, re.S)
                if len(raw) <= max(vi, pi, oi):
                    continue
                venue = cell_text(raw[vi])
                place = cell_text(raw[pi])
                # Rows repeat attendance/revenue because of rowspans; those land
                # in the venue column and would corrupt the venue name.
                if not venue or len(venue) < 3 or len(venue) > 70 or NUMERIC.match(venue):
                    continue
                if re.search(r"\b(to|perform|act|shows?|tour)\b", venue, re.I):
                    continue
                if not venue[0].isupper():
                    continue
                openers = [n for n in cell_links(raw[oi]) if not NUMERIC.match(n)]
                openers = [n for n in openers if n.upper() != "N/A" and n not in {"—", "-"}]
                records.append({
                    "headliner": artist, "tour": title,
                    "venue": venue, "city": place, "openers": openers,
                })
                found += 1
                if found > 90:
                    break
        if found:
            print(f"  {title[:46]:46s} -> {found}")
        time.sleep(0.15)
    return records


def main():
    recs = collect(TOURS)
    print(f"\nshows: {len(recs)}")
    print(f"with openers: {sum(1 for r in recs if r['openers'])}")
    from collections import Counter
    c = Counter()
    for r in recs:
        for o in r["openers"]:
            c[o] += 1
    print("\nmost-documented openers:")
    for n, k in c.most_common(14):
        print(f"  {k:3d}  {n}")
    json.dump(recs, open("shows.json", "w"), indent=1)
    print("\nwrote shows.json")


if __name__ == "__main__":
    main()