const form = document.getElementById("searchForm");
const companyInput = document.getElementById("companyInput");
const matchSelect = document.getElementById("matchSelect");
const normalizeCheck = document.getElementById("normalizeCheck");
const regionInput = document.getElementById("regionInput");
const displayInput = document.getElementById("displayInput");
const resultBody = document.getElementById("resultBody");
const resultCount = document.getElementById("resultCount");
const resultMeta = document.getElementById("resultMeta");
const csvBtn = document.getElementById("csvBtn");

function buildParams() {
  const params = new URLSearchParams();
  const company = companyInput.value.trim();
  const region = regionInput.value.trim();
  const display = displayInput.value.trim();

  if (company) params.set("company", company);
  params.set("match", matchSelect.value);
  if (normalizeCheck.checked) params.set("normalize", "true");
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
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.coNm || ""}</td>
      <td>${item.CEO || ""}</td>
      <td>${item.region || ""}</td>
      <td>${item.winYear || ""}</td>
      <td>${item.mainProduct || ""}</td>
      <td>${item.firmSize || ""}</td>
    `;
    resultBody.appendChild(tr);
  }
}

async function fetchData() {
  setLoading(true);
  const params = buildParams();
  try {
    const res = await fetch(`/api/smallgiants?${params.toString()}`);
    if (!res.ok) {
      throw new Error(`API 오류: ${res.status}`);
    }
    const data = await res.json();
    resultCount.textContent = `${data.count}건`;
    resultMeta.textContent = `조회 완료 (${new Date().toLocaleString()})`;
    renderRows(data.items || []);
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

csvBtn.addEventListener("click", () => {
  const params = buildParams();
  params.set("format", "csv");
  const url = `/api/smallgiants?${params.toString()}`;
  window.location.href = url;
});
