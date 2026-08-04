(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    Object.assign(root, factory());
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  function formatSessionRange(record) {
    var parts = String(record.date).split('-');
    var dateLabel = Number(parts[1]) + '/' + Number(parts[2]);
    return dateLabel + ' ' + record.start + ' → ' + dateLabel + ' ' + record.end;
  }

  function computeTotalMinutes(records) {
    return records.reduce(function (sum, r) { return sum + r.duration; }, 0);
  }

  function computeTargetPercent(durationMinutes, targetMinutes) {
    if (!targetMinutes) return null;
    return Math.round(durationMinutes / targetMinutes * 100);
  }

  return {
    formatSessionRange: formatSessionRange,
    computeTotalMinutes: computeTotalMinutes,
    computeTargetPercent: computeTargetPercent
  };
});
