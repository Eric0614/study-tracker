var SUBJECT_SHEET_NAME = '科目清單';
var RECORD_SHEET_NAME = '唸書記錄';

var DEFAULT_SUBJECTS = [
  '國文',
  '英文',
  '數學',
  '自然',
  '社會'
];

var RECORD_HEADERS = [
  '使用者',
  '科目',
  '開始時間',
  '結束時間',
  '持續分鐘',
  '日期'
];

/**
 * GET API
 *
 * 讀取科目：
 * ?action=getSubjects
 *
 * 讀取紀錄：
 * ?action=getRecords&user=Eric
 *
 * 為了相容舊前端，也支援：
 * ?action=addRecord&data={JSON}
 * ?action=saveSubjects&subjects=[JSON]
 */
function doGet(e) {
  return executeRequest(function () {
    var params = e && e.parameter ? e.parameter : {};
    var action = normalizeText(params.action);

    console.log('GET action: ' + action);
    console.log('GET parameters: ' + JSON.stringify(params));

    if (action === 'getSubjects') {
      return getSubjects();
    }

    if (action === 'getRecords') {
      return getRecords(params.user);
    }

    /*
     * 相容原本以 GET 寫入資料的前端。
     * 未來前端全部改成 POST 後可以移除這兩段。
     */
    if (action === 'addRecord') {
      return addRecord(parseJson(params.data, 'data'));
    }

    if (action === 'saveSubjects') {
      return saveSubjects(
        parseJson(params.subjects, 'subjects')
      );
    }

    throw new Error('未知或缺少 action，收到：' + action);
  });
}

/**
 * POST API
 *
 * 新增紀錄：
 * {
 *   "action": "addRecord",
 *   "data": {
 *     "user": "Eric",
 *     "subject": "數學",
 *     "start": "08:00",
 *     "end": "09:00",
 *     "duration": 60,
 *     "date": "2026-07-20"
 *   }
 * }
 *
 * 儲存科目：
 * {
 *   "action": "saveSubjects",
 *   "subjects": ["國文", "英文", "數學"]
 * }
 */
function doPost(e) {
  return executeRequest(function () {
    var request = parseIncomingRequest(e);
    var action = normalizeText(request.action);

    console.log('POST action: ' + action);
    console.log('POST request: ' + JSON.stringify(request));

    if (action === 'addRecord') {
      return addRecord(request.data || request);
    }

    if (action === 'saveSubjects') {
      return saveSubjects(request.subjects);
    }

    throw new Error('未知或缺少 action，收到：' + action);
  });
}

/**
 * 統一執行與錯誤處理。
 */
function executeRequest(callback) {
  try {
    var result = callback();

    if (!result || typeof result !== 'object') {
      result = {};
    }

    result.ok = true;
    return respond(result);
  } catch (error) {
    var message = error && error.message
      ? error.message
      : String(error);

    console.error(message);

    if (error && error.stack) {
      console.error(error.stack);
    }

    return respond({
      ok: false,
      error: message
    });
  }
}

/**
 * 解析 POST 請求。
 *
 * 支援：
 * 1. JSON body
 * 2. 表單參數
 * 3. action + data 參數
 */
function parseIncomingRequest(e) {
  if (!e) {
    throw new Error('沒有收到 POST 請求資料');
  }

  var params = e.parameter || {};
  var content = '';

  if (e.postData && e.postData.contents) {
    content = e.postData.contents;
  }

  /*
   * 優先嘗試解析完整 JSON body。
   */
  if (content) {
    try {
      var jsonBody = JSON.parse(content);

      if (
        jsonBody &&
        typeof jsonBody === 'object' &&
        !Array.isArray(jsonBody)
      ) {
        return jsonBody;
      }
    } catch (error) {
      console.log(
        'POST body 不是完整 JSON，改用表單參數解析'
      );
    }
  }

  var result = {
    action: params.action || ''
  };

  if (params.data) {
    result.data = parseJson(params.data, 'data');
  }

  if (params.subjects) {
    result.subjects = parseJson(
      params.subjects,
      'subjects'
    );
  }

  return result;
}

/**
 * 安全解析 JSON 字串。
 */
function parseJson(value, name) {
  if (value === null || value === undefined || value === '') {
    throw new Error('缺少 ' + name);
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(name + ' 不是有效的 JSON');
  }
}

