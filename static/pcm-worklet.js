// ===== Base64 encoder (works in AudioWorklet, no btoa) =====
function base64Encode(bytes) {
  const base64abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = '';
  let i;
  const len = bytes.length;

  for (i = 2; i < len; i += 3) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 3) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[((bytes[i - 1] & 15) << 2) | (bytes[i] >> 6)];
    result += base64abc[bytes[i] & 63];
  }
  if (i === len + 1) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[(bytes[i - 2] & 3) << 4];
    result += "==";
  }
  if (i === len) {
    result += base64abc[bytes[i - 2] >> 2];
    result += base64abc[((bytes[i - 2] & 3) << 4) | (bytes[i - 1] >> 4)];
    result += base64abc[(bytes[i - 1] & 15) << 2];
    result += "=";
  }
  return result;
}

class PCMWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetSR = 16000;
    this.inSR = sampleRate; // sample rate thực tế của AudioContext
    this.ratio = this.inSR / this.targetSR;

    this._inBuf = new Float32Array(0);
    this._outBuf = [];
    this._needOut = 320; // ~20ms @16kHz
  }

  _appendInput(samples) {
    const merged = new Float32Array(this._inBuf.length + samples.length);
    merged.set(this._inBuf, 0);
    merged.set(samples, this._inBuf.length);
    this._inBuf = merged;
  }

  _resampleTo16k() {
    if (this._inBuf.length < this.ratio + 1) return;

    const out = [];
    let idx = 0;
    while (idx + 1 < this._inBuf.length) {
      const i0 = Math.floor(idx);
      const i1 = i0 + 1;
      const frac = idx - i0;
      const s = this._inBuf[i0] * (1 - frac) + this._inBuf[i1] * frac;
      out.push(s);
      idx += this.ratio;
    }

    // giữ lại phần dư
    const remainStart = Math.floor(idx);
    this._inBuf = this._inBuf.slice(remainStart);

    return out;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;

    const samples = input[0];
    this._appendInput(samples);

    const resampled = (this.inSR === this.targetSR)
      ? Array.from(samples)
      : this._resampleTo16k();

    if (resampled && resampled.length) {
      for (const s0 of resampled) {
        const s = Math.max(-1, Math.min(1, s0));
        this._outBuf.push(s);
      }
    }

    // xuất chunk ~20ms
    while (this._outBuf.length >= this._needOut) {
      const chunk = this._outBuf.splice(0, this._needOut);
      const pcm16 = new Int16Array(chunk.length);

      for (let i = 0; i < chunk.length; i++) {
        pcm16[i] = chunk[i] * 32767;
      }

      const bytes = new Uint8Array(pcm16.buffer);
      const b64 = base64Encode(bytes);
      this.port.postMessage(b64);
    }

    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorkletProcessor);