/**
 * MSpace AI Resume Builder — Leads inbox
 *
 * Sheet URL: https://docs.google.com/spreadsheets/d/1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc/edit
 * Spreadsheet ID: 1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc
 * Owner: antenesclyde@gmail.com
 *
 * Deploy → New deployment → Web app
 *   Execute as: Me
 *   Who has access: Anyone
 * Then paste the /exec URL into config.js as window.MSPACE_SHEETS_WEBHOOK.
 *
 * Works container-bound or as a standalone script (openById).
 */

var SPREADSHEET_ID = '1UJOaMKz2GjQEBzzaxeFAgczv6RjHijYAiDmHvO3IOyc';
var SHEET_NAME = 'Leads';

var HEADERS = [
  'Timestamp',
  'Name',
  'Role',
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
  'Hours',
  'Shift',
  'Tools',
  'English',
  'Rate',
  'Source',
  'Notes',
  'Consent'
];

function getSheet_() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
  }
  ensureHeaders_(sh);
  return sh;
}

function ensureHeaders_(sh) {
  var lastCol = HEADERS.length;
  var range = sh.getRange(1, 1, 1, lastCol);
  var values = range.getValues()[0];
  var empty = true;
  for (var i = 0; i < values.length; i++) {
    if (String(values[i]).length) {
      empty = false;
      break;
    }
  }
  if (empty) {
    range.setValues([HEADERS]);
    sh.setFrozenRows(1);
    return;
  }
  for (var h = 0; h < HEADERS.length; h++) {
    if (String(values[h]) !== HEADERS[h]) {
      range.setValues([HEADERS]);
      sh.setFrozenRows(1);
      return;
    }
  }
}

function jsonOut_(obj, code) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
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
      return String(v);
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
    var type = (e.postData.type || '').toLowerCase();
    var raw = e.postData.contents;
    if (type.indexOf('json') !== -1 || (raw && raw.charAt(0) === '{')) {
      try {
        return JSON.parse(raw);
      } catch (err) {
        return { Notes: 'Unparseable JSON body' };
      }
    }
    if (e.parameter && Object.keys(e.parameter).length) {
      return e.parameter;
    }
  }
  if (e.parameter) return e.parameter;
  return {};
}
