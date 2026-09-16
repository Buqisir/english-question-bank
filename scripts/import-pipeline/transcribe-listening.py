#!/usr/bin/env python3

import argparse
import importlib.metadata
import json
import subprocess
import tempfile

from faster_whisper import WhisperModel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="small.en")
    parser.add_argument("--max-seconds", type=int, default=180)
    args = parser.parse_args()
    if not 1 <= args.max_seconds <= 180:
        parser.error("opening sample must be between 1 and 180 seconds")

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    # Bound the actual model input, not just the returned transcript. The caller
    # already decoded and retained the complete normalized playback MP3.
    with tempfile.NamedTemporaryFile(suffix=".wav") as sample:
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-i", args.audio,
            "-t", str(args.max_seconds), "-ac", "1", "-ar", "16000", sample.name,
        ], check=True)
        segments, info = model.transcribe(
            sample.name, beam_size=5, language="en", vad_filter=False,
        )
        segments = list(segments)
    output = {
        "engine": {
            "name": "faster-whisper",
            "model": args.model,
            "version": importlib.metadata.version("faster-whisper"),
            "computeType": "int8",
        },
        "language": info.language,
        "languageProbability": info.language_probability,
        "segments": [
            {
                "startSeconds": segment.start,
                "endSeconds": segment.end,
                "text": segment.text,
                "avgLogProbability": segment.avg_logprob,
                "noSpeechProbability": segment.no_speech_prob,
            }
            for segment in segments
        ],
    }
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
