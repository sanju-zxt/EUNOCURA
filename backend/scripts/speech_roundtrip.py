"""Round-trip check for the local speech stack: TTS writes a WAV, STT reads it back.

Run: .venv\\Scripts\\python.exe scripts\\speech_roundtrip.py
Exit code 0 when the transcript comes back non-empty, 1 otherwise.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services import local_speech  # noqa: E402

PHRASE = "The patient reports chest pain for two days."


def main() -> int:
    status = local_speech.status()
    print("status:", status)
    if not status["tts"]["available"]:
        print("FAIL: TTS unavailable")
        return 1
    if not status["stt"]["available"]:
        print("FAIL: STT unavailable")
        return 1

    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "probe.wav"
        audio = local_speech.synthesize(PHRASE)
        wav.write_bytes(audio)
        print(f"wav: {wav.exists()} {len(audio)} bytes")
        if len(audio) < 2000:
            print("FAIL: TTS produced no audio")
            return 1

        transcript = local_speech.transcribe_bytes(audio)
        print(f"transcript: {transcript!r}")
        if not transcript or not transcript.strip():
            print("FAIL: STT returned nothing")
            return 1

        overlap = len(set(PHRASE.lower().split()) & set(transcript.lower().split()))
        print(f"word overlap: {overlap} words")
        print("PASS: local speech round-trip works")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
