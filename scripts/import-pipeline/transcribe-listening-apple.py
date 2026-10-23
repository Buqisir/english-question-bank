#!/usr/bin/env python3
"""Apple primary ASR, immutable attempts, retained 16 kHz PCM and exact provenance."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import time
import uuid


def digest(file):
    return "sha256:" + hashlib.sha256(file.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("output", type=Path, help="Attempt parent directory; never replaces old attempts")
    parser.add_argument("--locale", default="en_US")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if shutil.disk_usage(args.output).free < 10_000_000_000:
        raise RuntimeError("LISTENING_DISK_PAUSE: less than 10 GB available")
    attempt = args.output / (time.strftime("attempt-%Y%m%dT%H%M%S") + "-" + uuid.uuid4().hex[:8])
    attempt.mkdir()
    script = Path(__file__).resolve().with_suffix(".swift")
    audio_hash = digest(args.audio)
    record = {"attempt": attempt.name, "engine": {"name": "Apple SpeechAnalyzer/SpeechTranscriber",
              "model": "not_exposed", "modelVersion": "not_exposed", "requestedLocale": args.locale,
              "actualLocale": "not_exposed", "apiOptions": {"transcriptionOptions": [],
              "reportingOptions": [], "attributeOptions": ["audioTimeRange", "transcriptionConfidence"]}},
              "platform": {"system": platform.system(), "architecture": platform.machine(),
              "macOSVersion": platform.mac_ver()[0], "macOSBuild": "not_applicable"},
              "adapterSha256": {"swift": digest(script), "python": digest(Path(__file__).resolve())},
              "audioSha256": audio_hash, "pcm": {"sampleRate": 16000, "channels": 1,
              "encoding": "signed_16_bit_little_endian", "cropOffsetSeconds": 0},
              "startSeconds": 0, "result": {"segments": []}}
    started = time.monotonic()
    try:
        record["endSeconds"] = float(subprocess.check_output(["ffprobe", "-v", "error",
            "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(args.audio)]))
        if platform.system() != "Darwin" or int(platform.mac_ver()[0].split(".")[0]) < 26:
            raise RuntimeError("LISTENING_APPLE_UNAVAILABLE: requires macOS 26")
        record["platform"]["macOSBuild"] = subprocess.check_output(["sw_vers", "-buildVersion"], text=True).strip()
        child_env = {**os.environ, "TMPDIR": str(attempt.resolve()),
                     "CLANG_MODULE_CACHE_PATH": str((attempt / "swift-cache").resolve())}
        executable = attempt / "apple-transcribe"
        subprocess.run(["swiftc", "-parse-as-library", "-O", str(script), "-o", str(executable)],
                       check=True, env=child_env, capture_output=True, timeout=120)
        pcm = attempt / "playback-16000-mono.wav"
        # Decode the full recording before resampling: one continuous PCM clock.
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(args.audio), "-map", "0:a:0",
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(pcm)], check=True)
        record["pcm"]["sha256"] = digest(pcm)
        raw = attempt / "apple-raw.json"
        proc = subprocess.run([str(executable), str(pcm), str(raw), args.locale],
                              env=child_env, capture_output=True, text=True, timeout=600)
        (attempt / "engine-stderr.log").write_text(proc.stderr)
        if proc.returncode:
            raise RuntimeError(f"Apple exited {proc.returncode}: {proc.stderr[-2000:]}")
        record.update(json.loads(raw.read_text()))
        if digest(args.audio) != audio_hash:
            raise RuntimeError("LISTENING_INPUT_CHANGED")
    except Exception as error:
        record["error"] = str(error)
        if getattr(error, "stderr", None):
            detail = error.stderr
            record["stderr"] = detail.decode(errors="replace") if isinstance(detail, bytes) else detail
    record["totalElapsedSeconds"] = time.monotonic() - started
    with (attempt / "evidence.json").open("x") as stream:
        json.dump(record, stream, ensure_ascii=False, indent=2)
    # This pointer is never used without validating the bound audio hash.
    pointer = {"evidence": str((attempt / "evidence.json").resolve()), "attempt": attempt.name,
               "error": record.get("error"), "audioSha256": audio_hash}
    temporary = args.output / f"completed-{uuid.uuid4().hex}.json"
    temporary.write_text(json.dumps(pointer, indent=2))
    temporary.replace(args.output / "completed.json")
    print(json.dumps(pointer), flush=True)


if __name__ == "__main__":
    main()
