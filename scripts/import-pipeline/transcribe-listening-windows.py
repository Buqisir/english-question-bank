#!/usr/bin/env python3
"""Explicit offline diagnostics. Never approves audio or edits import inputs."""
import argparse
import dataclasses
import hashlib
import importlib.metadata
import json
import math
from pathlib import Path
import subprocess
import tempfile
import time


def digest(file):
    with file.open("rb") as stream:
        return "sha256:" + hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("materialization", type=Path)
    parser.add_argument("output", type=Path, help="New private directory; existing evidence is never overwritten")
    parser.add_argument("--model-snapshot", type=Path, required=True, help="Installed local checkpoint directory; no downloads")
    parser.add_argument("--language", required=True, choices=["en", "zh", "auto"])
    parser.add_argument("--start", type=float, default=0)
    extent = parser.add_mutually_exclusive_group(required=True)
    extent.add_argument("--end", type=float)
    extent.add_argument("--whole-file", action="store_true")
    parser.add_argument("--vad", action="store_true")
    args = parser.parse_args()
    audio, source, model_path = (p.resolve(strict=True) for p in [args.audio, args.materialization, args.model_snapshot])
    if not (model_path / "model.bin").is_file():
        parser.error("model-snapshot must contain an installed model.bin")
    duration = float(subprocess.check_output(["ffprobe", "-v", "error", "-show_entries",
        "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio)]))
    end = duration if args.whole_file else args.end
    if not all(math.isfinite(value) for value in [duration, args.start, end]) or not 0 <= args.start < end <= duration:
        parser.error("requested interval must be within the full recording")
    if args.whole_file and args.start != 0:
        parser.error("whole-file requires start=0; use --end for a bounded follow-up")
    bound = {str(p): {"sha256": digest(p), "byteLength": p.stat().st_size} for p in [audio, source]}
    from faster_whisper import WhisperModel
    import numpy
    import wave
    settings = {"language": None if args.language == "auto" else args.language, "beam_size": 5,
        "temperature": 0, "condition_on_previous_text": False, "vad_filter": args.vad, "word_timestamps": True}
    engine = {"name": "faster-whisper", "version": importlib.metadata.version("faster-whisper"),
        "modelSnapshot": str(model_path), "modelSha256": digest(model_path / "model.bin"),
        "device": "cpu", "computeType": "int8", "cpuThreads": 4, "numWorkers": 1, "localFilesOnly": True}
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)

    def save(name, value):
        with (args.output / name).open("x", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)

    save("input.json", {"files": bound, "durationSeconds": duration, "startSeconds": args.start,
        "endSeconds": end, "engine": engine, "scope": "diagnostic only; not content approval or approved navigation"})
    save("settings.json", settings)
    started = time.monotonic()
    model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=4,
        num_workers=1, local_files_only=True)
    windows = []
    start = args.start
    while start < end:
        stop = min(end, start + 180)
        with tempfile.NamedTemporaryFile(suffix=".wav", dir=args.output) as sample:
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start), "-i", str(audio),
                "-t", str(stop - start), "-ac", "1", "-ar", "16000", sample.name], check=True)
            # Decode the 16 kHz mono PCM ourselves: faster-whisper's file path route calls
            # av.open(metadata_errors=...), which PyAV 15+ rejects.
            with wave.open(sample.name, "rb") as pcm:
                samples = numpy.frombuffer(pcm.readframes(pcm.getnframes()), dtype=numpy.int16)
            segments, info = model.transcribe(samples.astype(numpy.float32) / 32768.0, **settings)
            rows = [dataclasses.asdict(segment) for segment in segments]
            record = {"window": len(windows), "startSeconds": start, "endSeconds": stop,
                "sampleSha256": digest(Path(sample.name)), "language": info.language, "segments": rows,
                "timestampBasis": "relative to window start; overlaps retained verbatim"}
            filename = f"window-{len(windows):03d}.json"
            save(filename, record)
        windows.append({"path": filename, "startSeconds": start, "endSeconds": stop,
            "sha256": digest(args.output / filename), "byteLength": (args.output / filename).stat().st_size})
        print(json.dumps(windows[-1]), flush=True)
        if stop == end:
            break
        start += 175
    for file, expected in bound.items():
        if digest(Path(file)) != expected["sha256"]:
            raise RuntimeError("Input changed during ASR; retained diagnostics are not reusable")
    save("completed.json", {"elapsedSeconds": time.monotonic() - started, "windows": windows,
        "inputsUnchanged": True, "verdict": "not_yet_reviewed"})


if __name__ == "__main__":
    main()
