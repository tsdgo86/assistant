# Trantourist Call Template — Clean 2025

**Mục tiêu:** Template project cho hệ thống Chat+Call (Conversation SDK cho text + raw WebSocket cho call) với **Auto Reconnect / Auto Re-Call / Auto Resume**. Bao gồm mã client (JS), PCM worklet, và ví dụ server (Flask) để triển khai các endpoint cần thiết.

---

## Cấu trúc dự án

```
trantourist-template/
├─ README.md                 <-- bạn đang xem
├─ package.json
├─ server/
│  └─ app.py                 <-- Flask example (signed urls / voices / tts preview)
├─ static/
│  ├─ index.html
│  ├─ pcm-worklet.js
│  └─ js/
│     ├─ assistant.js        <-- main client file (loads Conversation SDK, UI wiring)
│     └─ callConnection.js   <-- module: call WS with auto-reconnect + resume
└─ .env.example
```

---

## Quick start

1. Tải repo này.
2. Cài Python dependencies (Flask):

```bash
python -m venv venv
source venv/bin/activate
pip install -r server/requirements.txt
```

3. Chạy server:

```bash
python server/app.py
```

4. Mở `static/index.html` trên trình duyệt (hoặc serve bằng Flask/NGINX).

> Lưu ý: `app.py` là ví dụ đơn giản — trong môi trường production bạn sẽ cung cấp signed URLs thực tế cho Conversation SDK và Call WS.

---

## File chính — Nội dung và giải thích

Dưới đây là nội dung mẫu cho các file chính trong template.

---

### `package.json`
```json
{
  "name": "trantourist-call-template",
  "version": "1.0.0",
  "private": true,
  "scripts": {
    "start": "python server/app.py"
  }
}
```

---

### `server/requirements.txt`
```
Flask==2.3.2
Flask-Cors==3.0.10
```

---

### `server/app.py` (ví dụ Flask)

> NOTE: Đây chỉ là mock endpoints để bạn thử nghiệm UI. Đổi logic để trả signed_url thực tế và TTS/voices từ backend của bạn.

```python
from flask import Flask, jsonify, request, send_file
from flask_cors import CORS
import io

app = Flask(__name__)
CORS(app)

# Mock voices
VOICES = [
    {"voice_id": "piper-vi-1", "name":"Piper VI", "labels": {"assistant_voice":"piper_vi"}, "language_trained":"vi"},
    {"voice_id": "piper-en-1", "name":"Piper EN", "labels": {"assistant_voice":"piper_en"}, "language_trained":"en"}
]

@app.route('/api/voices')
def voices():
    return jsonify({"voices": VOICES})

@app.route('/signed-url')
def signed_url():
    # In prod you would create a signed Conversation SDK URL
    # For testing we return a dummy value (client SDK import will likely fail)
    return jsonify({"signed_url": "wss://example.com/fake-signed-url"})

@app.route('/api/get-ws-url', methods=['POST'])
def get_ws():
    # Return WS url for raw call (ConvAI call proxy). For testing return a fake URL.
    return jsonify({"ws_url": "wss://example.com/fake-call-ws"})

@app.route('/api/tts-stream', methods=['POST'])
def tts_stream():
    # Return a tiny silent mp3 blob for test (real service should stream generated audio)
    # Here we generate a 0.5s silent WAV for demo
    import wave, struct
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        frames = b"\x00\x00" * 8000
        w.writeframes(frames)
    buf.seek(0)
    return send_file(buf, mimetype='audio/wav', as_attachment=False, download_name='preview.wav')

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
```

---

### `static/index.html`
```html
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Trantourist Assistant — Demo</title>
  <style>
    body { font-family: system-ui, Arial; padding: 18px; }
    #chat { height: 300px; overflow: auto; border: 1px solid #ddd; padding: 10px; }
    .msg.agent { color: #0b63b5; }
    .msg.user { color: #0a0; }
    #controls { margin-top: 10px; }
  </style>
</head>
<body>
  <h1>Trantourist Assistant — Demo</h1>
  <div id="chat"></div>
  <textarea id="text" rows="3" style="width:100%;"></textarea>
  <div id="controls">
    <button id="send">Send</button>
    <select id="voiceSel"></select>
    <button id="call">Start Call</button>
    <button id="endBtn">End</button>
  </div>
  <pre id="debug" style="height:120px; overflow:auto; border:1px solid #eee; padding:8px; background:#f8f9fb;"></pre>
  <script type="module" src="/static/js/assistant.js"></script>
</body>
</html>
```

