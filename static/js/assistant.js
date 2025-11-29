// assistant.js — Trantourist Assistant (fixed, 2025-11)
import { changeMessageVoice } from "./i18n.js";

// ====================== CONFIG ENDPOINTS ======================
const SIGNED_URL_ENDPOINT   = "/api/signed-url";
const CALL_WS_URL_ENDPOINT  = "/api/get-ws-url";
const VOICES_ENDPOINT       = "/api/voices";
const TTS_PREVIEW_ENDPOINT  = "/api/tts-stream";

/////////////////////// DOM ///////////////////////
const chatEl   = document.getElementById("chat");
const textEl   = document.getElementById("text");
const sendBtn  = document.getElementById("send");
const statusEl = document.getElementById("status");
const debugEl  = document.getElementById("debug");
const voiceSel = document.getElementById("voiceSel");
const tourCodeEl     = document.getElementById("tourCode");
const customerCodeEl = document.getElementById("customerCode");
const orderCodeEl    = document.getElementById("orderCode");
const endBtn  = document.getElementById("endBtn");
const callBtn = document.getElementById("call");
const uiLangBtn  = document.getElementById("uiLangBtn");
const uiLangMenu = document.getElementById("uiLangMenu");
const uiLangFlag = document.getElementById("uiLangFlag");
const uiLangText = document.getElementById("uiLangText");

