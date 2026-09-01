/**
 * MSpace AI Resume Builder — Prospective client inbox
 * Sheet: https://docs.google.com/spreadsheets/d/1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc/edit
 *
 * Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Paste the /exec URL into config.js as window.MSPACE_SHEETS_WEBHOOK
 */

var SPREADSHEET_ID = '1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc';
var SHEET_NAME = 'Leads';

var HEADERS = [
  'Timestamp',
  'Status',
  'AccountEmail',
  'Name',
  'DesiredRole',
  'Email',
  'Phone',
  'City',
  'LinkedIn',
  'Languages',
  'Summary',
  'Education',
  'Experience',
  'Skills',
  'References',
  'PhotoNote',
  'VAInterest',
  'HoursAvailable',
  'PreferredShift',
  'Tools',
  'English',
  'HeardAboutMSpace',
  'Notes',
  'Consent',
  'Channel'
];

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  ensureHeaders_(sh);
  return sh;
}

function ensureHeaders_(sh) {
  var lastCol = HEADERS.length;
  var range = sh.getRange(1, 1, 1, lastCol);
  range.setValues([HEADERS]);
  sh.setFrozenRows(1);
  sh.setColumnWidth(1, 160);
  sh.setColumnWidth(2, 90);
  sh.setColumnWidth(3, 200);
  sh.setColumnWidth(4, 180);
}

function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  getSheet_();
  return jsonOut_({ ok: true, sheet: SHEET_NAME, headers: HEADERS });
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var data = parseBody_(e);
    var sh = getSheet_();
    var row = HEADERS.map(function (key) {
      var v = data[key];
      if (v === undefined || v === null) return '';
      if (typeof v === 'object') return JSON.stringify(v);
      var s = String(v);
      if (key === 'PhotoNote' && s.indexOf('data:') === 0) return 'photo uploaded';
      if (s.length > 49000) return s.slice(0, 49000);
      return s;
    });
    sh.appendRow(row);
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    lock.releaseLock();
  }
}

function parseBody_(e) {
  if (!e) return {};
  if (e.postData && e.postData.contents) {
    var raw = e.postData.contents;
    if (raw && raw.charAt(0) === '{') {
      try { return JSON.parse(raw); } catch (err) { return { Notes: 'Unparseable JSON body' }; }
    }
  }
  if (e.parameter) return e.parameter;
  return {};
}
