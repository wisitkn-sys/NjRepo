const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
try { Object.assign(window.dashboardData, JSON.parse(localStorage.getItem("dtrs-dashboard-data")) || {}); } catch { /* Keep bundled data. */ }

const systems = window.dashboardData.systems;
const stations = window.dashboardData.stations;
const periodNames = { daily: "รายวัน", weekly: "รายสัปดาห์", monthly: "รายเดือน" };
const statusLabel = (status) => ({ online: "Online", warning: "Warning", down: "Down" }[status] || status);
let currentPeriod = "daily";
const thaiDate = (date, options) => new Intl.DateTimeFormat("th-TH-u-ca-buddhist", options).format(new Date(date));

function periodData(period, system = "all") {
  const allRows = (window.dashboardData.events?.rows || []).filter((row) => system === "all" || row.system === system);
  const allDates = [...new Set(allRows.map((row) => row.date))].sort();
  const latest = allDates.at(-1);
  const dates = period === "daily" ? [latest] : period === "weekly" ? allDates.slice(-7) : allDates.filter((date) => date.slice(0, 7) === latest?.slice(0, 7));
  return { dates, rows: allRows.filter((row) => dates.includes(row.date)) };
}

function periodLabel(period, dates) {
  if (!dates.length) return window.dashboardData.summary?.reportDate || "ไม่มีข้อมูลวันที่";
  if (period === "daily") return thaiDate(dates[0], { day: "numeric", month: "long", year: "numeric" });
  if (period === "weekly") return thaiDate(dates[0], { day: "numeric", month: "short" }) + " – " + thaiDate(dates.at(-1), { day: "numeric", month: "short", year: "numeric" });
  return thaiDate(dates.at(-1), { month: "long", year: "numeric" });
}

function renderSystems() {
  const filter = $("#system-filter")?.value || "all";
  const visible = filter === "all" ? systems : systems.filter((system) => system.id === filter);
  $("#system-grid").innerHTML = visible.map((system) => '<button class="system-card" type="button" data-system="' + system.id + '"><h4>' + system.name + '</h4><p>' + system.scope + '</p><span class="status-' + system.status + '">' + (system.status === "online" ? "ปกติ" : "ขัดข้อง") + '</span></button>').join("");
  $("#system-count").textContent = visible.filter((system) => system.status === "online").length + " ระบบทำงานปกติ";
  $$("#system-grid .system-card").forEach((card) => card.addEventListener("click", () => openSystem(card.dataset.system)));
}

function renderStations() {
  const type = $(".station-type.active")?.dataset.type || "base";
  const search = ($("#station-search")?.value || "").trim().toLowerCase();
  const status = $("#station-status")?.value || "all";
  const rows = stations.filter((station) => station.type === type && (status === "all" || station.status === status) && (station.code + " " + station.name).toLowerCase().includes(search));
  $("#station-rows").innerHTML = rows.length ? rows.map((station) => '<tr><td>' + station.code + '</td><td>' + station.name + '</td><td>' + station.device + '</td><td>' + station.checked + '</td><td><span class="status-' + station.status + '">' + statusLabel(station.status) + '</span></td></tr>').join("") : '<tr><td colspan="5">ไม่พบสถานีตามเงื่อนไข</td></tr>';
  $("#station-result-count").textContent = rows.length + " สถานี";
}

