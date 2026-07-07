import Foundation

/// Which game mode a records/season view is scoped to. Mirrors the server's `GameMode` type.
enum GameMode: String, Sendable, CaseIterable {
    case worldTour = "world-tour"
    case ranked = "ranked"

    var wireValue: String { rawValue }

    var prefsSuffix: String {
        switch self {
        case .worldTour: return "worldTour"
        case .ranked: return "ranked"
        }
    }

    var label: String {
        switch self {
        case .worldTour: return "World Tour"
        case .ranked: return "Ranked"
        }
    }
}
