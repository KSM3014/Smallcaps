#!/usr/bin/env python3
import os
import time
from fastapi import FastAPI, HTTPException, Query

from smallgiants_template import (
    build_url,
    fetch_xml,
    parse_items,
    filter_by_company,
)

app = FastAPI(title="Work24 Small-Giant API")

CACHE_TTL_SECONDS = int(os.getenv("WORK24_CACHE_TTL_SECONDS", "300"))
_CACHE = {}


def cache_get(key):
    if CACHE_TTL_SECONDS <= 0:
        return None
    entry = _CACHE.get(key)
    if not entry:
        return None
    ts, value = entry
    if (time.time() - ts) > CACHE_TTL_SECONDS:
        _CACHE.pop(key, None)
        return None
    return value


def cache_set(key, value):
    if CACHE_TTL_SECONDS <= 0:
        return
    _CACHE[key] = (time.time(), value)


def fetch_all(auth_key, region, display, max_pages, sleep):
    display = max(1, min(100, display))
    all_items = []
    total_expected = None

    for page in range(1, max_pages + 1):
        url = build_url(auth_key, page, display, region)
        try:
            xml_bytes = fetch_xml(url)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Upstream request failed: {e}")

        items, total = parse_items(xml_bytes)
        if total_expected is None and total is not None:
            total_expected = total

        if not items:
            break

        all_items.extend(items)

        if total_expected is not None and len(all_items) >= total_expected:
            break

        if sleep > 0:
            time.sleep(sleep)

    return all_items


@app.get("/smallgiants")
def smallgiants(
    company: str = Query("", description="Company name keyword"),
    match: str = Query("partial", pattern="^(partial|exact)$"),
    normalize: bool = Query(False, description="Normalize company names before matching"),
    region: str = Query("", description="Region code (optional)"),
    display: int = Query(100, ge=1, le=100),
    max_pages: int = Query(1000, ge=1, le=5000),
    sleep: float = Query(0.0, ge=0.0, le=5.0),
):
    auth_key = os.getenv("WORK24_AUTH_KEY")
    if not auth_key:
        raise HTTPException(status_code=500, detail="Missing WORK24_AUTH_KEY env var")

    cache_key = (region, display, max_pages, sleep)
    items = cache_get(cache_key)
    if items is None:
        items = fetch_all(auth_key, region, display, max_pages, sleep)
        cache_set(cache_key, items)
    filtered = filter_by_company(items, company, match, normalize)
    return {
        "count": len(filtered),
        "items": filtered,
    }
