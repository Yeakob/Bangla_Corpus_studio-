import fs from 'node:fs/promises';

/** Parse a RIFF/WAVE header from the start of a file. Throws on invalid input. */
export function parseWavHeader(buf) {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Not a WAV file (missing RIFF/WAVE header)');
  }
  let offset = 12;
  let fmt = null;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      if (!fmt) throw new Error('WAV data chunk found before fmt chunk');
      return { ...fmt, dataOffset: body, dataLength: size };
    }
    offset = body + size + (size % 2); // chunks are word-aligned
  }
  throw new Error('WAV data chunk not found');
}

export function wavHeader(dataLength, sampleRate, channels = 1, bitsPerSample = 16) {
  const h = Buffer.alloc(44);
  const blockAlign = (channels * bitsPerSample) / 8;
  h.write('RIFF', 0, 'ascii');
  h.writeUInt32LE(36 + dataLength, 4);
  h.write('WAVE', 8, 'ascii');
  h.write('fmt ', 12, 'ascii');
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); // PCM
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * blockAlign, 28);
  h.writeUInt16LE(blockAlign, 32);
  h.writeUInt16LE(bitsPerSample, 34);
  h.write('data', 36, 'ascii');
  h.writeUInt32LE(dataLength, 40);
  return h;
}

const toDb = (x) => (x > 0 ? 20 * Math.log10(x) : -120);

/**
 * Validate an uploaded WAV and measure basic quality.
 * Required format: PCM 16-bit, mono, >= 16 kHz.
 */
export async function analyzeWav(filePath) {
  const buf = await fs.readFile(filePath);
  const h = parseWavHeader(buf);
  const dataLength = Math.min(h.dataLength, buf.length - h.dataOffset);
  const bytesPerFrame = (h.channels * h.bitsPerSample) / 8;
  const durationSec = dataLength / (h.sampleRate * bytesPerFrame);
  const formatOk = h.audioFormat === 1 && h.bitsPerSample === 16 && h.channels === 1 && h.sampleRate >= 16000;

  let peak = 0;
  let sumSq = 0;
  let clipped = 0;
  const n = h.bitsPerSample === 16 ? Math.floor(dataLength / 2) : 0;
  for (let i = 0; i < n; i++) {
    const s = buf.readInt16LE(h.dataOffset + i * 2);
    const a = Math.abs(s);
    if (a > peak) peak = a;
    if (a >= 32767) clipped++;
    sumSq += s * s;
  }
  const peakNorm = peak / 32768;
  const rmsNorm = n ? Math.sqrt(sumSq / n) / 32768 : 0;
  const clippingRatio = n ? clipped / n : 0;

  return {
    sampleRate: h.sampleRate,
    channels: h.channels,
    bitDepth: h.bitsPerSample,
    durationSec: Number(durationSec.toFixed(3)),
    quality: {
      peakDbfs: Number(toDb(peakNorm).toFixed(1)),
      rmsDbfs: Number(toDb(rmsNorm).toFixed(1)),
      clippingRatio: Number(clippingRatio.toFixed(5)),
      clipping: clippingRatio > 0.001,
      tooQuiet: toDb(rmsNorm) < -40,
      formatOk,
    },
  };
}

/** Return a new WAV buffer containing [start, end) seconds of the source file. */
export async function sliceWav(filePath, start, end) {
  const fh = await fs.open(filePath, 'r');
  try {
    const head = Buffer.alloc(65536);
    const { bytesRead } = await fh.read(head, 0, head.length, 0);
    const h = parseWavHeader(head.subarray(0, bytesRead));
    const frame = (h.channels * h.bitsPerSample) / 8;
    const totalFrames = Math.floor(h.dataLength / frame);
    const s = Math.max(0, Math.min(totalFrames, Math.floor(start * h.sampleRate)));
    const e = Math.max(s, Math.min(totalFrames, Math.ceil(end * h.sampleRate)));
    const len = (e - s) * frame;
    const data = Buffer.alloc(len);
    if (len > 0) await fh.read(data, 0, len, h.dataOffset + s * frame);
    return Buffer.concat([wavHeader(len, h.sampleRate, h.channels, h.bitsPerSample), data]);
  } finally {
    await fh.close();
  }
}
