import Foundation
import Observation

/// App-wide graph display settings, persisted in UserDefaults. Mirrors the toggles in
/// packages/web/src/components/modals/SettingsModal.vue.
@MainActor
@Observable
final class AppSettings {
    var showRankOverlay: Bool { didSet { defaults.set(showRankOverlay, forKey: Keys.rankOverlay) } }
    var showAveragePace: Bool { didSet { defaults.set(showAveragePace, forKey: Keys.averagePace) } }
    var showDeviationWedge: Bool { didSet { defaults.set(showDeviationWedge, forKey: Keys.deviationWedge) } }
    var showPaceGraph: Bool { didSet { defaults.set(showPaceGraph, forKey: Keys.paceGraph) } }

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let rankOverlay = "settings.showRankOverlay"
        static let averagePace = "settings.showAveragePace"
        static let deviationWedge = "settings.showDeviationWedge"
        static let paceGraph = "settings.showPaceGraph"
    }

    init() {
        let d = UserDefaults.standard
        showRankOverlay = d.object(forKey: Keys.rankOverlay) as? Bool ?? true
        showAveragePace = d.object(forKey: Keys.averagePace) as? Bool ?? false
        showDeviationWedge = d.object(forKey: Keys.deviationWedge) as? Bool ?? false
        showPaceGraph = d.object(forKey: Keys.paceGraph) as? Bool ?? false
    }
}
