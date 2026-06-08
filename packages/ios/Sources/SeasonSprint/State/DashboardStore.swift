import Foundation
import Observation

/// Loads the user's records, computes dashboard-derived values, and merges live SSE
/// updates. Aggregation semantics match packages/web/src/composables/usePointsData.js:
/// records are *cumulative* season totals, so "current points" is the latest-dated record.
@MainActor
@Observable
final class DashboardStore {
    private(set) var points: [Point] = []
    private(set) var isLoading = false
    private(set) var errorMessage: String?
    private(set) var isLive = false
    private(set) var season: Season?

    /// Custom goal override; nil means "use the default (next rank target)".
    private var goalOverride: Int?

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let goal = "goal.worldTour"
    }

    private let sse = SSEClient()

    init() {
        if defaults.object(forKey: Keys.goal) != nil {
            goalOverride = defaults.integer(forKey: Keys.goal)
        }

        sse.onEvent = { [weak self] event in
            self?.apply(event)
        }
        // Drive the "Live" indicator from the real socket state, not optimistically.
        sse.onLiveChange = { [weak self] live in
            self?.isLive = live
        }
    }

    // MARK: Derived values

    var sortedPoints: [Point] {
        points.sorted { $0.date < $1.date }
    }

    /// Latest-dated record's win points (the season total so far).
    var currentPoints: Int {
        sortedPoints.last?.winPoints ?? 0
    }

    let thresholds: [Threshold] = worldTourThresholds

    var rank: RankInfo {
        computeRank(points: currentPoints, thresholds: thresholds)
    }

    /// Points gained today = today's total minus the most recent prior day's total.
    var todayGain: Int? {
        let today = DateKey.today()
        let sorted = sortedPoints
        guard let todayPoint = sorted.first(where: { $0.day == today }) else { return nil }
        let prev = sorted.last(where: { $0.day < today })
        return todayPoint.winPoints - (prev?.winPoints ?? 0)
    }

    /// The goal: a custom override, else the next rank target (or the current floor
    /// if already at the top).
    var goal: Int {
        get { goalOverride ?? defaultGoal }
        set {
            goalOverride = newValue
            defaults.set(newValue, forKey: Keys.goal)
        }
    }

    /// Whether the user has set an explicit goal.
    var hasCustomGoal: Bool { goalOverride != nil }

    private var defaultGoal: Int {
        rank.nextTarget ?? max(1, rank.currentFloor)
    }

    /// Points that fall within the current season window (all points if no season).
    var seasonPoints: [Point] {
        guard let season else { return points }
        return points.filter { $0.date >= season.start && $0.date <= season.end }
    }

    var pace: PaceStats? {
        guard let season else { return nil }
        return computePace(goal: goal, seasonPoints: seasonPoints, start: season.start, end: season.end)
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        // Season is public + best-effort; don't let its failure block records.
        if let s = try? await APIClient.getSeasons() {
            season = s
        }

        do {
            let records = try await APIClient.getRecords()
            points = records.map(Point.init(record:))
            startLive()
        } catch APIError.notAuthenticated {
            errorMessage = nil // signed out; the auth gate handles this
        } catch {
            errorMessage = "Couldn't load your data. Pull to refresh."
        }
    }

    private func startLive() {
        // start() is idempotent; isLive is now driven by the socket via onLiveChange.
        sse.start()
    }

    func stop() {
        sse.stop()
        isLive = false
    }

    // MARK: Live event merge (mirrors upsertPoint in usePointsData.js)

    private func apply(_ event: RecordEvent) {
        switch event {
        case .upsert(let r):
            upsert(r)
        case .delete(let id):
            points.removeAll { $0.remoteId == id }
        case .deleteAll:
            points.removeAll()
        case .bulkUpsert(let records):
            records.forEach(upsert)
        }
    }

    private func upsert(_ record: APIRecord) {
        let point = Point(record: record)
        if let idx = points.firstIndex(where: { $0.remoteId == point.remoteId || $0.day == point.day }) {
            points[idx] = point
        } else {
            points.append(point)
        }
    }
}
