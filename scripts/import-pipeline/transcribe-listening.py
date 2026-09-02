#!/usr/bin/env python3

import argparse
import importlib.metadata
import json

from faster_whisper import WhisperModel


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("audio")
    parser.add_argument("--model", default="small.en")
    args = parser.parse_args()

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        args.audio,
        beam_size=5,
        language="en",
        vad_filter=False,
    )
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
