// static/js/assistant.js
// Trantourist Assistant — ElevenLabs ConvAI
// Single voice source-of-truth. Language selector removed.
// Text uses Conversation SDK, Call uses raw ConvAI WS + PCM worklet.
// Voice change applies to BOTH text + call in one flow.
//
// NOTE: Load with:
// <script type="module" src="/static/js/assistant.js"></script>

import { I18N, tUI, applyUILang, FLAG, SHORT } from "./i18n.js";

const SIGNED_URL_ENDPOINT   = "/signed-url";        // text session signed url (Conversation SDK)
const CALL_WS_URL_ENDPOINT  = "/api/get-ws-url";    // call ws signed url (Flask proxy)
const VOICES_ENDPOINT       = "/api/voices";        // list voices: voice_id, name, label

// ===== DOM =====
const chatEl   = document.getElementById("chat");
const textEl   = document.getElementById("text");
const sendBtn  = document.getElementById("send");
const statusEl = document.getElementById("status");
const debugEl  = document.getElementById("debug");
const voiceSel = document.getElementById("voiceSel");

const tourCodeEl     = document.getElementById("tourCode");
const customerCodeEl = document.getElementById("customerCode");
const orderCodeEl    = document.getElementById("orderCode");

const uiLangBtn  = document.getElementById("uiLangBtn");
const uiLangMenu = document.getElementById("uiLangMenu");
const uiLangFlag = document.getElementById("uiLangFlag");
const uiLangText = document.getElementById("uiLangText");

const endBtn  = document.getElementById("endBtn");
const callBtn = document.getElementById("call");

// ===== STATE (TEXT SESSION via Conversation SDK) =====
let Conversation;
let conversation = null;
let connected = false;
let connecting = false;
let heartbeat = null;

// ===== STATE (VOICE CALL via raw WS + worklet) =====
let callWs = null;
let callMicCtx = null;
let callMicStream = null;
let callAudioQueue = [];
let callPlaying = false;

// ===== VOICE state =====
let CURRENT_VOICE_ID = null;
let CURRENT_VOICE_LABEL = null;   // multi-voice label
let VOICE_LABEL_MAP = {};
let VOICE_LANG_MAP = {};     // voice_id -> label
let voiceLocked = false;

// ===== last agent text (for preview / resay) =====
let lastAgentText = "";

// ===== UTIL =====
function logDebug(msg){
  console.log(msg);
  if (debugEl) debugEl.textContent += msg + "\n";
}
function addMsg(role, text){
  const div = document.createElement("div");
  div.className = `msg ${role}`;
  div.textContent = text;
  chatEl.appendChild(div);
  chatEl.scrollTop = chatEl.scrollHeight;
}
function updateSendState(){
  sendBtn.disabled = textEl.value.trim().length === 0;
}
function wrapWithVoiceTag(text){
  if (!CURRENT_VOICE_LABEL) return text;
  return `<${CURRENT_VOICE_LABEL}>${text}</${CURRENT_VOICE_LABEL}>`;
}
function saveVoice(voiceId) {
  localStorage.setItem("selected_voice", voiceId);
}
function getVoiceTagLabel(){
  return CURRENT_VOICE_LABEL || null;
}

// ===== Apply voice rules to running sessions =====
function applyVoiceRuleToTextSession(){
  if (!conversation || !connected || !getVoiceTagLabel()) return;
  const label = getVoiceTagLabel();
  try{
    conversation.sendUserMessage(
      `SYSTEM: From now on, always reply using voice label <${label}>...</${label}> only.`
    );
  }catch(e){ console.warn(e); }
}

function applyVoiceRuleToCallWs(){
  if (!callWs || callWs.readyState !== 1 || !getVoiceTagLabel()) return;
  const label = getVoiceTagLabel();
  try{
    callWsSend({
      type: "user_message",
      text: `SYSTEM: Always speak using voice label <${label}>...</${label}> only.`
    });
  }catch(e){ console.warn(e); }
}

// ===== UI language header (only UI, not bot language) =====
function setUILangHeader(lang){
  if (uiLangFlag) uiLangFlag.textContent = FLAG[lang] || "🌐";
  if (uiLangText) uiLangText.textContent = SHORT[lang] || lang.toUpperCase();
  localStorage.setItem("ui_lang", lang);
  applyUILang(lang);
}
if (uiLangBtn && uiLangMenu){
  uiLangBtn.addEventListener("click", ()=>{
    const open = uiLangMenu.classList.toggle("open");
    uiLangBtn.setAttribute("aria-expanded", open ? "true":"false");
  });
  document.addEventListener("click",(e)=>{
    if (!uiLangMenu.contains(e.target) && !uiLangBtn.contains(e.target)){
      uiLangMenu.classList.remove("open");
      uiLangBtn.setAttribute("aria-expanded","false");
    }
  });
  uiLangMenu.querySelectorAll(".ui-lang-item").forEach(item=>{
    item.addEventListener("click", ()=>{
      const lang = item.getAttribute("data-lang");
      setUILangHeader(lang);
      uiLangMenu.classList.remove("open");
      uiLangBtn.setAttribute("aria-expanded","false");
    });
  });
}
setUILangHeader(localStorage.getItem("ui_lang") || "vi");


