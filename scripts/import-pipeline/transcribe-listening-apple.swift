import Foundation
import Speech
import AVFoundation
import CoreMedia
import Darwin

// Compile on macOS 26 only. No authorization prompt or implicit model download.
@main
struct ListeningTranscribe {
    static func main() async throws {
        guard CommandLine.arguments.count == 4 else { exit(2) }
        let input = URL(fileURLWithPath: CommandLine.arguments[1])
        let output = URL(fileURLWithPath: CommandLine.arguments[2])
        let requestedLocale = CommandLine.arguments[3]
        guard SpeechTranscriber.isAvailable else { throw NSError(domain: "SpeechUnavailable", code: 1) }
        let locales = await SpeechTranscriber.installedLocales
        guard let actualLocale = locales.first(where: {
            $0.identifier.replacingOccurrences(of: "-", with: "_") == requestedLocale.replacingOccurrences(of: "-", with: "_")
        }) else { throw NSError(domain: "RequestedLocaleAssetsNotInstalled", code: 2) }
        let started = Date()
        let transcriber = SpeechTranscriber(
            locale: actualLocale,
            transcriptionOptions: [],
            reportingOptions: [],
            attributeOptions: [.audioTimeRange, .transcriptionConfidence]
        )
        let analyzer = SpeechAnalyzer(modules: [transcriber])
        let collect = Task { () throws -> [[String: Any]] in
            var segments: [[String: Any]] = []
            for try await result in transcriber.results {
                guard result.isFinal else { continue }
                var runs: [[String: Any]] = []
                for run in result.text.runs {
                    guard let range = run.audioTimeRange else { continue }
                    runs.append([
                        "text": String(result.text[run.range].characters),
                        "start": CMTimeGetSeconds(range.start),
                        "end": CMTimeGetSeconds(CMTimeRangeGetEnd(range)),
                        "confidence": run.transcriptionConfidence ?? -1,
                        "timing": "attributed_run"
                    ])
                }
                segments.append([
                    "text": String(result.text.characters),
                    "start": CMTimeGetSeconds(result.range.start),
                    "end": CMTimeGetSeconds(CMTimeRangeGetEnd(result.range)),
                    "runs": runs
                ])
            }
            return segments
        }
        let file = try AVAudioFile(forReading: input)
        let end = try await analyzer.analyzeSequence(from: file)
        if let end { try await analyzer.finalizeAndFinish(through: end) }
        else { try await analyzer.finalizeAndFinishThroughEndOfInput() }
        let segments = try await collect.value
        let record: [String: Any] = [
            "elapsedSeconds": Date().timeIntervalSince(started),
            "engine": [
                "name": "Apple SpeechAnalyzer/SpeechTranscriber",
                "model": "not_exposed", "modelVersion": "not_exposed",
                "requestedLocale": requestedLocale, "actualLocale": actualLocale.identifier,
                "apiOptions": ["transcriptionOptions": [], "reportingOptions": [],
                               "attributeOptions": ["audioTimeRange", "transcriptionConfidence"]]
            ],
            "onDevice": true,
            "requestedAuthorization": false,
            "requestedAssetInstallation": false,
            "result": ["segments": segments]
        ]
        let data = try JSONSerialization.data(withJSONObject: record, options: [.prettyPrinted, .sortedKeys])
        try data.write(to: output, options: .withoutOverwriting)
        await SpeechModels.endRetention()
    }
}