/**
 * 取得目前綁定的 Google 試算表。
 *
 * 此 Apps Script 必須從目標試算表的：
 * 擴充功能 → Apps Script
 * 建立或開啟。
 */
function getSpreadsheet() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();

  if (!spreadsheet) {
    throw new Error(
      '找不到綁定的試算表。請確認程式是從目標試算表的「擴充功能 → Apps Script」建立。'
    );
  }

  return spreadsheet;
}

/**
 * 取得科目清單。
 */
function getSubjects() {
  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(
    SUBJECT_SHEET_NAME
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      subjects: DEFAULT_SUBJECTS.slice()
    };
  }

  var rowCount = sheet.getLastRow() - 1;
  var rows = sheet
    .getRange(2, 1, rowCount, 1)
    .getDisplayValues();

  var subjects = [];

  for (var i = 0; i < rows.length; i++) {
    var subject = normalizeText(rows[i][0]);

    if (
      subject &&
      subjects.indexOf(subject) === -1
    ) {
      subjects.push(subject);
    }
  }

  if (subjects.length === 0) {
    subjects = DEFAULT_SUBJECTS.slice();
  }

  return {
    subjects: subjects
  };
}

/**
 * 儲存科目清單。
 */
function saveSubjects(subjects) {
  if (!Array.isArray(subjects)) {
    throw new Error('subjects 必須是陣列');
  }

  var cleanedSubjects = [];

  for (var i = 0; i < subjects.length; i++) {
    var subject = normalizeText(subjects[i]);

    if (!subject) {
      continue;
    }

    if (subject.length > 100) {
      throw new Error(
        '科目名稱不能超過 100 個字元'
      );
    }

    if (
      cleanedSubjects.indexOf(subject) === -1
    ) {
      cleanedSubjects.push(subject);
    }
  }

  if (cleanedSubjects.length > 100) {
    throw new Error('科目數量不能超過 100 個');
  }

  var lock = LockService.getScriptLock();
  var locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var spreadsheet = getSpreadsheet();
    var sheet = spreadsheet.getSheetByName(
      SUBJECT_SHEET_NAME
    );

    if (!sheet) {
      sheet = spreadsheet.insertSheet(
        SUBJECT_SHEET_NAME
      );
    }

    /*
     * 鎖定科目名稱欄為純文字，避免像 "1/2" 這種科目名稱
     * 被 Sheets 誤判成日期。
     */
    sheet.getRange('A:A').setNumberFormat('@');

    /*
     * 只清除 A 欄，避免影響其他欄位。
     */
    var rowsToClear = Math.max(
      sheet.getLastRow(),
      1
    );

    sheet
      .getRange(1, 1, rowsToClear, 1)
      .clearContent();

    sheet
      .getRange(1, 1)
      .setValue('科目名稱');

    if (cleanedSubjects.length > 0) {
      var values = [];

      for (
        var j = 0;
        j < cleanedSubjects.length;
        j++
      ) {
        values.push([cleanedSubjects[j]]);
      }

      sheet
        .getRange(2, 1, values.length, 1)
        .setValues(values);
    }

    SpreadsheetApp.flush();

    return {
      subjects: cleanedSubjects,
      count: cleanedSubjects.length
    };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

/**
 * 新增一筆讀書紀錄。
 */
function addRecord(data) {
  var record = validateRecord(data);
  var lock = LockService.getScriptLock();
  var locked = false;

  try {
    lock.waitLock(10000);
    locked = true;

    var spreadsheet = getSpreadsheet();
    var sheet = spreadsheet.getSheetByName(
      RECORD_SHEET_NAME
    );

    if (!sheet) {
      sheet = spreadsheet.insertSheet(
        RECORD_SHEET_NAME
      );
    }

    ensureRecordHeader(sheet);

    sheet.appendRow([
      record.user,
      record.subject,
      record.start,
      record.end,
      record.duration,
      record.date
    ]);

    /*
     * 確保變更立即寫入試算表。
     */
    SpreadsheetApp.flush();

    console.log(
      '新增紀錄成功：' + JSON.stringify(record)
    );

    return {
      record: record
    };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

/**
 * 查詢指定使用者的全部讀書紀錄。
 */
function getRecords(user) {
  var targetUser = normalizeText(user);

  if (!targetUser) {
    throw new Error('缺少 user 參數');
  }

  var spreadsheet = getSpreadsheet();
  var sheet = spreadsheet.getSheetByName(
    RECORD_SHEET_NAME
  );

  if (!sheet || sheet.getLastRow() < 2) {
    return {
      records: []
    };
  }

  var rowCount = sheet.getLastRow() - 1;
  var rows = sheet
    .getRange(2, 1, rowCount, 6)
    .getValues();

  var records = [];

  for (var i = 0; i < rows.length; i++) {
    var rowUser = normalizeText(rows[i][0]);
    var subject = normalizeText(rows[i][1]);

    if (
      rowUser !== targetUser ||
      !subject
    ) {
      continue;
    }

    records.push({
      user: rowUser,
      subject: subject,
      start: formatTime(rows[i][2]),
      end: formatTime(rows[i][3]),
      duration: toNumber(rows[i][4]),
      date: formatDate(rows[i][5])
    });
  }

  return {
    records: records
  };
}

/**
 * 驗證及標準化新增紀錄。
 */
function validateRecord(data) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data)
  ) {
    throw new Error('data 必須是物件');
  }

  var user = normalizeText(data.user);
  var subject = normalizeText(data.subject);
  var start = normalizeTime(data.start);
  var end = normalizeTime(data.end);
  var date = normalizeDate(data.date);
  var duration = Math.round(Number(data.duration));

  if (!user) {
    throw new Error('使用者名稱不能為空');
  }

  if (!subject) {
    throw new Error('科目不能為空');
  }

  if (user.length > 100) {
    throw new Error(
      '使用者名稱不能超過 100 個字元'
    );
  }

  if (subject.length > 100) {
    throw new Error(
      '科目名稱不能超過 100 個字元'
    );
  }

  if (!start) {
    throw new Error(
      '開始時間格式錯誤，收到：' +
      String(data.start)
    );
  }

  if (!end) {
    throw new Error(
      '結束時間格式錯誤，收到：' +
      String(data.end)
    );
  }

  if (!isFinite(duration) || duration < 0) {
    throw new Error(
      '持續分鐘格式錯誤，收到：' +
      String(data.duration)
    );
  }

  if (!date) {
    throw new Error(
      '日期格式錯誤，收到：' +
      String(data.date)
    );
  }

  return {
    user: user,
    subject: subject,
    start: start,
    end: end,
    duration: duration,
    date: date
  };
}

