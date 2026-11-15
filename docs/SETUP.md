# Setup

Takes about 20 minutes. You need a GitHub account and a Google account.

Use a **personal Google account** (or a new one just for this project, such as a shared "Kenya Campers" account the admins can all sign into). Many work or school Google accounts block "anyone with the link" sharing, and photos won't show on the map without it.

## 1. Put the site on GitHub Pages

1. Push this folder to a public GitHub repository, for example `kenya-campers-roads`.
2. In the repository go to **Settings → Pages**, set **Source** to *Deploy from a branch*, choose `main` and `/ (root)`, and save.
3. After a minute the map is live at `https://<your-github-name>.github.io/kenya-campers-roads/`.

## 2. Create the Google Form and Sheet

1. Go to [script.google.com](https://script.google.com) → **New project**. Name it "Kenya Road Reports intake".
2. Delete the sample code, paste in the whole of [`google/intake.gs`](../google/intake.gs), and save.
3. Choose `setup` in the function drop-down and click **Run**. Approve the permissions it asks for (it needs to create a form and a sheet and manage the photo files).
4. Open **Execution log**. It prints three links: the form's edit link, the form's share link and the sheet.

## 3. Add the photo question (by hand)

Google doesn't let scripts create file-upload questions, so add this one yourself:

1. Open the form's **edit link**.
2. Add a question just above "Permission to publish". Type: **File upload**. Title exactly: `Photos`.
3. Allow only **Image**, maximum **3** files, maximum size **10 MB**.
4. Make it optional.

File-upload questions make people sign in to Google to submit. Their name is **not** published: the script renames each photo before sharing it, and the map shows only the picture. If sign-in is a barrier for your members, you can skip the photo question. Everything else works without it.

## 4. Publish the Public tab

1. Open the sheet. You'll see a responses tab and a tab called **Public**.
2. **File → Share → Publish to web**.
3. In the first drop-down choose **Public** (not "Entire document"). In the second choose **Comma-separated values (.csv)**.
4. Click **Publish** and copy the link.

Only the Public tab is published. Raw responses stay private.

## 5. Connect the map

Edit `config.js` in the repository:

```js
sheetCsvUrl: "<the CSV link from step 4>",
formUrl:     "<the form's share link from step 2>",
repoUrl:     "https://github.com/<your-github-name>/kenya-campers-roads",
```

Commit the change. GitHub Pages refreshes within a minute or two.

## 6. Moderating

Each new response arrives in the responses tab with an unticked **Approved** box.

1. Read the update. Remove any names, phone numbers or personal details from the text cell. The script also strips phone numbers and emails automatically, but a person should check.
2. Look at any photos (the links are in the "Photos" column). Reject or crop any with faces or number plates.
3. Tick **Approved**. The Public tab rebuilds automatically, and the map picks it up on the next page load. Google can take up to 5 minutes to refresh a published CSV.

To take a report down, untick **Approved**.

If a report is for a road that's not on the list ("Other"), add the road to `data/roads.geojson`, then edit the response's road cell to the new road's exact name.

## 7. Keeping the road list in sync

When you add roads to `data/roads.geojson`:

1. Set `ROADS_URL` at the top of the Apps Script to `https://<your-github-name>.github.io/kenya-campers-roads/data/roads.geojson`.
2. Run `refreshRoadChoices`. The form drop-down now matches the map.

## Sharing admin duties

Share the sheet (as **Editor**) and the Apps Script project with the other moderators. Anyone with edit access to the sheet can approve reports.
