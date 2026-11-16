// Settings for the dashboard. Edit these three values after you set up the Google Form
// (see docs/SETUP.md). Leave a value as "" to switch that feature off.
window.KCR_CONFIG = {
  // "Publish to web" CSV link of the *Public* tab of the responses Google Sheet.
  // Looks like: https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?gid=123456&single=true&output=csv
  sheetCsvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSdxFGfmXuEicijVJTF3s-rdgdWDBYb42DImnL-wGvU951YqORBXcIwYbXrua9OHEelqXYjrRcmB_Xb/pub?gid=1723365610&single=true&output=csv",

  // Link to the Google Form people use to add a road update (the "Send" > link URL).
  formUrl: "https://docs.google.com/forms/d/e/1FAIpQLSdHJdvII9gwWIKcA9Rqv_IRRjOQ-Y2D3cMpnzfdEKDAJSNSog/viewform",

  // Link to this GitHub repository, shown in the footer.
  repoUrl: "https://github.com/CharlesSweetland/kenya-campers-roads",

  // Reports older than this many days are faded and marked "may be out of date".
  staleDays: 90
};
