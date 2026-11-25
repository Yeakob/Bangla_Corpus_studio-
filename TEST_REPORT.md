# Test report — plan conformance (2026-11-25)

## What was run

| Test | Result |
| --- | --- |
| Server unit tests (`npm test`): WAV parsing/slicing/quality, speaker-independent split, slugs | **10/10 pass** |
| Browser test (`client/test/ui_mock_test.py`) in Chrome with a fake microphone, API mocked, served by the real Express server | **27/27 pass** |
| Server starts, serves the app, security headers allow the recorder, protected routes refuse anonymous requests | pass |
| End-to-end API test (`server/test/smoke.js`, ~60 checks) | **Not run here.** MongoDB could not be downloaded in the build environment. Run it once on your machine (see README). |

## Plan items checked in the browser test

- Bangla UI by default; English toggle
- Dashboard per dialect (Cumilla, Noakhali, Chattogram) with targets
- Speaker registration → `CUM-0001`; no name fields
- Recording locked before consent; consent saved with signed-form photo and per-item ticks
- Session prompts per topic
- Recorder output: **16 kHz, mono, 16-bit PCM WAV**, correct length, real sound
- Offline: recording kept on the device, survives page reload, uploads when the connection returns, queue clears
- Waveform segmentation creates a timed utterance; dialect text kept exactly as typed; standard Bangla, intent, local words sent; submit for review
- Reviewer approval; export preview with train/validation/test split
- Phone layout fits a 390 px screen; no JavaScript errors

## Bugs found and fixed during testing

1. **Offline page blanked:** after recording with no connection, the session page was replaced by an error. Now the page keeps the last data and opens from a device cache.
2. **Partial edits wiped data:** with zod 4, saving one field of an utterance or speaker reset all other fields to blank. Updates now apply only the fields sent.
3. **Recorder blocked in production:** the server's Content-Security-Policy blocked the recorder's `blob:` AudioWorklet. Policy updated; verified by running the browser test against the Express server.
4. Archiver 8 import changed (`ZipArchive`); export fixed.

## What `npm run smoke` checks (run it once with MongoDB)

Login and roles · speaker IDs per dialect · consent gate and signed form · WAV format refusal (stereo, 8 kHz, 8-bit, non-WAV) · original audio byte-for-byte unchanged · offline re-upload de-duplication · utterance IDs, time checks, required fields · review rules (rejection needs a comment, annotators can't approve, approved = locked) · dashboard numbers · export fields match the plan's JSON, speaker-independent and reproducible splits, consent-based exclusion, zip contents · withdrawal deletes audio and blocks new sessions.
