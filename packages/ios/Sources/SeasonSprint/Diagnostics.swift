import Foundation
import Observation

/// Collects diagnostic lines (Clerk SDK error logs + our own probes) so they can be
/// shown on-device. Useful because xtool side-loaded apps have no easy console access.
@MainActor
@Observable
final class Diagnostics {
    static let shared = Diagnostics()
    private(set) var lines: [String] = []

    func add(_ line: String) {
        lines.append(line)
        if lines.count > 80 { lines.removeFirst(lines.count - 80) }
    }
}
