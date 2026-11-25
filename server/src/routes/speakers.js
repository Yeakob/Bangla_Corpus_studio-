import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { config, DIALECTS, DIALECT_KEYS } from '../config.js';
import {
  Speaker,
  Consent,
  Interview,
  Recording,
  Utterance,
  nextSeq,
  AGE_GROUPS,
  GENDERS,
  YEARS_IN_LOCALITY,
  EDUCATION,
  CONSENT_ITEMS,
} from '../models/index.js';
import { requireAuth, allow } from '../middleware/auth.js';
import { ah, HttpError, slugify, onlySent } from '../utils/helpers.js';

export const speakersRouter = Router();
speakersRouter.use(requireAuth);

const formUpload = multer({
  dest: path.join(config.uploadDir, 'tmp'),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    /^(image\/(jpeg|png|webp|heic)|application\/pdf)$/.test(file.mimetype)
      ? cb(null, true)
      : cb(new HttpError(400, 'Signed form must be a JPG, PNG, WEBP, HEIC image or a PDF')),
});

/** Find by human ID (CUM-0001) or Mongo _id. */
async function findSpeaker(idOrCode) {
  const q = /^[a-f0-9]{24}$/i.test(idOrCode) ? { _id: idOrCode } : { speakerId: idOrCode.toUpperCase() };
  const s = await Speaker.findOne(q);
  if (!s) throw new HttpError(404, 'Speaker not found');
  return s;
}

const speakerBody = z.object({
  dialect: z.enum(DIALECT_KEYS),
  upazila: z.string().min(1),
  village: z.string().optional(),
  ageGroup: z.enum(AGE_GROUPS),
  gender: z.enum(GENDERS).default('not_stated'),
  education: z.enum(EDUCATION).default('not_stated'),
  nativeDialect: z.enum(DIALECT_KEYS).optional(),
  yearsInLocality: z.enum(YEARS_IN_LOCALITY),
  otherDialectExposure: z.array(z.enum(DIALECT_KEYS)).default([]),
  notes: z.string().optional(),
});

speakersRouter.get(
  '/',
  ah(async (req, res) => {
    const filter = {};
    if (req.query.dialect) filter.dialect = req.query.dialect;
    if (req.query.consent) filter.consentStatus = req.query.consent;
    if (req.query.q) filter.$or = [{ speakerId: new RegExp(String(req.query.q).replace(/[^\w-]/g, ''), 'i') }, { upazila: new RegExp(String(req.query.q).replace(/[^\w\s-]/g, ''), 'i') }];
    const speakers = await Speaker.find(filter).sort({ speakerId: 1 }).lean();
    const ids = speakers.map((s) => s._id);
    const recAgg = await Recording.aggregate([
      { $match: { speaker: { $in: ids } } },
      { $group: { _id: '$speaker', n: { $sum: 1 }, sec: { $sum: '$durationSec' } } },
    ]);
    const byId = Object.fromEntries(recAgg.map((r) => [String(r._id), r]));
    res.json(
      speakers.map((s) => ({
        ...s,
        recordings: byId[String(s._id)]?.n || 0,
        recordedSec: Math.round(byId[String(s._id)]?.sec || 0),
      }))
    );
  })
);

speakersRouter.post(
  '/',
  allow('interviewer'),
  ah(async (req, res) => {
    const body = speakerBody.parse(req.body);
    const d = DIALECTS[body.dialect];
    const seq = await nextSeq(`speaker-${d.code}`);
    const speaker = await Speaker.create({
      ...body,
      nativeDialect: body.nativeDialect || body.dialect,
      speakerId: `${d.code}-${String(seq).padStart(4, '0')}`,
      district: d.district,
      upazilaSlug: slugify(body.upazila),
      registeredBy: req.user._id,
    });
    res.status(201).json(speaker);
  })
);

speakersRouter.get(
  '/:id',
  ah(async (req, res) => {
    const speaker = await findSpeaker(req.params.id);
    const [consent, interviews] = await Promise.all([
      Consent.findOne({ speaker: speaker._id }).lean(),
      Interview.find({ speaker: speaker._id }).sort({ createdAt: -1 }).populate('interviewer', 'name').lean(),
    ]);
    res.json({ speaker, consent, interviews });
  })
);

