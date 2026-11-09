// Percentiles and medians. Deterministic helpers only, so every number in a report comes from code.
export function quantile(sorted, q) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}
export function summarize(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0 };
  const sum = v.reduce((a, b) => a + b, 0);
  return { n: v.length, p50: quantile(v, 0.5), p95: quantile(v, 0.95), p99: quantile(v, 0.99), max: v[v.length - 1], mean: sum / v.length, sum };
}
export function shareOver(values, t) {
  const v = values.filter((x) => Number.isFinite(x));
  return v.length ? v.filter((x) => x > t).length / v.length : null;
}
export function median(xs) {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
// Median of each numeric field across repeats (objects with the same shape). Non-numeric fields come from the first.
export function medianOf(objs) {
  const list = objs.filter(Boolean);
  if (!list.length) return null;
  const out = {};
  for (const k of Object.keys(list[0])) {
    const vals = list.map((o) => o[k]);
    if (vals.every((x) => typeof x === 'number' || x === null || x === undefined)) out[k] = median(vals.map((x) => (x == null ? NaN : x)));
    else if (vals.every((x) => x && typeof x === 'object' && !Array.isArray(x))) out[k] = medianOf(vals);
    else out[k] = vals[0];
  }
  return out;
}
export const round = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
