// End-to-end check of Corpus Studio against the project plan.
// Runs every step a real team goes through, over HTTP, and prints a checklist.
//
// Usage (API running, admin seeded):
//   API_URL=http://localhost:4000 ADMIN_EMAIL=admin@corpus.local ADMIN_PASSWORD=ChangeMe123! npm run smoke
//
// It creates test users/speakers with a "smoke" marker. Run it on a test database.

const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '');
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@corpus.local', password: process.env.ADMIN_PASSWORD || 'ChangeMe123!' };
const run = Date.now().toString(36);

const results = [];
const check = (section, name, ok, detail = '') => {
  results.push({ section, name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${section}] ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};

async function call(method, path, { token, json, form, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (form) body = form;
  const res = await fetch(`${API}${path}`, { method, headers, body });
  if (raw) return { status: res.status, buf: Buffer.from(await res.arrayBuffer()), headers: res.headers };
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

// ---- synthetic audio: tone bursts separated by silence (like speech turns) ----
function makeWav({ seconds = 6, sampleRate = 16000, channels = 1, bits = 16 } = {}) {
  const frames = seconds * sampleRate;
  const bytesPer = bits / 8;
  const data = Buffer.alloc(frames * channels * bytesPer);
  for (let i = 0; i < frames; i++) {
    const t = i / sampleRate;
    const on = Math.floor(t) % 2 === 0; // 1 s tone, 1 s silence
    const v = on ? Math.sin(2 * Math.PI * 220 * t) * 0.3 : 0;
    for (let c = 0; c < channels; c++) {
      const o = (i * channels + c) * bytesPer;
      if (bits === 16) data.writeInt16LE(Math.round(v * 32767), o);
      else data.writeUInt8(Math.round(128 + v * 127), o);
    }
  }
  const h = Buffer.alloc(44);
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + data.length, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(channels, 22);
  h.writeUInt32LE(sampleRate, 24);
  h.writeUInt32LE(sampleRate * channels * bytesPer, 28);
  h.writeUInt16LE(channels * bytesPer, 32);
  h.writeUInt16LE(bits, 34);
  h.write('data', 36);
  h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

function uploadForm(interviewId, wav, clientId) {
  const f = new FormData();
  f.append('interviewId', interviewId);
  if (clientId) f.append('clientId', clientId);
  f.append('audio', new Blob([wav], { type: 'audio/wav' }), 'rec.wav');
  return f;
}
function consentForm(items, withFile = true) {
  const f = new FormData();
  f.append('items', JSON.stringify(items));
  f.append('consentDate', new Date().toISOString());
  f.append('readAloud', 'true');
  if (withFile) f.append('signedForm', new Blob([PNG_1PX], { type: 'image/png' }), 'form.png');
  return f;
}

async function main() {
  // ---------------- 0. Server and login ----------------
  const health = await call('GET', '/api/health').catch((e) => ({ status: 0, data: e.message }));
  check('Setup', 'API is reachable', health.status === 200, JSON.stringify(health.data));
  if (health.status !== 200) return;

  const login = await call('POST', '/api/auth/login', { json: ADMIN });
  check('Auth', 'Admin can log in', login.status === 200, JSON.stringify(login.data));
  if (login.status !== 200) return;
  const admin = login.data.token;

  const badLogin = await call('POST', '/api/auth/login', { json: { email: ADMIN.email, password: 'wrong-password' } });
  check('Auth', 'Wrong password is rejected', badLogin.status === 401);

  // ---------------- 1. Users and roles ----------------
  const tokens = {};
  for (const role of ['interviewer', 'annotator', 'reviewer']) {
    const email = `smoke-${role}-${run}@corpus.local`;
    const c = await call('POST', '/api/users', { token: admin, json: { name: `Smoke ${role}`, email, password: 'Password123', role } });
    const l = await call('POST', '/api/auth/login', { json: { email, password: 'Password123' } });
    tokens[role] = l.data.token;
    check('Auth', `Admin creates ${role} account and it can log in`, c.status === 201 && l.status === 200, JSON.stringify(c.data));
  }
  const { interviewer, annotator, reviewer } = tokens;

  const noAuth = await call('GET', '/api/speakers');
  check('Auth', 'API refuses requests without login', noAuth.status === 401);

  // ---------------- 2. Speaker registration ----------------
  const speakers = {};
  for (const [dialect, code, upazila] of [
    ['cumilla', 'CUM', 'Debidwar'],
    ['noakhali', 'NOA', 'Begumganj'],
    ['chattogram', 'CTG', 'Patiya'],
  ]) {
    const r = await call('POST', '/api/speakers', {
      token: interviewer,
      json: { dialect, upazila, ageGroup: '18-30', gender: 'female', yearsInLocality: '20+', otherDialectExposure: [], notes: `smoke ${run}` },
    });
    speakers[dialect] = r.data;
    check('Speakers', `${dialect}: speaker gets an ID like ${code}-0001`, r.status === 201 && new RegExp(`^${code}-\\d{4}$`).test(r.data.speakerId), JSON.stringify(r.data));
  }
  const cum = speakers.cumilla;
  check('Speakers', 'Upazila stored with an ASCII slug', cum.upazilaSlug === 'debidwar', cum.upazilaSlug);
  check('Speakers', 'No name/phone fields on the speaker record', !('name' in cum) && !('phone' in cum));

  const annotatorRegisters = await call('POST', '/api/speakers', {
    token: annotator,
    json: { dialect: 'cumilla', upazila: 'X', ageGroup: '18-30', yearsInLocality: '20+' },
  });
  check('Speakers', 'Annotators cannot register speakers (role check)', annotatorRegisters.status === 403);

  const badSpeaker = await call('POST', '/api/speakers', { token: interviewer, json: { dialect: 'sylhet', upazila: 'X', ageGroup: '18-30', yearsInLocality: '20+' } });
  check('Speakers', 'Unknown dialect is rejected', badSpeaker.status === 400);

  // ---------------- 3. Consent gate ----------------
  const early = await call('POST', '/api/interviews', { token: interviewer, json: { speakerId: cum.speakerId, topic: 'agriculture' } });
  check('Consent', 'Recording session is locked before consent', early.status === 409);

  const noForm = await call('POST', `/api/speakers/${cum.speakerId}/consent`, {
    token: interviewer,
    form: consentForm({ recording: true, transcription: true }, false),
  });
  check('Consent', 'Consent requires a photo of the signed paper form', noForm.status === 400);

  const allItems = { recording: true, transcription: true, modelTraining: true, publicAudioRelease: true, futureResearch: true };
  for (const d of ['cumilla', 'noakhali', 'chattogram']) {
    const items = d === 'chattogram' ? { ...allItems, modelTraining: false } : allItems; // CTG speaker opts out of training
    const r = await call('POST', `/api/speakers/${speakers[d].speakerId}/consent`, { token: interviewer, form: consentForm(items) });
    check('Consent', `${d}: signed consent saved, status granted`, r.status === 201 && r.data.consentStatus === 'granted', JSON.stringify(r.data));
  }
  const formImg = await call('GET', `/api/speakers/${cum.speakerId}/consent/form`, { token: admin, raw: true });
  check('Consent', 'Signed form can be viewed later', formImg.status === 200 && formImg.buf.length === PNG_1PX.length);

  // ---------------- 4. Interview + recording ----------------
  const interviews = {};
  for (const d of ['cumilla', 'noakhali', 'chattogram']) {
    const r = await call('POST', '/api/interviews', {
      token: interviewer,
      json: { speakerId: speakers[d].speakerId, topic: 'market', sessionType: 'spontaneous', environment: 'home, quiet' },
    });
    interviews[d] = r.data;
    check('Interview', `${d}: session created after consent`, r.status === 201, JSON.stringify(r.data));
  }

  const recs = {};
  for (const d of ['cumilla', 'noakhali', 'chattogram']) {
    const clientId = `smoke-${run}-${d}`;
    const r = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, makeWav(), clientId) });
    recs[d] = r.data.recording;
    check('Recording', `${d}: 16 kHz mono 16-bit WAV accepted`, r.status === 201, JSON.stringify(r.data));
    if (d === 'cumilla') {
      const rec = r.data.recording;
      check('Recording', 'Duration, sample rate and bit depth measured', rec.durationSec === 6 && rec.sampleRate === 16000 && rec.bitDepth === 16, JSON.stringify(rec));
      check('Recording', 'Quality metrics stored (peak, RMS, clipping)', typeof rec.quality?.rmsDbfs === 'number' && rec.quality.clipping === false);
      const again = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, makeWav(), clientId) });
      check('Offline sync', 'Re-uploading the same clientId does not duplicate', again.status === 200 && again.data.duplicate === true && again.data.recording._id === rec._id);
      const stereo = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, makeWav({ channels: 2 })) });
      check('Recording', 'Stereo audio rejected (plan: mono)', stereo.status === 400);
      const lowRate = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, makeWav({ sampleRate: 8000 })) });
      check('Recording', 'Under 16 kHz rejected (plan: 16 kHz minimum)', lowRate.status === 400);
      const eightBit = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, makeWav({ bits: 8 })) });
      check('Recording', '8-bit audio rejected (plan: 16-bit PCM)', eightBit.status === 400);
      const notWav = await call('POST', '/api/recordings', { token: interviewer, form: uploadForm(interviews[d]._id, Buffer.from('not audio')) });
      check('Recording', 'Non-WAV file rejected', notWav.status === 400);
      const orig = await call('GET', `/api/recordings/${rec._id}/audio`, { token: annotator, raw: true });
      const sent = makeWav();
      check('Recording', 'Original audio stored byte-for-byte unchanged', orig.status === 200 && Buffer.compare(orig.buf, sent) === 0);
      const viaQuery = await call('GET', `/api/recordings/${rec._id}/audio?token=${encodeURIComponent(annotator)}`, { raw: true });
      check('Recording', 'Audio playable in browser via token link', viaQuery.status === 200);
    }
  }

  // ---------------- 5. Utterance annotation ----------------
  const make = (d, start, end, extra = {}) =>
    call('POST', '/api/utterances', {
      token: annotator,
      json: { recordingId: recs[d]._id, start, end, dialectText: 'তুই কই যাস?', standardBangla: 'তুই কোথায় যাচ্ছিস?', english: 'Where are you going?', intent: 'asking_destination', speechType: 'question', ...extra },
    });

  const draft = await make('cumilla', 0, 1, { standardBangla: '' });
  check('Annotation', 'Annotator creates utterance with an ID like CUM-U00001', draft.status === 201 && /^CUM-U\d{5}$/.test(draft.data.utteranceId), JSON.stringify(draft.data));
  check('Annotation', 'Dialect spelling stored exactly as typed', draft.data.dialectText === 'তুই কই যাস?');
  check('Annotation', 'Utterance linked to speaker and dialect', draft.data.dialect === 'cumilla' && draft.data.speaker === cum._id);

  const incomplete = await call('PATCH', `/api/utterances/${draft.data._id}`, { token: annotator, json: { submit: true } });
  check('Annotation', 'Cannot submit without a standard Bangla equivalent', incomplete.status === 400);

  const pastEnd = await make('cumilla', 5, 9);
  check('Annotation', 'Segment past the end of the recording rejected', pastEnd.status === 400);
  const backwards = await make('cumilla', 3, 2);
  check('Annotation', 'Segment with end before start rejected', backwards.status === 400);

  const uncertain = await call('PATCH', `/api/utterances/${draft.data._id}`, {
    token: annotator,
    json: { standardBangla: 'তুই কোথায় যাচ্ছিস?', uncertain: true, uncertainNote: 'spelling of যাস unsure', vocabulary: [{ term: 'কই', meaning: 'কোথায়' }], submit: true },
  });
  check('Annotation', 'Uncertain flag and vocabulary notes saved; submitted', uncertain.status === 200 && uncertain.data.uncertain && uncertain.data.vocabulary.length === 1 && uncertain.data.status === 'submitted', JSON.stringify(uncertain.data));

  const u2 = await make('cumilla', 2, 3, { submit: true });
  const u3 = await make('noakhali', 0, 1, { submit: true, dialectText: 'তুঁই কন্ডে যাওর?' });
  const u4 = await make('chattogram', 0, 1, { submit: true, dialectText: 'তুই হডে যাইদ্দে?' });
  check('Annotation', 'Utterances created for all three dialects', [u2, u3, u4].every((x) => x.status === 201));

  const clip = await call('GET', `/api/utterances/${u2.data._id}/audio`, { token: reviewer, raw: true });
  const clipSec = clip.buf.length > 44 ? (clip.buf.length - 44) / 32000 : 0;
  check('Annotation', 'Each utterance plays as its own audio clip (correct length)', clip.status === 200 && Math.abs(clipSec - 1) < 0.01, `${clipSec}s`);

  // ---------------- 6. Review ----------------
  const ownReview = await call('POST', `/api/utterances/${u2.data._id}/review`, { token: annotator, json: { decision: 'approved' } });
  check('Review', 'Annotators cannot approve (needs reviewer role)', ownReview.status === 403);

  const noComment = await call('POST', `/api/utterances/${u2.data._id}/review`, { token: reviewer, json: { decision: 'rejected' } });
  check('Review', 'Rejection requires a comment', noComment.status === 400);

  const rej = await call('POST', `/api/utterances/${u2.data._id}/review`, { token: reviewer, json: { decision: 'rejected', comment: 'Check standard form' } });
  check('Review', 'Reviewer rejects with a comment', rej.status === 200 && rej.data.status === 'rejected');
  const fix = await call('PATCH', `/api/utterances/${u2.data._id}`, { token: annotator, json: { standardBangla: 'তুমি কোথায় যাচ্ছ?', submit: true } });
  check('Review', 'Annotator fixes and resubmits', fix.status === 200 && fix.data.status === 'submitted');

  for (const u of [uncertain, u2, u3, u4]) {
    await call('POST', `/api/utterances/${u.data._id}/review`, { token: reviewer, json: { decision: 'approved', comment: 'ok' } });
  }
  const approved = await call('GET', '/api/utterances?status=approved', { token: reviewer });
  const ours = approved.data.filter((u) => [uncertain, u2, u3, u4].some((x) => x.data._id === u._id));
  check('Review', 'Reviewer approves; review history kept', ours.length === 4 && ours.every((u) => u.reviews.length >= 1));

  const lockedEdit = await call('PATCH', `/api/utterances/${u3.data._id}`, { token: annotator, json: { english: 'changed' } });
  check('Review', 'Approved utterances are locked for annotators', lockedEdit.status === 409);

  // ---------------- 7. Dashboard ----------------
  const stats = await call('GET', '/api/stats', { token: interviewer });
  const cStats = stats.data.dialects?.find((d) => d.dialect === 'cumilla');
  check('Dashboard', 'Per-dialect progress: speakers, hours, utterances by status', stats.status === 200 && cStats.speakers >= 1 && cStats.recordedHours > 0 && cStats.utterances.approved >= 2, JSON.stringify(cStats));
  check('Dashboard', 'Dashboard shows targets (10 speakers, 5 h per dialect)', cStats.targets?.speakers === 10 && cStats.targets?.hours === 5);

  // ---------------- 8. Export ----------------
  const prev = await call('GET', '/api/export/preview', { token: reviewer });
  check('Export', 'Export preview works', prev.status === 200, JSON.stringify(prev.data));
  const sample = prev.data.sample?.[0] || {};
  const required = ['utterance_id', 'speaker_id', 'dialect', 'subregion', 'audio', 'transcription', 'standard_bangla', 'english', 'intent', 'speech_type', 'source', 'validated', 'split'];
  check('Export', 'Rows have every field from the plan\'s JSON example', required.every((k) => k in sample), required.filter((k) => !(k in sample)).join(','));

  const splits = prev.data.splits;
  const seen = {};
  let overlap = false;
  for (const sp of ['train', 'validation', 'test']) for (const s of splits[sp].speakers) {
    if (seen[s]) overlap = true;
    seen[s] = sp;
  }
  check('Export', 'Splits are speaker-independent (no speaker in two splits)', !overlap);

  const ctgIncluded = Object.keys(seen).includes(speakers.chattogram.speakerId);
  check('Export', 'Speaker who refused model training is excluded', !ctgIncluded && prev.data.excludedForConsent >= 1);

  const prev2 = await call('GET', '/api/export/preview', { token: reviewer });
  check('Export', 'Same seed gives the same split (reproducible)', JSON.stringify(prev2.data.splits) === JSON.stringify(splits));

  const zip = await call('GET', '/api/export?dialect=cumilla', { token: reviewer, raw: true });
  check('Export', 'Zip download (JSONL, CSV, splits, WAV clips)', zip.status === 200 && zip.buf.subarray(0, 2).toString() === 'PK' && zip.buf.includes(Buffer.from('utterances.jsonl')) && zip.buf.includes(Buffer.from('splits/test.jsonl')) && zip.buf.includes(Buffer.from('.wav')));

  const annExport = await call('GET', '/api/export/preview', { token: annotator });
  check('Export', 'Only reviewers/admins can export', annExport.status === 403);

  // ---------------- 9. Withdrawal ----------------
  const w = await call('POST', `/api/speakers/${speakers.noakhali.speakerId}/withdraw`, { token: admin, json: { deleteData: true, note: 'smoke test' } });
  check('Consent', 'Withdrawal deletes the speaker\'s audio and utterances', w.status === 200 && w.data.deleted.recordings === 1 && w.data.deleted.utterances === 1, JSON.stringify(w.data));
  const gone = await call('GET', `/api/recordings/${recs.noakhali._id}/audio`, { token: admin, raw: true });
  check('Consent', 'Withdrawn audio file is no longer served', gone.status === 404);
  const afterW = await call('POST', '/api/interviews', { token: interviewer, json: { speakerId: speakers.noakhali.speakerId, topic: 'food' } });
  check('Consent', 'Withdrawn speaker cannot be recorded again', afterW.status === 409);
}

main()
  .catch((e) => check('Run', 'Unexpected error', false, e.stack))
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exitCode = failed.length ? 1 : 0;
  });