/**
 * 鎖定時間/日期欄位為純文字。
 *
 * Sheets 在 setValue/appendRow 寫入 "08:00"、"2026-07-20"
 * 這類字串時，會自動解析成日期／時間序號（跟手動在儲存格打字
 * 效果一樣）。之後用 getValues() 讀回來的 Date 物件，其時區是
 * 「指令碼專案的時區」，但 formatTime/formatDate 卻是用「試算表
 * 的時區」重新格式化——兩者只要設定不同，時間就會跑掉。
 *
 * 把這幾欄鎖成純文字格式，Sheets 就不會做任何日期解析，寫進去
 * 什麼字串、讀出來就是同一個字串，直接避開時區問題。
 */
function ensureRecordColumnFormats(sheet) {
  sheet.getRange('C:D').setNumberFormat('@'); // 開始時間、結束時間
  sheet.getRange('F:F').setNumberFormat('@'); // 日期
}

/**
 * 確認紀錄工作表有標題列。
 */
function ensureRecordHeader(sheet) {
  ensureRecordColumnFormats(sheet);

  if (sheet.getLastRow() === 0) {
    sheet
      .getRange(1, 1, 1, RECORD_HEADERS.length)
      .setValues([RECORD_HEADERS]);

    return;
  }

  var currentHeaders = sheet
    .getRange(1, 1, 1, RECORD_HEADERS.length)
    .getDisplayValues()[0];

  var isEmpty = true;

  for (
    var i = 0;
    i < currentHeaders.length;
    i++
  ) {
    if (normalizeText(currentHeaders[i])) {
      isEmpty = false;
      break;
    }
  }

  if (isEmpty) {
    sheet
      .getRange(1, 1, 1, RECORD_HEADERS.length)
      .setValues([RECORD_HEADERS]);
  }
}

