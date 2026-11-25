import { Router } from 'express';
import { DIALECTS, DIALECT_KEYS } from '../config.js';
import { Speaker, Recording, Utterance } from '../models/index.js';
import { requireAuth } from '../middleware/auth.js';
import { ah } from '../utils/helpers.js';

export const statsRouter = Router();
statsRouter.use(requireAuth);

const TARGET_SPEAKERS = Number(process.env.TARGET_SPEAKERS_PER_DIALECT || 10);
const TARGET_HOURS = Number(process.env.TARGET_HOURS_PER_DIALECT || 5);

statsRouter.get(
  '/',
  ah(async (_req, res) => {
    const [spk, rec, utt] = await Promise.all([
      Speaker.aggregate([{ $group: { _id: { d: '$dialect', c: '$consentStatus' }, n: { $sum: 1 } } }]),
      Recording.aggregate([{ $group: { _id: '$dialect', n: { $sum: 1 }, sec: { $sum: '$durationSec' }, flagged: { $sum: { $cond: [{ $or: ['$quality.clipping', '$quality.tooQuiet'] }, 1, 0] } } } }]),
      Utterance.aggregate([
        { $group: { _id: { d: '$dialect', s: '$status' }, n: { $sum: 1 }, sec: { $sum: { $subtract: ['$end', '$start'] } }, uncertain: { $sum: { $cond: ['$uncertain', 1, 0] } } } },
      ]),
    ]);

    const dialects = DIALECT_KEYS.map((d) => {
      const speakers = spk.filter((x) => x._id.d === d);
      const r = rec.find((x) => x._id === d) || { n: 0, sec: 0, flagged: 0 };
      const u = utt.filter((x) => x._id.d === d);
      const byStatus = Object.fromEntries(['draft', 'submitted', 'approved', 'rejected'].map((s) => [s, u.find((x) => x._id.s === s)?.n || 0]));
      const approvedSec = u.find((x) => x._id.s === 'approved')?.sec || 0;
      return {
        dialect: d,
        label: DIALECTS[d].district,
        labelBn: DIALECTS[d].bn,
        speakers: speakers.reduce((a, x) => a + x.n, 0),
        consented: speakers.find((x) => x._id.c === 'granted')?.n || 0,
        withdrawn: speakers.find((x) => x._id.c === 'withdrawn')?.n || 0,
        recordings: r.n,
        recordedHours: Number((r.sec / 3600).toFixed(2)),
        flaggedRecordings: r.flagged,
        utterances: byStatus,
        uncertain: u.reduce((a, x) => a + x.uncertain, 0),
        approvedHours: Number((approvedSec / 3600).toFixed(2)),
        targets: { speakers: TARGET_SPEAKERS, hours: TARGET_HOURS },
      };
    });
    res.json({ dialects });
  })
);
