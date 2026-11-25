import { createContext, useContext, useState } from 'react';

// [English, Bangla]
const D = {
  appName: ['Corpus Studio', 'কর্পাস স্টুডিও'],
  dashboard: ['Dashboard', 'ড্যাশবোর্ড'],
  speakers: ['Speakers', 'বক্তা'],
  sessions: ['Sessions', 'সেশন'],
  annotate: ['Annotate', 'টীকা'],
  review: ['Review', 'পর্যালোচনা'],
  export: ['Export', 'এক্সপোর্ট'],
  users: ['Users', 'ব্যবহারকারী'],
  logout: ['Log out', 'লগ আউট'],
  login: ['Log in', 'লগ ইন'],
  email: ['Email', 'ইমেইল'],
  password: ['Password', 'পাসওয়ার্ড'],
  online: ['Online', 'অনলাইন'],
  offline: ['Offline', 'অফলাইন'],
  pendingUploads: ['waiting to upload', 'আপলোডের অপেক্ষায়'],
  syncNow: ['Sync now', 'এখনই সিঙ্ক করুন'],
  save: ['Save', 'সংরক্ষণ'],
  cancel: ['Cancel', 'বাতিল'],
  loading: ['Loading…', 'লোড হচ্ছে…'],
  none: ['None yet', 'এখনো নেই'],
  dialect: ['Dialect', 'আঞ্চলিক ভাষা'],
  all: ['All', 'সব'],

  // dashboard
  speakersTarget: ['Speakers', 'বক্তা'],
  hoursRecorded: ['Hours recorded', 'রেকর্ড করা ঘণ্টা'],
  approvedHours: ['Approved hours', 'অনুমোদিত ঘণ্টা'],
  utterances: ['Utterances', 'উক্তি'],
  flagged: ['Recordings flagged for quality', 'মান-সমস্যায় চিহ্নিত রেকর্ডিং'],
  uncertainCount: ['Marked uncertain', 'অনিশ্চিত চিহ্নিত'],
  consented: ['with consent', 'সম্মতিসহ'],

  // speakers
  speakerInfo: ['Speaker details', 'বক্তার তথ্য'],
  registerSpeaker: ['Register speaker', 'নতুন বক্তা নিবন্ধন'],
  upazila: ['Upazila', 'উপজেলা'],
  village: ['Village (optional, never exported)', 'গ্রাম (ঐচ্ছিক, এক্সপোর্ট হবে না)'],
  ageGroup: ['Age group', 'বয়সসীমা'],
  gender: ['Gender (self-reported)', 'লিঙ্গ (নিজের বলা)'],
  education: ['Education', 'শিক্ষা'],
  yearsInLocality: ['Years in this area', 'এলাকায় কত বছর'],
  otherExposure: ['Other dialects they hear often', 'অন্য যে আঞ্চলিক ভাষা প্রায়ই শোনেন'],
  notes: ['Notes', 'নোট'],
  noNames: ['Do not write names or phone numbers anywhere.', 'কোথাও নাম বা ফোন নম্বর লিখবেন না।'],
  consent: ['Consent', 'সম্মতি'],
  recordings: ['Recordings', 'রেকর্ডিং'],
  search: ['Search ID or upazila', 'আইডি বা উপজেলা খুঁজুন'],

  // consent
  consentTitle: ['Signed consent', 'স্বাক্ষরিত সম্মতি'],
  consentHelp: [
    'Read the paper form aloud, get it signed or thumb-printed, then tick exactly what the speaker agreed to and photograph the form.',
    'কাগজের ফর্মটি পড়ে শোনান, স্বাক্ষর বা টিপসই নিন, তারপর বক্তা ঠিক যেগুলোতে রাজি হয়েছেন সেগুলো টিক দিন এবং ফর্মের ছবি তুলুন।',
  ],
  consentDate: ['Date signed', 'স্বাক্ষরের তারিখ'],
  readAloud: ['Form was read aloud to the speaker', 'ফর্মটি বক্তাকে পড়ে শোনানো হয়েছে'],
  witness: ['Witness name (optional)', 'সাক্ষীর নাম (ঐচ্ছিক)'],
  signedForm: ['Photo or scan of the signed form', 'স্বাক্ষরিত ফর্মের ছবি বা স্ক্যান'],
  viewForm: ['View signed form', 'স্বাক্ষরিত ফর্ম দেখুন'],
  saveConsent: ['Save consent', 'সম্মতি সংরক্ষণ'],
  recordingLocked: ['Recording is locked until consent for recording and transcription is saved.', 'রেকর্ডিং ও লিখিত রূপের সম্মতি সংরক্ষণ না হওয়া পর্যন্ত রেকর্ডিং বন্ধ থাকবে।'],
  withdraw: ['Withdraw consent and delete audio', 'সম্মতি প্রত্যাহার ও অডিও মুছুন'],
  withdrawConfirm: ['This deletes all of this speaker\'s recordings and utterances. Continue?', 'এতে এই বক্তার সব রেকর্ডিং ও উক্তি মুছে যাবে। চালিয়ে যাবেন?'],

  // sessions
  newSession: ['New recording session', 'নতুন রেকর্ডিং সেশন'],
  topic: ['Topic', 'বিষয়'],
  sessionType: ['Session type', 'সেশনের ধরন'],
  environment: ['Setting (e.g. home, quiet)', 'পরিবেশ (যেমন: বাড়ি, শান্ত)'],
  start: ['Start', 'শুরু'],
  prompts: ['Conversation prompts', 'আলাপের প্রশ্ন'],
  promptsHelp: [
    'Ask in your own words. Let the speaker talk freely; hesitations and repeats are good data.',
    'নিজের ভাষায় জিজ্ঞেস করুন। বক্তাকে মন খুলে বলতে দিন; থেমে থেমে বলা বা পুনরাবৃত্তিও ভালো ডেটা।',
  ],
  record: ['Record', 'রেকর্ড'],
  stop: ['Stop & save', 'থামান ও সংরক্ষণ'],
  recording: ['Recording…', 'রেকর্ড হচ্ছে…'],
  tooLoud: ['Too loud — move the mic back', 'খুব জোরে — মাইক একটু দূরে সরান'],
  longWarn: ['Over 20 minutes — consider starting a new recording', '২০ মিনিট পেরিয়েছে — নতুন রেকর্ডিং শুরু করার কথা ভাবুন'],
  savedOnDevice: ['Saved on this device', 'এই ডিভাইসে সংরক্ষিত'],
  uploaded: ['Uploaded', 'আপলোড হয়েছে'],
  failed: ['Upload refused', 'আপলোড প্রত্যাখ্যাত'],
  retry: ['Retry', 'আবার চেষ্টা'],
  backup: ['Save file', 'ফাইল সংরক্ষণ'],
  markCompleted: ['Mark session completed', 'সেশন সম্পন্ন চিহ্নিত করুন'],
  micError: ['Microphone not available. Allow microphone access and use HTTPS.', 'মাইক্রোফোন পাওয়া যাচ্ছে না। মাইকের অনুমতি দিন এবং HTTPS ব্যবহার করুন।'],

  // annotation
  annotationQueue: ['Recordings to annotate', 'টীকার জন্য রেকর্ডিং'],
  dragToSegment: ['Drag on the waveform to mark an utterance. Click a segment to edit it. Space = play/pause.', 'একটি উক্তি চিহ্নিত করতে তরঙ্গরেখায় টানুন। সম্পাদনার জন্য অংশে ক্লিক করুন। স্পেস = চালু/বন্ধ।'],
  dialectText: ['What was said (dialect spelling — do not standardise)', 'যা বলা হয়েছে (আঞ্চলিক বানানে — প্রমিত করবেন না)'],
  standardBangla: ['Standard Bangla (same meaning)', 'প্রমিত বাংলা (একই অর্থ)'],
  english: ['English (optional)', 'ইংরেজি (ঐচ্ছিক)'],
  phonetic: ['Phonetic (optional)', 'ধ্বনিগত রূপ (ঐচ্ছিক)'],
  intent: ['Intent (e.g. asking_destination)', 'উদ্দেশ্য (যেমন: asking_destination)'],
  speechType: ['Speech type', 'বাক্যের ধরন'],
  uncertain: ['I am not sure about this transcription', 'এই লিখিত রূপ নিয়ে আমি নিশ্চিত নই'],
  uncertainNote: ['What is uncertain?', 'কোন অংশ অনিশ্চিত?'],
  vocabulary: ['Local words', 'স্থানীয় শব্দ'],
  term: ['Word', 'শব্দ'],
  meaning: ['Meaning', 'অর্থ'],
  addWord: ['Add word', 'শব্দ যোগ করুন'],
  saveDraft: ['Save draft', 'খসড়া সংরক্ষণ'],
  submit: ['Submit for review', 'পর্যালোচনায় পাঠান'],
  delete: ['Delete', 'মুছুন'],
  playSegment: ['Play segment', 'অংশটি শুনুন'],
  zoom: ['Zoom', 'জুম'],
  markDone: ['Mark recording fully annotated', 'রেকর্ডিংয়ের টীকা সম্পন্ন'],
  selectSegment: ['Drag on the waveform to create a segment, or click an existing one.', 'নতুন অংশ তৈরি করতে তরঙ্গরেখায় টানুন, অথবা আগের অংশে ক্লিক করুন।'],
  reviewerSaid: ['Reviewer comment', 'পর্যালোচকের মন্তব্য'],

  // review
  approve: ['Approve', 'অনুমোদন'],
  reject: ['Reject', 'প্রত্যাখ্যান'],
  rejectComment: ['Why? (required to reject)', 'কেন? (প্রত্যাখ্যানের জন্য আবশ্যক)'],
  nothingToReview: ['Nothing waiting for review.', 'পর্যালোচনার জন্য কিছু নেই।'],

  // export
  exportTitle: ['Export training data', 'প্রশিক্ষণ ডেটা এক্সপোর্ট'],
  statusFilter: ['Include', 'অন্তর্ভুক্ত'],
  approvedOnly: ['Approved only', 'শুধু অনুমোদিত'],
  approvedSubmitted: ['Approved + submitted', 'অনুমোদিত + জমা দেওয়া'],
  publicOnly: ['Only speakers who allowed public audio release', 'শুধু যারা অডিও প্রকাশে সম্মত'],
  includeAudio: ['Include WAV clips', 'WAV ক্লিপসহ'],
  seed: ['Split seed', 'বিভাজন সিড'],
  preview: ['Preview', 'প্রিভিউ'],
  download: ['Download zip', 'জিপ ডাউনলোড'],
  excluded: ['excluded for consent', 'সম্মতির কারণে বাদ'],

  // users
  addUser: ['Add user', 'ব্যবহারকারী যোগ'],
  name: ['Name', 'নাম'],
  role: ['Role', 'ভূমিকা'],
  active: ['Active', 'সক্রিয়'],
};

