const form = document.getElementById("searchForm");
const companyInput = document.getElementById("companyInput");
const companySuggest = document.getElementById("companySuggest");
const regionInput = document.getElementById("regionInput");
const displayInput = document.getElementById("displayInput");
const resultBody = document.getElementById("resultBody");
const resultCount = document.getElementById("resultCount");
const resultMeta = document.getElementById("resultMeta");
const csvBtn = document.getElementById("csvBtn");
const sortableHeaders = document.querySelectorAll("th[data-sort]");
const prevPageBtn = document.getElementById("prevPage");
const nextPageBtn = document.getElementById("nextPage");
const pageInfo = document.getElementById("pageInfo");
const pageButtons = document.getElementById("pageButtons");

const REGION_MAP = {
  "11": "서울",
  "26": "부산",
  "27": "대구",
  "28": "인천",
  "29": "광주",
  "30": "대전",
  "31": "울산",
  "36": "세종",
  "41": "경기",
  "42": "강원",
  "43": "충북",
  "44": "충남",
  "45": "전북",
  "46": "전남",
  "47": "경북",
  "48": "경남",
  "50": "제주",
};

let currentItems = [];
let sortKey = "";
let sortAsc = true;
let currentPage = 1;
const PAGE_WINDOW = 10;
let lastQuery = "";
let inputTimer = null;

function buildParams() {
  const params = new URLSearchParams();
  const company = companyInput.value.trim();
  const region = regionInput.value.trim();
  const display = displayInput.value.trim();

  if (company) params.set("company", company);
  params.set("normalize", "true");
  if (region) params.set("region", region);
  if (display) params.set("display", display);

  return params;
}

function setLoading(loading) {
  if (loading) {
    resultMeta.textContent = "불러오는 중...";
  }
}

function renderRows(items) {
  resultBody.innerHTML = "";
  for (const item of items) {
    const regionNameText = REGION_MAP[item.region] || "";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.coNm || ""}</td>
      <td>${item.CEO || ""}</td>
      <td>${item.region || ""}</td>
      <td>${regionNameText}</td>
      <td>${item.winYear || ""}</td>
      <td>${item.mainProduct || ""}</td>
      <td>${item.firmSize || ""}</td>
    `;
    resultBody.appendChild(tr);
  }
}

function getSortableValue(item, key) {
  if (key === "regionName") return REGION_MAP[item.region] || "";
  return item[key] || "";
}

function normalizeName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function relevanceScore(name, query) {
  const n = normalizeName(name);
  const q = normalizeName(query);
  if (!q) return 0;
  if (!n.includes(q)) return 0;
  if (n === q) return 100;
  let score = n.startsWith(q) ? 60 : 40;
  score += Math.min(30, Math.round((q.length / n.length) * 30));
  return score;
}

function applySort(items) {
  if (!sortKey) return items;
  if (sortKey === "relevance") {
    const sorted = [...items].sort((a, b) => {
      const av = relevanceScore(a.coNm, lastQuery);
      const bv = relevanceScore(b.coNm, lastQuery);
      if (av !== bv) return sortAsc ? bv - av : av - bv;
      return String(a.coNm || "").localeCompare(String(b.coNm || ""));
    });
    return sorted;
  }
  const sorted = [...items].sort((a, b) => {
    const av = String(getSortableValue(a, sortKey)).toLowerCase();
    const bv = String(getSortableValue(b, sortKey)).toLowerCase();
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });
  return sorted;
}

function getPageSize() {
  const size = Number(displayInput.value) || 10;
  return size;
}

function getSortedItems() {
  if (!sortKey && lastQuery) {
    sortKey = "relevance";
    sortAsc = true;
  }
  return applySort(currentItems);
}

function updatePagination(totalItems) {
  const pageSize = getPageSize();
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;
  pageInfo.textContent = `${currentPage} / ${totalPages}`;
  prevPageBtn.disabled = currentPage <= 1;
  nextPageBtn.disabled = currentPage >= totalPages;
  renderPageButtons(totalPages);
}

function renderPage() {
  const pageSize = getPageSize();
  const sortedItems = getSortedItems();
  updatePagination(sortedItems.length);
  const start = (currentPage - 1) * pageSize;
  const viewItems = sortedItems.slice(start, start + pageSize);
  renderRows(viewItems);
}

function renderPageButtons(totalPages) {
  pageButtons.innerHTML = "";
  const windowIndex = Math.floor((currentPage - 1) / PAGE_WINDOW);
  const start = windowIndex * PAGE_WINDOW + 1;
  const end = Math.min(start + PAGE_WINDOW - 1, totalPages);
  for (let i = start; i <= end; i++) {
    const btn = document.createElement("button");
    btn.textContent = String(i);
    if (i === currentPage) btn.classList.add("active");
    btn.addEventListener("click", () => {
      currentPage = i;
      renderPage();
      syncQueryToUrl();
    });
    pageButtons.appendChild(btn);
  }
}

async function fetchData(options = {}) {
  const { keepPage = false } = options;
  setLoading(true);
  const params = buildParams();
  try {
    const res = await fetch(`/api/smallgiants?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`API 오류: ${res.status}`);
    }
    const data = await res.json();
    currentItems = data.items || [];
    lastQuery = companyInput.value.trim();
    if (!keepPage) currentPage = 1;
    resultCount.textContent = `${data.count}건`;
    resultMeta.textContent = `조회 완료 (${new Date().toLocaleString()})`;
    renderPage();
    updateSuggestions();
    syncQueryToUrl();
  } catch (err) {
    resultMeta.textContent = `오류: ${err.message}`;
    resultBody.innerHTML = "";
    resultCount.textContent = "0건";
  }
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  fetchData();
});

