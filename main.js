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
const regionInfoBtn = document.getElementById("regionInfoBtn");
const regionModal = document.getElementById("regionModal");
const regionModalClose = document.getElementById("regionModalClose");
const regionName = document.getElementById("regionName");

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

function updateRegionName() {
  const code = regionInput.value.trim();
  if (!code) {
    regionName.textContent = "지역명을 표시합니다.";
    return;
  }
  regionName.textContent = REGION_MAP[code] ? `지역: ${REGION_MAP[code]}` : "알 수 없는 코드";
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

regionInput.addEventListener("input", updateRegionName);

csvBtn.addEventListener("click", () => {
  const params = buildParams();
  params.set("format", "csv");
  const url = `/api/smallgiants?${params.toString()}`;
  window.location.href = url;
});

function openModal() {
  regionModal.classList.add("open");
  regionModal.setAttribute("aria-hidden", "false");
}

function closeModal() {
  regionModal.classList.remove("open");
  regionModal.setAttribute("aria-hidden", "true");
}

regionInfoBtn.addEventListener("click", openModal);
regionModalClose.addEventListener("click", closeModal);
regionModal.addEventListener("click", (e) => {
  if (e.target && e.target.dataset && e.target.dataset.close === "true") {
    closeModal();
  }
});
