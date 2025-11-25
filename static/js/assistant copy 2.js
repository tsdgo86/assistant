
// static/js/assistant.js
// Trantourist Assistant — ElevenLabs ConvAI
// MODE: signedUrl (websocket) fetched from /signed-url (n8n primary, ElevenLabs fallback)
// NOTE: This file must be loaded with <script type="module" src="/static/js/assistant.js"></script>
// IMPORT i18n
import { I18N, tUI, applyUILang, initUILangHeader, FLAG,SHORT } from "./i18n.js";

const SIGNED_URL_ENDPOINT = "/signed-url";  // same-origin Flask route
const TOKEN_ENDPOINT = "/conversation-token"; // kept for fallback/debug if needed

// ===== DOM =====
const chatEl   = document.getElementById("chat");
const textEl   = document.getElementById("text");
const sendBtn  = document.getElementById("send");
const statusEl = document.getElementById("status");
const debugEl  = document.getElementById("debug");
const langSel  = document.getElementById("langSel");
const voiceSel = document.getElementById("voiceSel");

const tourCodeEl = document.getElementById("tourCode");
const customerCodeEl = document.getElementById("customerCode");
const orderCodeEl = document.getElementById("orderCode");
const lookupBtn = document.getElementById("lookupBtn");

// header ui-lang
const uiLangBtn  = document.getElementById("uiLangBtn");
const uiLangMenu = document.getElementById("uiLangMenu");
const uiLangFlag = document.getElementById("uiLangFlag");
const uiLangText = document.getElementById("uiLangText");
const endBtn = document.getElementById("endBtn");


// ===== STATE =====
let Conversation;
let conversation = null;
let connected = false;
let connecting = false;
let heartbeat = null;
let voiceLocked = false;   // user đã chọn voice tay hay chưa

let VOICE_LANG_MAP = {}; // voice_id -> language_trained
let SUPPORTED_LANGS = []; // [{code,name}]
let AGENT_SUPPORTED = []; // list of raw locale codes from agent

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
function norm(code){
  return (code || "").toLowerCase().split(/[-_]/)[0];
}


// ===== UI language dropdown (header) =====
// initUILangHeader({
//   uiLangBtn,
//   uiLangMenu,
//   uiLangFlag,
//   uiLangText,
//   Conversation,
//   getConnected: () => connected,
//   statusEl
// });

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


