#!/usr/bin/env python3
import argparse
import csv
import json
import os
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo216L01.do"


def build_url(auth_key, start_page, display, region):
    params = {
        "authKey": auth_key,
        "returnType": "XML",
        "startPage": str(start_page),
        "display": str(display),
    }
    if region:
        params["region"] = region
    return BASE_URL + "?" + urllib.parse.urlencode(params)


def fetch_xml(url, timeout=30):
    req = urllib.request.Request(url, headers={"User-Agent": "smallcaps/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_items(xml_bytes):
    root = ET.fromstring(xml_bytes)
    items = []
    for sg in root.findall(".//smallGiant"):
        item = {}
        for child in list(sg):
            tag = child.tag
            text = (child.text or "").strip()
            item[tag] = text
        items.append(item)
    total = root.findtext(".//total")
    return items, int(total) if total and total.isdigit() else None


def filter_by_company(items, company_keyword, match):
    if not company_keyword:
        return items
    key = company_keyword.lower()
    out = []
    for it in items:
        name = (it.get("coNm") or "").lower()
        if match == "exact":
            if name == key:
                out.append(it)
        else:
            if key in name:
                out.append(it)
    return out


def write_output(items, fmt, output_path):
    if fmt == "json":
        data = json.dumps(items, ensure_ascii=False, indent=2)
        if output_path:
            with open(output_path, "w", encoding="utf-8") as f:
                f.write(data)
        else:
            print(data)
        return

    if fmt == "csv":
        if not items:
            headers = []
        else:
            headers = sorted({k for item in items for k in item.keys()})
        if output_path:
            f = open(output_path, "w", newline="", encoding="utf-8")
        else:
            f = sys.stdout
        writer = csv.DictWriter(f, fieldnames=headers)
        writer.writeheader()
        for item in items:
            writer.writerow(item)
        if output_path:
            f.close()
        return

    raise ValueError("Unsupported format: " + fmt)


def main():
    parser = argparse.ArgumentParser(
        description="Fetch Work24 small-giant companies (강소기업) and optionally filter by company name."
    )
    parser.add_argument("--auth-key", help="Work24 auth key (prefer WORK24_AUTH_KEY env var)")
    parser.add_argument("--company", help="Company name keyword to filter", default="")
    parser.add_argument(
        "--match",
        choices=["partial", "exact"],
        default="partial",
        help="Company name matching mode (default: partial)",
    )
    parser.add_argument("--region", help="Region code (optional)", default="")
    parser.add_argument("--display", type=int, default=100, help="Results per page (max 100)")
    parser.add_argument("--max-pages", type=int, default=1000, help="Max pages to scan")
    parser.add_argument("--format", choices=["json", "csv"], default="json")
    parser.add_argument("--output", help="Output file path (optional)")
    parser.add_argument("--sleep", type=float, default=0.0, help="Sleep seconds between requests")
    args = parser.parse_args()

    auth_key = args.auth_key or os.getenv("WORK24_AUTH_KEY")
    if not auth_key:
        print("Missing auth key. Set WORK24_AUTH_KEY or pass --auth-key.", file=sys.stderr)
        sys.exit(2)

    display = max(1, min(100, args.display))

    all_items = []
    total_expected = None

    for page in range(1, args.max_pages + 1):
        url = build_url(auth_key, page, display, args.region)
        try:
            xml_bytes = fetch_xml(url)
        except Exception as e:
            print(f"Request failed on page {page}: {e}", file=sys.stderr)
            sys.exit(1)

        items, total = parse_items(xml_bytes)
        if total_expected is None and total is not None:
            total_expected = total

        if not items:
            break

        all_items.extend(items)

        if total_expected is not None and len(all_items) >= total_expected:
            break

        if args.sleep > 0:
            time.sleep(args.sleep)

    filtered = filter_by_company(all_items, args.company, args.match)
    write_output(filtered, args.format, args.output)


if __name__ == "__main__":
    main()
