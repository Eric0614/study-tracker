const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSessionRange, computeTotalMinutes, computeTargetPercent } = require('./record-format.js');

test('formatSessionRange 顯示同一天的起訖月日與時間', () => {
  const record = { date: '2026-08-04', start: '14:30', end: '15:20' };
  assert.equal(formatSessionRange(record), '8/4 14:30 → 8/4 15:20');
});

test('formatSessionRange 資料只有單一 date 欄位，跨午夜的紀錄結束端仍顯示同一天日期（已知限制）', () => {
  const record = { date: '2026-08-04', start: '23:50', end: '00:10' };
  assert.equal(formatSessionRange(record), '8/4 23:50 → 8/4 00:10');
});

test('computeTotalMinutes 加總所有紀錄的分鐘數', () => {
  const records = [{ duration: 30 }, { duration: 45 }, { duration: 10 }];
  assert.equal(computeTotalMinutes(records), 85);
});

test('computeTotalMinutes 空陣列回傳 0', () => {
  assert.equal(computeTotalMinutes([]), 0);
});

test('computeTargetPercent 算出實際分鐘數佔目標分鐘數的百分比（四捨五入）', () => {
  assert.equal(computeTargetPercent(50, 60), 83);
});

test('computeTargetPercent 剛好達成回傳 100', () => {
  assert.equal(computeTargetPercent(60, 60), 100);
});

test('computeTargetPercent 超過目標時回傳超過 100 的數字，不封頂', () => {
  assert.equal(computeTargetPercent(90, 60), 150);
});

test('computeTargetPercent 沒有設定目標（null/undefined/0）回傳 null', () => {
  assert.equal(computeTargetPercent(30, null), null);
  assert.equal(computeTargetPercent(30, undefined), null);
  assert.equal(computeTargetPercent(30, 0), null);
});
