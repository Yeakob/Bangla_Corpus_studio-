"""
Browser test of the Corpus Studio frontend with a mocked API.

Drives real Chrome through the field workflow: login, register speaker, consent,
record with a (fake) microphone, offline queue + sync, annotate on the waveform,
review and export preview. The API is mocked in-page so this runs without MongoDB;
the backend itself is covered by server/test/smoke.js.

Usage:  (from client/)  npx vite build && npx vite preview --port 4173 &
        python3 test/ui_mock_test.py
"""
import io, json, re, struct, sys, time, wave, math, os
from playwright.sync_api import sync_playwright

BASE = os.environ.get("UI_URL", "http://localhost:4173")
SHOTS = os.environ.get("SHOTS", "/tmp/ui-shots")
os.makedirs(SHOTS, exist_ok=True)
META = json.load(open(os.environ.get("META_JSON", "/tmp/meta.json")))

results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f" — {detail}"))

def make_wav(seconds=8, rate=16000):
    buf = io.BytesIO()
    w = wave.open(buf, "wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
    frames = bytearray()
    for i in range(seconds * rate):
        t = i / rate
        v = 0.3 * math.sin(2 * math.pi * 220 * t) if int(t) % 2 == 0 else 0.0
        frames += struct.pack("<h", int(v * 32767))
    w.writeframes(bytes(frames)); w.close()
    return buf.getvalue()

def parse_wav(b):
    i = b.find(b"RIFF")
    if i < 0: return None
    b = b[i:]
    fmt = None; off = 12
    while off + 8 <= len(b):
        cid = b[off:off+4]; size = struct.unpack("<I", b[off+4:off+8])[0]; body = off + 8
        if cid == b"fmt ":
            af, ch, rate = struct.unpack("<HHI", b[body:body+8]); bits = struct.unpack("<H", b[body+14:body+16])[0]
            fmt = dict(format=af, channels=ch, rate=rate, bits=bits)
        elif cid == b"data":
            data = b[body:body+size]
            n = len(data) // 2
            samples = struct.unpack(f"<{n}h", data[:n*2]) if n else ()
            peak = max((abs(s) for s in samples), default=0)
            return {**fmt, "seconds": n / fmt["rate"], "peak": peak}
        off = body + size + (size % 2)
    return None

WAV = make_wav()
now = "2026-11-25T08:00:00.000Z"
state = {
    "speaker": None, "consent": None, "interview": None, "recordings": [], "utterances": [],
    "uploads": [], "utt_posts": [], "reviews": [], "offline": False, "upload_attempts": 0,
}
ADMIN = {"id": "u1", "name": "Jakaria", "email": "admin@corpus.local", "role": "admin", "active": True}

def stats():
    return {"dialects": [
        {"dialect": d, "label": v["district"], "labelBn": v["bn"], "speakers": 1 if d == "cumilla" and state["speaker"] else 0,
         "consented": 1 if d == "cumilla" and state["consent"] else 0, "withdrawn": 0, "recordings": len(state["recordings"]) if d == "cumilla" else 0,
         "recordedHours": 0.01 if d == "cumilla" and state["recordings"] else 0, "flaggedRecordings": 0,
         "utterances": {"draft": 0, "submitted": len(state["utterances"]) if d == "cumilla" else 0, "approved": 0, "rejected": 0},
         "uncertain": 0, "approvedHours": 0, "targets": {"speakers": 10, "hours": 5}}
        for d, v in META["dialects"].items()]}

def handle(route, request):
    url = request.url; method = request.method
    path = re.sub(r"^https?://[^/]+", "", url).split("?")[0]
    def ok(body, status=200, ctype="application/json"):
        route.fulfill(status=status, body=body if isinstance(body, (bytes, str)) else json.dumps(body), headers={"content-type": ctype})
    if state["offline"]:
        return route.abort("internetdisconnected")
    if path == "/api/auth/login": return ok({"token": "tok", "user": ADMIN})
    if path == "/api/auth/me": return ok({"user": ADMIN})
    if path == "/api/meta": return ok(META)
    if path == "/api/stats": return ok(stats())
    if path == "/api/speakers" and method == "POST":
        body = json.loads(request.post_data)
        state["speaker"] = {"_id": "s1", "speakerId": "CUM-0001", "district": "Cumilla", "upazilaSlug": body["upazila"].lower(),
                            "consentStatus": "none", "createdAt": now, **body}
        return ok(state["speaker"], 201)
    if path == "/api/speakers": return ok([{**state["speaker"], "recordings": len(state["recordings"]), "recordedSec": 3}] if state["speaker"] else [])
    if path == "/api/speakers/CUM-0001/consent" and method == "POST":
        raw = request.post_data_buffer or b""
        has_file = b'name="signedForm"' in raw
        items = json.loads(re.search(rb'name="items"\r\n\r\n(.*?)\r\n', raw).group(1))
        state["consent_post"] = {"has_file": has_file, "items": items}
        state["consent"] = {"items": items, "consentDate": now, "readAloud": True, "signedFormPath": "consent/x.png"}
        state["speaker"]["consentStatus"] = "granted"
        return ok({"consent": state["consent"], "consentStatus": "granted"}, 201)
    if path == "/api/speakers/CUM-0001":
        return ok({"speaker": state["speaker"], "consent": state["consent"], "interviews": [state["interview"]] if state["interview"] else []})
    if path == "/api/interviews" and method == "POST":
        body = json.loads(request.post_data)
        state["interview"] = {"_id": "i1", "speaker": state["speaker"], "dialect": "cumilla", "topic": body["topic"], "sessionType": body["sessionType"],
                              "status": "open", "createdAt": now, "interviewer": {"name": "Jakaria"}}
        return ok(state["interview"], 201)
    if path == "/api/interviews/i1":
        if method == "PATCH":
            state["interview"]["status"] = "completed"; return ok(state["interview"])
        return ok({"interview": state["interview"], "recordings": state["recordings"]})
    if path == "/api/recordings" and method == "POST":
        state["upload_attempts"] += 1
        raw = request.post_data_buffer or b""
        cid = re.search(rb'name="clientId"\r\n\r\n(.*?)\r\n', raw).group(1).decode()
        info = parse_wav(raw)
        dup = any(u["clientId"] == cid for u in state["uploads"])
        if not dup:
            state["uploads"].append({"clientId": cid, "wav": info})
            state["recordings"].append({"_id": f"r{len(state['recordings'])+1}", "durationSec": info["seconds"], "quality": {"clipping": False, "tooQuiet": False}})
        return ok({"recording": state["recordings"][-1], "duplicate": dup}, 200 if dup else 201)
    if path == "/api/recordings" and method == "GET":
        return ok([{"_id": "r1", "dialect": "cumilla", "durationSec": 8, "annotationStatus": "pending", "utterances": len(state["utterances"]),
                    "speaker": {"speakerId": "CUM-0001"}, "interview": {"topic": "market"}}])
    if path == "/api/recordings/r1/audio": return ok(WAV, ctype="audio/wav")
    if path == "/api/recordings/r1":
        if method == "PATCH": return ok({"annotationStatus": "done"})
        return ok({"_id": "r1", "dialect": "cumilla", "durationSec": 8, "annotationStatus": "pending", "speaker": {"speakerId": "CUM-0001"}})
    if path == "/api/utterances" and method == "POST":
        body = json.loads(request.post_data); state["utt_posts"].append(body)
        u = {"_id": f"t{len(state['utterances'])+1}", "utteranceId": f"CUM-U{len(state['utterances'])+1:05d}", "recording": "r1",
             "dialect": "cumilla", "speaker": {"speakerId": "CUM-0001"}, "annotatedBy": {"name": "A"}, "reviews": [],
             "status": "submitted" if body.get("submit") else "draft", **{k: v for k, v in body.items() if k not in ("submit", "recordingId")}}
        state["utterances"].append(u); return ok(u, 201)
    if path == "/api/utterances" and method == "GET":
        q = url.split("?", 1)[1] if "?" in url else ""
        if "status=submitted" in q: return ok([u for u in state["utterances"] if u["status"] == "submitted"])
        return ok(state["utterances"])
    m = re.match(r"^/api/utterances/(t\d+)/review$", path)
    if m:
        body = json.loads(request.post_data); state["reviews"].append(body)
        for u in state["utterances"]:
            if u["_id"] == m.group(1): u["status"] = body["decision"]
        return ok({"ok": True})
    if re.match(r"^/api/utterances/t\d+/audio$", path): return ok(WAV, ctype="audio/wav")
    if path == "/api/export/preview":
        return ok({"filters": {}, "utterances": 1, "speakers": 1, "excludedForConsent": 0,
                   "splits": {"train": {"utterances": 1, "speakers": ["CUM-0001"], "hours": 0.001}, "validation": {"utterances": 0, "speakers": [], "hours": 0}, "test": {"utterances": 0, "speakers": [], "hours": 0}},
                   "sample": [{"utterance_id": "CUM-U00001", "transcription": "তুই কই যাস?", "split": "train"}]})
    return ok({"error": f"mock: no handler for {method} {path}"}, 404)

def visible(loc, timeout=8000):
    try:
        loc.first.wait_for(state="visible", timeout=timeout); return True
    except Exception:
        return False

_PAGE = []
def pause(sec):
    # Let Playwright process mocked API calls while we wait (time.sleep would block them).
    _PAGE[0].wait_for_timeout(int(sec * 1000))

def wait_for(fn, timeout=10):
    end = time.time() + timeout
    while time.time() < end:
        if fn(): return True
        pause(0.2)
    return False

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=[
        "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"])
    ctx = browser.new_context(service_workers="block", viewport={"width": 1280, "height": 900}, permissions=["microphone"])
    page = ctx.new_page()
    _PAGE.append(page)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and "Failed to load resource" not in m.text and errors.append(m.text))
    page.route("**/api/**", handle)

    # ---- Login (Bangla UI by default) ----
    page.goto(BASE + "/login")
    check("Login page shows Bangla UI by default", page.get_by_role("button", name="লগ ইন").is_visible())
    page.fill('input[type="email"]', "admin@corpus.local"); page.fill('input[type="password"]', "x")
    page.get_by_role("button", name="লগ ইন").click()
    page.wait_for_selector("text=কুমিল্লা")
    check("Dashboard shows the three dialects", all(page.get_by_text(n).first.is_visible() for n in ["কুমিল্লা", "নোয়াখালী", "চট্টগ্রাম"]))
    page.get_by_role("button", name="EN").click()
    check("Language toggle switches to English", page.get_by_text("Hours recorded").first.is_visible())
    page.screenshot(path=f"{SHOTS}/01-dashboard.png", full_page=True)

    # ---- Register speaker ----
    page.get_by_role("link", name="Speakers").click()
    page.get_by_role("button", name="+ Register speaker").click()
    page.get_by_placeholder("Debidwar").fill("Debidwar")
    page.get_by_role("button", name="Register speaker").last.click()
    page.wait_for_url("**/speakers/CUM-0001")
    check("Speaker registered as CUM-0001 and opened", visible(page.get_by_role("heading", name="CUM-0001")))
    check("Recording locked before consent", page.get_by_text("Recording is locked").is_visible())
    page.screenshot(path=f"{SHOTS}/02-speaker-consent.png", full_page=True)

    # ---- Consent ----
    for label in ["Audio recording", "Writing down what was said", "Training AI models"]:
        page.get_by_label(label).check()
    page.set_input_files('input[type="file"]', files=[{"name": "form.png", "mimeType": "image/png", "buffer": b"\x89PNG\r\n\x1a\nfake"}])
    page.get_by_role("button", name="Save consent").click()
    page.wait_for_selector("text=Consent granted")
    cp = state.get("consent_post", {})
    check("Consent sent with signed-form photo and ticked items", cp.get("has_file") and cp["items"]["recording"] and cp["items"]["modelTraining"] and not cp["items"]["publicAudioRelease"], str(cp))

    # ---- New session ----
    page.locator("select").filter(has_text="Everyday conversation").select_option("market")
    page.get_by_role("button", name="Start →").click()
    page.wait_for_url("**/sessions/i1")
    check("Session page shows topic prompts", visible(page.get_by_text("বাজারে গিয়ে সাধারণত কী কী কেনেন?")))

    # ---- Record online ----
    page.get_by_role("button", name="● Record").click()
    page.wait_for_selector("text=Recording…")
    pause(3.2)
    page.screenshot(path=f"{SHOTS}/03-recording.png", full_page=True)
    page.get_by_role("button", name="■ Stop & save").click()
    wait_for(lambda: len(state["uploads"]) == 1, 15)
    page.screenshot(path=f"{SHOTS}/03b-after-stop.png", full_page=True)
    w = state["uploads"][0]["wav"] if state["uploads"] else {}
    check("Recording uploaded automatically", len(state["uploads"]) == 1)
    check("Uploaded WAV is 16 kHz, mono, 16-bit PCM", w.get("rate") == 16000 and w.get("channels") == 1 and w.get("bits") == 16 and w.get("format") == 1, str(w))
    check("Uploaded WAV length matches recording time (~3 s)", 2.5 < w.get("seconds", 0) < 4.5, str(w.get("seconds")))
    check("Uploaded WAV contains sound (not silence)", w.get("peak", 0) > 500, str(w.get("peak")))

    # ---- Record offline, then sync ----
    ctx.set_offline(True); state["offline"] = True
    page.wait_for_selector("text=Offline")
    page.get_by_role("button", name="● Record").click(); page.wait_for_selector("text=Recording…"); pause(2.2)
    page.get_by_role("button", name="■ Stop & save").click()
    check("Offline: page keeps working after recording", visible(page.get_by_text("Saved on this device"), 10000))
    check("Offline: header shows the recording waiting to upload", visible(page.get_by_text("waiting to upload")) and len(state["uploads"]) == 1)
    page.screenshot(path=f"{SHOTS}/04-offline-queue.png", full_page=True)
    # Device back on a network, but the server still unreachable: the item must stay queued.
    ctx.set_offline(False)
    pause(1)
    page.reload()
    check("Queued recording survives a page reload (IndexedDB)", visible(page.get_by_text("Saved on this device")))
    check("Session page opens from the device cache when the server is unreachable", visible(page.get_by_text("Shopping & markets")))
    check("Nothing uploaded while the server is unreachable", len(state["uploads"]) == 1)
    state["offline"] = False
    page.get_by_text("waiting to upload").click()  # "Sync now"
    synced = wait_for(lambda: len(state["uploads"]) == 2, 15)
    check("Connection back: queued recording uploads", synced, f"uploads={len(state['uploads'])} attempts={state['upload_attempts']} ids={[u['clientId'][:8] for u in state['uploads']]}")
    check("Queue clears after upload", wait_for(lambda: not page.get_by_text("waiting to upload").is_visible(), 8))
    check("Uploaded recordings listed on the session page", visible(page.get_by_text("Uploaded")))

    # ---- Annotate ----
    page.goto(BASE + "/annotate/r1")
    page.wait_for_selector("text=Drag on the waveform")
    pause(1.5)  # decode
    box = page.locator("div.overflow-hidden.rounded-lg.bg-stone-50").bounding_box()
    y = box["y"] + box["height"] / 2
    page.mouse.move(box["x"] + 60, y); page.mouse.down(); page.mouse.move(box["x"] + 200, y, steps=10); page.mouse.up()
    page.wait_for_selector("text=Play segment", timeout=5000)
    page.get_by_label("What was said").fill("তুই কই যাস?")
    page.get_by_label("Standard Bangla").fill("তুই কোথায় যাচ্ছিস?")
    page.get_by_label("Intent").fill("asking_destination")
    page.get_by_role("button", name="+ Add word").click()
    page.get_by_placeholder("Word").fill("কই"); page.get_by_placeholder("Meaning").fill("কোথায়")
    page.screenshot(path=f"{SHOTS}/05-annotate.png", full_page=True)
    page.get_by_role("button", name="Submit for review").click()
    wait_for(lambda: len(state["utt_posts"]) == 1, 5)
    up = state["utt_posts"][0] if state["utt_posts"] else {}
    check("Dragging on the waveform creates a timed segment", up.get("end", 0) > up.get("start", -1) >= 0, str(up))
    check("Dialect text saved exactly as typed (not normalised)", up.get("dialectText") == "তুই কই যাস?")
    check("Standard Bangla, intent and vocabulary sent", up.get("standardBangla") and up.get("intent") == "asking_destination" and up.get("vocabulary") == [{"term": "কই", "meaning": "কোথায়", "note": ""}], str(up))
    check("Submitted for review", up.get("submit") is True)

    # ---- Review ----
    page.get_by_role("link", name="Review").click()
    page.wait_for_selector("text=CUM-U00001")
    page.screenshot(path=f"{SHOTS}/06-review.png", full_page=True)
    page.get_by_role("button", name="Approve").click()
    wait_for(lambda: len(state["reviews"]) == 1, 5)
    check("Reviewer approves from the review queue", state["reviews"] and state["reviews"][0]["decision"] == "approved")

    # ---- Export ----
    page.get_by_role("link", name="Export").click()
    page.get_by_role("button", name="Preview").click()
    page.wait_for_selector("text=validation")
    check("Export preview shows train/validation/test split", page.get_by_text("CUM-0001").first.is_visible())
    page.screenshot(path=f"{SHOTS}/07-export.png", full_page=True)

    # ---- Phone layout ----
    m = browser.new_context(service_workers="block", viewport={"width": 390, "height": 844}, permissions=["microphone"], is_mobile=True)
    mp = m.new_page(); mp.route("**/api/**", handle)
    mp.goto(BASE + "/login"); mp.evaluate("localStorage.setItem('cs_token','tok'); localStorage.setItem('cs_lang','en'); localStorage.setItem('cs_user', JSON.stringify(%s))" % json.dumps(ADMIN))
    mp.goto(BASE + "/sessions/i1"); mp.wait_for_selector("text=Record")
    wide = mp.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
    check("Phone: session page fits the screen (no sideways scroll)", not wide)
    mp.screenshot(path=f"{SHOTS}/08-phone-session.png", full_page=True)

    check("No JavaScript errors in the browser", not errors, "; ".join(errors[:3]))
    browser.close()

failed = [r for r in results if not r[1]]
print(f"\n{len(results) - len(failed)}/{len(results)} UI checks passed")
sys.exit(1 if failed else 0)
