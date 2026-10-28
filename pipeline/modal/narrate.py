# Chapter narration on a Modal GPU: Kokoro-82M voice af_heart at 0.95x.
# One function, narrate(texts, gaps, voice, speed), scales to zero after
# a minute idle. Deploy with: modal deploy pipeline/modal/narrate.py.
# Remove entirely with: modal app stop lectoria-narration.
from __future__ import annotations

import io
import re
import subprocess
import tempfile
import time

import modal

kimg = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("espeak-ng", "ffmpeg")
    .pip_install("kokoro==0.9.4", "soundfile", "numpy", "torch==2.5.1", "transformers==4.46.3")
)
with kimg.imports():
    import numpy as np
    import soundfile as sf
vol = modal.Volume.from_name("lectoria-hf-cache", create_if_missing=True)
app = modal.App("lectoria-narration", image=kimg)

SAMPLE_RATE = 24000
MIN_SPAN_SAMPLES = int(round(0.05 * SAMPLE_RATE))
VOICE_RE = re.compile(r"^[a-z]{2}_[a-z]+$")

_pipe = None


def pipeline():
    global _pipe
    if _pipe is None:
        from kokoro import KPipeline

        _pipe = KPipeline(lang_code="a")
    return _pipe


def clean(text: str) -> str:
    # Light TTS-only cleanup; offsets in the manifest never change because
    # the caller keeps the original text for timing and display.
    text = re.sub(r"(?<=\w)\s*—\s*(?=\w)", ", ", text)
    return text.replace("_", "")


def check(texts, gaps, voice, speed):
    if not isinstance(texts, list) or not 1 <= len(texts) <= 2000:
        raise ValueError("texts must be a list of 1..2000 strings")
    if not isinstance(gaps, list) or len(gaps) != len(texts):
        raise ValueError("gaps must match texts in length")
    for text in texts:
        if not isinstance(text, str) or not 1 <= len(text) <= 2000:
            raise ValueError("each text must be 1..2000 chars")
    for gap in gaps:
        if not isinstance(gap, (int, float)) or not 0 <= gap <= 3:
            raise ValueError("each gap must be 0..3 s")
    if not isinstance(voice, str) or not VOICE_RE.match(voice):
        raise ValueError("voice must match ^[a-z]{2}_[a-z]+$")
    if not isinstance(speed, (int, float)) or not 0.5 <= speed <= 1.5:
        raise ValueError("speed must be 0.5..1.5")


@app.function(gpu="L4", scaledown_window=60, timeout=600, max_containers=4, volumes={"/root/.cache/huggingface": vol})
def narrate(texts: list[str], gaps: list[float], voice: str, speed: float) -> dict:
    started = time.monotonic()
    check(texts, gaps, voice, speed)
    pipe = pipeline()
    parts: list[np.ndarray] = []
    spans: list[dict] = []
    cursor = 0
    for text, gap in zip(texts, gaps):
        chunks = []
        for _, _, audio in pipe(clean(text), voice=voice, speed=float(speed)):
            chunks.append(np.asarray(audio, dtype=np.float32).reshape(-1))
        speech = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.float32)
        if speech.shape[0] < MIN_SPAN_SAMPLES:
            # Kokoro can render a sentence as no audio ("…"); t0 == t1
            # fails parseChapterNarration, so pad to a 50 ms floor.
            speech = np.concatenate([speech, np.zeros(MIN_SPAN_SAMPLES - speech.shape[0], dtype=np.float32)])
        t0 = cursor / SAMPLE_RATE
        parts.append(speech)
        cursor += speech.shape[0]
        spans.append({"t0": t0, "t1": cursor / SAMPLE_RATE})
        silence = int(round(float(gap) * SAMPLE_RATE))
        if silence > 0:
            parts.append(np.zeros(silence, dtype=np.float32))
            cursor += silence
    full = np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
    with tempfile.NamedTemporaryFile(suffix=".wav") as wav, tempfile.NamedTemporaryFile(suffix=".mp3") as mp3:
        sf.write(wav.name, full, SAMPLE_RATE)
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error", "-i", wav.name, "-ac", "1", "-ar", "24000", "-b:a", "32k", "-codec:a", "libmp3lame", mp3.name],
            check=True,
        )
        mp3_bytes = open(mp3.name, "rb").read()
    return {
        "mp3": mp3_bytes,
        "durationSec": cursor / SAMPLE_RATE,
        "spans": spans,
        "gpuSec": time.monotonic() - started,
    }