---

### `static/js/pcm-worklet.js`
```js
// pcm-worklet.js — Encodes Float32 -> 16-bit PCM, base64 chunks posted via port
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._maxFrames = 16000; // send 1s frames at 16k
  }
  _floatTo16BitPCM(float32Array) {
    const l = float32Array.length;
    const buffer = new ArrayBuffer(l * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < l; i++, offset += 2) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Uint8Array(buffer);
  }
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;
    const chunk = this._floatTo16BitPCM(input[0]);
    this._buffer.push(chunk);
    // join if large enough
    let total = this._buffer.reduce((s, c) => s + c.length, 0);
    if (total >= this._maxFrames * 2) {
      const out = new Uint8Array(total);
      let pos = 0;
      for (const buf of this._buffer) { out.set(buf, pos); pos += buf.length; }
      this.port.postMessage(btoa(String.fromCharCode.apply(null, out)));
      this._buffer = [];
    }
    return true;
  }
}
registerProcessor('pcm-worklet', PCMWorklet);
```

---

### `static/js/callConnection.js`
```js
// callConnection.js — Module that manages call WS + auto-reconnect + resume

export function createCallConnection({ getWsUrl, onOpen, onMessage, onClose, onError, startMic }) {
  let ws = null;
  let reconnectTimer = null;
  let manualClose = false;
  let lastSessionId = null;

  async function connect() {
    try {
      const url = await getWsUrl();
      ws = new WebSocket(url);

      ws.onopen = () => {
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
        if (onOpen) onOpen();
        // restore session
        if (lastSessionId) {
          ws.send(JSON.stringify({ type: 'session.resume', session_id: lastSessionId }));
        }
        // start mic streaming if provided
        try { startMic?.(); } catch(e){ console.warn('startMic failed', e); }
      };

      ws.onmessage = (ev) => {
        let data;
        try { data = JSON.parse(ev.data); } catch { data = null; }
        if (onMessage) onMessage(data);
      };

      ws.onclose = (ev) => {
        if (onClose) onClose(ev);
        if (!manualClose) {
          // auto reconnect with backoff
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      ws.onerror = (err) => {
        if (onError) onError(err);
        try { ws.close(); } catch(e){}
      };

    } catch (e) {
      console.error('connect() failed', e);
      reconnectTimer = setTimeout(connect, 2000);
    }
  }

  connect();

  return {
    send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); },
    close() { manualClose = true; try { ws && ws.close(); } catch(e){} },
    setSessionId(id) { lastSessionId = id; }
  };
}
```

---

### `static/js/assistant.js` (main client)

> Đây là phiên bản gọn của file chính — nó import `createCallConnection` từ `callConnection.js`.

