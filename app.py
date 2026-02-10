#!/usr/bin/env python3
import csv
import io
import json
import os
import time
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import Response
try:
    import redis
except Exception:
    redis = None

from smallgiants_template import (
    build_url,
    fetch_xml,
    parse_items,
    filter_by_company,
)

app = FastAPI(title="Work24 Small-Giant API")

CACHE_TTL_SECONDS = int(os.getenv("WORK24_CACHE_TTL_SECONDS", "300"))
_CACHE = {}
_REDIS_URL = os.getenv("REDIS_URL", "").strip()
_REDIS = None
if _REDIS_URL and redis is not None:
    try:
        _REDIS = redis.Redis.from_url(_REDIS_URL, decode_responses=False)
        _REDIS.ping()
    except Exception:
        _REDIS = None


def _cache_key_to_str(key):
    return json.dumps(key, ensure_ascii=False, separators=(",", ":"))


def cache_get(key):
    if CACHE_TTL_SECONDS <= 0:
        return None
    if _REDIS is not None:
        try:
            value = _REDIS.get(_cache_key_to_str(key))
            if value is None:
                return None
            return json.loads(value.decode("utf-8"))
        except Exception:
            pass
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
    if _REDIS is not None:
        try:
            payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
            _REDIS.setex(_cache_key_to_str(key), CACHE_TTL_SECONDS, payload)
            return
        except Exception:
            pass
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


@app.get(
    "/smallgiants",
    responses={
        200: {
            "content": {
                "application/json": {
                    "example": {
                        "count": 1,
                        "items": [
                            {
                                "corpNo": "1234567890",
                                "coNm": "SME 스몰캡",
                                "CEO": "홍길동",
                                "coAddress": "서울특별시 ...",
                                "region": "11",
                                "winYear": "2024",
                                "mainProduct": "소프트웨어",
                                "firmSize": "중소기업",
                            }
                        ],
                    }
                }
            }
        }
    },
)
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

    cache_key = (region, display, max_pages, sleep, company, match, normalize)
    items = cache_get(cache_key)
    if items is None:
        items = fetch_all(auth_key, region, display, max_pages, sleep)
        cache_set(cache_key, items)
    filtered = filter_by_company(items, company, match, normalize)
    return {
        "count": len(filtered),
        "items": filtered,
    }


@app.get(
    "/smallgiants.csv",
    responses={
        200: {
            "content": {
                "text/csv": {
                    "example": "corpNo,coNm,region,winYear\n1234567890,SME 스몰캡,11,2024\n"
                }
            }
        }
    },
)
def smallgiants_csv(
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
    headers = sorted({k for item in filtered for k in item.keys()})
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=headers)
    writer.writeheader()
    for item in filtered:
        writer.writerow(item)
    data = output.getvalue().encode("utf-8")
    headers = {"Content-Disposition": "attachment; filename=smallgiants.csv"}
    return Response(content=data, media_type="text/csv; charset=utf-8", headers=headers)