const ENUMS = {
  topic: {
    everyday: ['Everyday conversation', 'দৈনন্দিন কথাবার্তা'],
    family: ['Family & relationships', 'পরিবার ও সম্পর্ক'],
    agriculture: ['Agriculture & rural work', 'কৃষি ও গ্রামীণ পেশা'],
    food: ['Food & cooking', 'খাবার ও রান্না'],
    education: ['Education', 'শিক্ষা'],
    health: ['Health & healthcare', 'স্বাস্থ্য ও চিকিৎসা'],
    market: ['Shopping & markets', 'কেনাকাটা ও বাজার'],
    history_culture: ['Local history & culture', 'স্থানীয় ইতিহাস ও সংস্কৃতি'],
    directions_transport: ['Directions & transport', 'পথনির্দেশ ও যাতায়াত'],
    storytelling: ['Stories & personal experiences', 'গল্প ও ব্যক্তিগত অভিজ্ঞতা'],
  },
  sessionType: {
    structured: ['Question & answer', 'প্রশ্নোত্তর'],
    spontaneous: ['Spontaneous talk', 'স্বতঃস্ফূর্ত কথা'],
    storytelling: ['Storytelling', 'গল্প বলা'],
    conversation: ['Two-person conversation', 'দুজনের আলাপ'],
  },
  consent: {
    recording: ['Audio recording', 'অডিও রেকর্ডিং'],
    transcription: ['Writing down what was said', 'কথাগুলো লিখে রাখা'],
    modelTraining: ['Training AI models', 'এআই মডেল প্রশিক্ষণ'],
    publicAudioRelease: ['Publishing the audio for research', 'গবেষণার জন্য অডিও প্রকাশ'],
    futureResearch: ['Use in future research', 'ভবিষ্যৎ গবেষণায় ব্যবহার'],
  },
  role: {
    admin: ['Admin', 'অ্যাডমিন'],
    interviewer: ['Interviewer', 'সাক্ষাৎকারগ্রহীতা'],
    annotator: ['Annotator', 'টীকাকার'],
    reviewer: ['Reviewer', 'পর্যালোচক'],
  },
  status: {
    draft: ['Draft', 'খসড়া'],
    submitted: ['Submitted', 'জমা দেওয়া'],
    approved: ['Approved', 'অনুমোদিত'],
    rejected: ['Rejected', 'প্রত্যাখ্যাত'],
    none: ['No consent', 'সম্মতি নেই'],
    granted: ['Consent granted', 'সম্মতি আছে'],
    declined: ['Declined', 'অসম্মত'],
    withdrawn: ['Withdrawn', 'প্রত্যাহৃত'],
    pending: ['Not started', 'শুরু হয়নি'],
    in_progress: ['In progress', 'চলমান'],
    done: ['Done', 'সম্পন্ন'],
    open: ['Open', 'চলমান'],
    completed: ['Completed', 'সম্পন্ন'],
  },
  speechType: {
    statement: ['Statement', 'বিবৃতি'],
    question: ['Question', 'প্রশ্ন'],
    command: ['Request / command', 'অনুরোধ / আদেশ'],
    exclamation: ['Exclamation', 'বিস্ময়'],
    other: ['Other', 'অন্যান্য'],
  },
  gender: {
    female: ['Female', 'নারী'],
    male: ['Male', 'পুরুষ'],
    other: ['Other', 'অন্যান্য'],
    not_stated: ['Prefer not to say', 'বলতে চান না'],
  },
  education: {
    none: ['No formal schooling', 'প্রাতিষ্ঠানিক শিক্ষা নেই'],
    primary: ['Primary', 'প্রাথমিক'],
    secondary: ['Secondary', 'মাধ্যমিক'],
    higher_secondary: ['Higher secondary', 'উচ্চ মাধ্যমিক'],
    tertiary: ['University', 'বিশ্ববিদ্যালয়'],
    not_stated: ['Not stated', 'উল্লেখ নেই'],
  },
};

