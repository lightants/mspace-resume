# MSpace AI Resume Builder

Static site for job-application résumés (especially VA roles in the Philippines).
No Node server. Hosts on GitHub Pages as plain files (`lightants/mspace-resume`).

Brand: MSpace (Multi-spaces). Light app UI, gold accent #C4A35A, official logo.

## Local preview

Open `index.html` in a browser, or from this folder:

```
python3 -m http.server 8080
```

## Google Sheet inbox

Sheet already exists (owner: `antenesclyde@gmail.com`):

- URL: https://docs.google.com/spreadsheets/d/1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc/edit
- Spreadsheet ID: `1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc`

The script writes to a tab named **Leads**.

### Apps Script setup

1. Open the sheet above.
2. Extensions → Apps Script. Paste `apps-script/Code.gs` (or bind a standalone script; `Code.gs` uses `SpreadsheetApp.openById` so it works unbound).
3. Save. Run `doGet` once if you want to create the **Leads** header row (authorize when asked).
4. Deploy → New deployment → type **Web app**.
   - Execute as: Me
   - Who has access: **Anyone** (so the public site can POST)
5. Copy the web-app URL into `config.js`:

```js
window.MSPACE_SHEETS_WEBHOOK = 'https://script.google.com/macros/s/…/exec';
```

6. Redeploy after script changes (Manage deployments → Edit → New version).

Until the webhook URL is set, Generate / Print / PDF still work. Submit shows: *Saved on this device. Sheet inbox not connected yet.* It never pretends a Sheets write succeeded.

## Photo

Client-side only: square crop + zoom, drawn onto a white 600×600 canvas (2×2 in at 300 dpi). Optional skip. PNG download on the photo step. Submissions send a short photo note, or a JPEG data URL under ~80KB if a webhook is set.

## PDF

Print-ready A4 CSS (`@page { size: A4 }`). **Print** uses the browser dialog. **Download PDF** uses html2canvas + jsPDF from CDN (fallback: print).

## Auth (Firebase)

Use Firebase compat 10.14.1 (app + auth) from gstatic.

Put keys in config.js on window.MSPACE_FIREBASE (apiKey, authDomain, projectId, appId).
Leave empty strings until you have a real Firebase web app. Do not invent keys.

### Console setup

1. Firebase Console: create or open a project, Add app, Web.
2. Copy apiKey, authDomain, projectId, appId into config.js.
3. Authentication, Sign-in method: enable Email/Password and Google.
4. Authorized domains: add GitHub Pages host and localhost.

When keys are filled, auth.js uses Firebase email sign-in, email sign-up with display name, Google popup (redirect fallback), and onAuthStateChanged.

When keys are empty: Google is disabled (Connect Google first). Email uses on-device fallback: accounts in localStorage with SHA-256 of password+email via Web Crypto, never plaintext. Labeled on the login screen. Session is email, name, provider, uid in sessionStorage and localStorage. Log out clears it.
