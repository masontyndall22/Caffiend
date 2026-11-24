// The only place derived numbers are computed (brand averages, counts, sorting, validation).
// The Apps Script stores raw ratings only and never computes these.

export const norm = (s) => String(s || '').trim().replace(/\s+/g, ' ');
export const key = (brand, flavor) => `${norm(brand).toLowerCase()}|${norm(flavor).toLowerCase()}`;

// Round to one decimal and clamp to 0.0–10.0. Returns null if not a number.
export function cleanScore(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, Math.round(n * 10) / 10));
}

const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

// ratings: [{brand, flavor, rating, date, note}] -> [{name, flavors, avg, best, latest}]
export function groupByBrand(ratings, { sort = 'score', query = '' } = {}) {
  const q = norm(query).toLowerCase();
  const map = new Map();
  for (const r of ratings) {
    const b = norm(r.brand);
    if (!map.has(b.toLowerCase())) map.set(b.toLowerCase(), { name: b, flavors: [] });
    map.get(b.toLowerCase()).flavors.push(r);
  }
  let brands = [...map.values()].map((b) => {
    const brandHit = !q || b.name.toLowerCase().includes(q);
    const flavors = brandHit ? b.flavors : b.flavors.filter((f) => norm(f.flavor).toLowerCase().includes(q));
    return {
      name: b.name,
      flavors: sortFlavors(flavors, sort),
      avg: avg(b.flavors.map((f) => f.rating)),
      count: b.flavors.length,
      caffeine: brandCaffeine(b.flavors),
      best: Math.max(...b.flavors.map((f) => f.rating)),
      latest: b.flavors.reduce((m, f) => (f.date > m ? f.date : m), ''),
    };
  }).filter((b) => b.flavors.length);

  const byName = (a, b) => a.name.localeCompare(b.name);
  if (sort === 'name') brands.sort(byName);
  else if (sort === 'recent') brands.sort((a, b) => b.latest.localeCompare(a.latest) || byName(a, b));
  else brands.sort((a, b) => b.avg - a.avg || byName(a, b));
  return brands;
}

function sortFlavors(flavors, sort) {
  const out = [...flavors];
  if (sort === 'name') out.sort((a, b) => a.flavor.localeCompare(b.flavor));
  else if (sort === 'recent') out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  else out.sort((a, b) => b.rating - a.rating || a.flavor.localeCompare(b.flavor));
  return out;
}

export function totals(ratings) {
  const brands = new Set(ratings.map((r) => norm(r.brand).toLowerCase()));
  return { cans: ratings.length, brands: brands.size, avg: avg(ratings.map((r) => r.rating)) };
}

export function brandNames(ratings) {
  const seen = new Map();
  for (const r of ratings) seen.set(norm(r.brand).toLowerCase(), norm(r.brand));
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function flavorsFor(ratings, brand) {
  const b = norm(brand).toLowerCase();
  return ratings.filter((r) => norm(r.brand).toLowerCase() === b).map((r) => r.flavor);
}

export function findRating(ratings, brand, flavor) {
  const k = key(brand, flavor);
  return ratings.find((r) => key(r.brand, r.flavor) === k) || null;
}

// Insert or replace a rating (same brand+flavor = re-rate). Mirrors the Apps Script upsert rule.
export function upsert(ratings, entry) {
  const k = key(entry.brand, entry.flavor);
  const rest = ratings.filter((r) => key(r.brand, r.flavor) !== k);
  return [...rest, entry];
}

// Existing spelling of a brand if one matches (case and extra spaces ignored), else the cleaned input.
export function canonicalBrand(ratings, typed) {
  const n = norm(typed);
  const hit = ratings.find((r) => norm(r.brand).toLowerCase() === n.toLowerCase());
  return hit ? norm(hit.brand) : n;
}

// Read a typed score. "8.5", "8,5" and ".5" work; a whole number over 10 (e.g. "85") is read as 8.5.
// Returns null while the text isn't a usable number yet.
export function parseTypedScore(text) {
  const t = String(text).trim().replace(',', '.');
  if (!/^\d*\.?\d*$/.test(t) || t === '' || t === '.') return null;
  let n = parseFloat(t);
  if (!t.includes('.') && n > 10 && n <= 100) n = n / 10;
  return cleanScore(n);
}

// Swap the rating identified by original {brand, flavor} for entry. Same rule as the Apps Script edit.
export function replaceRating(ratings, original, entry) {
  const k = key(original.brand, original.flavor);
  return ratings.map((r) => (key(r.brand, r.flavor) === k ? entry : r));
}

// Caffeine (mg per can). Each flavor may carry its own value; a brand shows its typical value.
// Returns {typical, min, max, count} or null when no flavor of the brand has a value.
export function brandCaffeine(flavors) {
  const vals = flavors.map((f) => f.caffeine).filter((v) => Number.isFinite(v));
  if (!vals.length) return null;
  const freq = new Map();
  vals.forEach((v) => freq.set(v, (freq.get(v) || 0) + 1));
  const typical = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { typical, min: Math.min(...vals), max: Math.max(...vals), count: vals.length };
}

// Typical caffeine for a brand name across all ratings (used to prefill the Rate form).
export function typicalCaffeineFor(ratings, brand) {
  const b = norm(brand).toLowerCase();
  return brandCaffeine(ratings.filter((r) => norm(r.brand).toLowerCase() === b));
}

// "" or junk -> null; otherwise a whole number of mg, 0–1000.
export function cleanCaffeine(v) {
  const t = String(v ?? '').trim();
  if (!t) return null;
  const n = Math.round(Number(t));
  return Number.isFinite(n) && n >= 0 && n <= 1000 ? n : NaN;
}
