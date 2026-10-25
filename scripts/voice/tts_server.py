# /// script
# requires-python = ">=3.10"
# dependencies = ["piper-tts==1.8.0"]
# ///
"""Local neural text-to-speech server for the game's spoken dialogue.

Every character gets their own offline Piper voice (German). Lines are
synthesised on demand and cached as WAV files, so each line is only rendered
once. The Vite dev server starts this script automatically and proxies
``/tts`` to it; the game falls back to the browser's speech synthesis when it
is not running.

Run by hand:  uv run scripts/voice/tts_server.py
Request:      GET http://127.0.0.1:5299/tts?voice=narrator&text=Hallo
"""

import hashlib
import json
import os
import threading
import wave
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from piper import PiperVoice, SynthesisConfig
from piper.download_voices import download_voice

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / ".voice-cache"
MODELS = CACHE / "models"
LINES = CACHE / "lines"
PORT = int(os.environ.get("TTS_PORT", "5299"))


@dataclass(frozen=True)
class Voice:
    """How one character sounds.

    Attributes:
        model: Piper voice name (downloaded on first use).
        speaker: Speaker name for multi-speaker models.
        length: Phoneme length scale (>1 = slower).
        rate: Browser playback rate. Playing faster raises the pitch, so a voice
            synthesised slower (``length``) and played faster sounds younger at a normal tempo.
    """

    model: str
    speaker: str | None = None
    length: float = 1.0
    rate: float = 1.0


VOICES: dict[str, Voice] = {
    "narrator": Voice("de_DE-thorsten-high", length=1.12),
    # Reason: no German child voice exists; a female voice pitched up ~3 semitones reads as a young boy
    "tadeo": Voice("de_DE-kerstin-low", length=1.18, rate=1.18),
    "child": Voice("de_DE-kerstin-low", length=1.3, rate=1.3),
    "parrot": Voice("de_DE-thorsten_emotional-medium", speaker="amused", length=1.4, rate=1.45),
    "elder": Voice("de_DE-karlsson-low", length=1.05, rate=0.95),
    "wiseman": Voice("de_DE-karlsson-low", length=1.1, rate=1.02),
    "wisewoman": Voice("de_DE-ramona-low", length=1.08),
    "villager": Voice("de_DE-thorsten_emotional-medium", speaker="amused", length=1.0),
    "baker": Voice("de_DE-ramona-low", length=0.98, rate=1.06),
    "ogre": Voice("de_DE-thorsten_emotional-medium", speaker="angry", length=0.85, rate=0.82),
    "ghost": Voice("de_DE-thorsten_emotional-medium", speaker="whisper", length=1.15),
}

_loaded: dict[str, PiperVoice] = {}
_lock = threading.Lock()
_model_lock = threading.Lock()


def load_model(name: str) -> PiperVoice:
    """Load a Piper voice, downloading it into the cache on first use.

    Args:
        name: Piper voice name, e.g. ``de_DE-thorsten-high``.

    Returns:
        The loaded voice.
    """
    with _model_lock:
        if name not in _loaded:
            onnx = MODELS / f"{name}.onnx"
            if not (onnx.exists() and onnx.with_suffix(".onnx.json").exists()):
                print(f"[tts] downloading {name} ...", flush=True)
                # Reason: download into a side folder so an interrupted download never looks complete
                partial = MODELS / f".partial-{name}"
                partial.mkdir(parents=True, exist_ok=True)
                download_voice(name, partial, force_redownload=True)
                for f in partial.iterdir():
                    f.replace(MODELS / f.name)
                partial.rmdir()
            _loaded[name] = PiperVoice.load(onnx)
        return _loaded[name]


def speaker_id(model: PiperVoice, speaker: str | None) -> int | None:
    """Resolve a speaker name to its id for multi-speaker models.

    Args:
        model: The loaded voice.
        speaker: Speaker name, or None for single-speaker models.

    Returns:
        The numeric speaker id, or None.
    """
    if speaker is None:
        return None
    return model.config.speaker_id_map[speaker]


def synthesize(voice_id: str, text: str) -> Path:
    """Render one line to a cached WAV file (or reuse the cached one).

    Args:
        voice_id: Key in ``VOICES``.
        text: The German sentence to speak.

    Returns:
        Path of the WAV file.
    """
    voice = VOICES[voice_id]
    key = hashlib.sha1(json.dumps([voice.model, voice.speaker, voice.length, text]).encode()).hexdigest()
    out = LINES / f"{key}.wav"
    if out.exists():
        return out
    LINES.mkdir(parents=True, exist_ok=True)
    # Reason: onnxruntime sessions are not shared safely across threads; render one line at a time
    with _lock:
        if out.exists():
            return out
        model = load_model(voice.model)
        config = SynthesisConfig(speaker_id=speaker_id(model, voice.speaker), length_scale=voice.length)
        tmp = out.with_suffix(".tmp")
        with wave.open(str(tmp), "wb") as wav:
            model.synthesize_wav(text, wav, syn_config=config)
        tmp.rename(out)
    return out


class Handler(BaseHTTPRequestHandler):
    """Serves ``GET /tts?voice=<id>&text=<line>`` as audio/wav."""

    def do_GET(self) -> None:  # noqa: N802 (http.server naming)
        """Handle one TTS request."""
        url = urlparse(self.path)
        query = parse_qs(url.query)
        voice_id = query.get("voice", ["narrator"])[0]
        text = query.get("text", [""])[0].strip()
        if url.path != "/tts" or voice_id not in VOICES or not text or len(text) > 600:
            self.send_error(400, "expected /tts?voice=<id>&text=<line>")
            return
        try:
            data = synthesize(voice_id, text).read_bytes()
        except Exception as exc:  # Reason: report synthesis failures to the client instead of dropping the socket
            self.send_error(500, str(exc))
            return
        self.send_response(200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Playback-Rate", str(VOICES[voice_id].rate))
        self.send_header("Cache-Control", "max-age=31536000, immutable")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, format: str, *args: object) -> None:  # noqa: A002
        """Keep the dev server console quiet."""


def main() -> None:
    """Start the server and warm up the narrator voice."""
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        # Reason: Vite restarts on config changes; an instance that is still running keeps serving
        print(f"[tts] port {PORT} already in use, reusing the running voice server", flush=True)
        return
    threading.Thread(target=lambda: load_model(VOICES["narrator"].model), daemon=True).start()
    print(f"[tts] Piper voices on http://127.0.0.1:{PORT}/tts", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
