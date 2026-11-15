# Kenya Road Reports

A free community map of road conditions in Kenya for campers and overlanders. For each road it shows **when someone last drove it** and **what it was like**, with photos where people share them.

Reports come from members of the Kenya Campers community. They are anonymous: no names, phone numbers or usernames appear anywhere on the map.

**Live map:** https://charlessweetland.github.io/kenya-campers-roads/

> **Prototype.** The map holds only the maintainer's own notes for now. Updates from the wider group will be added only with the community's permission (see [docs/PRIVACY.md](docs/PRIVACY.md)).

## Using the map

- Coloured lines show the most recent report: **good**, **fair**, **rough**, **very rough**, **impassable**.
- Dashed grey lines are roads nobody has reported on yet.
- Reports older than 90 days fade out and are marked *may be out of date*.
- Click a road on the map or in the list to see every report on it, newest first.

Conditions change fast, especially after rain. Always check locally (gate rangers, lodges, other drivers) before you set off. Road lines are approximate and **not for navigation**.

## Adding an update

Use the **Add a road update** button on the map. It opens a short Google Form: which road, when you drove it, how it was, what you were driving, and an optional photo. A moderator checks each update before it appears, usually within a day or two.

Please don't include names, phone numbers, number plates or people's faces.

## How it works

```
Google Form ──► Responses sheet ──(moderator ticks "Approved")──► Public tab ──(published CSV)──┐
                                                                                               ▼
data/roads.geojson  +  data/updates.csv  ───────────────────────────────────────────►  index.html map
```

| File | What it is |
|---|---|
| `index.html`, `assets/` | The map page (plain HTML/JS, Leaflet + OpenStreetMap, no build step) |
| `config.js` | Links to the Google Sheet CSV and the form |
| `data/roads.geojson` | The list of roads and their (approximate) lines |
| `data/updates.csv` | Updates kept directly in the repo |
| `data/sample-updates.csv` | Made-up example entries, shown only with `?demo=1` |
| `google/intake.gs` | Apps Script that builds the form and sheet and handles moderation |
| `docs/SETUP.md` | Step-by-step setup for the form, sheet and GitHub Pages |
| `docs/PRIVACY.md` | How reports are anonymised and how to ask for removal |

### Adding or fixing a road

Edit `data/roads.geojson` (easiest at [geojson.io](https://geojson.io): paste the file in, draw or adjust the line, copy it back). Each road needs a unique `id` and a `name`. Then run `refreshRoadChoices()` in the Apps Script so the form dropdown updates.

### Running it locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000 (add `?demo=1` to see the example entries).

## Removing a report

If a report mentions you or you'd like it taken down, open an issue in this repository or message a group admin. It will be removed, no questions asked.

## Licence

Code: MIT. Road reports: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), credited to "Kenya Campers community". Map tiles © OpenStreetMap contributors.
