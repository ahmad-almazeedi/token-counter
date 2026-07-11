#!/usr/bin/env python3
"""Print a short traffic digest for ilostcount.com from the GoatCounter API.

Token comes from $GOATCOUNTER_TOKEN or ~/.config/ilostcount/goatcounter-token.
Usage: traffic-digest.py [--days N]   (default: last 1 day)
"""

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

SITE = "https://ilostcount.goatcounter.com"


def token():
    t = os.environ.get("GOATCOUNTER_TOKEN")
    if t:
        return t.strip()
    path = os.path.expanduser("~/.config/ilostcount/goatcounter-token")
    try:
        with open(path) as f:
            return f.read().strip()
    except OSError:
        sys.exit("No token: set GOATCOUNTER_TOKEN or create " + path)


def api(path, **params):
    url = SITE + "/api/v0/" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": "Bearer " + token()})
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=1)
    args = ap.parse_args()

    # end is passed as tomorrow's date: GoatCounter treats the end date as a
    # cutoff at the start of that day, which would drop today's visits
    today = dt.datetime.now(dt.timezone.utc).date()
    end = today + dt.timedelta(days=1)
    start = today - dt.timedelta(days=args.days - 1)
    rng = {"start": start.isoformat(), "end": end.isoformat()}

    total = api("stats/total", **rng)
    pages = api("stats/hits", **rng)
    refs = api("stats/toprefs", **rng)

    label = "24h" if args.days == 1 else f"{args.days} days"
    print(f"iLostCount traffic, last {label}")
    print(f"  visits: {total.get('total_utc', total.get('total', 0))}")

    hits = pages.get("hits", [])
    if hits:
        print("  top pages:")
        for h in hits[:5]:
            print(f"    {h['count']:>6}  {h['path']}")

    stats = refs.get("stats", [])
    if stats:
        print("  top referrers:")
        for r in stats[:5]:
            name = r.get("name") or "(direct/unknown)"
            print(f"    {r['count']:>6}  {name}")


if __name__ == "__main__":
    main()
