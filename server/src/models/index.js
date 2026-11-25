import mongoose from 'mongoose';
import { DIALECT_KEYS, ROLES } from '../config.js';

const { Schema, model } = mongoose;
const ref = (name) => ({ type: Schema.Types.ObjectId, ref: name });

// ---------- Counter (for human-readable IDs like CUM-0001) ----------
const counterSchema = new Schema({ _id: String, seq: { type: Number, default: 0 } });
export const Counter = model('Counter', counterSchema);

export async function nextSeq(key) {
  const c = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return c.seq;
}

// ---------- User ----------
const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);
userSchema.methods.toSafe = function () {
  return { id: this._id, name: this.name, email: this.email, role: this.role, active: this.active };
};
export const User = model('User', userSchema);

// ---------- Speaker ----------
// No names or phone numbers are stored: only what the research needs.
export const AGE_GROUPS = ['18-30', '31-45', '46-60', '60+'];
export const GENDERS = ['female', 'male', 'other', 'not_stated'];
export const YEARS_IN_LOCALITY = ['<5', '5-10', '10-20', '20+'];
export const EDUCATION = ['none', 'primary', 'secondary', 'higher_secondary', 'tertiary', 'not_stated'];

const speakerSchema = new Schema(
  {
    speakerId: { type: String, required: true, unique: true }, // CUM-0001
    dialect: { type: String, enum: DIALECT_KEYS, required: true },
    district: { type: String, required: true },
    upazila: { type: String, required: true, trim: true },
    upazilaSlug: { type: String, required: true },
    village: { type: String, trim: true }, // optional; never exported
    ageGroup: { type: String, enum: AGE_GROUPS, required: true },
    gender: { type: String, enum: GENDERS, default: 'not_stated' },
    education: { type: String, enum: EDUCATION, default: 'not_stated' },
    nativeDialect: { type: String, enum: DIALECT_KEYS, required: true },
    yearsInLocality: { type: String, enum: YEARS_IN_LOCALITY, required: true },
    otherDialectExposure: [{ type: String, enum: DIALECT_KEYS }],
    notes: String,
    consentStatus: {
      type: String,
      enum: ['none', 'granted', 'declined', 'withdrawn'],
      default: 'none',
    },
    registeredBy: ref('User'),
  },
  { timestamps: true }
);
export const Speaker = model('Speaker', speakerSchema);

// ---------- Consent ----------
// Recording requires `recording` and `transcription`. Each other item is optional
// and controls what the data may be used for.
export const CONSENT_ITEMS = [
  'recording',
  'transcription',
  'modelTraining',
  'publicAudioRelease',
  'futureResearch',
];
const consentSchema = new Schema(
  {
    speaker: { ...ref('Speaker'), required: true, unique: true },
    items: Object.fromEntries(CONSENT_ITEMS.map((k) => [k, { type: Boolean, default: false }])),
    consentDate: { type: Date, required: true },
    signedFormPath: String, // photo/scan of the signed paper form
    signedFormMime: String,
    readAloud: { type: Boolean, default: false },
    witnessName: String,
    collectedBy: ref('User'),
    withdrawnAt: Date,
    withdrawalNote: String,
  },
  { timestamps: true }
);
export const Consent = model('Consent', consentSchema);

// ---------- Interview (session) ----------
export const TOPICS = [
  'everyday',
  'family',
  'agriculture',
  'food',
  'education',
  'health',
  'market',
  'history_culture',
  'directions_transport',
  'storytelling',
];
export const SESSION_TYPES = ['structured', 'spontaneous', 'storytelling', 'conversation'];

const interviewSchema = new Schema(
  {
    speaker: { ...ref('Speaker'), required: true },
    dialect: { type: String, enum: DIALECT_KEYS, required: true },
    interviewer: ref('User'),
    topic: { type: String, enum: TOPICS, required: true },
    sessionType: { type: String, enum: SESSION_TYPES, default: 'structured' },
    environment: { type: String, default: '' }, // e.g. "home, quiet"
    notes: String,
    status: { type: String, enum: ['open', 'completed'], default: 'open' },
  },
  { timestamps: true }
);
export const Interview = model('Interview', interviewSchema);

// ---------- Recording ----------
const recordingSchema = new Schema(
  {
    interview: { ...ref('Interview'), required: true },
    speaker: { ...ref('Speaker'), required: true },
    dialect: { type: String, enum: DIALECT_KEYS, required: true },
    filePath: { type: String, required: true }, // original, never modified
    sizeBytes: Number,
    sampleRate: Number,
    channels: Number,
    bitDepth: Number,
    durationSec: Number,
    quality: {
      peakDbfs: Number,
      rmsDbfs: Number,
      clippingRatio: Number,
      clipping: Boolean,
      tooQuiet: Boolean,
      formatOk: Boolean,
    },
    clientId: { type: String, unique: true, sparse: true }, // offline sync de-duplication
    recordedAt: Date,
    uploadedBy: ref('User'),
    notes: String,
    annotationStatus: {
      type: String,
      enum: ['pending', 'in_progress', 'done'],
      default: 'pending',
    },
  },
  { timestamps: true }
);
export const Recording = model('Recording', recordingSchema);

// ---------- Utterance (the central unit of the dataset) ----------
export const SPEECH_TYPES = ['statement', 'question', 'command', 'exclamation', 'other'];
export const UTTERANCE_STATUS = ['draft', 'submitted', 'approved', 'rejected'];

const reviewSchema = new Schema(
  {
    reviewer: ref('User'),
    decision: { type: String, enum: ['approved', 'rejected'], required: true },
    comment: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const utteranceSchema = new Schema(
  {
    utteranceId: { type: String, required: true, unique: true }, // CUM-U00001
    recording: { ...ref('Recording'), required: true },
    interview: ref('Interview'),
    speaker: { ...ref('Speaker'), required: true },
    dialect: { type: String, enum: DIALECT_KEYS, required: true },
    start: { type: Number, required: true, min: 0 },
    end: { type: Number, required: true },
    dialectText: { type: String, default: '' }, // what was said, dialect spelling preserved
    standardBangla: { type: String, default: '' },
    english: { type: String, default: '' },
    phonetic: { type: String, default: '' },
    intent: { type: String, default: '' },
    speechType: { type: String, enum: SPEECH_TYPES, default: 'statement' },
    vocabulary: [{ term: String, meaning: String, note: String, _id: false }],
    uncertain: { type: Boolean, default: false },
    uncertainNote: String,
    status: { type: String, enum: UTTERANCE_STATUS, default: 'draft' },
    annotatedBy: ref('User'),
    reviews: [reviewSchema],
  },
  { timestamps: true }
);
utteranceSchema.index({ recording: 1, start: 1 });
utteranceSchema.index({ status: 1, dialect: 1 });
export const Utterance = model('Utterance', utteranceSchema);
