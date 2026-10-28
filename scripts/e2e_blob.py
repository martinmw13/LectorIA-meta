"""Shared Playwright helpers for music-byte e2e checks (not run in CI).

Vercel Blob transfer is metered (10 GB/month on the free tier), so e2e
runs must never pull real tracks. Use block_music to assert zero music
bytes, or fake_music to test playback with an in-memory silent WAV.
"""

import io
import re
import wave

# Any host, so it keeps matching if tracks move from Blob to public/music/.
MUSIC_URL = re.compile(r"^https?://[^/]+/music/.+\.(?:mp3|m4a|ogg|opus|webm|wav|flac)(?:\?|$)")


def silent_wav(seconds=120):
    """Build a silent 8 kHz mono 16-bit PCM WAV in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * int(8000 * seconds))
    return buf.getvalue()


# Long enough that no e2e run reaches a loop crossfade.
_SILENT_WAV = silent_wav()


def block_music(target):
    """Abort every music request on a Page or BrowserContext; returns the hit URLs."""
    hits = []

    def _handle(route):
        hits.append(route.request.url)
        route.abort()

    target.route(MUSIC_URL, _handle)
    return hits


def fake_music(target):
    """Serve the silent WAV for every music request; returns the hit URLs."""
    hits = []

    def _handle(route):
        hits.append(route.request.url)
        route.fulfill(status=200, content_type="audio/wav", body=_SILENT_WAV)

    target.route(MUSIC_URL, _handle)
    return hits
