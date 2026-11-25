import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import fs from 'node:fs';
import { config, DIALECTS } from './config.js';
import { authRouter, usersRouter } from './routes/auth.js';
import { speakersRouter } from './routes/speakers.js';
import { interviewsRouter } from './routes/interviews.js';
import { recordingsRouter } from './routes/recordings.js';
import { utterancesRouter } from './routes/utterances.js';
import { statsRouter } from './routes/stats.js';
import { exportRouter } from './routes/export.js';
import { AGE_GROUPS, GENDERS, YEARS_IN_LOCALITY, EDUCATION, TOPICS, SESSION_TYPES, SPEECH_TYPES, CONSENT_ITEMS } from './models/index.js';
import { errorHandler } from './utils/helpers.js';

export function createApp() {
  const app = express();
  // Behind a reverse proxy (Caddy/Nginx for HTTPS) set TRUST_PROXY=1 so rate limiting sees real client IPs.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          // the recorder loads its AudioWorklet from a blob: URL
          scriptSrc: ["'self'", 'blob:'],
          mediaSrc: ["'self'", 'blob:'],
          imgSrc: ["'self'", 'data:', 'blob:'],
          workerSrc: ["'self'", 'blob:'],
        },
      },
    })
  );
  app.use(cors({ origin: config.clientOrigin.split(','), credentials: false }));
  app.use(express.json({ limit: '1mb' }));
  if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  // Enumerations the frontend uses to build forms
  app.get('/api/meta', (_req, res) =>
    res.json({ dialects: DIALECTS, AGE_GROUPS, GENDERS, YEARS_IN_LOCALITY, EDUCATION, TOPICS, SESSION_TYPES, SPEECH_TYPES, CONSENT_ITEMS })
  );

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/speakers', speakersRouter);
  app.use('/api/interviews', interviewsRouter);
  app.use('/api/recordings', recordingsRouter);
  app.use('/api/utterances', utterancesRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/export', exportRouter);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));

  // In production the API also serves the built frontend.
  const clientDist = path.resolve(process.env.CLIENT_DIST || '../client/dist');
  if (fs.existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