/////////////////////// Small utils ///////////////////////
function logDebug(...args){
  console.log(...args);
  if (debugEl) {
    debugEl.textContent +=
      args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ") +
      "\n";
  }
}
function addMsg(role, text){
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function safeJSON(text){ try { return JSON.parse(text); } catch { return null; } }
function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

/////////////////////// STATE ///////////////////////
// Conversation SDK (text)
let Conversation, conversation = null;
let textConnected = false;
let textConnecting = false;
let textHeartbeat = null;

// Call WS (raw)
let callWs = null;
let callMicStream = null;
let callMicCtx = null;
let callAudioQueue = [];
let callPlaying = false;
let manualEnd = false;
let callOutCtx = null;

// Voice metadata
let VOICE_LABEL_MAP = {}; // voice_id -> label
let VOICE_LANG_MAP  = {}; // voice_id -> trained language
let CURRENT_VOICE_ID = null;
let CURRENT_VOICE_LABEL = null;
let CURRENT_VOICE_LANG = "auto"; 

// 🔥 cờ báo cần restart session theo voice mới
let pendingVoiceChange = false;
// Last agent text (for preview/resay)
let lastAgentText = "";

// UI state
let uiLang = localStorage.getItem("ui_lang") || "vi";

// ======================
// ANTI-DUPLICATE MESSAGE
// ======================
let lastDisplayedAgentMsg = "";

function addAgentMsgOnce(text) {
  if (!text) return;
  if (text.trim() === lastDisplayedAgentMsg.trim()) return; // block duplicate
  lastDisplayedAgentMsg = text.trim();
  addMsg("agent", text);
}

/////////////////////// UI language helper (minimal) ///////////////////////
function setUILangHeader(lang){
  try {
    if (uiLangFlag)
      uiLangFlag.textContent = ({ vi: "🇻🇳", en: "🇬🇧" }[lang] || "🌐");
  } catch {}
  if (uiLangText) uiLangText.textContent = (lang || "??").toUpperCase();
  localStorage.setItem("ui_lang", lang);
  uiLang = lang;
}

if (uiLangBtn && uiLangMenu) {
  uiLangBtn.addEventListener("click", ()=> {
    const open = uiLangMenu.classList.toggle("open");
    uiLangBtn.setAttribute("aria-expanded", open ? "true":"false");
  });
  document.addEventListener("click", (e)=> {
    if (!uiLangMenu.contains(e.target) && !uiLangBtn.contains(e.target)){
      uiLangMenu.classList.remove("open");
      uiLangBtn.setAttribute("aria-expanded","false");
    }
  });
  uiLangMenu.querySelectorAll?.(".ui-lang-item")?.forEach(item=>{
    item.addEventListener("click", ()=>{
      const lang = item.getAttribute("data-lang");
      setUILangHeader(lang);
      uiLangMenu.classList.remove("open");
      uiLangBtn.setAttribute("aria-expanded","false");
    });
  });
}
setUILangHeader(uiLang);


async function ensureTextSessionFresh() {
  // Nếu chưa có session hoặc đang có cờ đổi voice, thì restart
  if (pendingVoiceChange || !conversation || !textConnected) {
    try {
      await restartTextSession();
    } catch (e) {
      logDebug("ensureTextSessionFresh restartTextSession error:", e.message || e);
    }
    pendingVoiceChange = false;
  }
}


/////////////////////// Voice loading & management ///////////////////////
async function loadVoices(){
  try {
    const res = await fetch(VOICES_ENDPOINT, { cache: "no-store" });
    const data = await res.json();
    const voices = data.voices || [];
    voiceSel.innerHTML = "";
    VOICE_LABEL_MAP = {};
    VOICE_LANG_MAP = {};

   voices.forEach(v => {
      const id = v.voice_id;
      if (!id) return;

      const name = v.name || id;

      // 🔥 cố gắng bắt language từ nhiều field khác nhau
      const trained =
        v.language_trained ||
        v.language ||
        v.default_language ||
        (v.labels && (v.labels.language || v.labels.lang || v.labels.voice_lang)) ||
        null;

      const label =
        (v.labels && (v.labels.assistant_voice || v.labels.voice_label)) ||
        name;

      VOICE_LABEL_MAP[id] = label;
      VOICE_LANG_MAP[id]  = trained || "auto";

      const opt = document.createElement("option");
      opt.value = id;
      opt.textContent = trained
        ? `${name} • ${trained.toUpperCase()}`
        : name;

      // 🔥 lưu language vào data attribute
      opt.dataset.lang = trained || "auto";

      voiceSel.appendChild(opt);
    });

    const saved = localStorage.getItem("selected_voice");
    if (saved && VOICE_LABEL_MAP[saved]) {
      voiceSel.value = saved;
      CURRENT_VOICE_ID    = saved;
      CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[saved];
      CURRENT_VOICE_LANG  = VOICE_LANG_MAP[saved] || "auto";
    } else if (voiceSel.options.length > 0) {
      const first = voiceSel.options[0];
      CURRENT_VOICE_ID    = first.value;
      CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[first.value] || null;
      CURRENT_VOICE_LANG  = first.dataset.lang || VOICE_LANG_MAP[first.value] || "auto";
    }
  } catch (e) {
    logDebug("loadVoices failed:", e.message || e);
    voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
    CURRENT_VOICE_ID = "default";
    CURRENT_VOICE_LABEL = null;
  }
}

function wrapWithVoiceTag(text){
  if (!CURRENT_VOICE_LABEL) return text;
  return `<${CURRENT_VOICE_LABEL}>${text}</${CURRENT_VOICE_LABEL}>`;
}


function saveVoiceSelection(voiceId){
  localStorage.setItem("selected_voice", voiceId);
}

/////////////////////// TTS preview ///////////////////////
async function previewVoiceStream(voiceId, text){
  try {
    const res = await fetch(TTS_PREVIEW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: voiceId, text })
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=> "");
      throw new Error(`TTS failed: ${res.status} ${txt}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = () => URL.revokeObjectURL(url);
    await audio.play().catch(e=> logDebug("Preview autoplay blocked:", e.message || e));
  } catch (e) {
    logDebug("previewVoiceStream error:", e.message || e);
  }
}

/////////////////////// Conversation SDK (text session) ///////////////////////
async function fetchSignedUrl(){
  const r = await fetch(SIGNED_URL_ENDPOINT, { cache: "no-store" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "signed_url error");
  if (!j.signed_url) throw new Error("signed_url missing");
  return j.signed_url;
}

// ✅ startTextSession chỉ resolve SAU khi onConnect chạy
async function startTextSession(){
  if (textConnected && conversation) return;
  if (textConnecting) {
    // nếu đang connect, đợi tí
    while (textConnecting) await sleep(100);
    return;
  }

  textConnecting = true;
  statusEl.textContent = "text: connecting...";

  try {
    if (!Conversation) throw new Error("Conversation SDK not loaded");
    const signedUrl = await fetchSignedUrl();

    let connectResolve, connectReject;
    const connectedPromise = new Promise((res, rej)=> {
      connectResolve = res;
      connectReject = rej;
    });

    const override = getCurrentConversationOverride();

    conversation = await Conversation.startSession({
      signedUrl,
      connectionType: "websocket",
      overrides: {
        agent: {
          language: override.agent.language,  // ví dụ "vi"
        },
        tts: {
          voiceId: override.tts.voice_id,     // LƯU Ý: camelCase cho SDK
        },
      },
      onConnect: async () => {
        textConnected = true;
        textConnecting = false;
        statusEl.textContent = "text: connected";
        updateEndState();

        try { await conversation.setMicMuted(true); } catch {}
        textHeartbeat = setInterval(() => {
          try { conversation?.sendUserActivity(); } catch {}
        }, 5000);

        logDebug("Conversation onConnect with overrides:", override);
      },
      onDisconnect: () => {
        logDebug("Conversation onDisconnect");
        textConnected = false;
        textConnecting = false;
        if (textHeartbeat) clearInterval(textHeartbeat);
        textHeartbeat = null;
        conversation = null;
        statusEl.textContent = "text: disconnected";
        updateEndState();
        if (!manualEnd) attemptTextReconnect();
      },
      onError: (e) => {
        logDebug("Conversation onError:", e?.message || e);
        textConnected = false;
        textConnecting = false;
        if (textHeartbeat) clearInterval(textHeartbeat);
        textHeartbeat = null;
        conversation = null;
        statusEl.textContent = "text: error";
        updateEndState();
        connectReject(e);
        attemptTextReconnect();
      },
      onMessage: ({ message, source }) => {
        if (!message?.text) return;

        if (source === "user") {
          addMsg("user", message.text);
        } else {
           lastAgentText = message.text;

          // nếu cuộc gọi đang hoạt động → KHÔNG hiển thị text
          if (SessionLock.activeCall) return;

          // nếu không call → cho hiện text như bình thường
          addAgentMsgOnce(message.text);

          // nếu agent nói câu kiểu kết thúc -> end session
          const t = message.text.toLowerCase();
          const isEnding =
            /kết thúc cuộc gọi|cuộc gọi kết thúc|tạm biệt|hẹn gặp lại|goodbye|end call|bye/.test(t);
          if (isEnding && !manualEnd) {
            endAll();
          }
        }
      }
    });

    // Đợi tới khi onConnect chạy xong
    await connectedPromise;
  } catch (err) {
    logDebug("startTextSession failed:", err.message || err);
    textConnecting = false;
    conversation = null;
    statusEl.textContent = "text: cannot connect";
    updateEndState();
    throw err;
  }
}

let textReconnectAttempts = 0;
async function attemptTextReconnect() {
  if (manualEnd) {
    console.warn("Reconnect blocked due to manual END");
    return;
  }
  if (textReconnectAttempts > 5) return;

  textReconnectAttempts++;
  const delay = Math.min(30000, 1000 * Math.pow(2, textReconnectAttempts));
  await sleep(delay);

  try {
    await startTextSession();
    textReconnectAttempts = 0;
  } catch {}
}

async function sendCurrentText() {
  const raw = textEl.value.trim();
  if (!raw) return;
  addMsg("user", raw);

  try {
    // Đảm bảo có session (nếu bật auto trong init thì thường đã có)
    if (!conversation || !textConnected) {
      await startTextSession();
    }
    if (!conversation || !textConnected) {
      addMsg("agent", "Unable to send — text session not connected.");
      return;
    }
  } catch {
    addMsg("agent", "Unable to send — text session not connected.");
    return;
  }

  const tagged = wrapWithVoiceTag(raw);
  try {
    conversation.sendUserMessage(tagged);
    conversation.sendUserActivity();
  } catch (e) {
    logDebug("sendCurrentText error:", e.message || e);
    addMsg("agent", "Failed to send message: " + (e.message || e));
  }
  textEl.value = "";
  updateSendState();
  textEl.focus();
}

async function restartTextSession(){
  try {
    if (conversation) await conversation.endSession();
  } catch {}
  conversation = null;
  textConnected = false;
  textConnecting = false;
  if (textHeartbeat) clearInterval(textHeartbeat);
  textHeartbeat = null;
  await startTextSession();
}

// Build override cho voice + language hiện tại
function getCurrentConversationOverride() {
  const voiceId = CURRENT_VOICE_ID;
  const lang =
    CURRENT_VOICE_LANG ||
    (voiceId && VOICE_LANG_MAP[voiceId]) ||
    "auto";

  return {
    tts: {
      voice_id: voiceId || null      // snake_case cho WS
    },
    agent: {
      language: lang                 // "vi", "en", "hi", ...
    }
  };
}

/////////////////////// Lookup helper ///////////////////////
async function lookupInfo(){
  const tourCode = tourCodeEl?.value.trim() || "";
  const customerCode = customerCodeEl?.value.trim() || "";
  const orderCode = orderCodeEl?.value.trim() || "";
  if (!tourCode && !customerCode && !orderCode){
    addMsg("agent", "Vui lòng nhập một trong: Tour Code, Customer Code, Order Code.");
    return;
  }
  const payload = `LOOKUP REQUEST IN COMPANY SYSTEM:
- Tour Code: ${tourCode || "N/A"}
- Customer Code: ${customerCode || "N/A"}
- Order/Booking Code: ${orderCode || "N/A"}
INSTRUCTIONS:
1) Look up these codes in the internal system using tools/webhooks.
2) Return itinerary stops in correct order.
3) Return estimated timing per stop + main hotels/restaurants (if any).
If no data found, clearly say so. Do NOT invent.`;
  textEl.value = payload;
  updateSendState();
  await sendCurrentText();
}

/////////////////////// CALL (raw WS) ///////////////////////
// Gửi qua WS nếu open
function callWsSend(obj) {
  if (callWs && callWs.readyState === WebSocket.OPEN) {
    callWs.send(JSON.stringify(obj));
  }
}

// Play audio base64 từ server (audio/mpeg)
async function playCallBase64Audio(b64, format = "mp3") {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));

  // Nếu là PCM 16k raw:
  if (format === "pcm_16000") {
    if (!callOutCtx) {
      callOutCtx = new AudioContext({ sampleRate: 16000 });
    }

    // 2 bytes / sample
    const sampleCount = bytes.length / 2;
    const buffer = callOutCtx.createBuffer(1, sampleCount, 16000);
    const ch = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      const lo = bytes[i * 2];
      const hi = bytes[i * 2 + 1];
      let sample = (hi << 8) | lo;           // int16
      if (sample > 32767) sample -= 65536;   // convert to signed
      ch[i] = sample / 32768;               // [-1, 1]
    }

    const src = callOutCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(callOutCtx.destination);
    src.start();
    return;
  }

  // Còn lại coi như MP3
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(e =>
    logDebug("call audio play failed:", e.message || e)
  );
}

// Lấy signed WS URL cho call
async function getCallWsUrl() {
  const r = await fetch(CALL_WS_URL_ENDPOINT, { method: "POST" });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "no ws_url");
  if (!j.ws_url) throw new Error("ws_url missing");
  return j.ws_url;
}

// Bắt đầu lấy mic (PCM 16k) – cần /pcm-worklet.js
async function callStartMicPCM() {
  callMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  callMicCtx = new AudioContext({ sampleRate: 16000 });

  await callMicCtx.audioWorklet.addModule("/pcm-worklet.js");

  const src = callMicCtx.createMediaStreamSource(callMicStream);
  const worklet = new AudioWorkletNode(callMicCtx, "pcm-worklet");

  worklet.port.onmessage = ev => {
    const b64 = ev.data; // base64-encoded raw pcm chunk
    callWsSend({ user_audio_chunk: b64 });
  };

  src.connect(worklet);
  logDebug("callStartMicPCM: mic started");
}

// Dừng mic
function callStopMicPCM() {
  try {
    if (callMicStream) {
      callMicStream.getTracks().forEach(t => t.stop());
    }
  } catch (e) {
    logDebug("callStopMicPCM stream stop error:", e.message || e);
  }

  try {
    if (callMicCtx && callMicCtx.state !== "closed") {
      callMicCtx.close();
    }
  } catch (e) {
    logDebug("callStopMicPCM ctx close error:", e.message || e);
  }

  callMicStream = null;
  callMicCtx = null;

  logDebug("callStopMicPCM: microphone stopped");
}

// Restart call WS với voice/language mới
async function restartCallWs() {
  logDebug("restartCallWs: begin");

  // dừng mic & đóng ws cũ
  try { callStopMicPCM(); } catch (e) {
    logDebug("restartCallWs: callStopMicPCM err:", e.message || e);
  }

  try {
    if (callWs && callWs.readyState === WebSocket.OPEN) {
      callWs.close(1000, "voice_changed_restart");
    }
  } catch (e) {
    logDebug("restartCallWs: callWs.close err:", e.message || e);
  }

  callWs = null;

  // lấy url mới & connect lại
  let wsUrl;
  try {
    wsUrl = await getCallWsUrl();
  } catch (e) {
    logDebug("restartCallWs: getCallWsUrl failed:", e.message || e);
    return;
  }

  try {
    connectCallWs(wsUrl);
  } catch (e) {
    logDebug("restartCallWs: connectCallWs failed:", e.message || e);
  }
}
// Kết nối WebSocket call
function connectCallWs(wsUrl) {
  if (!wsUrl) throw new Error("wsUrl required");
  callWs = new WebSocket(wsUrl);

  callWs.onopen = async () => {
    statusEl.textContent = "call: connected";

    const override = getCurrentConversationOverride();
    logDebug("CALL OVERRIDE SEND:", override);

    // ĐÚNG SPEC ELEVENLABS:
    callWsSend({
      type: "conversation_initiation_client_data",
      conversation_config_override: override
    });

    try {
      await callStartMicPCM();
    } catch (e) {
      logDebug("callStartMicPCM failed:", e.message || e);
    }

    logDebug("callWs connected");
  };

  callWs.onclose = () => {
    logDebug("call ws closed");
    SessionLock.markCallDisconnected();
    statusEl.textContent = "call ended";
    callStopMicPCM();
  };

  callWs.onerror = (e) => {
    logDebug("callWs error:", e.message || e);
  };

  callWs.onmessage = async (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }

    if (data.type === "ping") {
      callWsSend({ type: "pong", event_id: data.ping_event?.event_id });
      return;
    }

    if (data.type === "agent_response") {
      const t = data.agent_response_event?.agent_response;
      if (t) {
        addAgentMsgOnce(t);
        lastAgentText = t;
      }
      return;
    }

    if (data.type === "audio") {
      const b64 = data.audio_event?.audio_base_64;
      if (b64) await playCallBase64Audio(b64, "audio/mpeg");
      return;
    }

    if (data.type === "system_message" && data.message) {
      logDebug("call system_message:", data.message);
    }
  };
}


/////////////////////// Unified restart when voice changed ///////////////////////
async function onVoiceChanged(voiceId) {
  const opt = voiceSel.options[voiceSel.selectedIndex];

  CURRENT_VOICE_ID    = voiceId;
  CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[voiceId] || null;
  CURRENT_VOICE_LANG  = opt?.dataset.lang || VOICE_LANG_MAP[voiceId] || "auto";
  VOICE_LANG_MAP[voiceId] = CURRENT_VOICE_LANG;

  saveVoiceSelection(voiceId);
  const sampleText =
    (lastAgentText && lastAgentText.trim())
      ? lastAgentText
      : (textEl.value.trim() || changeMessageVoice(CURRENT_VOICE_LANG))

   // ✅ HIỆN TEXT TRONG CHAT KHI ĐỔI GIỌNG
  addMsg(
    "agent",
    `🔊 Voice: ${CURRENT_VOICE_LABEL || voiceId} • Language: ${CURRENT_VOICE_LANG}\n` +
    `🗣 Sample: ${sampleText}`
  );

  // Preview TTS (cho user nghe thử)
  try { await previewVoiceStream(voiceId, sampleText); }
  catch (e) { logDebug("voice preview failed:", e.message || e); }

  logDebug("Voice changed:", {
    voiceId: CURRENT_VOICE_ID,
    lang: CURRENT_VOICE_LANG
  });

  // 🔥 Restart text session với ngôn ngữ + voice mới
  try { await restartTextSession(); }
  catch (e) { logDebug("restartTextSession failed:", e.message || e); }

  // 🔥 Nếu đang có cuộc gọi, restart luôn call để dùng voice mới
  if (SessionLock.activeCall) {
    try { await restartCallWs(); }
    catch (e) { logDebug("restartCallWs failed:", e.message || e); }
  }
}


/////////////////////// End call / end text ///////////////////////
async function endAll() {
  manualEnd = true;  // khóa auto reconnect

  // end text
  if (conversation){
    try { await conversation.endSession(); } catch{}
  }
  conversation = null;
  textConnected = false;
  textConnecting = false;

  if (textHeartbeat) {
    clearInterval(textHeartbeat);
    textHeartbeat = null;
  }

  // end call
  try { callStopMicPCM(); } catch{}

  if (callWs) {
    try { callWs.close(1000, "manual_end_call"); } catch{}
  }
  callWs = null;

  SessionLock.markCallDisconnected();   // ✅ dùng đúng method
  statusEl.textContent = "ended";
  if (callBtn) callBtn.disabled = false;
}

function updateEndState(){
  if (!endBtn) return;
  endBtn.disabled = !textConnected;
}

/////////////////////// UI Event wiring ///////////////////////
function updateSendState(){
  if (sendBtn) sendBtn.disabled = textEl.value.trim().length === 0;
}

sendBtn?.addEventListener("click", sendCurrentText);
textEl?.addEventListener("input", updateSendState);
textEl?.addEventListener("keydown", (e)=>{
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentText();
  }
});

document.getElementById("lookupBtn")?.addEventListener("click", lookupInfo);

voiceSel?.addEventListener("change", async () => {
  const vid = voiceSel.value;
  await onVoiceChanged(vid);
});


callBtn?.addEventListener("click", async () => {
  if (!SessionLock.requestCallStart()) {
    addMsg("agent", "⚠ Cuộc gọi đang hoạt động. Không thể tạo cuộc gọi mới.");
    return;
  }

  callBtn.disabled = true;
  endBtn.disabled = false;

  try {
    const wsUrl = await getCallWsUrl();
    connectCallWs(wsUrl);
    SessionLock.markCallConnected();
  } catch (e) {
    logDebug("callBtn click error:", e.message || e);
    SessionLock.markCallDisconnected();
    callBtn.disabled = false;
  }
});


endBtn?.addEventListener("click", async () => {
  await endAll();
});

document.getElementById("restartTextBtn")?.addEventListener("click", async ()=>{
  await restartTextSession();
});

document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape") {
    try { if (callWs) callWs.close(); } catch {}
  }
});

/////////////////////// Initialization ///////////////////////
async function init(){
  try {
    statusEl.textContent = "loading...";

    // 1) Load SDK
    try {
      const mod = await import("https://esm.sh/@elevenlabs/client@0.11.0?bundle");
      Conversation = mod.Conversation;
      logDebug("Conversation SDK loaded");
    } catch (e) {
      logDebug("SDK import failed:", e.message || e);
      statusEl.textContent = "SDK load failed";
      return; // ❗ Không có SDK thì khỏi cố start session
    }

    // 2) Load voices
    await loadVoices();

    // 3) Tự động start text session khi mở trang
    try {
      await startTextSession();              // 🔥 CHÍNH LÀ DÒNG NÀY
    } catch (e) {
      logDebug("auto startTextSession failed:", e.message || e);
      // không throw tiếp – vẫn cho UI dùng, lần gửi đầu sẽ attempt lại
    }

    updateSendState();
    updateEndState();
    statusEl.textContent = textConnected ? "text: connected" : "ready";
  } catch (e) {
    logDebug("init error:", e.message || e);
    statusEl.textContent = "init error";
  }
}

// ======================
// SESSION LOCK (anti-double connect)
// ======================
const SessionLock = {
  activeCall: false,
  connectingCall: false,

  requestCallStart() {
    if (this.activeCall || this.connectingCall) return false;
    this.connectingCall = true;
    return true;
  },

  markCallConnected() {
    this.activeCall = true;
    this.connectingCall = false;
  },

  markCallDisconnected() {
    this.activeCall = false;
    this.connectingCall = false;
  }
};

// start
init();

/////////////////////////////////// End of file ///////////////////////////////////