// ===== Load bot languages & voices =====
async function loadSupportedLanguages(){
  try{
    const res = await fetch("/api/supported-languages", {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "supported-languages error");
    SUPPORTED_LANGS = data.languages || [];
    //console.log("loadSupportedLanguages", SUPPORTED_LANGS);
  }catch(e){
    logDebug("✗ loadSupportedLanguages: " + e.message);
    SUPPORTED_LANGS = [
      {code:"vi", name:"Tiếng Việt"},
      {code:"en", name:"English"},
      {code:"zh", name:"Chinese"},
      {code:"ja", name:"Japanese"},
      {code:"ko", name:"Korean"},
    ];
  }
}

async function loadAgentConfig(){
  try{
    const res = await fetch("/api/agent", {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "agent error");

    const primary = data.primary_language || "en";
    const adds = data.additional_languages || [];
    AGENT_SUPPORTED = Array.from(new Set([primary, ...adds]));

    // map code->name dựa trên supported-languages
    const globalMapShort = Object.fromEntries(
      SUPPORTED_LANGS.map(x => [norm(x.code), x.name])
    );

      const prettifyLocale = (raw) => {
        const short = norm(raw);
        const base = globalMapShort[short] || short;
        // thêm suffix vùng nếu có
        const m = (raw || "").match(/[-_](\w+)$/);
        return m ? `${base} (${m[1].toUpperCase()})` : base;
      };

      langSel.innerHTML = "";
      agentSupported.forEach(rawCode => {
        const opt = document.createElement("option");
        opt.value = rawCode;
        opt.textContent = prettifyLocale(rawCode);
        langSel.appendChild(opt);
      });

      langSel.value = primary;
    //console.log("loadAgentConfig", {primary, AGENT_SUPPORTED});
  }catch(e){
    logDebug("✗ loadAgentConfig: " + e.message);
    langSel.innerHTML = "";
    SUPPORTED_LANGS.forEach(x=>{
      const opt = document.createElement("option");
      opt.value = x.code;
      opt.textContent = x.name || x.code;
      langSel.appendChild(opt);
    });
    langSel.value = "en";
  }
}

async function loadVoices(){
  try{
    const res = await fetch("/api/voices", {cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "voices error");

    const voices = data.voices || [];
    voiceSel.innerHTML = "";
    VOICE_LANG_MAP = {};

    voices.forEach(v=>{
      if (!v.voice_id) return;
      VOICE_LANG_MAP[v.voice_id] = v.language_trained || null;

      const opt = document.createElement("option");
      opt.value = v.voice_id;
      const langTag = v.language_trained ? ` • ${String(v.language_trained).toUpperCase()}` : "";
      opt.textContent = (v.name || v.voice_id) + langTag;
      voiceSel.appendChild(opt);
    });

    if (!voices.length){
      voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
    }

    //console.log("loadVoices", voices);
  }catch(e){
    logDebug("✗ loadVoices: " + e.message);
    voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
  }
}

// Save Voice to localstore
function saveVoice(voiceId) {
  localStorage.setItem("selected_voice", voiceId);
}

// preload everything before SDK/session
(async () => {
  await loadSupportedLanguages();
  await loadAgentConfig();
  await loadVoices();
})();


// ===== Session Instruction =====
function buildSessionInstruction(){
  const lang = langSel.value;
  const voiceId = voiceSel.value;

  // use supported map if exists
  const shortMap = Object.fromEntries(SUPPORTED_LANGS.map(x=>[norm(x.code), x.name]));
  const langName = shortMap[norm(lang)] || lang;

  return `SYSTEM INSTRUCTION:
1) You MUST answer strictly in ${langName}. Use ${langName} ONLY. No mixed languages.
2) If internal system data is in another language, translate it to ${langName} before answering.
3) Voice preference (if supported): voice_id = ${voiceId}.
4) Professional inbound tour consultant style.`;
}


// ===== Signed URL fetch =====
async function fetchSignedUrl(){
  logDebug("→ fetchSignedUrl()");
  const res = await fetch(SIGNED_URL_ENDPOINT, { cache:"no-store" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Không lấy được signed_url");
  if (!data.signed_url) throw new Error("signed_url rỗng");
  return data.signed_url;
}

// optional debug token fetch (not used by default)
async function fetchToken(){
  logDebug("→ fetchToken()");
  const res = await fetch(TOKEN_ENDPOINT,{cache:"no-store"});
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Token fetch failed");
  if (!data.token) throw new Error("empty token");
  return data.token;
}


// ===== Start session (websocket signedUrl) =====
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
        // keep session alive
        heartbeat = setInterval(()=>{
          try{ conversation?.sendUserActivity(); }catch{}
        }, 5000);

        // text-first mode: mute mic
        try{ await conversation.setMicMuted(true); }catch(e){ console.warn(e); }

        // send language/voice rule right after connect
        try{
          conversation.sendUserMessage(buildSessionInstruction());
        }catch(e){ console.warn("send instruction failed", e); }
      },

      onDisconnect: () => {
        logDebug("✗ onDisconnect()");
        connected = false;
        connecting = false;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        conversation = null;
        statusEl.textContent = tUI("statusEnded");
      },

      onError: (e) => {
        logDebug("✗ onError(): " + (e?.message || e));
        connected = false;
        connecting = false;
        if (heartbeat) clearInterval(heartbeat);
        heartbeat = null;
        conversation = null;
        statusEl.textContent = tUI("statusError");
      },

      onMessage: async ({ message, source }) => {
        if (!message?.text) return;
        addMsg(source==="user" ? "user" : "agent", message.text);

        if (source !== "user") {
          const t = message.text.toLowerCase();
          const isEnding =
            /kết thúc cuộc gọi|cuộc gọi kết thúc|tạm biệt|hẹn gặp lại|goodbye|end call|bye/.test(t);

          if (isEnding && conversation) {
            statusEl.textContent = tUI("statusEnded");
            connected = false;
            try { await conversation.endSession(); } catch {}
            if (heartbeat) clearInterval(heartbeat);
            heartbeat = null;
            conversation = null;
          }
        }
      }
    });

  }catch(err){
    logDebug("✗ startSession catch: " + err.message);
    connected = false;
    connecting = false;
    conversation = null;
    statusEl.textContent = tUI("statusCannotConnect");
  }
}

async function restartSession(){
  // nếu bạn có WS ConvAI đang chạy
  try {
    if (window.ws && ws.readyState === 1) ws.close();
  } catch {}

  // tùy bạn: reconnect lại agent / reload config
  if (typeof loadAgentConfig === "function") {
    await loadAgentConfig();
  }
}

// ===== Send text =====
async function sendCurrentText(){
  const text = textEl.value.trim();
  if (!text) return;

  if (!conversation || !connected){
    await startSession();
  }
  if (!conversation || !connected) return;

  addMsg("user", text);
  try{
    conversation.sendUserMessage(text);
    conversation.sendUserActivity();
  }catch(e){
    logDebug("✗ sendUserMessage: " + e.message);
  }

  textEl.value = "";
  updateSendState();
  textEl.focus();

   // ✅ format text cho ConvAI WS (phổ biến)
  wsSend({
    type: "user_message",
    text
  });
}


