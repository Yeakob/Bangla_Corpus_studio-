import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { config } from '../config.js';
import { Interview, Recording, Speaker, Utterance } from '../models/index.js';
import { requireAuth, allow } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/helpers.js';
import { analyzeWav } from '../utils/wav.js';

export const recordingsRouter = Router();
recordingsRouter.use(requireAuth);

const audioUpload = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: config.maxAudioMb * 1024 * 1024 },
});

/**
 * Upload one WAV for an interview session.
 * Idempotent on `clientId`, so the offline queue can safely retry.
 */
recordingsRouter.post(
  '/',
  allow('interviewer'),
  audioUpload.single('audio'),
  ah(async (req, res) => {
    const tmp = req.file?.path;
    try {
      if (!req.file) throw new HttpError(400, 'No audio file (field name: audio)');
      const body = z
        .object({
          interviewId: z.string().min(1),
          clientId: z.string().min(8).max(100).optional(),
          recordedAt: z.coerce.date().optional(),
          notes: z.string().optional(),
        })
        .parse(req.body);

      if (body.clientId) {
        const dup = await Recording.findOne({ clientId: body.clientId });
        if (dup) return res.status(200).json({ recording: dup, duplicate: true });
      }

      const interview = await Interview.findById(body.interviewId);
      if (!interview) throw new HttpError(404, 'Interview not found');
      const speaker = await Speaker.findById(interview.speaker);
      if (speaker.consentStatus !== 'granted') throw new HttpError(409, 'Speaker consent is not active');

      let info;
      try {
        info = await analyzeWav(tmp);
      } catch (e) {
        throw new HttpError(400, `Invalid audio: ${e.message}`);
      }
      if (!info.quality.formatOk) {
        throw new HttpError(
          400,
          `Audio must be PCM 16-bit mono at 16 kHz or higher (got ${info.bitDepth}-bit, ${info.channels} ch, ${info.sampleRate} Hz)`
        );
      }

      const recording = new Recording({
        interview: interview._id,
        speaker: speaker._id,
        dialect: speaker.dialect,
        filePath: 'pending',
        sizeBytes: req.file.size,
        ...info,
        clientId: body.clientId,
        recordedAt: body.recordedAt || new Date(),
        uploadedBy: req.user._id,
        notes: body.notes,
      });
      const rel = path.join('audio', speaker.dialect, speaker.speakerId, `${recording._id}.wav`);
      await fs.mkdir(path.join(config.uploadDir, path.dirname(rel)), { recursive: true });
      await fs.rename(tmp, path.join(config.uploadDir, rel));
      recording.filePath = rel;
      await recording.save();
      res.status(201).json({ recording, duplicate: false });
    } finally {
      if (tmp) await fs.rm(tmp, { force: true }).catch(() => {});
    }
  })
);

recordingsRouter.get(
  '/',
  ah(async (req, res) => {
    const filter = {};
    if (req.query.dialect) filter.dialect = req.query.dialect;
    if (req.query.interview) filter.interview = req.query.interview;
    if (req.query.annotationStatus) filter.annotationStatus = req.query.annotationStatus;
    const recs = await Recording.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('speaker', 'speakerId dialect upazila')
      .populate('interview', 'topic sessionType')
      .lean();
    const counts = await Utterance.aggregate([
      { $match: { recording: { $in: recs.map((r) => r._id) } } },
      { $group: { _id: '$recording', n: { $sum: 1 } } },
    ]);
    const byId = Object.fromEntries(counts.map((c) => [String(c._id), c.n]));
    res.json(recs.map((r) => ({ ...r, utterances: byId[String(r._id)] || 0 })));
  })
);

recordingsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const rec = await Recording.findById(req.params.id)
      .populate('speaker', 'speakerId dialect upazila')
      .populate('interview', 'topic sessionType')
      .lean();
    if (!rec) throw new HttpError(404, 'Recording not found');
    res.json(rec);
  })
);

recordingsRouter.get(
  '/:id/audio',
  ah(async (req, res) => {
    const rec = await Recording.findById(req.params.id);
    if (!rec) throw new HttpError(404, 'Recording not found');
    res.type('audio/wav');
    res.sendFile(path.join(config.uploadDir, rec.filePath)); // supports Range requests
  })
);

recordingsRouter.patch(
  '/:id',
  allow('annotator', 'interviewer'),
  ah(async (req, res) => {
    const body = z
      .object({ annotationStatus: z.enum(['pending', 'in_progress', 'done']).optional(), notes: z.string().optional() })
      .parse(req.body);
    const rec = await Recording.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!rec) throw new HttpError(404, 'Recording not found');
    res.json(rec);
  })
);

recordingsRouter.delete(
  '/:id',
  allow('admin'),
  ah(async (req, res) => {
    const rec = await Recording.findById(req.params.id);
    if (!rec) throw new HttpError(404, 'Recording not found');
    await fs.rm(path.join(config.uploadDir, rec.filePath), { force: true });
    await Utterance.deleteMany({ recording: rec._id });
    await rec.deleteOne();
    res.json({ ok: true });
  })
);
