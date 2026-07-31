// ── State ──────────────────────────────────────
let isRunning = false;
let startTime = null;
let timerInterval = null;
let currentSubject = '';
let currentReportType = 'day';
let subjects = [];
let allRecords = [];
let weeklyGoalMinutes = null;   // null = 尚未設定（或尚未載入）
let weeklyGoalLoaded = false;   // 是否已完成第一次向後端取值
let weekActualMinutes = 0;      // 本週累積分鐘，與週報表使用同一份資料計算

// ── API ─────────────────────────────────────────
async function apiGet(params) {
  const url = new URL(CONFIG.SCRIPT_URL);
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
  const resp = await fetch(url.toString());
  return resp.json();
}

async function apiWrite(action, paramKey, data) {
  const body = new URLSearchParams();
  body.append('action', action);
  body.append(paramKey, JSON.stringify(data));
  const resp = await fetch(CONFIG.SCRIPT_URL, {
    method: 'POST',
    body: body,
  });
  const result = await resp.json();
  if (!result.ok) throw new Error(result.error || '寫入失敗');
  return result;
}

// ── Init ────────────────────────────────────────
window.addEventListener('load', async () => {
  checkUserName();
  await loadSubjects();
  await loadTodayRecords();
});

// ── User Name ───────────────────────────────────
function checkUserName() {
  const name = localStorage.getItem('study_user_name');
  if (!name) {
    document.getElementById('name-modal').style.display = 'flex';
    setTimeout(() => document.getElementById('name-input').focus(), 100);
  } else {
    document.getElementById('name-modal').style.display = 'none';
    document.getElementById('user-badge').textContent = '👤 ' + name;
  }
}

async function saveName() {
  const name = document.getElementById('name-input').value.trim();
  if (!name) { showToast('請輸入名字'); return; }
  localStorage.setItem('study_user_name', name);
  document.getElementById('name-modal').style.display = 'none';
  document.getElementById('user-badge').textContent = '👤 ' + name;
  await loadSubjects();
  await loadTodayRecords();
  // 換了使用者，週目標要重新以新使用者身分載入；等 allRecords 換成新使用者的資料後才計算，避免進度條短暫顯示舊使用者的數字
  weeklyGoalLoaded = false;
  weeklyGoalMinutes = null;
  await loadWeeklyGoal();
}

function changeName() {
  document.getElementById('name-input').value = localStorage.getItem('study_user_name') || '';
  document.getElementById('name-modal').style.display = 'flex';
}

function getUserName() {
  return localStorage.getItem('study_user_name') || '未知';
}

// ── Pages & Tabs ────────────────────────────────
function showPage(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'report') loadReport(currentReportType);
  if (name === 'subjects') renderSubjectChips();
}

// ── Timer ────────────────────────────────────────
function toggleTimer() {
  if (isRunning) stopTimer(); else startTimer();
}

function startTimer() {
  const select = document.getElementById('subject-select');
  if (!select.value) { showToast('請先選擇科目'); return; }
  currentSubject = select.value;
  startTime = new Date();
  isRunning = true;
  document.getElementById('timer-subject-label').textContent = currentSubject;
  document.getElementById('main-btn').innerHTML = '⏹&nbsp; 停止';
  document.getElementById('main-btn').className = 'timer-btn stop';
  document.getElementById('subject-select').disabled = true;
  document.getElementById('circle-timer').classList.add('running');
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

async function stopTimer() {
  if (!isRunning) return;
  clearInterval(timerInterval);
  isRunning = false;
  const endTime = new Date();
  const durationMin = Math.round((endTime - startTime) / 60000);
  if (durationMin < 1) {
    showToast('計時不足 1 分鐘，不記錄');
  } else {
    await saveRecord(currentSubject, startTime, endTime, durationMin);
  }
  document.getElementById('timer-display').textContent = '00:00:00';
  document.getElementById('timer-subject-label').textContent = '選擇科目開始';
  document.getElementById('main-btn').innerHTML = '▶&nbsp; 開始唸書';
  document.getElementById('main-btn').className = 'timer-btn start';
  document.getElementById('subject-select').disabled = false;
  document.getElementById('circle-timer').classList.remove('running');
  document.getElementById('circle-progress').style.strokeDashoffset = 565;
  startTime = null;
  currentSubject = '';
}

function updateTimerDisplay() {
  const elapsed = Math.floor((new Date() - startTime) / 1000);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  document.getElementById('timer-display').textContent =
    String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  // Progress ring: 1 full rotation = 60 min
  const circumference = 565;
  const progress = Math.min((elapsed % 3600) / 3600, 1);
  const offset = circumference * (1 - progress);
  document.getElementById('circle-progress').style.strokeDashoffset = offset;
}

// ── Subjects ─────────────────────────────────────
async function loadSubjects() {
  try {
    const data = await apiGet({ action: 'getSubjects' });
    subjects = data.subjects || [];
  } catch (e) {
    subjects = ['國文','英文','數學','自然','社會'];
  }
  renderSubjectSelect();
  renderSubjectChips();
}

function renderSubjectSelect() {
  const sel = document.getElementById('subject-select');
  const prev = sel.value;
  sel.innerHTML = '<option value="">── 選擇科目 ──</option>';
  subjects.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s; opt.textContent = s;
    sel.appendChild(opt);
  });
  if (prev) sel.value = prev;
}

