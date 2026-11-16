/* Kenya Road Reports: analytics page (D3).
 * Reads the same public data as the map: data/roads.geojson, data/updates.csv,
 * the published Public sheet (KCR_CONFIG.sheetCsvUrl) and, with ?demo=1, data/sample-updates.csv.
 *
 * The 10 stats:
 *   1 roads with a report   2 total reports   3 reports in the last 30 days
 *   4 roads with an up-to-date report   5 reports with photos or a GPS track
 *   6 freshness per road   7 reports per week   8 latest condition by region
 *   9 vehicle vs condition   10 roads that need an update
 */
(function () {
  "use strict";

  const CFG = Object.assign({ sheetCsvUrl: "", staleDays: 90 }, window.KCR_CONFIG || {});
  const DEMO = new URLSearchParams(location.search).get("demo") === "1";
  const DAY = 86400000;
  const ORDER = ["good", "fair", "rough", "very_rough", "impassable", "pending"];
  const LABEL = { good: "Good", fair: "Fair", rough: "Rough", very_rough: "Very rough", impassable: "Impassable", pending: "Report to follow", none: "No reports yet" };

  const $ = (id) => document.getElementById(id);
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const color = (k) => css("--c-" + k) || "#999";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
  const ageDays = (d) => d ? Math.floor((Date.now() - d.getTime()) / DAY) : Infinity;
  const fmtDate = d3.timeFormat("%-d %b %Y");

  /* ---------- parsing (same rules as assets/app.js) ---------- */

  function parseCondition(v) {
    const t = norm(v);
    if (!t) return "pending";
    if (t.startsWith("very rough")) return "very_rough";
    if (t.startsWith("impassable") || t.includes("closed")) return "impassable";
    for (const k of ["good", "fair", "rough"]) if (t.startsWith(k)) return k;
    if (t.replace(/ /g, "_") in LABEL) return t.replace(/ /g, "_");
    return "pending";
  }
  function parseDate(v) {
    const s = String(v || "").trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }
  function vehicleGroup(v) {
    const t = norm(v);
    if (!t) return "Not given";
    if (t.includes("4x4")) return "4x4";
    if (t.includes("suv")) return "SUV (2WD/AWD)";
    if (t.includes("saloon")) return "Saloon (2WD)";
    if (t.includes("motorbike") || t.includes("bike")) return "Motorbike";
    if (t.includes("truck") || t.includes("overland")) return "Truck / overlander";
    return "Other";
  }
  // Gives up after 10 s so a slow or blocked Google Sheet can't stop the page from drawing.
  function loadCsv(url) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => { console.warn("Timed out loading", url); resolve([]); }, 10000);
      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: true,
        transformHeader: (h) => norm(h).replace(/ /g, "_"),
        complete: (r) => { clearTimeout(timer); resolve(r.data || []); },
        error: () => { clearTimeout(timer); console.warn("Could not load", url); resolve([]); }
      });
    });
  }

  async function loadData() {
    const geo = await fetch("data/roads.geojson").then((r) => r.json());
    const sources = [loadCsv("data/updates.csv")];
    if (CFG.sheetCsvUrl) sources.push(loadCsv(CFG.sheetCsvUrl));
    if (DEMO) sources.push(loadCsv("data/sample-updates.csv"));
    const rows = (await Promise.all(sources)).flat();

    const roads = geo.features.map((f) => ({ id: f.properties.id, name: f.properties.name, region: f.properties.region || "Other", reports: [] }));
    const byKey = new Map();
    roads.forEach((r) => { byKey.set(norm(r.id), r); byKey.set(norm(r.name), r); });

    rows.forEach((row) => {
      let road = byKey.get(norm(row.road)) || byKey.get(norm(row.road_id));
      if (!road && row.track) {
        const name = (row.section || "").trim() || "Unlisted road";
        road = byKey.get(norm("track " + name));
        if (!road) { road = { id: "track-" + roads.length, name, region: "Added from a GPS track", reports: [] }; roads.push(road); byKey.set(norm("track " + name), road); }
      }
      if (!road) return;
      road.reports.push({
        date: parseDate(row.date_driven),
        condition: parseCondition(row.condition),
        vehicle: vehicleGroup(row.vehicle),
        media: !!(String(row.photo_url || "").trim() || String(row.track || "").trim())
      });
    });
    roads.forEach((r) => {
      r.reports.sort((a, b) => (b.date || 0) - (a.date || 0));
      r.latest = r.reports[0] || null;
      r.status = r.latest ? r.latest.condition : "none";
      r.age = r.latest ? ageDays(r.latest.date) : Infinity;
    });
    return roads;
  }

  /* ---------- helpers ---------- */

  const tip = $("tip");
  function showTip(e, html) {
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.min(e.clientX + 12, innerWidth - w - 8) + "px";
    tip.style.top = (e.clientY + h + 16 > innerHeight ? e.clientY - h - 10 : e.clientY + 14) + "px";
  }
  const hideTip = () => { tip.hidden = true; };
  function withTip(sel, html) { sel.on("mousemove", (e, d) => showTip(e, html(d))).on("mouseleave", hideTip); }

  function svgIn(id, height, margin) {
    const box = $(id); box.innerHTML = "";
    const width = Math.max(280, box.clientWidth);
    const svg = d3.select(box).append("svg").attr("viewBox", [0, 0, width, height]).attr("role", "img");
    return { svg, w: width - margin.left - margin.right, h: height - margin.top - margin.bottom,
      g: svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`) };
  }
  const empty = (id, msg) => { $(id).innerHTML = '<p class="empty-chart">' + esc(msg) + "</p>"; };
  function truncate(text, max) {
    text.each(function () {
      const t = d3.select(this), full = t.text();
      if (this.getComputedTextLength() <= max) return;
      let s = full; while (s.length > 3 && this.getComputedTextLength() > max) { s = s.slice(0, -1); t.text(s + "…"); }
      t.append("title").text(full);
    });
  }

  /* ---------- 1–5: headline numbers ---------- */

  function renderKpis(roads, reports) {
    const reported = roads.filter((r) => r.latest).length;
    const recent = reports.filter((r) => ageDays(r.date) <= 30).length;
    const fresh = roads.filter((r) => r.age <= CFG.staleDays).length;
    const media = reports.filter((r) => r.media).length;
    const pct = (a, b) => b ? Math.round((100 * a) / b) + "%" : "–";
    const tiles = [
      [reported + " / " + roads.length, "roads with at least one report"],
      [reports.length, "reports in total"],
      [recent, "reports in the last 30 days"],
      [pct(fresh, roads.length), "of roads reported in the last " + CFG.staleDays + " days"],
      [pct(media, reports.length), "of reports include photos or a GPS track"]
    ];
    $("kpis").innerHTML = tiles.map(([v, l]) => `<div class="kpi"><div class="v">${esc(v)}</div><div class="l">${esc(l)}</div></div>`).join("");
  }

  /* ---------- 6: freshness per road ---------- */

  function renderFreshness(roads) {
    const data = roads.slice().sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
    const known = data.filter((r) => r.age !== Infinity);
    const labelW = Math.min(260, Math.max(140, $("freshness").clientWidth * 0.34));
    const row = 24, m = { top: 24, right: 56, bottom: 8, left: labelW };
    const { g, w } = svgIn("freshness", m.top + m.bottom + row * data.length, m);
    const max = Math.max(CFG.staleDays * 1.2, d3.max(known, (r) => r.age) || 0);
    const x = d3.scaleLinear().domain([0, max]).nice().range([0, w]);
    const y = d3.scaleBand().domain(data.map((r) => r.id)).range([0, row * data.length]).padding(0.28);

    g.append("g").attr("class", "grid").call(d3.axisTop(x).ticks(Math.max(2, Math.min(5, Math.floor(w / 60)))).tickSize(-row * data.length).tickFormat((d) => d + "d"));
    g.append("line").attr("class", "threshold").attr("x1", x(CFG.staleDays)).attr("x2", x(CFG.staleDays)).attr("y1", -6).attr("y2", row * data.length);

    g.append("g").selectAll("text").data(data).join("text").attr("class", "road-label")
      .attr("x", -10).attr("y", (r) => y(r.id) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end")
      .text((r) => r.name).call(truncate, labelW - 16);

    const bars = g.append("g").selectAll("rect").data(known).join("rect").attr("class", "bar")
      .attr("x", 0).attr("y", (r) => y(r.id)).attr("height", y.bandwidth()).attr("rx", 3)
      .attr("width", (r) => Math.max(3, x(Math.min(r.age, max)))).attr("fill", (r) => color(r.status))
      .attr("opacity", (r) => r.age > CFG.staleDays ? 0.5 : 1);
    withTip(bars, (r) => `<strong>${esc(r.name)}</strong><br>${esc(LABEL[r.status])} · driven ${esc(fmtDate(r.latest.date))}<br>${r.age === 0 ? "today" : r.age + " days ago"} · ${r.reports.length} report${r.reports.length === 1 ? "" : "s"}`);

    g.append("g").selectAll("text").data(data).join("text")
      .attr("x", (r) => r.age === Infinity ? 0 : Math.max(3, x(Math.min(r.age, max))) + 6)
      .attr("y", (r) => y(r.id) + y.bandwidth() / 2).attr("dy", "0.35em")
      .text((r) => r.age === Infinity ? "no reports yet" : r.age === 0 ? "today" : r.age + "d");
  }

  /* ---------- 7: reports per week ---------- */

  function renderTimeline(reports) {
    const dated = reports.filter((r) => r.date);
    if (!dated.length) return empty("timeline", "No dated reports yet.");
    const end = d3.timeWeek.ceil(new Date());
    const start = d3.timeWeek.offset(end, -Math.max(12, Math.min(52, d3.timeWeek.count(d3.min(dated, (r) => r.date), end) + 1)));
    const weeks = d3.timeWeek.range(start, end);
    const rows = weeks.map((wk) => {
      const o = { week: wk };
      ORDER.forEach((k) => { o[k] = 0; });
      dated.forEach((r) => { if (+d3.timeWeek.floor(r.date) === +wk) o[r.condition]++; });
      return o;
    });
    const series = d3.stack().keys(ORDER)(rows);
    const m = { top: 8, right: 8, bottom: 26, left: 32 };
    const { g, w, h } = svgIn("timeline", 220, m);
    const x = d3.scaleBand().domain(weeks).range([0, w]).padding(0.18);
    const y = d3.scaleLinear().domain([0, Math.max(3, d3.max(series.at(-1), (d) => d[1]))]).nice().range([h, 0]);

    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(Math.min(5, y.domain()[1])).tickSize(-w).tickFormat(d3.format("d")));
    const every = Math.ceil(weeks.length / Math.max(2, Math.floor(w / 70)));
    g.append("g").attr("transform", `translate(0,${h})`)
      .call(d3.axisBottom(x).tickValues(weeks.filter((_, i) => i % every === 0)).tickFormat(d3.timeFormat("%-d %b")).tickSizeOuter(0));

    const seg = g.append("g").selectAll("g").data(series).join("g").attr("fill", (s) => color(s.key))
      .selectAll("rect").data((s) => s.map((d) => Object.assign(d, { key: s.key }))).join("rect").attr("class", "seg")
      .attr("x", (d) => x(d.data.week)).attr("width", x.bandwidth())
      .attr("y", (d) => y(d[1])).attr("height", (d) => y(d[0]) - y(d[1]));
    withTip(seg.filter((d) => d[1] > d[0]), (d) => `Week of ${esc(fmtDate(d.data.week))}<br><strong>${d[1] - d[0]}</strong> ${esc(LABEL[d.key].toLowerCase())}`);
  }

  /* ---------- 8 & 9: stacked horizontal bars ---------- */

  function stackedBars(id, categories, keys, countFn, tipFn) {
    const rows = categories.map((c) => { const o = { cat: c }; keys.forEach((k) => { o[k] = countFn(c, k); }); return o; });
    const labelW = Math.min(170, Math.max(100, $(id).clientWidth * 0.36));
    const row = 30, m = { top: 6, right: 30, bottom: 24, left: labelW };
    const { g, w } = svgIn(id, m.top + m.bottom + row * rows.length, m);
    const series = d3.stack().keys(keys)(rows);
    const x = d3.scaleLinear().domain([0, Math.max(1, d3.max(series.at(-1), (d) => d[1]))]).nice().range([0, w]);
    const y = d3.scaleBand().domain(categories).range([0, row * rows.length]).padding(0.25);

    g.append("g").attr("class", "grid").attr("transform", `translate(0,${row * rows.length})`)
      .call(d3.axisBottom(x).ticks(Math.min(5, x.domain()[1])).tickSize(-row * rows.length).tickFormat(d3.format("d")));
    g.append("g").selectAll("text").data(categories).join("text").attr("class", "road-label")
      .attr("x", -10).attr("y", (c) => y(c) + y.bandwidth() / 2).attr("dy", "0.35em").attr("text-anchor", "end").text((c) => c).call(truncate, labelW - 14);
    const seg = g.append("g").selectAll("g").data(series).join("g").attr("fill", (s) => color(s.key))
      .selectAll("rect").data((s) => s.map((d) => Object.assign(d, { key: s.key }))).join("rect").attr("class", "seg")
      .attr("y", (d) => y(d.data.cat)).attr("height", y.bandwidth())
      .attr("x", (d) => x(d[0])).attr("width", (d) => x(d[1]) - x(d[0]));
    withTip(seg.filter((d) => d[1] > d[0]), tipFn);
    g.append("g").selectAll("text").data(rows).join("text")
      .attr("x", (r) => x(keys.reduce((s, k) => s + r[k], 0)) + 6).attr("y", (r) => y(r.cat) + y.bandwidth() / 2).attr("dy", "0.35em")
      .text((r) => keys.reduce((s, k) => s + r[k], 0));
  }

  function renderRegions(roads) {
    const regions = d3.groupSort(roads, (rs) => -rs.length, (r) => r.region);
    stackedBars("regions", regions, ORDER.concat("none"),
      (reg, k) => roads.filter((r) => r.region === reg && r.status === k).length,
      (d) => `<strong>${esc(d.data.cat)}</strong><br>${d[1] - d[0]} road${d[1] - d[0] === 1 ? "" : "s"}: ${esc(LABEL[d.key].toLowerCase())}`);
  }

  function renderVehicles(reports) {
    if (!reports.length) return empty("vehicles", "No reports yet.");
    const cats = d3.groupSort(reports, (rs) => -rs.length, (r) => r.vehicle);
    stackedBars("vehicles", cats, ORDER,
      (v, k) => reports.filter((r) => r.vehicle === v && r.condition === k).length,
      (d) => `<strong>${esc(d.data.cat)}</strong><br>${d[1] - d[0]} report${d[1] - d[0] === 1 ? "" : "s"}: ${esc(LABEL[d.key].toLowerCase())}`);
  }

  /* ---------- 10: roads that need an update ---------- */

  function renderGaps(roads) {
    const gaps = roads.filter((r) => r.age > CFG.staleDays).sort((a, b) => (b.age === Infinity) - (a.age === Infinity) || b.age - a.age || a.name.localeCompare(b.name));
    if (!gaps.length) return void ($("gaps").innerHTML = '<p class="empty-chart">Every road has a report from the last ' + CFG.staleDays + " days. 🎉</p>");
    const form = CFG.formUrl ? ` <a href="${esc(CFG.formUrl)}" target="_blank" rel="noopener">Add an update</a>` : "";
    $("gaps").innerHTML = '<table class="gaps"><thead><tr><th>Road</th><th>Last report</th><th>Region</th></tr></thead><tbody>' +
      gaps.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.latest ? esc(fmtDate(r.latest.date)) + " (" + r.age + " days ago)" : "Never"}</td><td>${esc(r.region)}</td></tr>`).join("") +
      "</tbody></table><p class=\"empty-chart\">" + gaps.length + " of " + roads.length + " roads." + form + "</p>";
  }

  /* ---------- boot ---------- */

  function renderLegend() {
    $("legend").innerHTML = ORDER.concat("none").map((k) => `<span><i style="background:${color(k)}"></i>${esc(LABEL[k])}</span>`).join("");
  }

  async function boot() {
    $("demo-banner").hidden = !DEMO;
    $("toggle-demo").textContent = DEMO ? "Hide example entries" : "Show example entries";
    $("toggle-demo").href = DEMO ? "analytics.html" : "analytics.html?demo=1";
    document.querySelectorAll(".stale-days").forEach((el) => { el.textContent = CFG.staleDays; });

    const roads = await loadData();
    const reports = roads.flatMap((r) => r.reports);
    const draw = () => {
      renderLegend(); renderKpis(roads, reports); renderFreshness(roads); renderTimeline(reports);
      renderRegions(roads); renderVehicles(reports); renderGaps(roads);
    };
    draw();
    let t; addEventListener("resize", () => { clearTimeout(t); t = setTimeout(draw, 150); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", draw);
  }

  boot().catch((e) => { console.error(e); $("kpis").innerHTML = '<p class="empty-chart">Something went wrong loading the data.</p>'; });
})();