function updateSuggestions() {
  const query = companyInput.value.trim();
  if (!query || currentItems.length === 0) {
    companySuggest.classList.remove("show");
    companySuggest.setAttribute("aria-hidden", "true");
    companySuggest.innerHTML = "";
    return;
  }
  const ranked = [...currentItems]
    .map((item) => ({
      name: item.coNm || "",
      score: relevanceScore(item.coNm, query),
    }))
    .filter((item) => item.score > 0 && item.name)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    companySuggest.classList.remove("show");
    companySuggest.setAttribute("aria-hidden", "true");
    companySuggest.innerHTML = "";
    return;
  }

  companySuggest.innerHTML = ranked
    .map((item) => `<div class="suggest-item" data-name="${item.name}">${item.name}</div>`)
    .join("");
  companySuggest.classList.add("show");
  companySuggest.setAttribute("aria-hidden", "false");
}

companyInput.addEventListener("input", () => {
  if (inputTimer) clearTimeout(inputTimer);
  inputTimer = setTimeout(() => {
    updateSuggestions();
    syncQueryToUrl();
  }, 200);
});

companySuggest.addEventListener("click", (e) => {
  const target = e.target;
  if (!target || !target.dataset || !target.dataset.name) return;
  companyInput.value = target.dataset.name;
  companySuggest.classList.remove("show");
  companySuggest.setAttribute("aria-hidden", "true");
  fetchData();
});

document.addEventListener("click", (e) => {
  if (!companySuggest) return;
  if (e.target === companyInput || companySuggest.contains(e.target)) return;
  companySuggest.classList.remove("show");
  companySuggest.setAttribute("aria-hidden", "true");
});

displayInput.addEventListener("change", () => {
  currentPage = 1;
  renderPage();
  syncQueryToUrl();
});

csvBtn.addEventListener("click", () => {
  const params = buildParams();
  params.set("format", "csv");
  const url = `/api/smallgiants?${params.toString()}`;
  window.location.href = url;
});

function buildQueryFromState() {
  const params = buildParams();
  params.set("page", String(currentPage));
  if (sortKey) params.set("sort", sortKey);
  params.set("order", sortAsc ? "asc" : "desc");
  return params;
}

function applyStateFromQuery() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("company")) companyInput.value = params.get("company") || "";
  if (params.has("region")) regionInput.value = params.get("region") || "";
  if (params.has("display")) displayInput.value = params.get("display") || "10";
  if (params.has("sort")) sortKey = params.get("sort") || "";
  if (params.has("order")) sortAsc = (params.get("order") || "asc") === "asc";
  if (params.has("page")) currentPage = Math.max(1, Number(params.get("page") || "1"));
  return params;
}

function hasQueryParams(params) {
  const keys = ["company", "normalize", "region", "display", "sort", "order", "page"];
  return keys.some((key) => params.has(key));
}

function syncQueryToUrl() {
  const params = buildQueryFromState();
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, "", newUrl);
}

function initializeFromQuery() {
  const params = applyStateFromQuery();
  if (hasQueryParams(params)) {
    fetchData({ keepPage: true });
  }
}
sortableHeaders.forEach((th) => {
  th.addEventListener("click", () => {
    const key = th.dataset.sort;
    if (sortKey === key) {
      sortAsc = !sortAsc;
    } else {
      sortKey = key;
      sortAsc = true;
    }
    currentPage = 1;
    renderPage();
    syncQueryToUrl();
  });
});

prevPageBtn.addEventListener("click", () => {
  currentPage -= 1;
  renderPage();
  syncQueryToUrl();
});

nextPageBtn.addEventListener("click", () => {
  currentPage += 1;
  renderPage();
  syncQueryToUrl();
});

initializeFromQuery();
