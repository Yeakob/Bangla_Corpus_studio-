import { Router } from 'express';
import { z } from 'zod';
import { Interview, Speaker, Recording, TOPICS, SESSION_TYPES } from '../models/index.js';
import { requireAuth, allow } from '../middleware/auth.js';
import { ah, HttpError } from '../utils/helpers.js';

export const interviewsRouter = Router();
interviewsRouter.use(requireAuth);

interviewsRouter.get(
  '/',
  ah(async (req, res) => {
    const filter = {};
    if (req.query.dialect) filter.dialect = req.query.dialect;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.speaker) {
      const s = await Speaker.findOne({ speakerId: String(req.query.speaker).toUpperCase() });
      filter.speaker = s?._id ?? null;
    }
    const list = await Interview.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .populate('speaker', 'speakerId dialect upazila')
      .populate('interviewer', 'name')
      .lean();
    res.json(list);
  })
);

interviewsRouter.post(
  '/',
  allow('interviewer'),
  ah(async (req, res) => {
    const body = z
      .object({
        speakerId: z.string().min(1),
        topic: z.enum(TOPICS),
        sessionType: z.enum(SESSION_TYPES).default('structured'),
        environment: z.string().optional(),
        notes: z.string().optional(),
      })
      .parse(req.body);
    const speaker = await Speaker.findOne({ speakerId: body.speakerId.toUpperCase() });
    if (!speaker) throw new HttpError(404, 'Speaker not found');
    if (speaker.consentStatus !== 'granted') {
      throw new HttpError(409, 'Recording is locked: this speaker has no valid consent on file');
    }
    const interview = await Interview.create({
      speaker: speaker._id,
      dialect: speaker.dialect,
      interviewer: req.user._id,
      topic: body.topic,
      sessionType: body.sessionType,
      environment: body.environment || '',
      notes: body.notes,
    });
    res.status(201).json(interview);
  })
);

interviewsRouter.get(
  '/:id',
  ah(async (req, res) => {
    const interview = await Interview.findById(req.params.id)
      .populate('speaker')
      .populate('interviewer', 'name')
      .lean();
    if (!interview) throw new HttpError(404, 'Interview not found');
    const recordings = await Recording.find({ interview: interview._id }).sort({ createdAt: 1 }).lean();
    res.json({ interview, recordings });
  })
);

interviewsRouter.patch(
  '/:id',
  allow('interviewer'),
  ah(async (req, res) => {
    const body = z
      .object({ status: z.enum(['open', 'completed']).optional(), notes: z.string().optional(), environment: z.string().optional() })
      .parse(req.body);
    const interview = await Interview.findByIdAndUpdate(req.params.id, body, { new: true });
    if (!interview) throw new HttpError(404, 'Interview not found');
    res.json(interview);
  })
);