function renderSubjectChips() {
  const el = document.getElementById('subject-chips');
  if (!el) return;
  if (subjects.length === 0) {
    el.innerHTML = '<p class="empty-msg">還沒有科目，請新增</p>';
    return;
  }
  el.innerHTML = '';
  subjects.forEach((s, i) => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `<span>${s}</span><button class="chip-del" onclick="deleteSubject(${i})">✕</button>`;
    el.appendChild(chip);
  });
}

async function addSubject() {
  const input = document.getElementById('new-subject-input');
  const name = input.value.trim();
  if (!name) { showToast('請輸入科目名稱'); return; }
  if (subjects.includes(name)) { showToast('科目已存在'); return; }
  subjects.push(name);
  input.value = '';
  await apiWrite('saveSubjects', 'subjects', subjects);
  renderSubjectSelect();
  renderSubjectChips();
  showToast('✅ 已新增：' + name);
}

async function deleteSubject(index) {
  if (!confirm(`確定要刪除「${subjects[index]}」嗎？`)) return;
  const name = subjects[index];
  subjects.splice(index, 1);
  await apiWrite('saveSubjects', 'subjects', subjects);
  renderSubjectSelect();
  renderSubjectChips();
  showToast('已刪除：' + name);
}

// ── Records ──────────────────────────────────────
async function saveRecord(subject, start, end, durationMin) {
  showToast('儲存中...');
  try {
    await apiWrite('addRecord', 'data', {
      user: getUserName(),
      subject,
      start: formatTime(start),
      end: formatTime(end),
      duration: durationMin,
      date: formatDate(start),
    });
    showToast(`✅ 已記錄：${subject} ${durationMin} 分鐘`);
    setTimeout(loadTodayRecords, 1500);
  } catch (e) {
    showToast('❌ 儲存失敗，請重試');
    console.error(e);
  }
}

async function loadAllRecords() {
  try {
    const data = await apiGet({ action: 'getRecords', user: getUserName() });
    allRecords = (data.records || []).map(r => ({
      ...r,
      duration: Number(r.duration) || 0,
      date: String(r.date),
    }));
  } catch (e) {
    allRecords = [];
  }
}