// ===== Load voices =====
async function loadVoices() {
  try {
    const res = await fetch("/api/voices", { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "voices error");

    const voices = data.voices || [];
    voiceSel.innerHTML = "";
    VOICE_LABEL_MAP = {};   // voice_id → label
    VOICE_LANG_MAP  = {};   // voice_id → language_trained

    voices.forEach(v => {
      if (!v.voice_id) return;

      const voiceId = v.voice_id;
      const name    = v.name || voiceId;
      const trained = v.language_trained || null;

      // Lưu vào state
      // labels trong API của bạn là object, ví dụ: { "assistant_voice": "Piper" }
      // Bạn sẽ chọn key nào là voice-label để multi-voice (tôi dùng assistant_voice)
      const label =
        (v.labels && v.labels.assistant_voice) ||
        (v.labels && v.labels.voice_label) ||
        name;

      VOICE_LABEL_MAP[voiceId] = label;
      VOICE_LANG_MAP[voiceId]  = trained;

      // UI 
      const opt = document.createElement("option");
      opt.value = voiceId;

      // Hiển thị luôn language_trained như API trả về
      const langTag = trained ? ` • ${trained.toUpperCase()}` : "";
      opt.textContent = `${name}${langTag}`;

      voiceSel.appendChild(opt);
    });

    // Restore voice đã chọn trước đó
    const saved = localStorage.getItem("selected_voice");
    if (saved && VOICE_LABEL_MAP[saved]) {
      voiceSel.value = saved;
      CURRENT_VOICE_ID = saved;
      CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[saved];
    } else {
      const first = voiceSel.options[0];
      if (first) {
        CURRENT_VOICE_ID = first.value;
        CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[first.value] || null;
      }
    }

  } catch (e) {
    console.error("✗ loadVoices:", e.message);
    voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
    CURRENT_VOICE_ID = "default";
    CURRENT_VOICE_LABEL = null;
  }
}
await loadVoices();

// ===== Session Instruction (TEXT SESSION) =====
function buildSessionInstruction(){
  const voiceId = CURRENT_VOICE_ID || "default";
  const voiceLabel = CURRENT_VOICE_LABEL || "default";
  const lang       = VOICE_LANG_MAP[voiceId] || null;

  return `SYSTEM INSTRUCTION:
1) You MUST reply strictly in ${lang || "the same language as the user's last message"}.
   If lang is provided, DO NOT use any other language.
2) Always speak using voice label <${voiceLabel}>...</${voiceLabel}> only.
3) Voice preference: voice_id=${voiceId}.
4) Professional inbound tour consultant style.`;
}

// ===== Signed URL fetch (text session) =====
async function fetchSignedUrl(){
  logDebug("→ fetchSignedUrl()");
  const res = await fetch(SIGNED_URL_ENDPOINT, { cache:"no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Không lấy được signed_url");
  if (!data.signed_url) throw new Error("signed_url rỗng");
  return data.signed_url;
}

// ===== Start text session (Conversation SDK) =====
async function startSession(){
  if (connecting || connected) return;
  connecting = true;
  logDebug("→ startSession()");

  try{
    statusEl.textContent = tUI("statusFetchingSigned");
    const signedUrl = await fetchSignedUrl();
    statusEl.textContent = tUI("statusConnecting");

    conversation = await Conversation.startSession({
      signedUrl,
      connectionType: "websocket",

      onConnect: async () => {
        logDebug("✓ onConnect()");
        connected = true;
        connecting = false;
        statusEl.textContent = tUI("statusConnected");
        updateEndState();

        heartbeat = setInterval(()=>{
          try{ conversation?.sendUserActivity(); }catch{}
        }, 5000);

        // text-first mode: mute SDK mic
        try{ await conversation.setMicMuted(true); }catch{}

        // push voice rule
        try{
          conversation.sendUserMessage(buildSessionInstruction());
        }catch(e){ console.warn(e); }
      },

      onDisconnect: () => {
        logDebug("✗ onDisconnect()");
        connected = false;
        connecting = false;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        conversation = null;
        statusEl.textContent = tUI("statusEnded");
        updateEndState();
      },

      onError: (e) => {
        logDebug("✗ onError(): " + (e?.message || e));
        connected = false;
        connecting = false;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        conversation = null;
        statusEl.textContent = tUI("statusError");
        updateEndState();
      },

      onMessage: async ({ message, source }) => {
        if (!message?.text) return;
        addMsg(source==="user" ? "user" : "agent", message.text);
        if (source !== "user") lastAgentText = message.text;
      }
    });

  }catch(err){
    logDebug("✗ startSession catch: " + err.message);
    connected = false;
    connecting = false;
    conversation = null;
    statusEl.textContent = tUI("statusCannotConnect");
    updateEndState();
  }
}

// ===== Send text =====
async function sendCurrentText(){
  const raw = textEl.value.trim();
  if (!raw) return;

  if (!conversation || !connected){
    await startSession();
  }
  if (!conversation || !connected) return;

  const tagged = wrapWithVoiceTag(raw);
  addMsg("user", raw);

  try{
    conversation.sendUserMessage(tagged);
    conversation.sendUserActivity();
  }catch(e){
    logDebug("✗ sendUserMessage: " + e.message);
  }

  textEl.value = "";
  updateSendState();
  textEl.focus();
}

async function restartTextSession(){
  try{
    if (conversation) {
      await conversation.endSession();
    }
  }catch{}
  conversation = null;
  connected = false;
  connecting = false;

  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;

  await startSession(); // sẽ gửi instruction mới ở onConnect
}

// ===== Lookup =====
async function lookupInfo() {
  const tourCode = tourCodeEl.value.trim();
  const customerCode = customerCodeEl.value.trim();
  const orderCode = orderCodeEl.value.trim();

  if (!tourCode && !customerCode && !orderCode) {
    addMsg("agent", tUI("noCode"));
    return;
  }

  const payload =
`LOOKUP REQUEST IN COMPANY SYSTEM:
- Tour Code: ${tourCode || "N/A"}
- Customer Code: ${customerCode || "N/A"}
- Order/Booking Code: ${orderCode || "N/A"}

INSTRUCTIONS:
1) Look up these codes in the internal system using tools/webhooks.
2) Return the itinerary stops in correct order.
3) Return estimated timing per stop + main hotels/restaurants (if any).
If no data found, clearly say so. Do NOT invent.`;

  textEl.value = payload;
  updateSendState();
  await sendCurrentText();
}

// ===== EVENTS (TEXT) =====
sendBtn.addEventListener("click", sendCurrentText);
textEl.addEventListener("input", updateSendState);
textEl.addEventListener("keydown",(e)=>{
  if(e.key==="Enter" && !e.shiftKey) sendCurrentText();
});


// ===== Voice change: ONE FLOW for text + call =====
async function previewVoiceStream(voiceId, text) {
  const r = await fetch("/api/tts-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      voice_id: voiceId,
      text
    })
  });

  if (!r.ok) {
    const err = await r.text().catch(()=> "");
    console.error("TTS stream error:", r.status, err);
    return;
  }

  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(e => console.warn("Autoplay blocked:", e));
}

