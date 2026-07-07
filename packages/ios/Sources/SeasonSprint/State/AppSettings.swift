import Foundation
import Observation

/// App-wide graph display settings, persisted in UserDefaults per mode (matching the web
/// app's per-mode `storageKey`). Mirrors the toggles in
/// packages/web/src/components/modals/SettingsModal.vue.
@MainActor
@Observable
final class AppSettings {
    var showRankOverlay: Bool { didSet { defaults.set(showRankOverlay, forKey: key(Keys.rankOverlay)) } }
    var showAveragePace: Bool { didSet { defaults.set(showAveragePace, forKey: key(Keys.averagePace)) } }
    var showDeviationWedge: Bool { didSet { defaults.set(showDeviationWedge, forKey: key(Keys.deviationWedge)) } }
    var showPaceGraph: Bool { didSet { defaults.set(showPaceGraph, forKey: key(Keys.paceGraph)) } }

    private let mode: GameMode
    private let defaults = UserDefaults.standard
    private enum Keys {
        static let rankOverlay = "settings.showRankOverlay"
        static let averagePace = "settings.showAveragePace"
        static let deviationWedge = "settings.showDeviationWedge"
        static let paceGraph = "settings.showPaceGraph"
    }

    // World Tour keeps the original, un-suffixed keys so existing installs don't lose
    // their toggles; Ranked gets its own suffixed keys.
    private func key(_ base: String) -> String {
        mode == .worldTour ? base : "\(base).\(mode.prefsSuffix)"
    }

    init(mode: GameMode) {
        self.mode = mode
        let d = UserDefaults.standard
        func read(_ base: String) -> String {
            mode == .worldTour ? base : "\(base).\(mode.prefsSuffix)"
        }
        showRankOverlay = d.object(forKey: read(Keys.rankOverlay)) as? Bool ?? true
        showAveragePace = d.object(forKey: read(Keys.averagePace)) as? Bool ?? false
        showDeviationWedge = d.object(forKey: read(Keys.deviationWedge)) as? Bool ?? false
        showPaceGraph = d.object(forKey: read(Keys.paceGraph)) as? Bool ?? false
    }
}
