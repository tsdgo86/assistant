/********************************************************************
 * Trantourist Assistant — SINGLE ConvAI WebSocket
 * - Bỏ Conversation SDK
 * - 1 WS duy nhất cho TEXT + VOICE
 * - Chọn voice => auto set language theo language_trained (overrides chuẩn)
 * - Voice change => restart SAME WS để overrides ăn chắc
 ********************************************************************/

import { tUI, applyUILang, FLAG, SHORT } from "./i18n.js";

const CALL_WS_URL_ENDPOINT = "/api/get-ws-url";  // trả signed ws_url
const VOICES_ENDPOINT      = "/api/voices";

// ===== DOM =====
const chatEl   = document.getElementById("chat");
const textEl   = document.getElementById("text");
const sendBtn  = document.getElementById("send");
const statusEl = document.getElementById("status");
const debugEl  = document.getElementById("debug");

const voiceSel = document.getElementById("voiceSel");
const callBtn  = document.getElementById("call");
const endBtn   = document.getElementById("endBtn");
const lookupBtn = document.getElementById("lookupBtn");

const tourCodeEl     = document.getElementById("tourCode");
const customerCodeEl = document.getElementById("customerCode");
const orderCodeEl    = document.getElementById("orderCode");

// ===== UI language header (chỉ UI) =====
const uiLangBtn  = document.getElementById("uiLangBtn");
const uiLangMenu = document.getElementById("uiLangMenu");
const uiLangFlag = document.getElementById("uiLangFlag");
const uiLangText = document.getElementById("uiLangText");

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


// ===== STATE =====
let ws = null;
let wsConnected = false;

let micCtx = null;
let micStream = null;

let audioQueue = [];
let playing = false;

let CURRENT_VOICE_ID = null;
let CURRENT_VOICE_LABEL = null;
let VOICE_LABEL_MAP = {};  // voice_id -> label for multi-voice tag
let VOICE_LANG_MAP  = {};  // voice_id -> language_trained

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
function wsSend(obj){
  if(ws && ws.readyState === 1){
    ws.send(JSON.stringify(obj));
  }
}

// ===== AUDIO PLAYBACK =====
async function playBase64Audio(b64, mime="audio/mpeg"){
  audioQueue.push({b64, mime});
  if(playing) return;
  playing = true;

  while(audioQueue.length){
    const {b64, mime} = audioQueue.shift();
    const bytes = Uint8Array.from(atob(b64), c=>c.charCodeAt(0));
    const blob = new Blob([bytes], {type:mime});
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    await a.play().catch(()=>{});
    await new Promise(r=> a.onended=r);
    URL.revokeObjectURL(url);
  }
  playing = false;
}

// ===== MIC PCM STREAMING (16k) =====
async function startMicPCM(){
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  micCtx = new AudioContext({ sampleRate: 16000 });
  await micCtx.audioWorklet.addModule("/pcm-worklet.js");

  const src = micCtx.createMediaStreamSource(micStream);
  const worklet = new AudioWorkletNode(micCtx, "pcm-worklet");

  worklet.port.onmessage = (ev) => {
    const b64 = ev.data;
    wsSend({ user_audio_chunk: b64 });
  };

  src.connect(worklet); // không nối ra destination để tránh echo
}
function stopMicPCM(){
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (micCtx) micCtx.close();
  micStream = null;
  micCtx = null;
}

// ===== GET SIGNED WS URL =====
async function getWsUrl(){
  const r = await fetch(CALL_WS_URL_ENDPOINT, { method:"POST" });
  const j = await r.json();
  if(!j.ws_url) throw new Error(j.error || "no ws_url");
  return j.ws_url;
}

// ===== BUILD OVERRIDES (CHUẨN SCHEMA) =====
function buildConversationConfigOverride(){
  const language = VOICE_LANG_MAP[CURRENT_VOICE_ID] || null;
  const voice_id = CURRENT_VOICE_ID || null;

  const cfg = {};

  if (language) {
    cfg.agent = { language };      // ✅ agent.language
  }
  if (voice_id) {
    cfg.tts = { voice_id };        // ✅ tts.voice_id
  }

  return { cfg, language, voice_id };
}


// ===== START / RESTART SINGLE WS SESSION =====
async function startWsSession(){
  if (ws && ws.readyState === 1) return;

  statusEl.textContent = "connecting…";

  const wsUrl = await getWsUrl();
  ws = new WebSocket(wsUrl);

  ws.onopen = async ()=>{
    wsConnected = true;
    statusEl.textContent = "connected";

    const { cfg, language } = buildConversationConfigOverride();

    // ✅ Initiation + overrides chuẩn schema
    wsSend({
      type: "conversation_initiation_client_data",
      conversation_config_override: cfg   // ✅ đúng key + đúng schema
    });

    // ✅ fallback system nếu agent ignore overrides (chưa bật Allow overrides)
    if (CURRENT_VOICE_LABEL){
      wsSend({
        type: "user_message",
        text: `SYSTEM: Always speak using voice <${CURRENT_VOICE_LABEL}>...</${CURRENT_VOICE_LABEL}> only.`
      });
    }
    if (language){
      wsSend({
        type: "user_message",
        text: `SYSTEM: Reply strictly in ${language}.`
      });
    }

    await startMicPCM();
  };

  ws.onmessage = async (ev)=>{
    let data;
    try{ data = JSON.parse(ev.data); }catch{ return; }

    if (data.type === "ping"){
      wsSend({ type:"pong", event_id: data.ping_event?.event_id });
      return;
    }

    if (data.type === "agent_response"){
      const t = data.agent_response_event?.agent_response;
      if (t){
        addMsg("agent", t);
        lastAgentText = t;
      }
      return;
    }

    if (data.type === "audio"){
      const b64 = data.audio_event?.audio_base_64;
      if (b64) await playBase64Audio(b64, "audio/mpeg");
      return;
    }
  };

  ws.onclose = ()=>{
    wsConnected = false;
    stopMicPCM();
    ws = null;
    statusEl.textContent = "disconnected";
    if (callBtn) callBtn.disabled = false;
    if (endBtn) endBtn.disabled = true;
  };

  ws.onerror = (e)=>{
    console.error("ws error", e);
  };
}

