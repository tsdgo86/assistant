
// static/js/i18n.js
// UI I18N layer for Trantourist Assistant
// This module is imported by assistant.js
export function changeMessageVoice(CURRENT_VOICE_LANG) {
  const messages = {
    vi: "Xin chào! Tôi là trợ lý mà bạn vừa chọn. Rất vui được đồng hành cùng bạn.",
    en: "Hello! I'm the assistant you just selected. Happy to accompany you.",
    ja: "こんにちは！私はあなたが選んだ新しいアシスタントです。これからよろしくお願いします。",
    ko: "안녕하세요! 저는 당신이 방금 선택한 새 어시스턴트입니다. 잘 부탁드립니다.",
    zh: "你好！我是你刚选择的助理，很高兴为你服务。",
  };

  return messages[CURRENT_VOICE_LANG] || messages.en;
}

export const I18N = {
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
    statusReady:"Hệ thống đã sẵn sàng. Bạn có thể gửi tin nhắn để bắt đầu",
    statusConnecting:"Đang kết nối Agent...",
    statusConnected:"Dịch vụ đã kết nối — Bạn có thể gửi yêu cầu.",
    statusEnded:"Session đã kết thúc. Gửi tin mới để bắt đầu lại.",
    statusError:"Lỗi session. Gửi tin mới để bắt đầu lại.",
    statusCannotConnect:"Không kết nối được. Gửi tin để thử lại.",
    statusFetchingSigned:"Đang lấy signed_url...",
    micRequired:"Bạn phải cho phép micro để dùng Agent.",
    noCode:"Bạn chưa nhập mã nào để tra cứu.",
    callBtn:"Tạo cuộc gọi mới",
    endBtn:"Kết thúc cuộc gọi",
    endCallMsg:"Đã kết thúc cuộc gọi.",
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
    statusReady:"The system is ready. You can send a message to begin.",
    statusConnecting:"Connecting to Agent...",
    statusConnected:"The service is connected — You can send your request.",
    statusEnded:"Session ended. Send a new message to start again.",
    statusError:"Session error. Send a new message to retry.",
    statusCannotConnect:"Could not connect. Send a message to retry.",
    statusFetchingSigned:"Fetching signed_url...",
    micRequired:"Microphone permission is required.",
    noCode:"Please enter a code to look up.",
    callBtn:"New Call",
    endBtn:"Hang up",
    endCallMsg:"Call ended.",
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
    statusReady:"系统已准备就绪。您可以发送消息开始对话。",
    statusConnecting:"正在连接客服...",
    statusConnected:"服务已连接 — 您可以发送请求。",
    statusEnded:"会话已结束，发送新消息重新开始。",
    statusError:"会话错误，请重新发送消息。",
    statusCannotConnect:"无法连接，请重试。",
    statusFetchingSigned:"正在获取 signed_url...",
    micRequired:"需要麦克风权限。",
    noCode:"请输入查询编号。",
    callBtn:"创建新通话",
    endBtn:"结束",
    endCallMsg:"通话已结束。",
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
    statusReady:"システムの準備が整いました。メッセージを送って開始してください。",
    statusConnecting:"エージェントに接続中...",
    statusConnected:"サービスが接続されました — ご要望を送信できます。",
    statusEnded:"セッション終了。新しいメッセージで再開。",
    statusError:"セッションエラー。再送してください。",
    statusCannotConnect:"接続できません。再試行してください。",
    statusFetchingSigned:"signed_url 取得中...",
    micRequired:"マイクの許可が必要です。",
    noCode:"検索コードを入力してください。",
    callBtn:"新しい通話を作成",
    endBtn:"終了",
    endCallMsg:"通話を終了しました。",
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
    statusReady:"시스템이 준비되었습니다. 메시지를 보내서 시작하세요.",
    statusConnecting:"에이전트 연결 중...",
    statusConnected:"서비스가 연결되었습니다 — 요청을 보내실 수 있습니다.",
    statusEnded:"세션 종료. 새 메시지로 다시 시작.",
    statusError:"세션 오류. 다시 보내세요.",
    statusCannotConnect:"연결할 수 없습니다. 다시 시도하세요.",
    statusFetchingSigned:"signed_url 가져오는 중...",
    micRequired:"마이크 권한이 필요합니다.",
    noCode:"조회 코드를 입력하세요.",
    callBtn:"새 통화를 생성",
    endBtn:"종료",
    endCallMsg:"통화가 종료되었습니다.",
    langSelected:(t)=>`봇 언어 선택됨: ${t}. 다음 세션에 적용됩니다.`,
    voiceSelected:(t)=>`보이스 선택됨: ${t}. 봇이 해당 보이스로 답하려고 합니다.`
  }
};

export const FLAG = { vi:"🇻🇳", en:"🇬🇧", zh:"🇨🇳", ja:"🇯🇵", ko:"🇰🇷" };
export const SHORT = { vi:"VI", en:"EN", zh:"ZH", ja:"JA", ko:"KO" };

// translate helper
export function tUI(key){
  const lang = localStorage.getItem("ui_lang") || "vi";
  return (I18N[lang] && I18N[lang][key]) || I18N.vi[key] || key;
}

// apply i18n text to DOM
export function applyUILang(lang, { Conversation, connected, statusEl } = {}){
  const dict = I18N[lang] || I18N.vi;

  document.querySelectorAll("[data-i18n]").forEach(el=>{
    const key = el.getAttribute("data-i18n");
    if (dict[key]) el.textContent = dict[key];
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{
    const key = el.getAttribute("data-i18n-placeholder");
    if (dict[key]) el.placeholder = dict[key];
  });

  if (statusEl){
    if (Conversation) statusEl.textContent = connected ? dict.statusConnected : dict.statusReady;
    else statusEl.textContent = dict.statusLoading;
  }
}

// init header dropdown
export function initUILangHeader({
  uiLangBtn,
  uiLangMenu,
  uiLangFlag,
  uiLangText,
  Conversation,
  getConnected,
  statusEl
}){
  function setUILangHeader(lang){
    if (uiLangFlag) uiLangFlag.textContent = FLAG[lang] || "🌐";
    if (uiLangText) uiLangText.textContent = SHORT[lang] || lang.toUpperCase();
    localStorage.setItem("ui_lang", lang);
    applyUILang(lang, { Conversation, connected: getConnected?.(), statusEl });
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

  return { setUILangHeader };
}


