const test = require('node:test');
const assert = require('node:assert/strict');
const { formatSessionRange, computeTotalMinutes } = require('./record-format.js');

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