```js
import { createCallConnection } from './callConnection.js';

const SIGNED_URL_ENDPOINT   = '/signed-url';
const CALL_WS_URL_ENDPOINT  = '/api/get-ws-url';
const VOICES_ENDPOINT       = '/api/voices';
const TTS_PREVIEW_ENDPOINT  = '/api/tts-stream';

const chatEl = document.getElementById('chat');
const textEl = document.getElementById('text');
const sendBtn = document.getElementById('send');
const voiceSel = document.getElementById('voiceSel');
const callBtn = document.getElementById('call');
const endBtn = document.getElementById('endBtn');
const debugEl = document.getElementById('debug');

let Conversation, conversation = null;
let textConnected = false;
let callConn = null;
let lastAgentText = '';
let CURRENT_VOICE_ID = null;
let VOICE_LABEL_MAP = {};
let VOICE_LANG_MAP = {};

function log(...args){ console.log(...args); if(debugEl) debugEl.textContent += args.join(' ') + '\n'; }
function addMsg(role, text){ const d = document.createElement('div'); d.className = 'msg '+role; d.textContent = text; chatEl.appendChild(d); }

async function loadVoices(){
  const r = await fetch(VOICES_ENDPOINT); const j = await r.json(); (j.voices||[]).forEach(v=>{
    VOICE_LABEL_MAP[v.voice_id] = (v.labels && (v.labels.assistant_voice||v.labels.voice_label)) || v.name;
    VOICE_LANG_MAP[v.voice_id] = v.language_trained || null;
    const opt = document.createElement('option'); opt.value = v.voice_id; opt.textContent = v.name; voiceSel.appendChild(opt);
  });
  CURRENT_VOICE_ID = voiceSel.value || Object.keys(VOICE_LABEL_MAP)[0];
}

// -- Conversation SDK minimal start (see earlier for full impl)
async function startTextSession(){
  try {
    const mod = await import('https://esm.sh/@elevenlabs/client@0.11.0?bundle');
    Conversation = mod.Conversation;
    const r = await fetch(SIGNED_URL_ENDPOINT); const j = await r.json();
    conversation = await Conversation.startSession({ signedUrl: j.signed_url, connectionType: 'websocket', onConnect: ()=>{ textConnected = true; }, onMessage: ({message, source})=>{ if(message?.text){ addMsg(source==='user'?'user':'agent', message.text); lastAgentText = message.text; } } });
  } catch (e) { log('startTextSession error', e); }
}

async function preview(vid, text){
  try{ const r = await fetch(TTS_PREVIEW_ENDPOINT, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({voice_id:vid, text})}); const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = new Audio(url); await a.play(); }catch(e){ log('preview err', e); }
}

async function onVoiceChange(){
  CURRENT_VOICE_ID = voiceSel.value;
  await preview(CURRENT_VOICE_ID, lastAgentText || 'Xin chao');
  // Apply overrides to text session
  if (conversation) try { conversation.sendUserMessage(`SYSTEM: Use voice_id=${CURRENT_VOICE_ID}`); } catch(e){}
  // Restart call connection to apply overrides
  if (callConn) { callConn.close(); callConn = null; }
  if (callBtn.disabled === false) startCall();
}

async function startCall(){
  callBtn.disabled = true;
  try {
    callConn = createCallConnection({
      getWsUrl: async ()=>{ const r = await fetch(CALL_WS_URL_ENDPOINT, {method:'POST'}); const j = await r.json(); return j.ws_url; },
      onOpen: ()=>{ log('call opened'); },
      onMessage: (m)=>{ if (m?.type === 'agent_response') addMsg('agent', m.agent_response_event.agent_response); if (m?.type==='audio'){} },
      onClose: ()=>{ log('call closed'); callBtn.disabled = false; },
      onError: (e)=>{ log('call error', e); },
      startMic: async ()=>{
        const s = await navigator.mediaDevices.getUserMedia({audio:true});
        const ctx = new AudioContext({ sampleRate: 16000 }); await ctx.audioWorklet.addModule('/static/pcm-worklet.js');
        const src = ctx.createMediaStreamSource(s);
        const worklet = new AudioWorkletNode(ctx, 'pcm-worklet');
        worklet.port.onmessage = (ev)=>{ callConn.send({ user_audio_chunk: ev.data }); };
        src.connect(worklet);
      }
    });
  } catch (e) { log('startCall failed', e); callBtn.disabled = false; }
}

// events
sendBtn.addEventListener('click', ()=>{
  if (!conversation) startTextSession();
  const text = textEl.value.trim(); if (!text) return; addMsg('user', text); conversation?.sendUserMessage(text); textEl.value='';
});
voiceSel.addEventListener('change', onVoiceChange);
callBtn.addEventListener('click', startCall);
endBtn.addEventListener('click', ()=>{ if (callConn) callConn.close(); callConn=null; if (conversation) conversation.endSession(); });

loadVoices();
```

---

## Triển khai & tùy chỉnh

- **Conversation SDK signed_url**: `server/signed_url` phải trả signed URL hợp lệ do ElevenLabs (hoặc ConvAI) cung cấp.
- **Call WS**: `server/api/get-ws-url` trả `ws_url` của ConvAI call ws hoặc flask proxy tới ConvAI.
- **TTS preview**: `server/api/tts-stream` trả blob audio để preview giọng.
- **Secure**: Đảm bảo endpoints chỉ trả signed_url cho client đã xác thực.

---

## Nâng cao (gợi ý tiếp theo)

- Thêm exponential-backoff và jitter cho reconnect.
- Lưu `session_id` vào localStorage để resume across tabs.
- Thêm diagnostics: RTT, packet loss, mic level meter.
- Chuyển sang WebRTC media for full-duplex low-latency.

---

## Kết luận

Bạn đã có một **starter template** gồm client + PCM worklet + sample server để chạy local và thử tính năng Auto Re-Call / Auto Resume. Nếu muốn, mình có thể gửi archive zip của project hoặc tách code thành từng file riêng theo repo (gửi link pastebin / gdrive) — bạn muốn nhận theo dạng nào?

---

*End of README*

