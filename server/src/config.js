import path from 'node:path';
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT || 4000),
  mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/corpus_studio',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  maxAudioMb: Number(process.env.MAX_AUDIO_MB || 200),
};

if (process.env.NODE_ENV === 'production' && config.jwtSecret === 'dev-secret-change-me') {
  console.warn('[config] WARNING: set JWT_SECRET in production.');
}

// The three pilot dialects. `code` is used in speaker and utterance IDs.
export const DIALECTS = {
  cumilla: { code: 'CUM', district: 'Cumilla', bn: 'কুমিল্লা' },
  noakhali: { code: 'NOA', district: 'Noakhali', bn: 'নোয়াখালী' },
  chattogram: { code: 'CTG', district: 'Chattogram', bn: 'চট্টগ্রাম' },
};
export const DIALECT_KEYS = Object.keys(DIALECTS);

export const ROLES = ['admin', 'interviewer', 'annotator', 'reviewer'];