async function restartWsSession(){
  try{
    stopMicPCM();
    if (ws) ws.close();
  }catch{}
  ws = null;
  wsConnected = false;
  await startWsSession();
}


// ===== SEND TEXT (CÙNG 1 WS) =====
async function sendCurrentText(){
  const raw = textEl.value.trim();
  if(!raw) return;

  if(!wsConnected) await startWsSession();

  addMsg("user", raw);

  wsSend({
    type: "user_message",
    text: wrapWithVoiceTag(raw)
  });

  textEl.value = "";
  updateSendState();
}


// ===== LOOKUP (CÙNG 1 WS) =====
async function lookupInfo(){
  const tour = tourCodeEl.value.trim();
  const cust = customerCodeEl.value.trim();
  const ord  = orderCodeEl.value.trim();

  if(!tour && !cust && !ord){
    addMsg("agent", tUI("noCode") || "Bạn chưa nhập mã.");
    return;
  }

  const payload =
`LOOKUP REQUEST IN COMPANY SYSTEM:
- Tour Code: ${tour || "N/A"}
- Customer Code: ${cust || "N/A"}
- Order/Booking Code: ${ord || "N/A"}

INSTRUCTIONS:
1) Look up these codes in the internal system using tools/webhooks.
2) Return real results only. If none, say none.`;

  textEl.value = payload;
  updateSendState();
  await sendCurrentText();
}


// ===== EVENTS =====
sendBtn.addEventListener("click", sendCurrentText);
textEl.addEventListener("input", updateSendState);
textEl.addEventListener("keydown",(e)=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    sendCurrentText();
  }
});

lookupBtn?.addEventListener("click", lookupInfo);

callBtn.onclick = async ()=>{
  callBtn.disabled = true;
  await startWsSession();
  if (endBtn) endBtn.disabled = false;
};
endBtn.onclick = ()=>{
  if(ws) ws.close();
};


// ===== VOICE CHANGE (SYNC TEXT + VOICE TUYỆT ĐỐI) =====
voiceSel.addEventListener("change", async ()=>{
  const vid = voiceSel.value;

  CURRENT_VOICE_ID = vid;
  CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[vid] || null;
  localStorage.setItem("selected_voice", vid);

  // ✅ restart SINGLE WS => overrides language+voice ăn chắc cho cả text & audio
  if(wsConnected){
    await restartWsSession();

    // preview: bot đọc lại câu agent cuối bằng giọng mới
    if(lastAgentText){
      setTimeout(()=>{
        wsSend({
          type:"user_message",
          text: wrapWithVoiceTag(lastAgentText)
        });
      }, 600);
    }
  }

  addMsg(
    "agent",
    `✅ Voice: ${CURRENT_VOICE_LABEL || vid} | Lang: ${(VOICE_LANG_MAP[vid]||"auto")}`
  );
});


// ===== LOAD VOICES =====
async function loadVoices(){
  try{
    const res = await fetch(VOICES_ENDPOINT, { cache:"no-store" });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "voices error");

    const voices = data.voices || [];
    voiceSel.innerHTML = "";
    VOICE_LABEL_MAP = {};
    VOICE_LANG_MAP = {};

    voices.forEach(v=>{
      if(!v.voice_id) return;

      const voiceId = v.voice_id;
      const name = v.name || voiceId;
      const trained = v.language_trained || null;

      const label =
        (v.labels && (v.labels.assistant_voice || v.labels.voice_label)) ||
        name;

      VOICE_LABEL_MAP[voiceId] = label;
      VOICE_LANG_MAP[voiceId]  = trained;

      const opt = document.createElement("option");
      opt.value = voiceId;
      const langTag = trained ? ` • ${trained.toUpperCase()}` : "";
      opt.textContent = `${name}${langTag}`;
      voiceSel.appendChild(opt);
    });

    const saved = localStorage.getItem("selected_voice");
    if(saved && VOICE_LABEL_MAP[saved]){
      voiceSel.value = saved;
      CURRENT_VOICE_ID = saved;
      CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[saved];
    }else{
      const first = voiceSel.options[0];
      if(first){
        CURRENT_VOICE_ID = first.value;
        CURRENT_VOICE_LABEL = VOICE_LABEL_MAP[first.value] || null;
      }
    }

  }catch(e){
    console.error("✗ loadVoices:", e.message);
    voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
    CURRENT_VOICE_ID = "default";
    CURRENT_VOICE_LABEL = null;
  }
}

await loadVoices();
updateSendState();