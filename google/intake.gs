/**
 * Kenya Road Reports: Google Form + Sheet intake.
 *
 * What this does
 *   setup()             Creates the "Add a road update" Google Form and its responses Sheet,
 *                       adds an "Approved" tick-box column and a "Public" tab, and installs triggers.
 *   onApprovalEdit()    When a moderator ticks "Approved", rebuilds the Public tab.
 *   publishPublic()     Copies approved, consented rows (no names, no emails) to the Public tab,
 *                       renames their photos and makes them viewable by link.
 *   refreshRoadChoices() Re-reads the road list from the live site and updates the form dropdown.
 *
 * The dashboard reads ONLY the Public tab (published to the web as CSV). Nothing in the raw
 * responses tab is ever public. See docs/SETUP.md for the step-by-step.
 */

// Live road list, read by refreshRoadChoices(). Change it if you fork or move the site.
const ROADS_URL = "https://charlessweetland.github.io/kenya-campers-roads/data/roads.geojson";

// Fallback road names if ROADS_URL can't be reached. Must match `name` in data/roads-src.json.
const DEFAULT_ROADS = [
  "Namanga – Meshanani Gate, Amboseli (B54)",
  "Emali – Kimana – Loitokitok",
  "Kimana – Chyulu Gate, Tsavo West (B54, formerly C103)",
  "Nairobi – Mombasa Highway (A8)",
  "Mariakani – Kinango – Kwale – Ukunda (back road to Diani)",
  "Voi – Wundanyi (Taita Hills)",
  "Machakos – Wote – Makindu",
  "Kiserian – Olorgesailie – Lake Magadi",
  "Mai Mahiu – Suswa (B3)",
  "Narok – Sekenani Gate (Maasai Mara)",
  "Bahati – Subukia",
  "Isiolo – Archer's Post – Marsabit (A2)",
  "Archer's Post – Wamba – Maralal",
  "South Horr – Loiyangalani",
  "Loiyangalani – Sibiloi NP (lakeshore)"
];
const OTHER_ROAD = "Other (not listed, describe it below)";

// Question titles. The script finds answers by these titles, so don't rename them in the form.
const Q = {
  road: "Which road?",
  section: "Which section? (e.g. 'Meshanani Gate to Namanga', 'last 15 km before the gate')",
  date: "When did you drive it?",
  condition: "How was it?",
  vehicle: "What were you driving?",
  weather: "Weather or recent rain",
  update: "What should other campers know?",
  photos: "Photos",               // add this file-upload question by hand (see SETUP.md)
  gpx: "GPS track (GPX file)",    // add this file-upload question by hand (see SETUP.md)
  consent: "Permission to publish"
};
const CONSENT_YES = "Yes, publish this anonymously on the Kenya Road Reports map";
const APPROVED = "Approved";
const PUBLIC_SHEET = "Public";
const PUBLIC_HEADERS = ["date_driven", "road", "section", "condition", "vehicle", "weather", "update", "photo_url", "track", "source"];

/* ------------------------------------------------------------------ setup */

function setup() {
  const form = FormApp.create("Kenya Road Reports: add a road update");
  form.setDescription(
    "Tell other campers how a road was when you drove it. Your update appears on the Kenya Road Reports " +
    "map WITHOUT your name, after a quick check by a moderator.\n\n" +
    "Please don't include names, phone numbers, number plates or people's faces in your text or photos."
  );
  form.setCollectEmail(false);
  form.setAllowResponseEdits(false);
  form.setLimitOneResponsePerUser(false);
  form.setProgressBar(false);
  form.setConfirmationMessage("Thank you! Your update will appear on the map once a moderator has checked it.");

  form.addListItem().setTitle(Q.road).setRequired(true)
    .setChoiceValues(roadNames_().concat([OTHER_ROAD]));
  form.addTextItem().setTitle(Q.section);
  form.addDateItem().setTitle(Q.date).setRequired(true);
  form.addMultipleChoiceItem().setTitle(Q.condition).setRequired(true).setChoiceValues([
    "Good – fine for any car",
    "Fair – some rough patches, fine with care",
    "Rough – high clearance recommended",
    "Very rough – 4x4 needed",
    "Impassable or closed"
  ]);
  form.addMultipleChoiceItem().setTitle(Q.vehicle).setChoiceValues([
    "Saloon (2WD)", "SUV (2WD/AWD)", "4x4", "Motorbike", "Truck / overlander"
  ]).showOtherOption(true);
  form.addTextItem().setTitle(Q.weather).setHelpText("e.g. 'Dry for a week', 'Heavy rain the night before'");
  form.addParagraphTextItem().setTitle(Q.update).setRequired(true)
    .setHelpText("Surface, washouts, river crossings, roadworks, how long it took, anything you'd want to know. No names or phone numbers, please.");
  form.addCheckboxItem().setTitle(Q.consent).setRequired(true).setChoiceValues([CONSENT_YES]);

  const ss = SpreadsheetApp.create("Kenya Road Reports: responses");
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();

  const pub = ss.insertSheet(PUBLIC_SHEET);
  pub.getRange(1, 1, 1, PUBLIC_HEADERS.length).setValues([PUBLIC_HEADERS]).setFontWeight("bold");
  pub.setFrozenRows(1);

  ScriptApp.newTrigger("onApprovalEdit").forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger("onNewResponse").forSpreadsheet(ss).onFormSubmit().create();
  PropertiesService.getScriptProperties().setProperties({ formId: form.getId(), sheetId: ss.getId() });

  Logger.log("Form (edit):  " + form.getEditUrl());
  Logger.log("Form (share): " + form.getPublishedUrl());
  Logger.log("Sheet:        " + ss.getUrl());
  Logger.log("Next: add the 'Photos' file-upload question by hand, then follow docs/SETUP.md.");
}

