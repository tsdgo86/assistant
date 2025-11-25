from flask import Flask, send_from_directory, jsonify, render_template
import requests, os
from dotenv import load_dotenv

load_dotenv()

PORT = int(os.getenv("PORT", "8080"))
N8N_SIGNED_URL_ENDPOINT = (os.getenv("N8N_SIGNED_URL_ENDPOINT") or "").strip()
ELEVENLABS_API_KEY = (os.getenv("ELEVENLABS_API_KEY") or "").strip().strip('"').strip("'")
AGENT_ID = (os.getenv("AGENT_ID") or "").strip()
BASE = (os.getenv("BASE_API") or "").strip()

if not ELEVENLABS_API_KEY or not AGENT_ID:
    raise RuntimeError("Thiếu ELEVENLABS_API_KEY hoặc AGENT_ID trong .env")

HEADERS = {"xi-api-key": ELEVENLABS_API_KEY}

# ✅ CHỈ KHỞI TẠO 1 LẦN
app = Flask(__name__, static_folder="static", template_folder="templates")


# ====== HOME ======
@app.get("/")
def home():
    # nếu bạn để index.html trong templates/
    return render_template("index.html")
    # nếu bạn muốn để index.html ở root thì dùng:
    # return send_from_directory(".", "index.html")


# ====== TOKEN ======
@app.route("/conversation-token")
def conversation_token():
    try:
        r = requests.get(
            f"{BASE}/convai/conversation/token",
            params={"agent_id": AGENT_ID},
            headers=HEADERS,
            timeout=20
        )
        r.raise_for_status()
        data = r.json()
        token = data.get("token") or data.get("conversation_token") or ""

        if not token:
            return jsonify({"error": "Không nhận được token", "raw": data}), 500
        return jsonify({"token": token})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ====== AGENT CONFIG ======