function renderReport(period) {
  currentPeriod = period;
  const data = periodData(period);
  const pLabel = periodLabel(period, data.dates);
  $("#period-label").textContent = pLabel;
  const printLabel = $("#print-period-label");
  if (printLabel) printLabel.textContent = "ช่วงรายงาน" + periodNames[period] + " (" + pLabel + ")";
  $("#summary-title").textContent = "สรุปรายงานประจำ" + periodNames[period];
  $("#trend-title").textContent = "แนวโน้มความพร้อมใช้งาน " + (period === "daily" ? "รายวัน" : period === "weekly" ? "7 วันล่าสุด" : "เดือนล่าสุด");
  $("#content-title").textContent = "หัวข้อรายงาน" + periodNames[period];
  $("#downtime-unit").textContent = period === "daily" ? "ล่าสุด" : periodNames[period];
  const summary = window.dashboardData?.summary || { averageAvailability: 100, totalDowntime: 0 };
  const reportRows = data.rows;
  const availability = reportRows.length ? reportRows.reduce((sum, row) => sum + row.availability, 0) / reportRows.length : summary.averageAvailability;
  const downtime = reportRows.length ? (period === "daily" ? Math.max(...reportRows.map((row) => row.downtime)) : reportRows.reduce((sum, row) => sum + row.downtime, 0)) : summary.totalDowntime;
  $("#availability-kpi").innerHTML = availability.toFixed(2) + "<small>%</small>";
  $("#downtime-kpi").textContent = downtime;
  $("#downtime-detail").textContent = period === "daily" ? "สูงสุด " + downtime + " นาทีต่อระบบ" : "รวม " + downtime + " นาที";
  $("#summary-list").innerHTML = [["Availability", availability.toFixed(2) + "%"], ["สถานีออนไลน์", "16 / 16 จุด"], ["Downtime", downtime + " นาที"], ["Alarm", "0 รายการ"]].map((item) => "<div><dt>" + item[0] + "</dt><dd>" + item[1] + "</dd></div>").join("");
  $("#chart-legend").textContent = "Availability · SLA 95%";
  $("#report-checklist").innerHTML = ["ตรวจสอบสถานะระบบหลัก", "ตรวจสอบสถานีและอุปกรณ์", "สรุปความพร้อมใช้งานของระบบ และ ข้อบกพร่องรอการแก้ไข", "ยืนยันสถานะแจ้งผู้ใช้งาน"].map((item) => "<li>" + item + "</li>").join("");
  drawChart();
}

function drawChart() {
  ข้อความ
  const canvas = $("#availability-chart");
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.clientWidth || 600, height = 230, ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio; canvas.height = height * ratio; context.scale(ratio, ratio);
  const selected = $("#system-filter")?.value || "all";
  const grouped = periodData(currentPeriod, selected).rows.reduce((result, row) => {
    (result[row.date] ||= []).push(Number(row.availability)); return result;
  }, {});
  const values = Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).slice(-31).map(([, items]) => items.reduce((sum, value) => sum + value, 0) / items.length);
  const points = values.length ? values : [Number(window.dashboardData.summary?.averageAvailability || 100)];
  const left = 38, right = 10, top = 16, bottom = 28, plotWidth = width - left - right, plotHeight = height - top - bottom;
  const y = (value) => top + (100 - value) / 5 * plotHeight;
  context.clearRect(0, 0, width, height); context.font = "11px Sarabun, sans-serif"; context.fillStyle = "#6c8193"; context.strokeStyle = "#dde5eb"; context.lineWidth = 1;
  [100, 97.5, 95].forEach((value) => { const lineY = y(value); context.beginPath(); context.moveTo(left, lineY); context.lineTo(width - right, lineY); context.stroke(); context.fillText(value + "%", 2, lineY + 4); });
  context.setLineDash([5, 4]); context.strokeStyle = "#a86d12"; context.beginPath(); context.moveTo(left, y(95)); context.lineTo(width - right, y(95)); context.stroke(); context.setLineDash([]); context.fillStyle = "#a86d12"; context.fillText("SLA", width - right - 22, y(95) - 5);
  context.strokeStyle = "#177b7b"; context.lineWidth = 2; context.beginPath();
  points.forEach((value, index) => { const x = points.length === 1 ? left + plotWidth / 2 : left + index * plotWidth / (points.length - 1); index ? context.lineTo(x, y(value)) : context.moveTo(x, y(value)); });
  context.stroke();
  const dates = Object.keys(grouped).sort();
  const labels = [dates[0], dates[Math.floor(dates.length / 2)], dates.at(-1)].filter(Boolean).map((date) => thaiDate(date, { day: "numeric", month: "short" }));
  $(".chart-axis").innerHTML = labels.map((label) => "<span>" + label + "</span>").join("");
}

function openSystem(id) {
  const system = systems.find((item) => item.id === id);
  if (!system || !$("#system-dialog")) return;
  const events = (window.dashboardData.events?.rows || []).filter((row) => row.system === id);
  const availability = events.length ? (events.reduce((sum, row) => sum + row.availability, 0) / events.length).toFixed(2) + "%" : "—";
  const downtime = events.length ? events.reduce((sum, row) => sum + row.downtime, 0) + " นาที" : "—";
  const status = system.status === "online" ? "ปกติ" : "ขัดข้อง";
  $("#dialog-title").textContent = system.name; $("#dialog-scope").textContent = system.scope;
  $("#dialog-availability").textContent = availability; $("#dialog-downtime").textContent = downtime;
  const statusElement = $("#system-dialog .dialog-metrics div:first-child strong");
  statusElement.textContent = status; statusElement.className = "status-" + system.status;
  $("#system-dialog .dialog-message p").textContent = events.length ? "ข้อมูลจาก Event Log ของ " + system.name : "ยังไม่มี Event Log สำหรับระบบนี้";
  $("#system-dialog").showModal();
}
function showToast() {
  const toast = $("#toast"); toast.classList.add("show"); window.setTimeout(() => toast.classList.remove("show"), 2200);
}

