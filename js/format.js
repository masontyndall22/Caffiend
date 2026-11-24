// Display formatting only.

export const fmtScore = (n) => (n == null || Number.isNaN(n) ? '–' : Number(n).toFixed(1));

// Colour tier for a score.
export function tier(n) {
  if (n >= 7.5) return 't-good';
  if (n >= 5) return 't-mid';
  return 't-bad';
}

export function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export const plural = (n, one, many = one + 's') => `${n} ${n === 1 ? one : many}`;