/* -------------------------------------------------------------- triggers */

// New response: add an unticked Approved box so a moderator can review it.
function onNewResponse(e) {
  const sheet = responsesSheet_();
  const col = ensureApprovedColumn_(sheet);
  const row = e && e.range ? e.range.getRow() : sheet.getLastRow();
  sheet.getRange(row, col).insertCheckboxes().setValue(false);
}

// A moderator ticked or unticked "Approved": rebuild the Public tab.
function onApprovalEdit(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() === PUBLIC_SHEET) return;
  const header = sheet.getRange(1, e.range.getColumn()).getValue();
  if (header === APPROVED) publishPublic();
}

/* ------------------------------------------------------------ publishing */

function publishPublic() {
  const sheet = responsesSheet_();
  ensureApprovedColumn_(sheet);
  const values = sheet.getDataRange().getValues();
  const head = values.shift();
  const idx = (title) => head.indexOf(title);
  const tz = Session.getScriptTimeZone();

  const out = [];
  values.forEach((row, i) => {
    if (row[idx(APPROVED)] !== true) return;
    if (String(row[idx(Q.consent)]).indexOf(CONSENT_YES) === -1) return;

    const date = row[idx(Q.date)];
    const photos = idx(Q.photos) >= 0 ? preparePhotos_(row[idx(Q.photos)], i + 2) : "";
    const track = idx(Q.gpx) >= 0 ? gpxToTrack_(row[idx(Q.gpx)]) : "";
    out.push([
      date instanceof Date ? Utilities.formatDate(date, tz, "yyyy-MM-dd") : String(date || ""),
      clean_(row[idx(Q.road)]),
      clean_(row[idx(Q.section)]),
      clean_(row[idx(Q.condition)]),
      clean_(row[idx(Q.vehicle)]),
      clean_(row[idx(Q.weather)]),
      clean_(row[idx(Q.update)]),
      photos,
      track,
      "Form"
    ]);
  });

  const pub = SpreadsheetApp.openById(prop_("sheetId")).getSheetByName(PUBLIC_SHEET);
  pub.getRange(2, 1, Math.max(pub.getMaxRows() - 1, 1), PUBLIC_HEADERS.length).clearContent();
  if (out.length) pub.getRange(2, 1, out.length, PUBLIC_HEADERS.length).setValues(out);
}

// Google adds the uploader's name to uploaded file names. Rename to a neutral name before
// sharing so the person can't be identified from the photo link.
function preparePhotos_(cell, rowNumber) {
  return String(cell || "").split(/[\s,]+/).filter(Boolean).map((url, n) => {
    const id = (url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/) || [])[1];
    if (!id) return "";
    try {
      const file = DriveApp.getFileById(id);
      const ext = (file.getName().match(/\.\w+$/) || [".jpg"])[0];
      file.setName("road-update-" + rowNumber + "-" + (n + 1) + ext);
      file.setDescription("");
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return "https://drive.google.com/thumbnail?id=" + id + "&sz=w1200";
    } catch (err) {
      Logger.log("Photo " + id + " not shared: " + err);
      return "";
    }
  }).filter(Boolean).join(" ");
}

/* ------------------------------------------------------------ GPS tracks */

const TRACK_TRIM_KM = 1;        // cut this much off each end so homes and campsites never show
const TRACK_MIN_KM = 3;         // tracks shorter than this (after trimming) are dropped
const TRACK_MAX_CHARS = 40000;  // stay under Google Sheets' 50,000-character cell limit