async function importWorkbook(file) {
  if (!window.XLSX) throw new Error("ตัวอ่านไฟล์ยังโหลดไม่เสร็จ");
  const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const overview = XLSX.utils.sheet_to_json(workbook.Sheets.Overview, { header: 1, defval: "" });
  const eventRows = XLSX.utils.sheet_to_json(workbook.Sheets["Event Log"], { defval: "" });
  systems.forEach((system) => {
    const row = overview.find((cells) => cells.some((cell) => String(cell).trim() === system.id));
    if (!row) return;
    const index = row.findIndex((cell) => String(cell).trim() === system.id);
    const status = String(row[index + 2] || row[index + 3] || "");
    system.status = /ปกติ|normal/i.test(status) ? "online" : "down";
  });
  const gatewayIndex = { value: 0 };
  const importedStations = overview.slice(3).filter((row) => /^(BS-\d+|AGW)$/i.test(String(row[0]))).map((row) => {
    const code = String(row[0]);
    const gateway = /^AGW$/i.test(code);
    const displayCode = gateway ? "AGW-" + String(++gatewayIndex.value).padStart(2, "0") : code;
    return {
      type: gateway ? "gateway" : "base",
      code: displayCode, name: String(row[1]),
      device: gateway ? "Analog Gateway" : "Base Station",
      checked: "ล่าสุด", status: "online"
    };
  });
  if (!importedStations.length || !eventRows.length) throw new Error("ไม่พบข้อมูลสถานีหรือ Event Log ที่รองรับ");
  stations.splice(0, stations.length, ...importedStations);
  const availability = eventRows.map((row) => Number(row["Online (100%)"])).filter(Number.isFinite);
  const downtime = eventRows.reduce((sum, row) => sum + (Number(row["Down time(min)"]) || 0), 0);
  window.dashboardData.events.rows = eventRows.map((row) => ({ system: row.System, date: new Date(row.Date).toISOString().slice(0, 10), availability: Number(row["Online (100%)"]), downtime: Number(row["Down time(min)"]) || 0 }));
  window.dashboardData.summary = { reportDate: "ข้อมูลล่าสุดจากไฟล์", averageAvailability: availability.reduce((a, b) => a + b, 0) / availability.length, totalDowntime: downtime };
  localStorage.setItem("dtrs-dashboard-data", JSON.stringify(window.dashboardData));
  renderSystems(); renderStations(); renderReport("daily"); showToast();
}

$("#system-filter")?.addEventListener("change", () => { renderSystems(); drawChart(); });
$("#station-search")?.addEventListener("input", renderStations);
$("#station-status")?.addEventListener("change", renderStations);
$$(".station-type").forEach((button) => button.addEventListener("click", () => { $$(".station-type").forEach((item) => item.classList.remove("active")); button.classList.add("active"); renderStations(); }));
$$(".period-tab").forEach((button) => button.addEventListener("click", () => { $$(".period-tab").forEach((item) => { item.classList.remove("active"); item.setAttribute("aria-selected", "false"); }); button.classList.add("active"); button.setAttribute("aria-selected", "true"); renderReport(button.dataset.period); }));
$$("[data-scroll]").forEach((button) => button.addEventListener("click", () => $("#" + button.dataset.scroll)?.scrollIntoView({ behavior: "smooth" })));
$("#refresh-button")?.addEventListener("click", showToast);
$("#print-button")?.addEventListener("click", () => window.print());
$("#import-button")?.addEventListener("click", () => $("#import-file")?.click());
$("#import-file")?.addEventListener("change", async (event) => {
  const button = $("#import-button");
  const file = event.target.files?.[0];
  if (!file) return;
  button.disabled = true;
  try { await importWorkbook(file); } catch (error) { window.alert(error.message || "นำเข้าไฟล์ไม่สำเร็จ"); } finally { button.disabled = false; event.target.value = ""; }
});
$("#dialog-close")?.addEventListener("click", () => $("#system-dialog")?.close());
$("#system-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
window.addEventListener("resize", drawChart);
renderSystems(); renderStations(); renderReport("daily");
const _ver = window.dashboardData?.version; if (_ver && $("#app-version")) $("#app-version").textContent = "v" + _ver;