/**
 * 標準化前端傳入的時間。
 *
 * 支援：
 * 08:30
 * 8:30
 * 08:30:00
 */
function normalizeTime(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      getTimeZone(),
      'HH:mm'
    );
  }

  var text = normalizeText(value);
  var match = text.match(
    /^(\d{1,2}):(\d{2})(?::\d{2})?$/
  );

  if (!match) {
    return '';
  }

  var hour = Number(match[1]);
  var minute = Number(match[2]);

  if (
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return '';
  }

  return (
    padTwoDigits(hour) +
    ':' +
    padTwoDigits(minute)
  );
}

/**
 * 標準化前端傳入的日期。
 *
 * 支援：
 * 2026-07-20
 * 2026-7-20
 * JavaScript Date
 */
function normalizeDate(value) {
  if (
    Object.prototype.toString.call(value) ===
      '[object Date]' &&
    !isNaN(value.getTime())
  ) {
    return Utilities.formatDate(
      value,
      getTimeZone(),
      'yyyy-MM-dd'
    );
  }

  var text = normalizeText(value);
  var match = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})$/
  );

  if (!match) {
    return '';
  }

  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);

  var testDate = new Date(
    Date.UTC(year, month - 1, day)
  );

  if (
    testDate.getUTCFullYear() !== year ||
    testDate.getUTCMonth() !== month - 1 ||
    testDate.getUTCDate() !== day
  ) {
    return '';
  }

  return (
    year +
    '-' +
    padTwoDigits(month) +
    '-' +
    padTwoDigits(day)
  );
}

/**
 * 格式化從試算表讀出的時間。
 */
function formatTime(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  var normalized = normalizeTime(value);

  if (normalized) {
    return normalized;
  }

  return normalizeText(value);
}

/**
 * 格式化從試算表讀出的日期。
 */
function formatDate(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  var normalized = normalizeDate(value);

  if (normalized) {
    return normalized;
  }

  return normalizeText(value);
}

/**
 * 取得試算表時區。
 */
function getTimeZone() {
  return (
    getSpreadsheet().getSpreadsheetTimeZone() ||
    Session.getScriptTimeZone() ||
    'Asia/Taipei'
  );
}

/**
 * 文字標準化。
 */
function normalizeText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return '';
  }

  return String(value).trim();
}

/**
 * 數字標準化。
 */
function toNumber(value) {
  var number = Number(value);

  if (!isFinite(number)) {
    return 0;
  }

  return number;
}

/**
 * 數字補零。
 */
function padTwoDigits(value) {
  var text = String(value);

  return text.length < 2
    ? '0' + text
    : text;
}

/**
 * 回傳 JSON。
 */
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 手動測試新增紀錄。
 *
 * 在 Apps Script 編輯器選取 testAddRecord，
 * 按「執行」，即可確認試算表寫入功能。
 */
function testAddRecord() {
  var result = addRecord({
    user: '測試使用者',
    subject: '測試科目',
    start: '08:00',
    end: '09:00',
    duration: 60,
    date: Utilities.formatDate(
      new Date(),
      getTimeZone(),
      'yyyy-MM-dd'
    )
  });

  console.log(JSON.stringify(result));
}

/**
 * 手動測試讀取紀錄。
 */
function testGetRecords() {
  var result = getRecords('測試使用者');
  console.log(JSON.stringify(result));
}

/**
 * 手動測試 doGet（模擬 HTTP GET 事件）。
 *
 * 直接在編輯器執行 doGet 本身會因為沒有真正的 HTTP 請求、
 * e.parameter 是空物件而出現「未知或缺少 action」錯誤，這是
 * 正常現象、不是 bug。要測試 doGet 的路由邏輯，請改執行這個函式。
 */
function testDoGet() {
  var result = doGet({
    parameter: { action: 'getSubjects' }
  });
  console.log(result.getContent());
}

/**
 * 手動測試 doPost（模擬 HTTP POST 事件）。
 */
function testDoPost() {
  var result = doPost({
    parameter: {
      action: 'addRecord',
      data: JSON.stringify({
        user: '測試使用者',
        subject: '測試科目',
        start: '08:00',
        end: '09:00',
        duration: 60,
        date: Utilities.formatDate(
          new Date(),
          getTimeZone(),
          'yyyy-MM-dd'
        )
      })
    }
  });
  console.log(result.getContent());
}
