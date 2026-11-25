// Unit tests that need no database: WAV handling and dataset splits.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseWavHeader, wavHeader, analyzeWav, sliceWav } from '../src/utils/wav.js';
import { splitSpeakers, slugify } from '../src/utils/helpers.js';

function tone(seconds, sampleRate = 16000, amp = 0.3) {
  const n = seconds * sampleRate;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(Math.sin((2 * Math.PI * 220 * i) / sampleRate) * amp * 32767))), i * 2);
  return Buffer.concat([wavHeader(data.length, sampleRate), data]);
}
async function tmpFile(buf) {
  const p = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'cs-')), 'a.wav');
  await fs.writeFile(p, buf);
  return p;
}

test('wavHeader round-trips through parseWavHeader', () => {
  const h = parseWavHeader(Buffer.concat([wavHeader(3200, 16000), Buffer.alloc(3200)]));
  assert.deepEqual([h.audioFormat, h.channels, h.sampleRate, h.bitsPerSample, h.dataOffset, h.dataLength], [1, 1, 16000, 16, 44, 3200]);
});

test('parseWavHeader skips extra chunks (e.g. LIST) before data', () => {
  const base = wavHeader(4, 16000);
  const list = Buffer.concat([Buffer.from('LIST'), Buffer.from([3, 0, 0, 0]), Buffer.from('abc'), Buffer.from([0])]); // odd size + pad
  const buf = Buffer.concat([base.subarray(0, 36), list, base.subarray(36), Buffer.alloc(4)]);
  const h = parseWavHeader(buf);
  assert.equal(h.dataOffset, 36 + list.length + 8);
  assert.equal(h.dataLength, 4);
});

test('parseWavHeader rejects non-WAV input', () => {
  assert.throws(() => parseWavHeader(Buffer.from('hello world, not audio')), /Not a WAV/);
});

test('analyzeWav measures duration, format and loudness', async () => {
  const info = await analyzeWav(await tmpFile(tone(2)));
  assert.equal(info.durationSec, 2);
  assert.equal(info.sampleRate, 16000);
  assert.equal(info.quality.formatOk, true);
  assert.equal(info.quality.clipping, false);
  assert.ok(Math.abs(info.quality.peakDbfs - -10.5) < 0.3, `peak ${info.quality.peakDbfs}`);
});

test('analyzeWav flags clipping and silence', async () => {
  const loud = await analyzeWav(await tmpFile(tone(1, 16000, 1.5)));
  assert.equal(loud.quality.clipping, true);
  const quiet = await analyzeWav(await tmpFile(tone(1, 16000, 0.001)));
  assert.equal(quiet.quality.tooQuiet, true);
});

test('sliceWav cuts the exact time range', async () => {
  const p = await tmpFile(tone(5));
  const clip = await sliceWav(p, 1.25, 3.75);
  const h = parseWavHeader(clip);
  assert.equal(h.dataLength / 2 / 16000, 2.5);
  const src = await fs.readFile(p);
  assert.equal(Buffer.compare(clip.subarray(44), src.subarray(44 + 1.25 * 32000, 44 + 3.75 * 32000)), 0);
});

test('sliceWav clamps to the file length', async () => {
  const clip = await sliceWav(await tmpFile(tone(1)), 0.5, 10);
  assert.equal(parseWavHeader(clip).dataLength, 0.5 * 32000);
});

test('splitSpeakers is speaker-independent, ~70/15/15, and reproducible', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `CUM-${String(i + 1).padStart(4, '0')}`);
  const a = splitSpeakers(ids, 'seed');
  const b = splitSpeakers([...ids].reverse(), 'seed');
  assert.deepEqual(a, b, 'same seed and same speakers -> same split, whatever the input order');
  const count = (s) => Object.values(a).filter((x) => x === s).length;
  assert.deepEqual([count('train'), count('validation'), count('test')], [14, 3, 3]);
  assert.equal(Object.keys(a).length, 20);
});

test('splitSpeakers gives val and test a speaker even with 10 speakers', () => {
  const ids = Array.from({ length: 10 }, (_, i) => `NOA-000${i}`);
  const s = splitSpeakers(ids, 'x');
  const vals = Object.values(s);
  assert.ok(vals.filter((v) => v === 'test').length >= 1);
  assert.ok(vals.filter((v) => v === 'validation').length >= 1);
});

test('slugify makes ASCII upazila slugs', () => {
  assert.equal(slugify('Debidwar'), 'debidwar');
  assert.equal(slugify('  Chauddagram Upazila '), 'chauddagram_upazila');
  assert.equal(slugify('দেবিদ্বার'), 'unknown');
});