voiceSel.addEventListener("change", async () => {
  const vid = voiceSel.value;

  // === Update voice state ===
  CURRENT_VOICE_ID = vid;
  CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[vid] || null;
  localStorage.setItem("selected_voice", vid);

  const trainedLang = VOICE_LANG_MAP[vid] || null;

  // === 1) Preview giọng đọc mới theo nội dung thực ===
  const sampleText =
      (lastAgentText && lastAgentText.trim()) ? lastAgentText :
      (textEl.value.trim() ? textEl.value.trim() :
       "Xin chào, đây là giọng đọc mới bạn vừa chọn.");

  try {
    await previewVoiceStream(vid, sampleText);
  } catch (e) {
    console.warn("Preview failed:", e);
  }

  // === 2) Restart WebSocket để áp LANGUAGE + VOICE ID mới ===
  // buildConversationConfigOverride() là hàm bạn đã có
  try {
    await restartWsSession();  // bạn đã có hàm này trong code 1-WS
  } catch (e) {
    console.warn("restartWsSession failed:", e);
  }
  
  callBtn.disabled=false;
  // === 3) Sau khi WS open lại → agent sẽ dùng voice & language mới ===
  /*addMsg(
    "agent",
    `🔄 Voice → ${CURRENT_VOICE_LABEL || vid} | Language → ${trainedLang || "auto"}`
  );*/
});




// ======================================================================
// ================= VOICE CALL (RAW WS + worklet) =======================
// ======================================================================

// get signed ws url for call
async function getCallWsUrl(){
  const r = await fetch(CALL_WS_URL_ENDPOINT, {method:"POST"});
  const j = await r.json();
  if(!j.ws_url) throw new Error(j.error||"no ws_url");
  return j.ws_url;
}

function callWsSend(obj){
  if(callWs && callWs.readyState===1){
    callWs.send(JSON.stringify(obj));
  }
}