async function loadTodayRecords() {
  await loadAllRecords();
  const today = formatDate(new Date());
  const todayRecords = allRecords.filter(r => r.date === today);
  const bySubject = {};
  todayRecords.forEach(r => { bySubject[r.subject] = (bySubject[r.subject] || 0) + r.duration; });
  const list = document.getElementById('today-list');
  if (Object.keys(bySubject).length === 0) {
    list.innerHTML = '<li class="empty-msg">今天還沒有記錄</li>';
    return;
  }
  const colors = ['#a78bfa','#34d399','#fbbf24','#f87171','#60a5fa','#f472b6','#4ade80'];
  list.innerHTML = '';
  Object.entries(bySubject).sort((a,b) => b[1]-a[1]).forEach(([subj, mins], i) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="subj-left">
        <span class="subj-dot" style="background:${colors[i % colors.length]}"></span>
        <span class="subj-name">${subj}</span>
      </span>
      <span class="subj-duration">${formatDuration(mins)}</span>`;
    list.appendChild(li);
  });
}

// ── Report ───────────────────────────────────────
function switchReport(type, btn) {
  currentReportType = type;
  document.querySelectorAll('.report-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('goal-card').style.display = (type === 'week') ? 'block' : 'none';
  loadReport(type);
}

async function loadReport(type) {
  document.getElementById('report-content').innerHTML = '<p class="loading-msg">載入中...</p>';
  await loadAllRecords();
  const now = new Date();

  let filtered = [];
  if (type === 'day') {
    const days = Array.from({length:7}, (_,i) => {
      const d = new Date(now); d.setDate(d.getDate()-i); return formatDate(d);
    });
    filtered = allRecords.filter(r => days.includes(r.date));
    renderReportTable(filtered, 'date');
  } else if (type === 'week') {
    const weekStart = getWeekStart(now);
    filtered = allRecords.filter(r => { const d = parseDate(r.date); return d >= weekStart && d <= now; });
    renderReportTable(filtered, 'week');
    // 週目標卡片必須沿用同一份 filtered 資料/同一個週起訖定義，避免跟下方報表數字對不上
    await loadWeeklyGoal();
  } else {
    const monthStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    filtered = allRecords.filter(r => r.date && String(r.date).startsWith(monthStr));
    renderReportTable(filtered, 'month');
  }
}

// ── Weekly Goal ──────────────────────────────────
async function loadWeeklyGoal() {
  try {
    const data = await apiGet({ action: 'getWeeklyGoal', user: getUserName() });
    weeklyGoalMinutes = (data.goalMinutes === undefined) ? null : data.goalMinutes;
  } catch (e) {
    weeklyGoalMinutes = null;
    console.error(e);
  }
  weeklyGoalLoaded = true;
  renderGoalCard();
}

function computeWeekActualMinutes() {
  // 沿用 loadReport 對「本週」的同一套篩選邏輯（getWeekStart + allRecords），避免另外重算導致數字對不上
  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekRecords = allRecords.filter(r => { const d = parseDate(r.date); return d >= weekStart && d <= now; });
  return weekRecords.reduce((sum, r) => sum + r.duration, 0);
}

function renderGoalCard() {
  const el = document.getElementById('goal-content');
  if (!el) return;

  if (!weeklyGoalLoaded) {
    el.innerHTML = '<p class="loading-msg">載入中...</p>';
    return;
  }

  weekActualMinutes = computeWeekActualMinutes();

  if (weeklyGoalMinutes === null) {
    el.innerHTML = `
      <p class="goal-title">🎯 設定本週目標時數</p>
      <div class="goal-form-row">
        <input type="number" id="goal-hours-input" placeholder="例如 10" min="0" step="0.5"
               oninput="validateGoalInput()"
               onkeydown="if(event.key==='Enter' && !document.getElementById('goal-save-btn').disabled) handleSaveWeeklyGoal()">
        <button class="btn-add" id="goal-save-btn" onclick="handleSaveWeeklyGoal()" disabled>儲存</button>
      </div>
      <p class="goal-hint" id="goal-hint"></p>
    `;
  } else {
    const actualHours = weekActualMinutes / 60;
    const goalHours = weeklyGoalMinutes / 60;
    const pct = goalHours > 0 ? (weekActualMinutes / weeklyGoalMinutes * 100) : 0;
    const pctCapped = Math.min(Math.max(pct, 0), 100);
    el.innerHTML = `
      <div class="goal-header">
        <p class="goal-title">🎯 本週目標</p>
        <button class="goal-edit-link" onclick="showGoalForm()">重新設定</button>
      </div>
      <div class="goal-progress-track">
        <div class="goal-progress-fill" style="width:${pctCapped}%"></div>
      </div>
      <p class="goal-progress-text${pct > 100 ? ' over' : ''}">已唸 ${formatHours(actualHours)} 小時 / 目標 ${formatHours(goalHours)} 小時</p>
    `;
  }
}

function validateGoalInput() {
  const input = document.getElementById('goal-hours-input');
  const btn = document.getElementById('goal-save-btn');
  const hint = document.getElementById('goal-hint');
  if (!input || !btn || !hint) return;
  const val = parseFloat(input.value);
  if (input.value === '' ) {
    btn.disabled = true;
    hint.textContent = '';
  } else if (isNaN(val) || val <= 0) {
    btn.disabled = true;
    hint.textContent = '目標時數需大於 0';
  } else if (val > 168) {
    btn.disabled = true;
    hint.textContent = '目標時數不能超過 168 小時（一週上限）';
  } else {
    btn.disabled = false;
    hint.textContent = '';
  }
}

async function handleSaveWeeklyGoal() {
  const input = document.getElementById('goal-hours-input');
  const hours = parseFloat(input.value);
  if (!hours || hours <= 0) { showToast('目標時數需大於 0'); return; }
  if (hours > 168) { showToast('目標時數不能超過 168 小時（一週上限）'); return; }

  const btn = document.getElementById('goal-save-btn');
  btn.disabled = true;
  try {
    const result = await apiWrite('saveWeeklyGoal', 'data', {
      user: getUserName(),
      goalMinutes: Math.round(hours * 60),
    });
    weeklyGoalMinutes = result.goalMinutes;
    showToast('✅ 已設定本週目標');
    renderGoalCard();
  } catch (e) {
    showToast('❌ ' + (e.message || '設定失敗，請重試'));
    console.error(e);
    btn.disabled = false;
  }
}

function showGoalForm() {
  weeklyGoalMinutes = null;
  renderGoalCard();
}

function formatHours(h) {
  const rounded = Math.round(h * 10) / 10;
  return (rounded % 1 === 0) ? String(rounded) : rounded.toFixed(1);
}

function renderReportTable(records, groupMode) {
  const container = document.getElementById('report-content');
  if (records.length === 0) { container.innerHTML = '<p class="empty-msg">這段期間沒有記錄</p>'; return; }

  const bySubject = {};
  records.forEach(r => { bySubject[r.subject] = (bySubject[r.subject]||0) + r.duration; });

  let html = '';
  if (groupMode === 'date') {
    const byDate = {};
    records.forEach(r => {
      if (!byDate[r.date]) byDate[r.date] = {};
      byDate[r.date][r.subject] = (byDate[r.date][r.subject]||0) + r.duration;
    });
    html += `<table class="report-table"><thead><tr><th>日期</th><th>科目</th><th style="text-align:right">時數</th></tr></thead><tbody>`;
    Object.keys(byDate).sort().reverse().forEach(date => {
      Object.entries(byDate[date]).sort((a,b)=>b[1]-a[1]).forEach(([subj,mins]) => {
        html += `<tr><td class="date-cell">${date}</td><td>${subj}</td><td class="hours">${formatDuration(mins)}</td></tr>`;
      });
    });
    html += '</tbody></table>';
  } else {
    const totalMin = Object.values(bySubject).reduce((a,b)=>a+b,0);
    html += `<table class="report-table"><thead><tr><th>科目</th><th style="text-align:right">累積時數</th><th style="text-align:right">佔比</th></tr></thead><tbody>`;
    Object.entries(bySubject).sort((a,b)=>b[1]-a[1]).forEach(([subj,mins]) => {
      const pct = totalMin > 0 ? Math.round(mins/totalMin*100) : 0;
      html += `<tr><td>${subj}</td><td class="hours">${formatDuration(mins)}</td><td class="hours" style="color:#8a93a6">${pct}%</td></tr>`;
    });
    html += `<tr style="font-weight:700;border-top:2px solid #e4e8f0"><td>總計</td><td class="hours">${formatDuration(totalMin)}</td><td class="hours" style="color:#8a93a6">100%</td></tr>`;
    html += '</tbody></table>';
  }
  container.innerHTML = html;
}

// ── Helpers ──────────────────────────────────────
function formatDate(d) {
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function formatTime(d) {
  return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
}
function formatDuration(mins) {
  if (mins < 60) return mins + ' 分';
  const h = Math.floor(mins/60), m = mins%60;
  return m > 0 ? `${h} 時 ${m} 分` : `${h} 小時`;
}
function parseDate(str) {
  if (!str) return new Date(0);
  const s = String(str).trim();
  // YYYY-MM-DD
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2])-1, Number(m[3]));
  return new Date(s);
}
function getWeekStart(d) {
  const day = d.getDay();
  const diff = day === 0 ? 6 : day - 1;
  const start = new Date(d);
  start.setDate(d.getDate()-diff);
  start.setHours(0,0,0,0);
  return start;
}
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}
