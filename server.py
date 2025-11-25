import os, requests
from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("ELEVENLABS_API_KEY")
AGENT_ID = os.getenv("AGENT_ID")

if not API_KEY or not AGENT_ID:
    raise RuntimeError("Missing ELEVENLABS_API_KEY or AGENT_ID in .env")

app = Flask(__name__, static_folder="static")
CORS(app)

@app.route("/", methods=["GET"])
def index():
    return send_from_directory("static", "index.html")

@app.get("/pcm-worklet.js")
def pcm_worklet():
    return send_from_directory("static", "pcm-worklet.js")

@app.route("/api/get-ws-url", methods=["POST"])
def get_ws_url():
    # ✅ đúng endpoint hiện tại
    url = f"https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id={AGENT_ID}"
    headers = {"xi-api-key": API_KEY}

    r = requests.get(url, headers=headers, timeout=30)
    if r.status_code != 200:
        return jsonify({"error": r.text}), 500

    body = r.json()
    signed_url = body.get("signed_url")
    if not signed_url:
        return jsonify({"error": "No signed_url in response", "raw": body}), 500

    return jsonify({"ws_url": signed_url})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8787, debug=True)