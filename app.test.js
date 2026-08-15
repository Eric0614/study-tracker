// 極簡測試 runner（零依賴，Node.js 執行）
let passed = 0, failed = 0;

async function test(name, fn) {
  try {
    await fn();
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

const TIMER_STATE_KEY = 'study_timer_state';

// 與 app.js startTimer() 相同的寫法
function writeTimerState(subject, startTime, targetMinutes) {
  localStorage.setItem(TIMER_STATE_KEY, JSON.stringify({
    subject,
    startTime: startTime.toISOString(),
    targetMinutes,
  }));
}

// 與 app.js restoreTimerState() 相同的讀取邏輯（純資料部分，不含 DOM 操作）
function readTimerState() {
  const raw = localStorage.getItem(TIMER_STATE_KEY);
  if (!raw) return null;
  let saved;
  try { saved = JSON.parse(raw); } catch (e) { return null; }
  const savedStart = new Date(saved.startTime);
  if (!saved.subject || isNaN(savedStart.getTime())) return null;
  return {
    subject: saved.subject,
    startTime: savedStart,
    targetMinutes: (typeof saved.targetMinutes === 'number' && saved.targetMinutes > 0)
      ? saved.targetMinutes : null,
  };
}

function computeDuration(startTime, endTime) {
  return Math.round((endTime - startTime) / 60000);
}

// ── isSaving guard（模擬 stopTimer 的核心邏輯）──
function makeSaveGuard() {
  let isSaving = false;
  let saveCallCount = 0;

  async function stopTimer(isRunning) {
    if (!isRunning) return 'not_running';
    if (isSaving) return 'already_saving';
    isSaving = true;
    try {
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

await test('計時中才能停止，非計時中呼叫是 no-op', async () => {
  const g = makeSaveGuard();
  const result = await g.stopTimer(false);
  expect(result).toBe('not_running');
  expect(g.getSaveCount()).toBe(0);
});

await test('正常停止一次只 saveRecord 一次', async () => {
  const g = makeSaveGuard();
  await g.stopTimer(true);
  expect(g.getSaveCount()).toBe(1);
});

await test('連續兩次 stopTimer 只觸發一次 save（isSaving guard）', async () => {
  const g = makeSaveGuard();
  const [r1, r2] = await Promise.all([g.stopTimer(true), g.stopTimer(true)]);
  expect(g.getSaveCount()).toBe(1);
  const results = [r1, r2].sort();
  expect(results[0]).toBe('already_saving');
  expect(results[1]).toBe('saved');
});

// ════════════════════════════════════════════════
// Seam 2：Timer state persistence（生產格式）
// ════════════════════════════════════════════════
console.log('\nSeam 2: Timer state persistence (TIMER_STATE_KEY JSON)');

await test('writeTimerState 寫入後 readTimerState 能還原科目', async () => {
  const t = new Date('2026-08-15T10:00:00Z');
  writeTimerState('數學', t, null);
  const state = readTimerState();
  expect(state.subject).toBe('數學');
});

await test('readTimerState 還原後 startTime 仍在過去（不是重置成現在）', async () => {
  const past = new Date(Date.now() - 5 * 60 * 1000);
  writeTimerState('英文', past, null);
  const state = readTimerState();
  expect(state.startTime.getTime()).toBeLessThan(Date.now());
});

await test('targetMinutes 正確往返序列化', async () => {
  writeTimerState('國文', new Date(), 45);
  const state = readTimerState();
  expect(state.targetMinutes).toBe(45);
});

await test('targetMinutes 為 null 時讀回也是 null', async () => {
  writeTimerState('社會', new Date(), null);
  const state = readTimerState();
  expect(state.targetMinutes).toBe(null);
});

await test('localStorage 清空後 readTimerState 回傳 null', async () => {
  localStorage.removeItem(TIMER_STATE_KEY);
  const state = readTimerState();
  expect(state).toBe(null);
});

// ════════════════════════════════════════════════
// Seam 3：computeDuration 精確度
// ════════════════════════════════════════════════
console.log('\nSeam 3: computeDuration');

await test('剛好 60 秒 → 1 分鐘', async () => {
  expect(computeDuration(new Date(0), new Date(60 * 1000))).toBe(1);
});

await test('59 秒 → round 成 1 分鐘', async () => {
  expect(computeDuration(new Date(0), new Date(59 * 1000))).toBe(1);
});

await test('29 秒 → round 成 0 分鐘（不記錄）', async () => {
  expect(computeDuration(new Date(0), new Date(29 * 1000))).toBe(0);
});

// ── 結果 ─────────────────────────────────────────
console.log(`\n結果：${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