speakersRouter.patch(
  '/:id',
  allow('interviewer'),
  ah(async (req, res) => {
    const speaker = await findSpeaker(req.params.id);
    const body = onlySent(speakerBody.partial().omit({ dialect: true }).parse(req.body), req.body); // dialect fixes the ID; not editable
    Object.assign(speaker, body);
    if (body.upazila) speaker.upazilaSlug = slugify(body.upazila);
    await speaker.save();
    res.json(speaker);
  })
);

// ---------- Consent ----------
// multipart/form-data: items (JSON), consentDate, readAloud, witnessName, signedForm (file)
speakersRouter.post(
  '/:id/consent',
  allow('interviewer'),
  formUpload.single('signedForm'),
  ah(async (req, res) => {
    const speaker = await findSpeaker(req.params.id);
    const items = z
      .object(Object.fromEntries(CONSENT_ITEMS.map((k) => [k, z.boolean().default(false)])))
      .parse(typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items || {});
    const meta = z
      .object({
        consentDate: z.coerce.date(),
        readAloud: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
        witnessName: z.string().optional(),
      })
      .parse(req.body);

    const existing = await Consent.findOne({ speaker: speaker._id });
    if (!req.file && !existing?.signedFormPath) {
      throw new HttpError(400, 'Upload a photo or scan of the signed consent form');
    }

    let signedFormPath = existing?.signedFormPath;
    let signedFormMime = existing?.signedFormMime;
    if (req.file) {
      const dir = path.join(config.uploadDir, 'consent');
      await fs.mkdir(dir, { recursive: true });
      const ext = path.extname(req.file.originalname || '').toLowerCase() || '.bin';
      const finalPath = path.join(dir, `${speaker.speakerId}-${Date.now()}${ext}`);
      await fs.rename(req.file.path, finalPath);
      signedFormPath = path.relative(config.uploadDir, finalPath);
      signedFormMime = req.file.mimetype;
    }

    const consent = await Consent.findOneAndUpdate(
      { speaker: speaker._id },
      { items, ...meta, signedFormPath, signedFormMime, collectedBy: req.user._id, $unset: { withdrawnAt: 1, withdrawalNote: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    speaker.consentStatus = items.recording && items.transcription ? 'granted' : 'declined';
    await speaker.save();
    res.status(201).json({ consent, consentStatus: speaker.consentStatus });
  })
);

speakersRouter.get(
  '/:id/consent/form',
  ah(async (req, res) => {
    const speaker = await findSpeaker(req.params.id);
    const consent = await Consent.findOne({ speaker: speaker._id });
    if (!consent?.signedFormPath) throw new HttpError(404, 'No signed form on file');
    res.type(consent.signedFormMime || 'application/octet-stream');
    res.sendFile(path.join(config.uploadDir, consent.signedFormPath));
  })
);

/**
 * Withdrawal: marks consent withdrawn. With deleteData=true it also deletes the
 * speaker's audio files, recordings and utterances (the signed form is kept as a record).
 */
speakersRouter.post(
  '/:id/withdraw',
  allow('admin'),
  ah(async (req, res) => {
    const { deleteData, note } = z
      .object({ deleteData: z.boolean().default(true), note: z.string().optional() })
      .parse(req.body);
    const speaker = await findSpeaker(req.params.id);
    await Consent.updateOne({ speaker: speaker._id }, { withdrawnAt: new Date(), withdrawalNote: note });
    speaker.consentStatus = 'withdrawn';
    await speaker.save();

    let deleted = { recordings: 0, utterances: 0 };
    if (deleteData) {
      const recs = await Recording.find({ speaker: speaker._id });
      for (const r of recs) await fs.rm(path.join(config.uploadDir, r.filePath), { force: true });
      deleted.utterances = (await Utterance.deleteMany({ speaker: speaker._id })).deletedCount;
      deleted.recordings = (await Recording.deleteMany({ speaker: speaker._id })).deletedCount;
    }
    res.json({ speakerId: speaker.speakerId, consentStatus: 'withdrawn', deleted });
  })
);
