// Settings for the dashboard. Edit these three values after you set up the Google Form
// (see docs/SETUP.md). Leave a value as "" to switch that feature off.
window.KCR_CONFIG = {
  // "Publish to web" CSV link of the *Public* tab of the responses Google Sheet.
  // Looks like: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=123456&single=true&output=csv
  sheetCsvUrl: "",

  // Link to the Google Form people use to add a road update (the "Send" > link URL).
  formUrl: "",

  // Link to this GitHub repository, shown in the footer.
  repoUrl: "",

  // Reports older than this many days are faded and marked "may be out of date".
  staleDays: 90
};