@app.route("/api/agent")
def get_agent():
    try:
        r = requests.get(f"{BASE}/convai/agents/{AGENT_ID}", headers=HEADERS, timeout=20)
        if r.status_code == 404:
            r = requests.get(f"{BASE}/agents/{AGENT_ID}", headers=HEADERS, timeout=20)

        r.raise_for_status()
        data = r.json()

        conv = data.get("conversation_config") or {}
        additional = conv.get("additional_languages") or conv.get("languages") or []
        primary = conv.get("language") or conv.get("primary_language") or "en"

        return jsonify({
            "agent_id": AGENT_ID,
            "primary_language": primary,
            "additional_languages": additional,
            "raw": data
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ====== VOICES ======
@app.route("/api/voices")
def list_my_voices():
    try:
        r = requests.get(f"{BASE}/voices", headers=HEADERS, timeout=20)
        if r.status_code == 404:
            r = requests.get(f"{BASE}/voices/search", headers=HEADERS, timeout=20)

        r.raise_for_status()
        data = r.json()
        voices = data.get("voices") or data.get("items") or data.get("results") or []

        out = []
        for v in voices:
            vid = v.get("voice_id") or v.get("id")
            if not vid:
                continue

            category = (v.get("category") or "").lower()
            is_premade = v.get("is_premade") or v.get("premade")

            # only load my voices
            if category == "premade" or is_premade:
                continue

            labels = v.get("labels") or {}
            lang_trained = labels.get("language") or labels.get("lang")

            out.append({
                "voice_id": vid,


                "name": v.get("name") or vid,
                "language_trained": lang_trained,
                "labels": labels
            })

        return jsonify({"voices": out})

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ====== SUPPORTED LANGUAGES ======
@app.route("/api/supported-languages")
def supported_languages():
    langs = [
        {"code":"en","name":"English"},
        {"code":"ja","name":"Japanese"},
        {"code":"zh","name":"Chinese"},
        {"code":"de","name":"German"},
        {"code":"hi","name":"Hindi"},
        {"code":"fr","name":"French"},
        {"code":"ko","name":"Korean"},
        {"code":"pt","name":"Portuguese"},
        {"code":"it","name":"Italian"},
        {"code":"es","name":"Spanish"},
        {"code":"id","name":"Indonesian"},
        {"code":"nl","name":"Dutch"},
        {"code":"tr","name":"Turkish"},
        {"code":"fil","name":"Filipino"},
        {"code":"pl","name":"Polish"},
        {"code":"sv","name":"Swedish"},
        {"code":"bg","name":"Bulgarian"},
        {"code":"ro","name":"Romanian"},
        {"code":"ar","name":"Arabic"},
        {"code":"cs","name":"Czech"},
        {"code":"el","name":"Greek"},
        {"code":"fi","name":"Finnish"},
        {"code":"hr","name":"Croatian"},
        {"code":"ms","name":"Malay"},
        {"code":"sk","name":"Slovak"},
        {"code":"da","name":"Danish"},
        {"code":"ta","name":"Tamil"},
        {"code":"uk","name":"Ukrainian"},
        {"code":"ru","name":"Russian"},
    ]
    return jsonify({"languages": langs})

# =========================================================
# N8N SIGNED URL HELPERS (BỔ SUNG NGUYÊN KHỐI)
# =========================================================
def find_signed_url_deep(obj):
    """
    Tìm signed_url / signedUrl / url ở mọi cấp JSON.
    Chỉ nhận string bắt đầu bằng wss://
    """
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("signed_url", "signedUrl", "url") and isinstance(v, str) and v.startswith("wss://"):
                return v
            found = find_signed_url_deep(v)
            if found:
                return found
    elif isinstance(obj, list):
        for item in obj:
            found = find_signed_url_deep(item)
            if found:
                return found
    return None


def extract_signed_url(r: requests.Response):
    """
    n8n trả application/json + body JSON.
    Nhưng signed_url có thể nằm lồng sâu hoặc key khác.
    """
    ct = (r.headers.get("content-type") or "").lower()
    text = r.text.strip()

    # 1) Nếu là JSON content-type
    if "application/json" in ct:
        data = r.json()
        signed = find_signed_url_deep(data)
        return signed or "", data

    # 2) Nếu lỡ content-type sai nhưng body vẫn là JSON
    try:
        data = json.loads(text)
        signed = find_signed_url_deep(data)
        return signed or "", data
    except Exception:
        pass

    # 3) fallback text thẳng
    return "", {"raw_text": text}


# =========================================================
# N8N SIGNED URL ROUTE (BỔ SUNG)
# =========================================================
@app.route("/signed-url")
def signed_url():
    """
    Browser -> localhost -> POST n8n -> signed_url
    fallback ElevenLabs nếu n8n fail/rỗng
    """
    try:
        payload = {"purpose": "get_signed_url"}
        if AGENT_ID:
            payload["agent_id"] = AGENT_ID

        # ✅ PRIMARY: POST n8n
        r = requests.post(
            N8N_SIGNED_URL_ENDPOINT,
            json=payload,
            timeout=20
        )

        signed, raw = extract_signed_url(r)
        print("signed_from_n8n =", signed)

        if not r.ok:
            return jsonify({
                "error": f"n8n error status={r.status_code}",
                "raw": raw
            }), 500

        if signed:
            return jsonify({"signed_url": signed, "source": "n8n"})

        # --- FALLBACK: gọi thẳng ElevenLabs ---
        r2 = requests.get(
            f"{BASE}/convai/conversation/get-signed-url",
            params={"agent_id": AGENT_ID},
            headers=HEADERS,
            timeout=20
        )
        r2.raise_for_status()
        data2 = r2.json()
        signed2 = data2.get("signed_url")

        print("signed_from_elevenlabs =", signed2)

        if not signed2:
            return jsonify({
                "error": "ElevenLabs fallback cũng không trả signed_url",
                "raw_from_n8n": raw,
                "raw_from_elevenlabs": data2
            }), 500

        return jsonify({"signed_url": signed2, "source": "elevenlabs"})

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    




@app.post("/api/simulate")
def simulate():
    """
    Proxy to ElevenLabs simulate conversation.
    Body from frontend:
      {
        "first_message": "...",
        "language": "en",
        "turns": [{"role":"user","text":"..."}, ...]   # optional
      }
    """
    try:
        body = request.get_json(force=True) or {}
        first_message = body.get("first_message") or ""
        language = body.get("language") or "en"
        turns = body.get("turns") or []

        payload = {
            "simulation_specification": {
                "simulated_user_config": {
                    "first_message": first_message,
                    "language": language,
                    # bạn có thể nhét thêm dynamic_variables, partial_conversation_history... nếu cần
                },
                # optional: cho sẵn lịch sử hội thoại giả lập
                "partial_conversation_history": turns
            }
        }

        r = requests.post(
            f"{BASE}/convai/agents/{AGENT_ID}/simulate-conversation",
            headers=HEADERS,
            json=payload,
            timeout=60
        )
        r.raise_for_status()
        return jsonify(r.json())

    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT, debug=True)
