/* Kenya Road Reports: map + list of community road updates.
 * Data sources (merged):
 *   data/roads.geojson        road lines (id, name, region)
 *   data/updates.csv          curated updates kept in the repo
 *   KCR_CONFIG.sheetCsvUrl    approved updates from the Google Form (Public tab, published as CSV)
 *   data/sample-updates.csv   example entries, only with ?demo=1
 */
(function () {
  "use strict";

  const CFG = Object.assign({ sheetCsvUrl: "", formUrl: "", repoUrl: "", staleDays: 90 }, window.KCR_CONFIG || {});
  const DEMO = new URLSearchParams(location.search).get("demo") === "1";
  const DAY = 86400000;

  const CONDITIONS = {
    good:       { label: "Good",        rank: 1 },
    fair:       { label: "Fair",        rank: 2 },
    rough:      { label: "Rough",       rank: 3 },
    very_rough: { label: "Very rough",  rank: 4 },
    impassable: { label: "Impassable",  rank: 5 },
    pending:    { label: "Report to follow", rank: 0 },
    none:       { label: "No reports yet",   rank: -1 }
  };

  const $ = (id) => document.getElementById(id);
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();

  /* ---------- parsing ---------- */

  // Accepts free text from the form ("Very rough – needs 4x4") and maps it to a condition key.
  function parseCondition(v) {
    const t = norm(v);
    if (!t) return "pending";
    if (t.startsWith("very rough")) return "very_rough";
    if (t.startsWith("impassable") || t.includes("closed")) return "impassable";
    for (const k of ["good", "fair", "rough"]) if (t.startsWith(k)) return k;
    if (t.replace(/ /g, "_") in CONDITIONS) return t.replace(/ /g, "_");
    return "pending";
  }

  function parseDate(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);                       // 2026-11-15
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);                          // 15/11/2026 (Kenya/UK sheets)
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    const d = new Date(s);
    return isNaN(d) ? null : d;
  }

  // Only allow https links and files inside this repo. Google Drive links become thumbnails.
  function photoUrls(v) {
    return String(v || "").split(/[\s,]+/).map((u) => u.trim()).filter(Boolean).map((u) => {
      const id = (u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]+)/) || [])[1];
      if (id) return "https://drive.google.com/thumbnail?id=" + id + "&sz=w1200";
      if (/^https:\/\//i.test(u)) return u;
      if (/^photos\/[\w./-]+$/.test(u) && !u.includes("..")) return u;
      return null;
    }).filter(Boolean);
  }

  // Google "encoded polyline" (precision 5) → [[lat, lon], ...]. Used for GPS tracks.
  function decodePolyline(str) {
    const pts = []; let i = 0, lat = 0, lon = 0;
    try {
      while (i < str.length) {
        for (const k of [0, 1]) {
          let shift = 0, result = 0, b;
          do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i <= str.length);
          const d = result & 1 ? ~(result >> 1) : result >> 1;
          if (k === 0) lat += d; else lon += d;
        }
        pts.push([lat / 1e5, lon / 1e5]);
      }
    } catch (e) { return []; }
    return pts.filter((p) => Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180);
  }

  function loadCsv(url) {
    return new Promise((resolve) => {
      Papa.parse(url, {
        download: true, header: true, skipEmptyLines: true,
        transformHeader: (h) => norm(h).replace(/ /g, "_"),
        complete: (r) => resolve(r.data || []),
        error: () => { console.warn("Could not load", url); resolve([]); }
      });
    });
  }

  /* ---------- state ---------- */

  let roads = [];          // { id, name, region, surface, feature, layer, reports: [] }
  let map, selectedId = null;

  function ageDays(d) { return d ? Math.floor((Date.now() - d.getTime()) / DAY) : Infinity; }
  function ago(d) {
    const n = ageDays(d);
    if (n === Infinity) return "";
    if (n <= 0) return "today";
    if (n === 1) return "yesterday";
    if (n < 30) return n + " days ago";
    if (n < 365) return Math.round(n / 30) + " months ago";
    return Math.round(n / 365) + (n < 730 ? " year ago" : " years ago");
  }
  const fmtDate = (d) => d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Date unknown";

  function latest(road) { return road.reports[0] || null; }
  function statusOf(road) { const r = latest(road); return r ? r.condition : "none"; }

  function styleFor(road) {
    const st = statusOf(road);
    const r = latest(road);
    const stale = r && ageDays(r.date) > CFG.staleDays;
    const selected = road.id === selectedId;
    return {
      color: css("--c-" + st) || "#999",
      weight: selected ? 8 : (st === "none" ? 3 : 5),
      opacity: st === "none" ? 0.7 : (stale ? 0.45 : 0.95),
      dashArray: st === "none" || st === "pending" || stale ? "6 7" : null,
      lineCap: "round"
    };
  }

  /* ---------- rendering ---------- */

  function chip(cond) { return '<span class="chip ' + esc(cond) + '">' + esc(CONDITIONS[cond].label) + "</span>"; }

  function renderLegend() {
    const rows = ["good", "fair", "rough", "very_rough", "impassable", "pending"].map((k) =>
      '<div class="row"><span class="swatch" style="background:' + css("--c-" + k) + '"></span>' + CONDITIONS[k].label + "</div>");
    rows.push('<div class="row"><span class="swatch dashed"></span>No reports yet</div>');
    rows.push('<div class="note">Faded/dashed = older than ' + CFG.staleDays + " days</div>");
    $("legend").innerHTML = rows.join("");
  }

  function visibleRoads() {
    const q = norm($("search").value);
    const f = $("filter").value;
    return roads.filter((r) => {
      if (q && !norm(r.name + " " + r.region + " " + r.reports.map((x) => x.section + " " + x.text).join(" ")).includes(q)) return false;
      if (f === "reported" && !r.reports.length) return false;
      if (f === "recent" && !(latest(r) && ageDays(latest(r).date) <= 30)) return false;
      return true;
    }).sort((a, b) => {
      const da = latest(a) ? (latest(a).date || 0) : -1;
      const db = latest(b) ? (latest(b).date || 0) : -1;
      return db - da || a.name.localeCompare(b.name);
    });
  }

  function renderList() {
    const list = visibleRoads();
    const reported = roads.filter((r) => r.reports.length).length;
    $("summary").textContent = reported + " of " + roads.length + " roads have reports. Most recently driven first.";
    $("road-list").innerHTML = list.map((r) => {
      const l = latest(r);
      const stale = l && ageDays(l.date) > CFG.staleDays;
      const meta = l
        ? chip(l.condition) + "<span>Last driven " + esc(ago(l.date) || "date unknown") + "</span>" +
          (stale ? '<span class="stale">May be out of date</span>' : "") +
          "<span>" + r.reports.length + (r.reports.length === 1 ? " report" : " reports") + "</span>"
        : chip("none") + "<span>" + esc(r.region) + "</span>";
      return '<li><button class="road-item" data-id="' + esc(r.id) + '">' +
        '<span class="name">' + esc(r.name) + "</span>" +
        '<span class="meta">' + meta + "</span>" +
        (l && l.text ? '<p class="snippet">' + esc(l.text) + "</p>" : "") +
        "</button></li>";
    }).join("") || '<li class="empty" style="padding:14px">No roads match.</li>';
  }

  function renderDetail(road) {
    const reports = road.reports.map((r) => {
      const facts = [r.section && "Section: " + r.section, r.vehicle && "Vehicle: " + r.vehicle, r.weather && "Weather: " + r.weather]
        .filter(Boolean).map(esc).join(" · ");
      const imgs = r.photos.map((u) => '<a href="' + esc(u) + '" target="_blank" rel="noopener"><img loading="lazy" src="' + esc(u) + '" alt="Photo of ' + esc(road.name) + '"></a>').join("");
      const gps = r.track.length > 1 ? '<div class="facts">📍 GPS track shared (dotted line on the map)</div>' : "";
      return '<article class="report"><div class="head">' + chip(r.condition) +
        "<strong>" + esc(fmtDate(r.date)) + "</strong><span>" + esc(ago(r.date)) + "</span>" +
        (r.example ? '<span class="stale">Example only</span>' : "") + "</div>" +
        (facts ? '<div class="facts">' + facts + "</div>" : "") +
        (r.text ? "<p>" + esc(r.text) + "</p>" : "") + gps + imgs + "</article>";
    }).join("");
    const add = CFG.formUrl ? ' <a href="' + esc(CFG.formUrl) + '" target="_blank" rel="noopener">Add an update for this road</a>' : "";
    $("detail").innerHTML =
      '<button class="back" id="back">← All roads</button>' +
      "<h2>" + esc(road.name) + "</h2>" +
      '<p class="sub">' + esc([road.region, road.surface].filter(Boolean).join(" · ")) + "." + add + "</p>" +
      (reports || '<p class="empty">Nobody has reported on this road yet. Driven it recently? Please add an update.</p>');
    $("back").onclick = () => select(null);
  }

  function select(id, fly) {
    selectedId = id;
    const road = roads.find((r) => r.id === id);
    $("road-list").hidden = !!road;
    $("summary").hidden = !!road;
    $("detail").hidden = !road;
    if (road) {
      renderDetail(road);
      if (fly !== false) map.fitBounds(road.layer.getBounds(), { padding: [40, 40], maxZoom: 10 });
      $("detail").scrollIntoView({ block: "nearest" });
    }
    roads.forEach((r) => r.layer.setStyle(styleFor(r)));
    if (road) road.layer.bringToFront();
  }

  /* ---------- boot ---------- */

  async function boot() {
    if (CFG.formUrl) { $("add-update").href = CFG.formUrl; $("add-update").hidden = false; }
    if (CFG.repoUrl) $("repo-link").innerHTML = ' · <a href="' + esc(CFG.repoUrl) + '" target="_blank" rel="noopener">About this project</a>';
    $("demo-banner").hidden = !DEMO;
    $("toggle-demo").textContent = DEMO ? "Hide example entries" : "Show example entries";
    $("toggle-demo").href = DEMO ? "./" : "?demo=1";

    map = L.map("map", { zoomControl: true }).setView([0.2, 37.9], 6);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18, attribution: "© OpenStreetMap contributors"
    }).addTo(map);

    const geo = await fetch("data/roads.geojson").then((r) => r.json());
    const sources = [loadCsv("data/updates.csv")];
    if (CFG.sheetCsvUrl) sources.push(loadCsv(CFG.sheetCsvUrl));
    if (DEMO) sources.push(loadCsv("data/sample-updates.csv").then((rows) => rows.map((x) => Object.assign(x, { _example: true }))));
    const rows = (await Promise.all(sources)).flat();

    roads = geo.features.map((f) => ({
      id: f.properties.id, name: f.properties.name, region: f.properties.region || "",
      surface: f.properties.surface || "", feature: f, reports: []
    }));
    const byKey = new Map();
    roads.forEach((r) => { byKey.set(norm(r.id), r); byKey.set(norm(r.name), r); });

    rows.forEach((row) => {
      const track = row.track ? decodePolyline(String(row.track).trim()) : [];
      let road = byKey.get(norm(row.road)) || byKey.get(norm(row.road_id));
      if (!road && track.length > 1) {
        // A road that isn't on the list yet, but someone shared a GPS track: add it from the track.
        const name = (row.section || "").trim() || "Unlisted road";
        road = byKey.get(norm("track " + name));
        if (!road) {
          road = { id: "track-" + roads.length, name: name, region: "Added from a GPS track", surface: "", reports: [],
            feature: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: track.map((p) => [p[1], p[0]]) } } };
          roads.push(road); byKey.set(norm("track " + name), road);
        }
      }
      if (!road) { if (row.road) console.warn("Update for unknown road:", row.road); return; }
      road.reports.push({
        date: parseDate(row.date_driven),
        condition: parseCondition(row.condition),
        section: (row.section || "").trim(),
        vehicle: (row.vehicle || "").trim(),
        weather: (row.weather || "").trim(),
        text: (row.update || "").trim(),
        photos: photoUrls(row.photo_url),
        track: track,
        example: !!row._example
      });
    });
    roads.forEach((r) => r.reports.sort((a, b) => (b.date || 0) - (a.date || 0)));

    roads.forEach((road) => {
      road.layer = L.geoJSON(road.feature, { style: () => styleFor(road) }).addTo(map);
      const l = latest(road);
      road.layer.bindTooltip(
        "<strong>" + esc(road.name) + "</strong>" +
        (l ? esc(CONDITIONS[l.condition].label) + " · last driven " + esc(ago(l.date) || "date unknown") : "No reports yet"),
        { sticky: true });
      road.layer.on("click", () => select(road.id, false));
      // GPS tracks people shared for this road, drawn as thin lines on top.
      road.reports.filter((r) => r.track.length > 1).forEach((r) => {
        const t = L.polyline(r.track, { color: css("--c-" + r.condition) || "#999", weight: 2.5, opacity: 0.9, dashArray: "2 5" })
          .bindTooltip("GPS track · " + esc(fmtDate(r.date)), { sticky: true }).addTo(map);
        t.on("click", () => select(road.id, false));
        r.trackLayer = t;
      });
    });
    map.fitBounds(L.featureGroup(roads.map((r) => r.layer)).getBounds(), { padding: [20, 20] });
    // Draw reported roads above unreported ones.
    roads.filter((r) => r.reports.length).forEach((r) => r.layer.bringToFront());

    renderLegend();
    renderList();
    $("road-list").addEventListener("click", (e) => {
      const b = e.target.closest(".road-item");
      if (b) select(b.dataset.id);
    });
    $("search").addEventListener("input", () => { select(null); renderList(); });
    $("filter").addEventListener("change", () => { select(null); renderList(); });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { renderLegend(); select(selectedId, false); });
  }

  boot().catch((e) => {
    console.error(e);
    $("summary").textContent = "Something went wrong loading the road data. Please try again later.";
  });
})();
