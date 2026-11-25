import { ZodError } from 'zod';

/** Wrap async route handlers so errors reach the error middleware. */
export const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues });
  }
  if (err?.name === 'CastError') return res.status(400).json({ error: 'Invalid id' });
  if (err?.code === 11000) return res.status(409).json({ error: 'Duplicate value', details: err.keyValue });
  if (err?.name === 'MulterError') return res.status(400).json({ error: err.message });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.message || 'Server error', details: err.details });
}

/** ASCII slug for upazila names, e.g. "Debidwar" -> "debidwar". */
export const slugify = (s) =>
  String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';

/** Deterministic PRNG so dataset splits are reproducible. */
export function seededShuffle(items, seedStr) {
  let seed = 0;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Speaker-independent split: every speaker goes to exactly one split.
 * With >= 3 speakers, val and test each get at least one speaker.
 */
export function splitSpeakers(speakerIds, seed = 'corpus-studio', ratios = [0.7, 0.15, 0.15]) {
  const sorted = [...speakerIds].sort();
  const shuffled = seededShuffle(sorted, seed);
  const n = shuffled.length;
  let nTest = Math.round(n * ratios[2]);
  let nVal = Math.round(n * ratios[1]);
  if (n >= 3) {
    nTest = Math.max(1, nTest);
    nVal = Math.max(1, nVal);
  }
  const map = {};
  shuffled.forEach((id, i) => {
    map[id] = i < nTest ? 'test' : i < nTest + nVal ? 'validation' : 'train';
  });
  return map;
}

/**
 * For PATCH requests: keep only the fields the client actually sent.
 * (zod 4 fills .default() values even inside .partial(), which would overwrite
 * existing data with blanks.)
 */
export const onlySent = (parsed, body) =>
  Object.fromEntries(Object.entries(parsed).filter(([k]) => Object.prototype.hasOwnProperty.call(body || {}, k)));
