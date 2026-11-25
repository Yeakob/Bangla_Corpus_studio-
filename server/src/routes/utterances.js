import { Router } from 'express';
import path from 'node:path';
import { z } from 'zod';
import { config, DIALECTS } from '../config.js';
import { Recording, Utterance, nextSeq, SPEECH_TYPES } from '../models/index.js';
import { requireAuth, allow } from '../middleware/auth.js';
import { ah, HttpError, onlySent } from '../utils/helpers.js';
import { sliceWav } from '../utils/wav.js';

export const utterancesRouter = Router();
utterancesRouter.use(requireAuth);

const fields = z.object({
  start: z.number().min(0),
  end: z.number().positive(),
  dialectText: z.string().default(''),
  standardBangla: z.string().default(''),
  english: z.string().default(''),
  phonetic: z.string().default(''),
  intent: z.string().default(''),
  speechType: z.enum(SPEECH_TYPES).default('statement'),
  vocabulary: z.array(z.object({ term: z.string(), meaning: z.string().default(''), note: z.string().default('') })).default([]),
  uncertain: z.boolean().default(false),
  uncertainNote: z.string().optional(),
});

function checkTimes(start, end, rec) {
  if (end <= start) throw new HttpError(400, 'End time must be after start time');
  if (end - start < 0.2) throw new HttpError(400, 'Segment is shorter than 0.2 s');
  if (rec.durationSec && end > rec.durationSec + 0.05) throw new HttpError(400, 'Segment runs past the end of the recording');
}

/** A submitted utterance must have a dialect transcript and a standard Bangla equivalent. */
function checkComplete(u) {
  const missing = [];
  if (!u.dialectText?.trim()) missing.push('dialectText');
  if (!u.standardBangla?.trim()) missing.push('standardBangla');
  if (missing.length) throw new HttpError(400, `Fill in before submitting: ${missing.join(', ')}`);
}

utterancesRouter.get(
  '/',
  ah(async (req, res) => {
    const filter = {};
    if (req.query.recording) filter.recording = req.query.recording;
    if (req.query.status) filter.status = { $in: String(req.query.status).split(',') };
    if (req.query.dialect) filter.dialect = req.query.dialect;
    if (req.query.uncertain === 'true') filter.uncertain = true;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);
    const sort = req.query.recording ? { start: 1 } : { updatedAt: 1 };
    const list = await Utterance.find(filter)
      .sort(sort)
      .limit(limit)
      .populate('speaker', 'speakerId upazila')
      .populate('annotatedBy', 'name')
      .populate('reviews.reviewer', 'name')
      .lean();
    res.json(list);
  })
);

utterancesRouter.post(
  '/',
  allow('annotator'),
  ah(async (req, res) => {
    const body = fields.extend({ recordingId: z.string(), submit: z.boolean().default(false) }).parse(req.body);
    const rec = await Recording.findById(body.recordingId);
    if (!rec) throw new HttpError(404, 'Recording not found');
    checkTimes(body.start, body.end, rec);
    if (body.submit) checkComplete(body);
    const code = DIALECTS[rec.dialect].code;
    const seq = await nextSeq(`utt-${code}`);
    const { recordingId, submit, ...data } = body;
    const u = await Utterance.create({
      ...data,
      utteranceId: `${code}-U${String(seq).padStart(5, '0')}`,
      recording: rec._id,
      interview: rec.interview,
      speaker: rec.speaker,
      dialect: rec.dialect,
      status: submit ? 'submitted' : 'draft',
      annotatedBy: req.user._id,
    });
    if (rec.annotationStatus === 'pending') await Recording.updateOne({ _id: rec._id }, { annotationStatus: 'in_progress' });
    res.status(201).json(u);
  })
);

utterancesRouter.patch(
  '/:id',
  allow('annotator'),
  ah(async (req, res) => {
    const body = onlySent(fields.partial().extend({ submit: z.boolean().optional() }).parse(req.body), req.body);
    const u = await Utterance.findById(req.params.id);
    if (!u) throw new HttpError(404, 'Utterance not found');
    if (u.status === 'approved' && req.user.role !== 'admin') {
      throw new HttpError(409, 'Approved utterances can only be edited by an admin');
    }
    const rec = await Recording.findById(u.recording);
    const { submit, ...data } = body;
    Object.assign(u, data);
    checkTimes(u.start, u.end, rec);
    if (submit) {
      checkComplete(u);
      u.status = 'submitted';
    } else if (u.status === 'rejected' || u.status === 'approved') {
      u.status = 'draft'; // edited after review -> needs re-submission
    }
    await u.save();
    res.json(u);
  })
);

utterancesRouter.post(
  '/:id/review',
  allow('reviewer'),
  ah(async (req, res) => {
    const { decision, comment } = z
      .object({ decision: z.enum(['approved', 'rejected']), comment: z.string().optional() })
      .parse(req.body);
    const u = await Utterance.findById(req.params.id);
    if (!u) throw new HttpError(404, 'Utterance not found');
    if (u.status !== 'submitted') throw new HttpError(409, `Only submitted utterances can be reviewed (status: ${u.status})`);
    if (decision === 'rejected' && !comment?.trim()) throw new HttpError(400, 'Add a comment explaining the rejection');
    if (String(u.annotatedBy) === String(req.user._id) && req.user.role !== 'admin') {
      throw new HttpError(403, 'You cannot review your own annotation');
    }
    u.reviews.push({ reviewer: req.user._id, decision, comment });
    u.status = decision;
    await u.save();
    res.json(u);
  })
);

utterancesRouter.get(
  '/:id/audio',
  ah(async (req, res) => {
    const u = await Utterance.findById(req.params.id);
    if (!u) throw new HttpError(404, 'Utterance not found');
    const rec = await Recording.findById(u.recording);
    const clip = await sliceWav(path.join(config.uploadDir, rec.filePath), u.start, u.end);
    res.type('audio/wav').send(clip);
  })
);

utterancesRouter.delete(
  '/:id',
  allow('annotator'),
  ah(async (req, res) => {
    const u = await Utterance.findById(req.params.id);
    if (!u) throw new HttpError(404, 'Utterance not found');
    if (u.status === 'approved' && req.user.role !== 'admin') throw new HttpError(409, 'Approved utterances can only be deleted by an admin');
    await u.deleteOne();
    res.json({ ok: true });
  })
);
