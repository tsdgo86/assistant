 const TOKEN_ENDPOINT = "/conversation-token";

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

  let Conversation;
  let conversation = null;
  let connected = false;
  let connecting = false;
  let heartbeat = null;
  let micReady = false;

  function logDebug(msg){
     debugEl.textContent += msg + "\n";
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

  async function ensureMicPermission(){
    if (micReady) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    stream.getTracks().forEach(t=>t.stop());
    micReady = true;
    logDebug("✓ Mic permission granted");
  }

  async function fetchToken(){
    logDebug("→ fetchToken()");
    const res = await fetch(TOKEN_ENDPOINT,{cache:"no-store"});
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Token fetch failed");
    if (!data.token) throw new Error("empty token");
    return data.token;
  }

  // ===== I18N UI =====
  const I18N = {
    vi: {
      menuHome:"Trang chủ", menuTours:"Tours", menuAbout:"Về chúng tôi", menuContact:"Liên hệ",
      lookupTitle:"Tra cứu thông tin",
      tourCodeLabel:"Mã Tour", tourCodePh:"VD: HG3N2D-2025-11-01",
      customerCodeLabel:"Mã Khách hàng", customerCodePh:"VD: KH-000123",
      orderCodeLabel:"Mã Order / Booking", orderCodePh:"VD: OD-778899",
      lookupBtn:"Kiểm tra ngay",
      lookupHint:"Nhập 1 trong 3 mã trên rồi bấm “Kiểm tra ngay”. Hệ thống sẽ gửi yêu cầu vào chatbot để Agent tra cứu và phản hồi.",
      chatInputPh:"Nhập tin nhắn...", sendBtn:"Gửi",
      botLangLabel:"Ngôn ngữ:", voiceLabel:"Voices:", statusLabel:"Trạng thái:",
      statusLoading:"Đang tải SDK...",
      statusReady:"SDK OK. Nhập tin nhắn để bắt đầu.",
      statusConnecting:"Đang kết nối Agent (WebRTC)...",
      statusConnected:"Dịch vụ đã kết nối — Bạn có thể gửi yêu cầu.",
      statusEnded:"Session đã kết thúc. Gửi tin mới để bắt đầu lại.",
      statusError:"Lỗi session. Gửi tin mới để bắt đầu lại.",
      statusCannotConnect:"Không kết nối được. Gửi tin để thử lại.",
      statusFetchingToken:"Đang lấy token...",
      micRequired:"Bạn phải cho phép micro để dùng Agent.",
      noCode:"Bạn chưa nhập mã nào để tra cứu.",
      langSelected:(t)=>`Đã chọn ngôn ngữ bot: ${t}. Lần kết nối sau bot sẽ trả lời theo ngôn ngữ này.`,
      voiceSelected:(t)=>`Đã chọn voice: ${t}. Bot sẽ cố gắng nói theo voice này.`
    },
    en: {
      menuHome:"Home", menuTours:"Tours", menuAbout:"About us", menuContact:"Contact",
      lookupTitle:"Lookup information",
      tourCodeLabel:"Tour Code", tourCodePh:"E.g., HG3N2D-2025-11-01",
      customerCodeLabel:"Customer Code", customerCodePh:"E.g., KH-000123",
      orderCodeLabel:"Order / Booking Code", orderCodePh:"E.g., OD-778899",
      lookupBtn:"Check now",
      lookupHint:"Enter one of the codes above and click “Check now”. The system will ask the agent to look up and respond.",
      chatInputPh:"Type your message...", sendBtn:"Send",
      botLangLabel:"Languages:", voiceLabel:"Voices:", statusLabel:"Status:",
      statusLoading:"Loading SDK...",
      statusReady:"SDK OK. Type to start.",
      statusConnecting:"Connecting to Agent (WebRTC)...",
      statusConnected:"The service is connected — You can send your request.",
      statusEnded:"Session ended. Send a new message to start again.",
      statusError:"Session error. Send a new message to retry.",
      statusCannotConnect:"Could not connect. Send a message to retry.",
      statusFetchingToken:"Fetching token...",
      micRequired:"Microphone permission is required.",
      noCode:"Please enter a code to look up.",
      langSelected:(t)=>`Bot language selected: ${t}. Next session will use this language.`,
      voiceSelected:(t)=>`Voice selected: ${t}. The bot will try to follow it.`
    },
    zh: {
      menuHome:"首页", menuTours:"线路", menuAbout:"关于我们", menuContact:"联系",
      lookupTitle:"信息查询",
      tourCodeLabel:"团号", tourCodePh:"例如：HG3N2D-2025-11-01",
      customerCodeLabel:"客户编号", customerCodePh:"例如：KH-000123",
      orderCodeLabel:"订单 / 预订编号", orderCodePh:"例如：OD-778899",
      lookupBtn:"立即查询",
      lookupHint:"请输入以上任一编号并点击“立即查询”。系统会让客服机器人检索并回复。",
      chatInputPh:"输入消息...", sendBtn:"发送",
      botLangLabel:"语言：", voiceLabel:"声音：", statusLabel:"状态：",
      statusLoading:"正在加载 SDK...",
      statusReady:"SDK 就绪，输入消息开始。",
      statusConnecting:"正在连接客服 (WebRTC)...",
      statusConnected:"服务已连接 — 您可以发送请求。",
      statusEnded:"会话已结束，发送新消息重新开始。",
      statusError:"会话错误，请重新发送消息。",
      statusCannotConnect:"无法连接，请重试。",
      statusFetchingToken:"正在获取 token...",
      micRequired:"需要麦克风权限。",
      noCode:"请输入查询编号。",
      langSelected:(t)=>`已选择机器人语言：${t}。下次会话将使用此语言。`,
      voiceSelected:(t)=>`已选择声音：${t}。机器人将尽量按此声音回复。`
    },
    ja: {
      menuHome:"ホーム", menuTours:"ツアー", menuAbout:"会社概要", menuContact:"お問い合わせ",
      lookupTitle:"情報検索",
      tourCodeLabel:"ツアーコード", tourCodePh:"例：HG3N2D-2025-11-01",
      customerCodeLabel:"顧客コード", customerCodePh:"例：KH-000123",
      orderCodeLabel:"注文 / 予約コード", orderCodePh:"例：OD-778899",
      lookupBtn:"今すぐ確認",
      lookupHint:"上のいずれかのコードを入力して「今すぐ確認」を押してください。エージェントが確認して回答します。",
      chatInputPh:"メッセージを入力...", sendBtn:"送信",
      botLangLabel:"言語:", voiceLabel:"ボイス：", statusLabel:"状態：",
      statusLoading:"SDK を読み込み中...",
      statusReady:"SDK OK。入力して開始。",
      statusConnecting:"エージェントに接続中 (WebRTC)...",
      statusConnected:"サービスが接続されました — ご要望を送信できます。接続完了 — チャットできます。",
      statusEnded:"セッション終了。新しいメッセージで再開。",
      statusError:"セッションエラー。再送してください。",
      statusCannotConnect:"接続できません。再試行してください。",
      statusFetchingToken:"トークン取得中...",
      micRequired:"マイクの許可が必要です。",
      noCode:"検索コードを入力してください。",
      langSelected:(t)=>`ボット言語を選択しました：${t}。次回セッションで反映されます。`,
      voiceSelected:(t)=>`ボイスを選択しました：${t}。ボットはこの声で話そうとします。`
    },
    ko: {
      menuHome:"홈", menuTours:"투어", menuAbout:"회사 소개", menuContact:"문의",
      lookupTitle:"정보 조회",
      tourCodeLabel:"투어 코드", tourCodePh:"예: HG3N2D-2025-11-01",
      customerCodeLabel:"고객 코드", customerCodePh:"예: KH-000123",
      orderCodeLabel:"주문 / 예약 코드", orderCodePh:"예: OD-778899",
      lookupBtn:"지금 확인",
      lookupHint:"위의 코드 중 하나를 입력하고 “지금 확인”을 누르세요. 에이전트가 조회 후 답변합니다.",
      chatInputPh:"메시지 입력...", sendBtn:"전송",
      botLangLabel:"언어:", voiceLabel:"보이스:", statusLabel:"상태:",
      statusLoading:"SDK 로딩 중...",
      statusReady:"SDK 준비 완료. 입력해서 시작하세요.",
      statusConnecting:"에이전트 연결 중 (WebRTC)...",
      statusConnected:"서비스가 연결되었습니다 — 요청을 보내실 수 있습니다.연결됨 — 채팅하세요.",
      statusEnded:"세션 종료. 새 메시지로 다시 시작.",
      statusError:"세션 오류. 다시 보내세요.",
      statusCannotConnect:"연결할 수 없습니다. 다시 시도하세요.",
      statusFetchingToken:"토큰 가져오는 중...",
      micRequired:"마이크 권한이 필요합니다.",
      noCode:"조회 코드를 입력하세요.",
      langSelected:(t)=>`봇 언어 선택됨: ${t}. 다음 세션에 적용됩니다.`,
      voiceSelected:(t)=>`보이스 선택됨: ${t}. 봇이 해당 보이스로 답하려고 합니다.`
    }
  };

  function tUI(key){
    const lang = localStorage.getItem("ui_lang") || "vi";
    return (I18N[lang] && I18N[lang][key]) || I18N.vi[key] || key;
  }

  function applyUILang(lang){
    const dict = I18N[lang] || I18N.vi;

    document.querySelectorAll("[data-i18n]").forEach(el=>{
      const key = el.getAttribute("data-i18n");
      if (dict[key]) el.textContent = dict[key];
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
      const key = el.getAttribute("data-i18n-placeholder");
      if (dict[key]) el.placeholder = dict[key];
    });

    if (Conversation) statusEl.textContent = connected ? dict.statusConnected : dict.statusReady;
    else statusEl.textContent = dict.statusLoading;
  }

  // ===== UI language dropdown (header) =====
  const FLAG = { vi:"🇻🇳", en:"🇬🇧", zh:"🇨🇳", ja:"🇯🇵", ko:"🇰🇷" };
  const SHORT = { vi:"VI", en:"EN", zh:"ZH", ja:"JA", ko:"KO" };

  function setUILangHeader(lang){
    uiLangFlag.textContent = FLAG[lang] || "🌐";
    uiLangText.textContent = SHORT[lang] || lang.toUpperCase();
    localStorage.setItem("ui_lang", lang);
    applyUILang(lang);
  }

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

  const savedUILang = localStorage.getItem("ui_lang") || "vi";
  setUILangHeader(savedUILang);

  // ===== Load bot languages & voices =====
  let VOICE_LANG_MAP = {}; // voice_id -> language_trained

  let SUPPORTED_LANGS = []; // [{code,name},...]

  async function loadSupportedLanguages(){
    try{
      const res = await fetch("/api/supported-languages", {cache:"no-store"});
      const data = await res.json();
      console.log("loadSupportedLanguages", data)
      if (!res.ok) throw new Error(data.error || "supported-languages error");
      SUPPORTED_LANGS = data.languages || [];
    }catch(e){
      logDebug("✗ loadSupportedLanguages: " + e.message);
      // fallback tối thiểu
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
    console.log("loadAgentConfig agent", data);
    if (!res.ok) throw new Error(data.error || "agent error");

    const primary = data.primary_language || "en";
    const adds = data.additional_languages || [];
    const agentSupported = Array.from(new Set([primary, ...adds]));

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


  }catch(e){
    logDebug("✗ loadAgentConfig: " + e.message);
    // fallback lấy global languages luôn (nhưng không biết agent có bật hay không)
    const globalMap = Object.fromEntries(
      SUPPORTED_LANGS.map(x => [x.code, x.name])
    );

    langSel.innerHTML = "";
    SUPPORTED_LANGS.forEach(x=>{
      const opt = document.createElement("option");
      opt.value = x.code;
      opt.textContent = globalMap[x.code] || x.code;
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
        const langTag = v.language_trained ? ` • ${v.language_trained.toUpperCase()}` : "";
        opt.textContent = (v.name || v.voice_id) + langTag;
        voiceSel.appendChild(opt);
      });

      if (!voices.length){
        voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
      }
    }catch(e){
      logDebug("✗ loadVoices: " + e.message);
      voiceSel.innerHTML = `<option value="default">Default (Agent)</option>`;
    }
  }

  (async () => {
  await loadSupportedLanguages();
  await loadAgentConfig();
  await loadVoices();
  })();
  // ===== ElevenLabs session =====
  function buildSessionInstruction(){
    const lang = langSel.value;
    const voiceId = voiceSel.value;

    const langMap = {
      vi:"Tiếng Việt", en:"English", zh:"Chinese", ja:"Japanese", ko:"Korean",
      es:"Spanish", fr:"French", de:"German"
    };

    return `HƯỚNG DẪN NỘI BỘ:
1) Trả lời bằng ${langMap[lang] || lang}.
2) Dùng voice_id: ${voiceId} cho phần TTS (nếu agent hỗ trợ override voice).
3) Giữ văn phong tư vấn tour chuyên nghiệp.`;
  }

  async function startSession(){
    if (connecting || connected || conversation) return;
    connecting = true;
    logDebug("→ startSession()");

    try{
      statusEl.textContent = tUI("statusFetchingToken");
      const token = await fetchToken();

      statusEl.textContent = tUI("statusConnecting");
      conversation = await Conversation.startSession({
        conversationToken: token,
        connectionType: "webrtc",
        
        // 🔥 OVERRIDES để khóa ngôn ngữ + voice
        overrides: {
          agent: { language: langSel.value },      // ví dụ "en"
          tts:   { voiceId: voiceSel.value },      // voice Huyen
          conversation: { textOnly: true }
        },

        onConnect: async ()=>{
          logDebug("✓ onConnect()");
          connected = true;
          connecting = false;
          statusEl.textContent = tUI("statusConnected");

          heartbeat = setInterval(()=>{
            try{ conversation?.sendUserActivity(); }catch{}
          },5000);

          //try{ await conversation.setMicMuted(true); }catch{}          
        },

        onDisconnect: ()=>{
          logDebug("✗ onDisconnect()");
          connected = false;
          connecting = false;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          conversation = null;
          statusEl.textContent = tUI("statusEnded");
        },

        onError: (e)=>{
          logDebug("✗ onError(): " + (e?.message || e));
          connected = false;
          connecting = false;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          conversation = null;
          statusEl.textContent = tUI("statusError");
        },

        onMessage: async ({message, source})=>{
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

  async function sendCurrentText(){
    const text = textEl.value.trim();
    if (!text) return;

    try{ await ensureMicPermission(); }
    catch{ statusEl.textContent = tUI("micRequired"); return; }

    if (!conversation || !connected) await startSession();
    if (!conversation || !connected) return;

    addMsg("user", text);
    conversation.sendUserMessage(text);
    conversation.sendUserActivity();

    textEl.value = "";
    updateSendState();
    textEl.focus();
  }

 
 async function lookupInfo() {
  const tourCode = tourCodeEl.value.trim();
  const customerCode = customerCodeEl.value.trim();
  const orderCode = orderCodeEl.value.trim();

  if (!tourCode && !customerCode && !orderCode) {
    addMsg("agent", "Bạn chưa nhập mã để tra cứu.");
    return;
  }

  const payload =
`YÊU CẦU TRA CỨU TRONG HỆ THỐNG CÔNG TY:

- Mã Tour: ${tourCode || "N/A"}
- Mã Khách hàng: ${customerCode || "N/A"}
- Mã Order/Booking: ${orderCode || "N/A"}

Hãy tự động tra cứu trong hệ thống.
Trả về:
1) Danh sách các điểm sẽ đến (theo thứ tự lịch trình).
2) Thời gian dự kiến mỗi điểm.
3) Khách sạn / nhà hàng chính (nếu có).
Nếu không tìm thấy, nói rõ “không có dữ liệu trong hệ thống”.`;

  textEl.value = payload;
  updateSendState();
  await sendCurrentText();
}


  sendBtn.addEventListener("click", sendCurrentText);
  textEl.addEventListener("input", updateSendState);
  textEl.addEventListener("keydown",(e)=>{
    if(e.key==="Enter") sendCurrentText();
  });
  lookupBtn.addEventListener("click", lookupInfo);

  langSel.addEventListener("change", ()=>{
    const label = langSel.options[langSel.selectedIndex]?.text || langSel.value;
    const dict = I18N[localStorage.getItem("ui_lang") || "vi"] || I18N.vi;
    addMsg("agent", dict.langSelected(label));
  });

  voiceSel.addEventListener("change", ()=>{
    const selectedId = voiceSel.value;
    const trainedLang = VOICE_LANG_MAP[selectedId];

    const uiLang = localStorage.getItem("ui_lang") || "vi";
    const dict = I18N[uiLang] || I18N.vi;
    const label = voiceSel.options[voiceSel.selectedIndex]?.text || selectedId;

    if (trainedLang) {
      const hasOption = [...langSel.options].some(o => o.value === trainedLang);
      if (hasOption) {
        langSel.value = trainedLang;
        addMsg("agent", `Voice "${label}" tối ưu cho ${trainedLang.toUpperCase()} → Bot language đã chuyển theo.`);
      } else {
        addMsg("agent", `Voice "${label}" tối ưu cho ${trainedLang.toUpperCase()}, nhưng agent chưa bật ngôn ngữ này.`);
      }
    } else {
      addMsg("agent", dict.voiceSelected(label));
    }
  });

  // ===== Load SDK =====
  try{
    statusEl.textContent = tUI("statusLoading");
    const mod = await import("https://esm.sh/@elevenlabs/client@0.11.0?bundle");
    Conversation = mod.Conversation;
    logDebug("✓ Imported Conversation SDK");
    statusEl.textContent = tUI("statusReady");
    startSession()
  }catch(e){
    logDebug("✗ Import SDK failed: " + e.message);
    statusEl.textContent = tUI("statusError");
  }

  updateSendState();

  // ===== Weak deterrent (NOT security) =====
  /*document.addEventListener("contextmenu", e => e.preventDefault());
  document.addEventListener("keydown", e => {
    const k = e.key.toLowerCase();
    if (k === "f12" ||
        (e.ctrlKey && e.shiftKey && ["i","j","c"].includes(k)) ||
        (e.ctrlKey && k === "u")) {
      e.preventDefault();
    }
  }); */