// Reads an uploaded GPX file (kept private in Drive) and returns a trimmed, simplified line as a
// Google "encoded polyline" string. Only coordinates are kept: no times, names or device data.
function gpxToTrack_(cell) {
  const url = String(cell || "").split(/[\s,]+/).filter(Boolean)[0];
  if (!url) return "";
  const id = (url.match(/[?&]id=([\w-]+)/) || url.match(/\/d\/([\w-]+)/) || [])[1];
  if (!id) return "";
  try {
    const xml = DriveApp.getFileById(id).getBlob().getDataAsString();
    let pts = [];
    const re = /<(?:trkpt|rtept)\b([^>]*)>/g;
    let m;
    while ((m = re.exec(xml))) {
      const lat = parseFloat((m[1].match(/lat\s*=\s*["']([-\d.]+)/) || [])[1]);
      const lon = parseFloat((m[1].match(/lon\s*=\s*["']([-\d.]+)/) || [])[1]);
      if (isFinite(lat) && isFinite(lon)) pts.push([lat, lon]);
    }
    pts = trimEnds_(pts, TRACK_TRIM_KM);
    if (trackKm_(pts) < TRACK_MIN_KM) return "";
    let tol = 0.0002, enc = "";
    do { enc = encodePolyline_(simplify_(pts, tol)); tol *= 2; } while (enc.length > TRACK_MAX_CHARS);
    return enc;
  } catch (err) {
    Logger.log("GPX " + id + " not read: " + err);
    return "";
  }
}

function km_(a, b) {
  const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLon = (b[1] - a[1]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}
function trackKm_(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += km_(pts[i - 1], pts[i]); return d; }

function trimEnds_(pts, km) {
  const cut = (arr) => { let d = 0, i = 1; while (i < arr.length && d < km) { d += km_(arr[i - 1], arr[i]); i++; } return arr.slice(i - 1); };
  return cut(cut(pts).reverse()).reverse();
}

function simplify_(pts, tol) {   // Douglas-Peucker
  if (pts.length < 3) return pts;
  const [y1, x1] = pts[0], [y2, x2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, n = Math.hypot(dx, dy) || 1e-12;
  let dmax = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i][1] - dx * pts[i][0] + x2 * y1 - y2 * x1) / n;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= tol) return [pts[0], pts[pts.length - 1]];
  return simplify_(pts.slice(0, idx + 1), tol).slice(0, -1).concat(simplify_(pts.slice(idx), tol));
}

function encodePolyline_(pts) {
  let out = "", pLat = 0, pLon = 0;
  const enc = (v) => { v = v < 0 ? ~(v << 1) : v << 1; let s = ""; while (v >= 0x20) { s += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
  pts.forEach(([lat, lon]) => {
    const a = Math.round(lat * 1e5), b = Math.round(lon * 1e5);
    out += enc(a - pLat) + enc(b - pLon); pLat = a; pLon = b;
  });
  return out;
}

/* ------------------------------------------------------------ road list */

function roadNames_() {
  try {
    const geo = JSON.parse(UrlFetchApp.fetch(ROADS_URL).getContentText());
    const names = geo.features.map((f) => f.properties.name).filter(Boolean);
    if (names.length) return names;
  } catch (err) {
    Logger.log("Couldn't read " + ROADS_URL + ", using the built-in road list: " + err);
  }
  return DEFAULT_ROADS;
}

function refreshRoadChoices() {
  const names = roadNames_();
  const form = FormApp.openById(prop_("formId"));
  const item = form.getItems(FormApp.ItemType.LIST).find((it) => it.getTitle() === Q.road);
  item.asListItem().setChoiceValues(names.concat([OTHER_ROAD]));
  Logger.log("Road dropdown now has " + names.length + " roads.");
}

/* -------------------------------------------------------------- helpers */

function prop_(k) {
  const v = PropertiesService.getScriptProperties().getProperty(k);
  if (!v) throw new Error("Run setup() first.");
  return v;
}

function responsesSheet_() {
  const ss = SpreadsheetApp.openById(prop_("sheetId"));
  return ss.getSheets().find((s) => s.getFormUrl()) || ss.getSheets()[0];
}

function ensureApprovedColumn_(sheet) {
  const head = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  let col = head.indexOf(APPROVED) + 1;
  if (!col) {
    col = sheet.getLastColumn() + 1;
    sheet.getRange(1, col).setValue(APPROVED).setFontWeight("bold");
    if (sheet.getLastRow() > 1) sheet.getRange(2, col, sheet.getLastRow() - 1, 1).insertCheckboxes();
  }
  return col;
}

// Light-touch scrub of obvious personal details in free text. Moderators still read every update.
function clean_(v) {
  return String(v == null ? "" : v)
    .replace(/\+?\d[\d\s-]{7,}\d/g, (m) => (m.replace(/\D/g, "").length >= 9 ? "[number removed]" : m))
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email removed]")
    .replace(/@\S+/g, "")
    .trim();
}
