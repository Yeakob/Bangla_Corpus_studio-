# Corpus Studio

A web app (MongoDB, Express, React, Node) for collecting regional Bangla dialect speech: Cumilla, Noakhali and Chattogram.
Field teams register speakers, record signed consent, record interviews (offline too), segment and transcribe utterances, review them, and export a training-ready dataset.

## Workflow

| Step | Who | Screen |
| --- | --- | --- |
| 1. Register speaker (auto ID `CUM-0001`, no names stored) | Interviewer | Speakers → Register |
| 2. Record signed consent: tick items + photo of the paper form | Interviewer | Speaker page |
| 3. Start a session (topic, type) and record | Interviewer | Speaker page → Start |
| 4. Mark utterances on the waveform, transcribe in dialect spelling + standard Bangla | Annotator | Annotate |
| 5. Approve or reject (rejection needs a comment) | Reviewer | Review |
| 6. Export JSONL/CSV + WAV clips with a speaker-independent split | Reviewer / admin | Export |

Recording is blocked until consent for **recording** and **transcription** is saved.
Only speakers who ticked **training AI models** appear in exports.

## Roles

- **Admin**: everything, plus user management and consent withdrawal (which deletes that speaker's audio).
- **Interviewer**: speakers, consent, sessions, recording.
- **Annotator**: segment and transcribe.
- **Reviewer**: approve/reject and export.

## Run with Docker (recommended)

```bash
JWT_SECRET=$(openssl rand -hex 32) ADMIN_PASSWORD='your-strong-password' docker compose up -d --build
```

Open http://localhost:4000 and log in as `admin@corpus.local` with that password. The admin account is created on first start. Create the other accounts on the **Users** page.

Audio files and consent photos are stored in the `audio-data` volume. Back up that volume and the `mongo-data` volume regularly.

## Run for development

Requirements: Node 18+ and MongoDB running on `localhost:27017`.

```bash
cd server && cp .env.example .env && npm install && npm run dev      # API on :4000
cd client && npm install && npm run dev                               # app on :5173
```

## Using it in the field (phones)

- **The microphone only works over HTTPS** (or on `localhost`). For phones, put the app behind HTTPS, for example on a server with a domain and Caddy/Nginx + Let's Encrypt, or temporarily with a tunnel such as Cloudflare Tunnel.
- Open the app **once while online** on each phone, then log in and open the session. It installs as an app ("Add to Home screen"), so it keeps working with no signal.
- **Offline recording:** every recording is saved on the phone first (IndexedDB), then uploaded. With no signal it waits and uploads by itself when the phone is back online. The header shows how many recordings are waiting. Each recording also has a **Save file** button for a manual backup.
- Register speakers and record consent while online. Recording and the upload queue work offline.
- Audio format: 16 kHz, mono, 16-bit PCM WAV. The browser's echo cancellation, noise suppression and auto-gain are turned off to keep natural speech. The server refuses anything else.
- The interface defaults to Bangla. The **EN / বাংলা** button switches language.

## Data model

`speakers` → `consents` (one per speaker) → `interviews` (sessions) → `recordings` (original WAV, never modified) → `utterances` (the central unit: time span, dialect text, standard Bangla, English, intent, speech type, local-word notes, uncertain flag, review history).

## Export format

`GET /api/export` returns a zip:

```
utterances.jsonl / utterances.csv   one row per utterance
splits/train|validation|test.jsonl  speaker-independent split (70/15/15, seeded)
speakers.csv                        metadata, no names or villages
audio/CUM-U00001.wav …              clip per utterance, cut from the original
manifest.json, README.md
```

Example row:

```json
{"utterance_id":"CUM-U00001","speaker_id":"CUM-0001","dialect":"cumilla","subregion":"debidwar",
 "audio":"audio/CUM-U00001.wav","transcription":"তুই কই যাস?","standard_bangla":"তুই কোথায় যাচ্ছিস?",
 "english":"Where are you going?","intent":"asking_destination","speech_type":"question",
 "source":"spontaneous","validated":true,"split":"train", "...": "..."}
```

Use the same **seed** to reproduce a split. With 10 speakers per dialect you get 7/1–2/1–2 speakers per split, so consider leave-speakers-out cross-validation for evaluation.

## Tests

```bash
cd server && npm test                 # unit tests: WAV parsing/slicing/quality, splits (no DB needed)

# Full end-to-end check against the plan (needs the API + MongoDB running; use a test database):
API_URL=http://localhost:4000 ADMIN_EMAIL=admin@corpus.local ADMIN_PASSWORD=... npm run smoke

cd client && npx vite build && (npx vite preview --port 4173 &) && python3 test/ui_mock_test.py
                                      # browser test of the UI with a mocked API (needs Python Playwright + Chrome)
```

`npm run smoke` walks the whole workflow over HTTP and prints a PASS/FAIL checklist. It covers roles, the consent gate, audio format checks, offline de-duplication, annotation rules, review, the dashboard, the export split and withdrawal.

## Privacy and consent

- No names or phone numbers are stored. Village is optional and never exported.
- A signed paper form plus its photo is stored for every speaker.
- **Withdraw** (admin) marks consent withdrawn and deletes that speaker's recordings and utterances. The consent record is kept.
- Media links carry the login token so `<audio>` tags can play them. Serve the app over HTTPS.
