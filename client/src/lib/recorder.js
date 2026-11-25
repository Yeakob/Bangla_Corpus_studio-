// Browser recorder that produces the plan's format: 16 kHz, mono, 16-bit PCM WAV.
// Browser "voice" processing (echo cancellation, noise suppression, auto gain) is
// turned off so the corpus keeps natural speech.

export const TARGET_RATE = 16000;

const WORKLET = `
class Capture extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor('capture', Capture);
`;

export async function startRecorder({ onLevel } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const ctx = new AudioContext();
  const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' }));
  await ctx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'capture');
  const chunks = [];
  let clipped = 0;
  let total = 0;
  node.port.onmessage = (e) => {
    const d = e.data;
    chunks.push(d);
    let peak = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
    }
    total += d.length;
    onLevel?.(peak);
  };
  src.connect(node);
  // Keep the graph running without playing the mic back through the speakers.
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute).connect(ctx.destination);

  const startedAt = Date.now();
  return {
    startedAt,
    sampleRate: ctx.sampleRate,
    elapsed: () => (Date.now() - startedAt) / 1000,
    async stop() {
      stream.getTracks().forEach((t) => t.stop());
      src.disconnect();
      node.disconnect();
      const inputRate = ctx.sampleRate;
      await ctx.close();
      const pcm = concat(chunks);
      const resampled = await resample(pcm, inputRate, TARGET_RATE);
      const blob = encodeWav(resampled, TARGET_RATE);
      return { blob, durationSec: resampled.length / TARGET_RATE, clippedRatio: total ? clipped / total : 0, inputRate };
    },
  };
}

function concat(chunks) {
  const out = new Float32Array(chunks.reduce((a, c) => a + c.length, 0));
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function resample(pcm, fromRate, toRate) {
  if (fromRate === toRate || pcm.length === 0) return pcm;
  const length = Math.max(1, Math.round((pcm.length * toRate) / fromRate));
  const off = new OfflineAudioContext(1, length, toRate);
  const buf = off.createBuffer(1, pcm.length, fromRate);
  buf.copyToChannel(pcm, 0);
  const s = off.createBufferSource();
  s.buffer = buf;
  s.connect(off.destination);
  s.start();
  return (await off.startRendering()).getChannelData(0);
}

export function encodeWav(float32, sampleRate) {
  const n = float32.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}
