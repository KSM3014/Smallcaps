const BASE_URL = "https://www.work24.go.kr/cm/openApi/call/wk/callOpenApiSvcInfo216L01.do";

const CACHE_TTL_SECONDS = Number.parseInt(globalThis.WORK24_CACHE_TTL_SECONDS || "300", 10);
const _CACHE = new Map();

function cacheGet(key) {
  if (!CACHE_TTL_SECONDS || CACHE_TTL_SECONDS <= 0) return null;
  const entry = _CACHE.get(key);
  if (!entry) return null;
  const [ts, value] = entry;
  if ((Date.now() - ts) / 1000 > CACHE_TTL_SECONDS) {
    _CACHE.delete(key);
    return null;
  }
  return value;
}

function cacheSet(key, value) {
  if (!CACHE_TTL_SECONDS || CACHE_TTL_SECONDS <= 0) return;
  _CACHE.set(key, [Date.now(), value]);
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function normalizeName(value) {
  if (!value) return "";
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseItems(xmlText) {
  const items = [];
  const blocks = xmlText.matchAll(/<smallGiant>([\s\S]*?)<\/smallGiant>/g);
  for (const m of blocks) {
    const block = m[1];
    const item = {};
    const tags = block.matchAll(/<([A-Za-z0-9_]+)>([\s\S]*?)<\/\1>/g);
    for (const t of tags) {
      item[t[1]] = decodeXml((t[2] || "").trim());
    }
    items.push(item);
  }
  const totalMatch = xmlText.match(/<total>(\d+)<\/total>/);
  const total = totalMatch ? Number.parseInt(totalMatch[1], 10) : null;
  return { items, total };
}

function filterByCompany(items, company, match, normalize) {
  if (!company) return items;
  let key = company.toLowerCase();
  if (normalize) key = normalizeName(company);
  return items.filter((it) => {
    let name = (it.coNm || "").toLowerCase();
    if (normalize) name = normalizeName(name);
    if (match === "exact") return name === key;
    return name.includes(key);
  });
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchAll(authKey, region, display, maxPages, sleepMs, retries, backoffMs) {
  const allItems = [];
  let totalExpected = null;

  for (let page = 1; page <= maxPages; page++) {
    const params = new URLSearchParams({
      authKey,
      returnType: "XML",
      startPage: String(page),
      display: String(display),
    });
    if (region) params.set("region", region);
    const url = `${BASE_URL}?${params.toString()}`;

    let xmlText = null;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url, { headers: { "User-Agent": "smallcaps/1.0" } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        xmlText = await res.text();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < retries) await sleep(backoffMs * Math.pow(2, attempt));
      }
    }
    if (lastErr) throw lastErr;

    const { items, total } = parseItems(xmlText);
    if (totalExpected === null && total !== null) totalExpected = total;
    if (!items.length) break;

    allItems.push(...items);
    if (totalExpected !== null && allItems.length >= totalExpected) break;

    if (sleepMs > 0) await sleep(sleepMs);
  }

  return allItems;
}

function toCsv(items) {
  const headers = Array.from(
    items.reduce((set, item) => {
      Object.keys(item).forEach((k) => set.add(k));
      return set;
    }, new Set())
  ).sort();

  const lines = [];
  lines.push(headers.join(","));
  for (const item of items) {
    const row = headers.map((h) => {
      const val = item[h] ?? "";
      const s = String(val).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    });
    lines.push(row.join(","));
  }
  return lines.join("\n") + "\n";
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const authKey = env.WORK24_AUTH_KEY;
  const commonKey = env.WORK24_COMMON_KEY;
  if (!authKey) {
    return new Response("Missing WORK24_AUTH_KEY", { status: 500 });
  }

  const company = url.searchParams.get("company") || "";
  const match = url.searchParams.get("match") || "partial";
  const normalize = url.searchParams.get("normalize") === "true";
  const region = url.searchParams.get("region") || "";
  const display = Math.min(Math.max(Number(url.searchParams.get("display") || 100), 1), 100);
  const maxPages = Math.min(Math.max(Number(url.searchParams.get("maxPages") || 1000), 1), 5000);
  const sleepMs = Math.min(Math.max(Number(url.searchParams.get("sleepMs") || 0), 0), 5000);
  const retries = Math.min(Math.max(Number(url.searchParams.get("retries") || 2), 0), 5);
  const backoffMs = Math.min(Math.max(Number(url.searchParams.get("backoffMs") || 500), 0), 5000);
  const format = (url.searchParams.get("format") || "json").toLowerCase();

  const cacheKey = JSON.stringify({ region, display, maxPages, sleepMs, retries, backoffMs, company, match, normalize, format });
  let data = cacheGet(cacheKey);
  if (!data) {
    try {
      const items = await fetchAll(authKey, region, display, maxPages, sleepMs, retries, backoffMs);
      const filtered = filterByCompany(items, company, match, normalize);
      data = { count: filtered.length, items: filtered };
      cacheSet(cacheKey, data);
    } catch (err) {
      return new Response(`Upstream request failed: ${err}`, { status: 502 });
    }
  }

  if (format === "csv") {
    const csv = toCsv(data.items);
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=smallgiants.csv",
      },
    });
  }

  const payload = {
    ...data,
    meta: {
      work24AuthKeyPresent: !!authKey,
      work24CommonKeyPresent: !!commonKey,
    },
  };
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