// ===== Lookup: send codes to bot =====
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
If no data found, clearly say so. Do NOT invent.

REMEMBER: reply strictly in the selected language.`;

  textEl.value = payload;
  updateSendState();
  await sendCurrentText();
}


// ===== Events =====
sendBtn.addEventListener("click", sendCurrentText);
textEl.addEventListener("input", updateSendState);
textEl.addEventListener("keydown",(e)=>{
  if(e.key==="Enter") sendCurrentText();
});
lookupBtn.addEventListener("click", lookupInfo);

/*langSel.addEventListener("change", ()=>{
  const label = langSel.options[langSel.selectedIndex]?.text || langSel.value;
  const dict = I18N[localStorage.getItem("ui_lang") || "vi"] || I18N.vi;
  addMsg("agent", dict.langSelected(label));
});*/
langSel.addEventListener("change", async () => {
  const lang = langSel.value;

  // 1) tìm voice match trainedLang với ngôn ngữ mới
  const match = [...voiceSel.options].find(opt => {
    const vid = opt.value;
    const vlang = VOICE_LANG_MAP[vid];   // lấy từ /api/voices labels.language
    return vlang && norm(vlang) === norm(lang);
  });

  // 2) nếu có voice phù hợp -> auto set
  if (match) {
    voiceSel.value = match.value;
    addMsg("agent", `Đã tự chuyển voice theo ngôn ngữ ${lang.toUpperCase()}.`);
  } else {
    addMsg("agent", `Không có voice tối ưu cho ${lang.toUpperCase()}, sẽ dùng voice hiện tại.`);
  }

  // 3) restart session để áp dụng (ConvAI chỉ ăn lúc start)
  if (conversation) {
    try { await conversation.endSession(); } catch {}
    conversation = null;
    connected = false;
    connecting = false;
  }
  startSession();
});


/*voiceSel.addEventListener("change", async () => {
  voiceLocked = true;  // user chọn tay => không auto đổi voice nữa

  const selectedId = voiceSel.value;
  //const trainedLang = VOICE_LANG_MAP[selectedId];
  const label = voiceSel.options[voiceSel.selectedIndex]?.text || selectedId;

  // Nếu bạn muốn auto đổi language theo voice thì để, còn không thì bỏ khối này.
  // Mình khuyên: BỎ để tránh lộn xộn.
  /*
  if (trainedLang) {
    const exact = [...langSel.options].find(o => norm(o.value) === norm(trainedLang));
    if (exact) langSel.value = exact.value;
  }
  */

  // restart session để áp voice mới (vì ConvAI chỉ ăn voice lúc start)
 /* if (conversation) {
    try { await conversation.endSession(); } catch {}
    conversation = null;
    connected = false;
    connecting = false;
  }
  startSession();

  addMsg("agent", `Đã chọn voice: ${label}.`);
});*/

/*voiceSel.addEventListener("change", async ()=>{
  const vid = voiceSel.value;
  const trainedLang = VOICE_LANG_MAP[vid];
  if (trainedLang){
    const exact = [...langSel.options].find(o=>norm(o.value)===norm(trainedLang));
    if (exact){
      langSel.value = exact.value;
      saveBotLang(exact.value);
    }
  }
  saveVoice(vid);
  await restartSession();
});*/
async function previewVoiceStream(voiceId, text) {
  // gọi API TTS stream của bạn
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

  // nhận mp3 stream -> play preview
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play().catch(e => console.warn("Autoplay blocked:", e));
}

voiceSel.addEventListener("change", async () => {
  const vid = voiceSel.value;                 // voice_id
  
  saveVoice(vid);

  // ✅ gọi API TTS stream ngay khi đổi voice (preview)
  // đổi text mẫu theo ý bạn
  await previewVoiceStream(
    vid,
    "Xin chào, đây là giọng đọc mới bạn vừa chọn."
  );

  // restart session sau khi preview xong
  await restartSession();
});




// ===== Load SDK (module required for top-level await) =====
try{
  statusEl.textContent = tUI("statusLoading");
  const mod = await import("https://esm.sh/@elevenlabs/client@0.11.0?bundle");
  Conversation = mod.Conversation;
  logDebug("✓ Imported Conversation SDK");
  statusEl.textContent = tUI("statusReady");

  // auto-start after SDK is ready (optional)
 // startSession();
}catch(e){
  logDebug("✗ Import SDK failed: " + e.message);
  statusEl.textContent = tUI("statusError");
}

updateSendState();

//update state theo connected
function updateEndState(){
  if (!endBtn) return;
  endBtn.disabled = !connected;
}

//handler End Call
async function endCall(){
  if (!conversation) return;

  // message i18n
  addMsg("agent", tUI("endCallMsg"));

  try { await conversation.endSession(); } catch {}

  conversation = null;
  connected = false;
  connecting = false;

  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;

  statusEl.textContent = tUI("statusEnded");
  updateEndState();
  // Hang up 
  stopMicPCM();
  if(ws) ws.close();
  ws=null;
  endBtn.disabled=true;
  callBtn.disabled=false;
}
if (endBtn) endBtn.addEventListener("click", endCall);



// === ENTER EVENT HANDLERS =====================================

// Enter to send message
textEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendCurrentText();
  }
});

// Enter to lookup
[tourCodeEl, customerCodeEl, orderCodeEl].forEach(input => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      lookupInfo();
    }
  });
});

// Enter to end call
if (endBtn) {
  endBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      endCall();     
    }
  });
}

 //===== Weak deterrent (NOT security) =====
/*document.addEventListener("contextmenu", e => e.preventDefault());
document.addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (k === "f12" ||
      (e.ctrlKey && e.shiftKey && ["i","j","c"].includes(k)) ||
      (e.ctrlKey && k === "u")) {
    e.preventDefault();
  }
}); */


const callBtn = document.getElementById("call");

let ws = null;
let audioQueue = [];
let playing = false;
let micCtx = null;
let micStream = null;


// ---------- UI ----------
function addBubble(text, who="ai"){
  const row = document.createElement("div");
  row.className = "row " + (who==="me" ? "me": "ai");
  const b = document.createElement("div");
  b.className = "bubble";
  b.textContent = text;
  row.appendChild(b);
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
}
function setStatus(s){ statusEl.textContent=s; }

// ---------- get signed ws url ----------
async function getWsUrl(){
  const r = await fetch("/api/get-ws-url", {method:"POST"});
  const j = await r.json();
  if(!j.ws_url) throw new Error(j.error||"no ws_url");
  return j.ws_url;
}

// ---------- audio playback ----------
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

// ---------- WS helpers ----------
function wsSend(obj){
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify(obj));
  }
}

function connectWs(wsUrl){
  ws = new WebSocket(wsUrl);

  ws.onopen = async ()=>{
    setStatus("connected");

    // ✅ BẮT BUỘC: init conversation
    wsSend({ type: "conversation_initiation_client_data" });
    // ✅ chỉ start mic sau khi WS open
    await startMicPCM();
  };

  ws.onclose = ()=>{
    setStatus("disconnected");
  };
  ws.onerror = (e)=>{
    console.error("ws error", e);
  };

  ws.onmessage = async (ev)=>{
    let data;
    try{ data = JSON.parse(ev.data); }catch{ return; }

    // ✅ ping -> pong
    if (data.type === "ping") {
      wsSend({ type: "pong", event_id: data.ping_event?.event_id });
      return;
    }

    // ✅ text agent trả về
    if (data.type === "agent_response") {
      const t = data.agent_response_event?.agent_response;
      if (t) addBubble(t, "ai");
      return;
    }

    // ✅ audio agent trả về
    if (data.type === "audio") {
      const b64 = data.audio_event?.audio_base_64;
      if (b64) await playBase64Audio(b64, "audio/mpeg");
      return;
    }
  };
}

// ---------- PCM mic streaming (worklet) ----------
async function startMicPCM() {
  micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  // ✅ match user_input_audio_format = pcm_16000
  micCtx = new AudioContext({ sampleRate: 16000 });

  await micCtx.audioWorklet.addModule("/pcm-worklet.js");

  const src = micCtx.createMediaStreamSource(micStream);
  const worklet = new AudioWorkletNode(micCtx, "pcm-worklet");

  worklet.port.onmessage = (ev) => {
    const b64 = ev.data; // PCM16 @16kHz base64
    wsSend({ user_audio_chunk: b64 }); // ✅ đúng schema
  };

  src.connect(worklet); // không nối ra loa để khỏi echo
}


function stopMicPCM() {
  if (micStream) micStream.getTracks().forEach(t => t.stop());
  if (micCtx) micCtx.close();
  micStream = null;
  micCtx = null;
}

// ---------- UI events ----------
callBtn.onclick = async ()=>{
  callBtn.disabled = true;
  try{
    startSession();
    const wsUrl = await getWsUrl();
    connectWs(wsUrl);
  }catch(err){
    console.error(err);
    addBubble("Failed to start call: "+err.message,"ai");
    callBtn.disabled=false;
  }
};
