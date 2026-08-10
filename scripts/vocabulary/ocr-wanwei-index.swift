import AppKit
import Foundation
import Vision

struct Recognition: Codable {
    let file: String
    let column: Int
    let text: String
    let confidence: Float
    let x: Double
    let y: Double
    let width: Double
    let height: Double
}

let encoder = JSONEncoder()
encoder.outputFormatting = [.withoutEscapingSlashes]

for inputPath in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: inputPath)
    guard
        let image = NSImage(contentsOf: url),
        let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil)
    else {
        fputs("Unable to read image: \(inputPath)\n", stderr)
        continue
    }

    // Running Vision once over all five narrow columns causes it to skip
    // alternating pages. Isolating each column keeps the reading order and
    // makes every small index row large enough for stable recognition.
    let columnRegions = [
        CGRect(x: 0.000, y: 0.000, width: 0.225, height: 1.000),
        CGRect(x: 0.205, y: 0.000, width: 0.215, height: 1.000),
        CGRect(x: 0.395, y: 0.000, width: 0.215, height: 1.000),
        CGRect(x: 0.585, y: 0.000, width: 0.215, height: 1.000),
        CGRect(x: 0.775, y: 0.000, width: 0.225, height: 1.000),
    ]
    for (columnIndex, region) in columnRegions.enumerated() {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        request.recognitionLanguages = ["en-US"]
        request.usesLanguageCorrection = false
        request.minimumTextHeight = 0.003
        request.regionOfInterest = region

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])
        let observations = (request.results ?? []).sorted {
            if abs($0.boundingBox.midY - $1.boundingBox.midY) > 0.004 {
                return $0.boundingBox.midY > $1.boundingBox.midY
            }
            return $0.boundingBox.minX < $1.boundingBox.minX
        }
        for observation in observations {
            guard let candidate = observation.topCandidates(1).first else { continue }
            let box = observation.boundingBox
            let record = Recognition(
                file: url.lastPathComponent,
                column: columnIndex + 1,
                text: candidate.string,
                confidence: candidate.confidence,
                x: box.minX,
                y: box.minY,
                width: box.width,
                height: box.height
            )
            if let data = try? encoder.encode(record), let line = String(data: data, encoding: .utf8) {
                print(line)
            }
        }
    }
}
