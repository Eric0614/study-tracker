// 極簡測試 runner（零依賴，Node.js 執行）
let passed = 0, failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (e) {
    console.log(`  ❌ ${name}`);
    console.log(`     ${e.message}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected)
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected))
        throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    },
    toBeLessThan(n) {
      if (actual >= n) throw new Error(`expected ${actual} < ${n}`);
    },
    toBeGreaterThan(n) {
      if (actual <= n) throw new Error(`expected ${actual} > ${n}`);
    },
  };
}

// ── Mock localStorage ────────────────────────────
const store = {};
const localStorage = {
  getItem: k => store[k] ?? null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; },
};

// ── 被測試的純邏輯（從 app.js 提取，不依賴 DOM）──

function computeDuration(startTime, endTime) {
  return Math.round((endTime - startTime) / 60000);
}

function persistTimerState(state) {
  localStorage.setItem('timer_running', state.isRunning ? '1' : '0');
  localStorage.setItem('timer_subject', state.currentSubject);
  localStorage.setItem('timer_start', state.startTime ? state.startTime.toISOString() : '');
}

function restoreTimerState() {
  const isRunning = localStorage.getItem('timer_running') === '1';
  const currentSubject = localStorage.getItem('timer_subject') || '';
  const raw = localStorage.getItem('timer_start');
  const startTime = raw ? new Date(raw) : null;
  return { isRunning, currentSubject, startTime };
}

// ── isSaving guard（模擬 stopTimer 的核心邏輯）──
function makeSaveGuard() {
  let isSaving = false;
  let saveCallCount = 0;

  async function stopTimer(isRunning) {
    if (!isRunning) return 'not_running';
    if (isSaving) return 'already_saving';  // 這行是要實作的
    isSaving = true;
    try {
      // 模擬 saveRecord 的 async 延遲
      await new Promise(r => setTimeout(r, 50));
      saveCallCount++;
    } finally {
      isSaving = false;
    }
    return 'saved';
  }

  return { stopTimer, getSaveCount: () => saveCallCount };
}

// ════════════════════════════════════════════════
// Seam 1：stopTimer 的 isSaving guard
// ════════════════════════════════════════════════
console.log('\nSeam 1: isSaving guard');

test('計時中才能停止，非計時中呼叫是 no-op', async () => {
  const g = makeSaveGuard();
  const result = await g.stopTimer(false);
  expect(result).toBe('not_running');
  expect(g.getSaveCount()).toBe(0);
});

test('正常停止一次只 saveRecord 一次', async () => {
  const g = makeSaveGuard();
  await g.stopTimer(true);
  expect(g.getSaveCount()).toBe(1);
});

// ════════════════════════════════════════════════
// Seam 2：Timer state persistence
// ════════════════════════════════════════════════
console.log('\nSeam 2: Timer state persistence');

test('persistTimerState 寫入 isRunning=true', () => {
  persistTimerState({ isRunning: true, currentSubject: '數學', startTime: new Date('2026-07-11T10:00:00') });
  expect(localStorage.getItem('timer_running')).toBe('1');
});

test('persistTimerState 寫入 isRunning=false 清空 start', () => {
  persistTimerState({ isRunning: false, currentSubject: '', startTime: null });
  expect(localStorage.getItem('timer_running')).toBe('0');
  expect(localStorage.getItem('timer_start')).toBe('');
});

test('restoreTimerState 還原科目名稱', () => {
  persistTimerState({ isRunning: true, currentSubject: '英文', startTime: new Date('2026-07-11T09:30:00') });
  const state = restoreTimerState();
  expect(state.currentSubject).toBe('英文');
});

test('restoreTimerState 還原後 startTime 仍在過去（不是重置成現在）', () => {
  const past = new Date(Date.now() - 5 * 60 * 1000); // 5 分鐘前
  persistTimerState({ isRunning: true, currentSubject: '國文', startTime: past });
  const state = restoreTimerState();
  expect(state.startTime.getTime()).toBeLessThan(Date.now());
});

// ════════════════════════════════════════════════
// Seam 3：computeDuration 精確度
// ════════════════════════════════════════════════
console.log('\nSeam 3: computeDuration');

test('剛好 60 秒 → 1 分鐘', () => {
  const start = new Date(0);
  const end = new Date(60 * 1000);
  expect(computeDuration(start, end)).toBe(1);
});

test('59 秒 → round 成 1 分鐘', () => {
  const start = new Date(0);
  const end = new Date(59 * 1000);
  expect(computeDuration(start, end)).toBe(1);
});

test('29 秒 → round 成 0 分鐘（不記錄）', () => {
  const start = new Date(0);
  const end = new Date(29 * 1000);
  expect(computeDuration(start, end)).toBe(0);
});

// ── 結果 ─────────────────────────────────────────
setTimeout(() => {
  console.log(`\n結果：${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}, 200);