// play call audio
async function playCallBase64Audio(b64, mime="audio/mpeg"){
  callAudioQueue.push({b64, mime});
  if(callPlaying) return;
  callPlaying = true;

  while(callAudioQueue.length){
    const {b64, mime} = callAudioQueue.shift();
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const blob = new Blob([bytes], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    await a.play().catch(()=>{});
    await new Promise(r=> a.onended=r);
    URL.revokeObjectURL(url);
  }
  callPlaying = false;
}

// connect call ws
function connectCallWs(wsUrl){
  callWs = new WebSocket(wsUrl);
 
  callWs.onopen = async ()=>{
  statusEl.textContent = "call connected";

  const language = VOICE_LANG_MAP[CURRENT_VOICE_ID] || null;
  const voice_id = CURRENT_VOICE_ID || null;

  const overrides = {};
  if (language) overrides.language = language;   // ví dụ "vi","en","hi"
  if (voice_id) overrides.voice_id = voice_id;

  // ✅ Initiation + overrides chuẩn
  callWsSend({
    type: "conversation_initiation_client_data",
    overrides
  });

  // ✅ fallback ép label nếu overrides bị ignore (Agent chưa bật Allow overrides)
  applyVoiceRuleToCallWs();
  if (language){
    callWsSend({
      type: "user_message",
      text: `SYSTEM: Speak strictly in ${language}.`
    });
  }

  await callStartMicPCM();
  };


  callWs.onclose = ()=>{
    statusEl.textContent = "call ended";
  };

  callWs.onerror = (e)=>{
    console.error("call ws error", e);
  };

  callWs.onmessage = async (ev)=>{
    let data;
    try{ data = JSON.parse(ev.data); }catch{ return; }

    if (data.type === "ping") {
      callWsSend({ type: "pong", event_id: data.ping_event?.event_id });
      return;
    }
    if (data.type === "agent_response") {
      const t = data.agent_response_event?.agent_response;
      if (t){
        addMsg("agent", t);
        lastAgentText = t;
      }
      return;
    }
    if (data.type === "audio") {
      const b64 = data.audio_event?.audio_base_64;
      if (b64) await playCallBase64Audio(b64, "audio/mpeg");
      return;
    }
  };
}

// mic streaming (pcm worklet @16k)
async function callStartMicPCM() {
  callMicStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  callMicCtx = new AudioContext({ sampleRate: 16000 });

  await callMicCtx.audioWorklet.addModule("/pcm-worklet.js");

  const src = callMicCtx.createMediaStreamSource(callMicStream);
  const worklet = new AudioWorkletNode(callMicCtx, "pcm-worklet");

  worklet.port.onmessage = (ev) => {
    const b64 = ev.data;
    callWsSend({ user_audio_chunk: b64 });
  };

  src.connect(worklet);
}

function callStopMicPCM() {
  if (callMicStream) callMicStream.getTracks().forEach(t => t.stop());
  if (callMicCtx) callMicCtx.close();
  callMicStream = null;
  callMicCtx = null;
}

//Thêm helper restart call WS (để đổi voice/language)
async function restartCallWs(){
  try{
    callStopMicPCM();
    if (callWs) callWs.close();
  }catch{}
  callWs = null;

  const wsUrl = await getCallWsUrl();
  connectCallWs(wsUrl);
}

// call button
callBtn.onclick = async ()=>{
  callBtn.disabled = true;
  try{
    await startSession(); // ensure text session ready
    const wsUrl = await getCallWsUrl();
    connectCallWs(wsUrl);
  }catch(err){
    console.error(err);
    addMsg("agent", "Failed to start call: " + err.message);
    callBtn.disabled=false;
  }
};

// end call button
async function endCall(){
  if (conversation) {
    try { await conversation.endSession(); } catch {}
  }
  conversation = null;
  connected = false;
  connecting = false;

  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;

  callStopMicPCM();
  if(callWs) callWs.close();
  callWs = null;

  statusEl.textContent = tUI("statusEnded");
  updateEndState();
  if(callBtn) callBtn.disabled=false;
}
if (endBtn) endBtn.addEventListener("click", endCall);

// update state of end button
function updateEndState(){
  if (!endBtn) return;
  endBtn.disabled = !connected;
}

// ===== Load SDK =====
try{
  statusEl.textContent = tUI("statusLoading");
  const mod = await import("https://esm.sh/@elevenlabs/client@0.11.0?bundle");
  Conversation = mod.Conversation;
  logDebug("✓ Imported Conversation SDK");
  statusEl.textContent = tUI("statusReady");
}catch(e){
  logDebug("✗ Import SDK failed: " + e.message);
  statusEl.textContent = tUI("statusError");
}

updateSendState();
updateEndState();