// Prompts written in standard Bangla; interviewers ask them in their own words.
export const PROMPTS = {
  everyday: ['আজ সকাল থেকে কী কী করলেন?', 'আপনার একটা সাধারণ দিন কেমন কাটে?', 'ছুটির দিনে কী করতে ভালো লাগে?'],
  family: ['আপনার পরিবারে কে কে আছেন?', 'ছোটবেলায় বাড়িতে কেমন দিন কাটত?', 'বিয়ে বা উৎসবে পরিবারে কী কী হয়?'],
  agriculture: ['আপনার এলাকায় কোন কোন ফসল হয়?', 'ধান লাগানো থেকে কাটা পর্যন্ত কী কী কাজ করতে হয়?', 'বন্যা বা খরা হলে চাষিরা কী করেন?'],
  food: ['আপনার প্রিয় খাবার কী, কীভাবে রান্না করেন?', 'বাড়িতে অতিথি এলে কী রান্না হয়?', 'পিঠা বানানোর নিয়ম বলবেন?'],
  education: ['আপনি কোথায় পড়াশোনা করেছেন?', 'এখনকার স্কুল আর আগের স্কুলে পার্থক্য কী?', 'ছেলেমেয়েদের পড়াশোনা নিয়ে আপনার কী ভাবনা?'],
  health: ['অসুখ হলে সাধারণত কোথায় যান?', 'এলাকার হাসপাতাল বা ক্লিনিক কেমন?', 'জ্বর-সর্দিতে বাড়িতে কী করেন?'],
  market: ['বাজারে গিয়ে সাধারণত কী কী কেনেন?', 'দরদাম কীভাবে করেন?', 'এখন জিনিসপত্রের দাম কেমন?'],
  history_culture: ['আপনার এলাকার পুরোনো কোনো গল্প জানেন?', 'এখানে কোন কোন মেলা বা উৎসব হয়?', 'আগের দিনের তুলনায় এলাকা কতটা বদলেছে?'],
  directions_transport: ['এখান থেকে উপজেলা সদরে কীভাবে যাবেন?', 'বাজারে যেতে কোন পথে যান?', 'বর্ষায় যাতায়াতে কী অসুবিধা হয়?'],
  storytelling: ['জীবনের একটা মজার ঘটনা বলুন।', 'কখনো কোনো বিপদে পড়েছিলেন?', 'ছোটবেলার একটা স্মৃতি বলুন।'],
};

const I18nCtx = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('cs_lang') || 'bn');
  const idx = lang === 'bn' ? 1 : 0;
  const t = (k) => D[k]?.[idx] ?? k;
  const te = (group, k) => ENUMS[group]?.[k]?.[idx] ?? k;
  const toggle = () => {
    const next = lang === 'bn' ? 'en' : 'bn';
    localStorage.setItem('cs_lang', next);
    document.documentElement.lang = next;
    setLang(next);
  };
  document.documentElement.lang = lang;
  return <I18nCtx.Provider value={{ lang, t, te, toggle }}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
export const ENUM_KEYS = Object.fromEntries(Object.entries(ENUMS).map(([g, v]) => [g, Object.keys(v)]));
