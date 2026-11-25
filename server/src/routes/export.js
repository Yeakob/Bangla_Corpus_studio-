import { Router } from 'express';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import { config, DIALECT_KEYS } from '../config.js';
import { Consent, Utterance } from '../models/index.js';
import { requireAuth, allow } from '../middleware/auth.js';
import { ah, HttpError, splitSpeakers } from '../utils/helpers.js';
import { sliceWav } from '../utils/wav.js';

export const exportRouter = Router();
exportRouter.use(requireAuth, allow('reviewer'));

const csvCell = (v) => {
  const s = v == null ? '' : Array.isArray(v) ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows, cols) => [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';

/**
 * Builds the dataset rows. Exported so the smoke test can check it.
 * - Only speakers with active consent AND consent for model training.
 * - publicOnly=true additionally requires consent for public audio release.
 * - Splits are speaker-independent and reproducible (seeded), per dialect.
 */
export async function buildDataset({ status = ['approved'], dialect, publicOnly = false, seed = 'corpus-studio-v1' }) {
  const filter = { status: { $in: status } };
  if (dialect) filter.dialect = dialect;
  const utts = await Utterance.find(filter)
    .sort({ utteranceId: 1 })
    .populate('speaker')
    .populate('interview', 'topic sessionType')
    .populate('recording', 'filePath sampleRate')
    .lean();

  const consents = await Consent.find({ speaker: { $in: [...new Set(utts.map((u) => u.speaker._id))] } }).lean();
  const consentBy = Object.fromEntries(consents.map((c) => [String(c.speaker), c]));
  const usable = utts.filter((u) => {
    const c = consentBy[String(u.speaker._id)];
    if (u.speaker.consentStatus !== 'granted' || !c?.items?.modelTraining) return false;
    if (publicOnly && !c.items.publicAudioRelease) return false;
    return true;
  });

  const splitOf = {};
  for (const d of DIALECT_KEYS) {
    const ids = [...new Set(usable.filter((u) => u.dialect === d).map((u) => u.speaker.speakerId))];
    Object.assign(splitOf, splitSpeakers(ids, `${seed}-${d}`));
  }

  const rows = usable.map((u) => ({
    utterance_id: u.utteranceId,
    speaker_id: u.speaker.speakerId,
    dialect: u.dialect,
    subregion: u.speaker.upazilaSlug,
    audio: `audio/${u.utteranceId}.wav`,
    start: Number(u.start.toFixed(3)),
    end: Number(u.end.toFixed(3)),
    duration: Number((u.end - u.start).toFixed(3)),
    transcription: u.dialectText,
    standard_bangla: u.standardBangla,
    english: u.english,
    phonetic: u.phonetic,
    intent: u.intent,
    speech_type: u.speechType,
    vocabulary: u.vocabulary,
    uncertain: u.uncertain,
    topic: u.interview?.topic,
    source: u.interview?.sessionType,
    validated: u.status === 'approved',
    split: splitOf[u.speaker.speakerId],
    _recordingPath: u.recording.filePath,
  }));

  const speakerMap = new Map();
  for (const u of usable) {
    const s = u.speaker;
    if (!speakerMap.has(s.speakerId)) {
      speakerMap.set(s.speakerId, {
        speaker_id: s.speakerId,
        dialect: s.dialect,
        district: s.district,
        subregion: s.upazilaSlug,
        age_group: s.ageGroup,
        gender: s.gender,
        education: s.education,
        native_dialect: s.nativeDialect,
        years_in_locality: s.yearsInLocality,
        other_dialect_exposure: (s.otherDialectExposure || []).join('|'),
        split: splitOf[s.speakerId],
      });
    }
  }
  return { rows, speakers: [...speakerMap.values()], excluded: utts.length - usable.length };
}

const parseQuery = (q) => ({
  status: String(q.status || 'approved').split(','),
  dialect: q.dialect && DIALECT_KEYS.includes(q.dialect) ? q.dialect : undefined,
  publicOnly: q.publicOnly === 'true',
  seed: String(q.seed || 'corpus-studio-v1'),
});

/** Counts and split summary without building a zip (used by the Export page and tests). */
exportRouter.get(
  '/preview',
  ah(async (req, res) => {
    const opts = parseQuery(req.query);
    const { rows, speakers, excluded } = await buildDataset(opts);
    const summary = {};
    for (const sp of ['train', 'validation', 'test']) {
      summary[sp] = {
        utterances: rows.filter((r) => r.split === sp).length,
        speakers: speakers.filter((s) => s.split === sp).map((s) => s.speaker_id),
        hours: Number((rows.filter((r) => r.split === sp).reduce((a, r) => a + r.duration, 0) / 3600).toFixed(3)),
      };
    }
    res.json({
      filters: opts,
      utterances: rows.length,
      speakers: speakers.length,
      excludedForConsent: excluded,
      splits: summary,
      sample: rows.slice(0, 5).map(({ _recordingPath, ...r }) => r),
    });
  })
);

exportRouter.get(
  '/',
  ah(async (req, res) => {
    const { status, dialect, publicOnly, seed } = parseQuery(req.query);
    const includeAudio = req.query.includeAudio !== 'false';

    const { rows, speakers, excluded } = await buildDataset({ status, dialect, publicOnly, seed });
    if (!rows.length) throw new HttpError(404, 'No utterances match these filters (check status and consent)');

    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    const name = `corpus-${dialect || 'all'}-${stamp}`;
    res.attachment(`${name}.zip`);
    const zip = new ZipArchive({ zlib: { level: 6 } });
    zip.on('error', (e) => res.destroy(e));
    zip.pipe(res);

    const clean = rows.map(({ _recordingPath, ...r }) => r);
    const jsonl = (rs) => rs.map((r) => JSON.stringify(r)).join('\n') + (rs.length ? '\n' : '');
    zip.append(jsonl(clean), { name: `${name}/utterances.jsonl` });
    zip.append(toCsv(clean, Object.keys(clean[0])), { name: `${name}/utterances.csv` });
    zip.append(toCsv(speakers, Object.keys(speakers[0])), { name: `${name}/speakers.csv` });
    for (const sp of ['train', 'validation', 'test']) {
      zip.append(jsonl(clean.filter((r) => r.split === sp)), { name: `${name}/splits/${sp}.jsonl` });
    }
    const manifest = {
      created: new Date().toISOString(),
      filters: { status, dialect: dialect || 'all', publicOnly, seed },
      utterances: clean.length,
      excludedForConsent: excluded,
      speakers: speakers.length,
      hours: Number((clean.reduce((a, r) => a + r.duration, 0) / 3600).toFixed(3)),
      splits: Object.fromEntries(
        ['train', 'validation', 'test'].map((sp) => [
          sp,
          { utterances: clean.filter((r) => r.split === sp).length, speakers: speakers.filter((s) => s.split === sp).length },
        ])
      ),
      audio: includeAudio ? '16-bit PCM WAV clips cut from the unmodified originals' : 'not included',
    };
    zip.append(JSON.stringify(manifest, null, 2), { name: `${name}/manifest.json` });
    zip.append(README, { name: `${name}/README.md` });

    if (includeAudio) {
      for (const r of rows) {
        const clip = await sliceWav(path.join(config.uploadDir, r._recordingPath), r.start, r.end);
        zip.append(clip, { name: `${name}/${r.audio}` });
      }
    }
    await zip.finalize();
  })
);

const README = `# Corpus export

- utterances.jsonl / .csv: one row per utterance (the central unit of the dataset)
  - transcription: what the speaker said, dialect spelling preserved (NOT normalised)
  - standard_bangla: meaning-preserving standard Bangla
  - split: speaker-independent (no speaker appears in two splits)
- splits/: the same rows divided into train / validation / test
- speakers.csv: speaker metadata (no names, no villages)
- audio/: one WAV per utterance, cut from the original recording
- manifest.json: filters, counts, seed (re-run with the same seed for the same split)

Only speakers who consented to model training are included.
`;
