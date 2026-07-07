import Foundation
import Observation

/// Loads the user's records, computes dashboard-derived values, and merges live SSE
/// updates. Aggregation semantics match packages/web/src/composables/usePointsData.js:
/// records are *cumulative* season totals, so "current points" is the latest-dated record
/// for `mode` — independent of which season is being *viewed* (only the chart/pace look back).
@MainActor
@Observable
final class DashboardStore {
    let mode: GameMode

    private(set) var points: [Point] = []
    private(set) var isLoading = false
    /// True once the first load attempt has finished (success or failure).
    private(set) var hasLoaded = false
    private(set) var errorMessage: String?
    private(set) var liveStatus: LiveStatus = .disconnected

    /// The live/current season window (unaffected by `viewedSeasonKey`).
    private(set) var season: Season?
    /// The full `/seasons` list, same for every mode.
    private(set) var seasonOptionsAll: [SeasonOption] = []
    /// Raw season name the server reports as current (matches a `SeasonOption.key`).
    private(set) var currentSeasonKey: String?
    /// nil = viewing the live/current season.
    private(set) var viewedSeasonKey: String?
    private(set) var overlaySeasonKey: String?

    /// Custom goal override; nil means "use the default (next rank target)".
    private var goalOverride: Int?

    private let defaults = UserDefaults.standard
    private var goalKey: String { "goal.\(mode.prefsSuffix)" }

    private let sse = SSEClient()

    init(mode: GameMode) {
        self.mode = mode
        if defaults.object(forKey: goalKey) != nil {
            goalOverride = defaults.integer(forKey: goalKey)
        }

        sse.onEvent = { [weak self] event in
            self?.apply(event)
        }
        // Drive the indicator from the real socket state, not optimistically.
        sse.onStatusChange = { [weak self] status in
            self?.liveStatus = status
        }
    }

    // MARK: Derived values

    var sortedPoints: [Point] {
        points.sorted { $0.date < $1.date }
    }

    /// Latest-dated record's win points (the season total so far) — always the live total.
    var currentPoints: Int {
        sortedPoints.last?.winPoints ?? 0
    }

    var thresholds: [Threshold] { SeasonSprint.thresholds(for: mode) }

    var rank: RankInfo {
        computeRank(points: currentPoints, thresholds: thresholds)
    }

    /// Points gained today = today's total minus the most recent prior day's total. In
    /// Ranked, a today-entry with no prior point is the placement itself, not earned
    /// progress, so it reads as 0 gain rather than a jump from 0 (World Tour genuinely
    /// starts at 0).
    var todayGain: Int? {
        let today = DateKey.today()
        let sorted = sortedPoints
        guard let todayPoint = sorted.first(where: { $0.day == today }) else { return nil }
        let prev = sorted.last(where: { $0.day < today })
        let prevValue = prev?.winPoints ?? (mode == .ranked ? todayPoint.winPoints : 0)
        return todayPoint.winPoints - prevValue
    }

    /// The goal: a custom override, else the next rank target (or the current floor
    /// if already at the top).
    var goal: Int {
        get { goalOverride ?? defaultGoal }
        set {
            goalOverride = newValue
            defaults.set(newValue, forKey: goalKey)
        }
    }

    /// Whether the user has set an explicit goal.
    var hasCustomGoal: Bool { goalOverride != nil }

    private var defaultGoal: Int {
        rank.nextTarget ?? max(1, rank.currentFloor)
    }

    private var dataSeasonKeys: Set<String> {
        seasonsWithDataKeys(points: points, seasons: seasonOptionsAll)
    }

    /// Season picker entries, newest first: the current season, plus any past season with data.
    var seasonOptions: [SeasonOption] {
        seasonOptionsAll
            .sorted { $0.season.start > $1.season.start }
            .filter { $0.key == currentSeasonKey || dataSeasonKeys.contains($0.key) }
    }

    /// Compare-overlay entries, newest first: any season with data, excluding the viewed one.
    var overlayOptions: [SeasonOption] {
        let viewed = viewedSeasonKey ?? currentSeasonKey
        return seasonOptionsAll
            .sorted { $0.season.start > $1.season.start }
            .filter { $0.key != viewed && dataSeasonKeys.contains($0.key) }
    }

    /// True once there's at least one past season with data — otherwise the picker has
    /// nothing to offer.
    var seasonModuleDisabled: Bool {
        !seasonOptionsAll.contains { $0.key != currentSeasonKey && dataSeasonKeys.contains($0.key) }
    }

    var viewedSeason: Season? {
        if let viewedSeasonKey, let match = seasonOptionsAll.first(where: { $0.key == viewedSeasonKey }) {
            return match.season
        }
        return season
    }

    /// Read-only: looking at any season other than the live one.
    var isViewingPastSeason: Bool {
        viewedSeasonKey != nil && currentSeasonKey != nil && viewedSeasonKey != currentSeasonKey
    }

    var overlaySeason: Season? {
        guard let overlaySeasonKey else { return nil }
        return seasonOptionsAll.first { $0.key == overlaySeasonKey }?.season
    }

    /// Points that fall within the *viewed* season window (all points if no season known).
    var seasonPoints: [Point] {
        guard let viewedSeason else { return points }
        return points.filter { $0.date >= viewedSeason.start && $0.date <= viewedSeason.end }
    }

    /// The compare season's points, re-mapped onto the viewed season's day-of-season axis.
    var overlayPoints: [OverlayPoint] {
        guard let overlaySeason, let viewedSeason else { return [] }
        let overlayRecords = points.filter { $0.date >= overlaySeason.start && $0.date <= overlaySeason.end }
        return mapOverlayByDayOfSeason(
            overlayPoints: overlayRecords,
            overlaySeasonStart: overlaySeason.start,
            viewedSeasonStart: viewedSeason.start,
            viewedSeasonEnd: viewedSeason.end
        )
    }

    var paceBaseline: PaceBaseline? {
        guard let viewedSeason else { return nil }
        return SeasonSprint.paceBaseline(for: mode, sortedSeasonPoints: seasonPoints.sorted { $0.date < $1.date }, seasonStart: viewedSeason.start)
    }

    var pace: PaceStats? {
        guard let viewedSeason else { return nil }
        return computePace(goal: goal, seasonPoints: seasonPoints, start: viewedSeason.start, end: viewedSeason.end, baseline: paceBaseline)
    }

    // MARK: Loading

    func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false; hasLoaded = true }

        // Seasons are public + best-effort; don't let their failure block records.
        if let payload = try? await APIClient.getAllSeasons() {
            seasonOptionsAll = SeasonSprint.seasonOptions(from: payload.seasons)
            season = payload.currentSeason
            currentSeasonKey = payload.currentSeason?.name
        }

        do {
            let records = try await APIClient.getRecords(mode: mode)
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

    /// Resume the live-update connection (call when this mode becomes the active tab).
    func resumeLive() {
        sse.start()
    }

    /// Pause the live-update connection (call when this mode is backgrounded, to avoid a
    /// dangling socket for a mode the user isn't looking at).
    func pauseLive() {
        sse.stop()
    }

    func stop() {
        sse.stop()
        liveStatus = .disconnected
    }

    /// View a past season read-only, or pass nil to return to the live season.
    func viewSeason(_ key: String?) {
        viewedSeasonKey = key
        if overlaySeasonKey == key {
            overlaySeasonKey = nil
        }
    }

    func setOverlaySeason(_ key: String?) {
        overlaySeasonKey = key
    }

    // MARK: Live event merge (mirrors upsertPoint in usePointsData.js)

    /// Whether a live event (missing `mode` means `"world-tour"`) belongs to this store's mode.
    private func matchesMode(_ raw: String?) -> Bool {
        let eventMode: GameMode = raw == GameMode.ranked.wireValue ? .ranked : .worldTour
        return eventMode == mode
    }

    private func apply(_ event: RecordEvent) {
        switch event {
        case .upsert(let r):
            guard matchesMode(r.mode) else { return }
            upsert(r)
        case .delete(let id, let mode):
            guard matchesMode(mode) else { return }
            points.removeAll { $0.remoteId == id }
        case .deleteAll(let mode):
            guard matchesMode(mode) else { return }
            points.removeAll()
        case .bulkUpsert(let records, let mode):
            guard matchesMode(mode) else { return }
            records.forEach(upsert)
        }
    }

    // MARK: Writes

    private(set) var isWriting = false

    /// Add or overwrite the record for a day (`POST /me/records`). No-op while read-only.
    func addOrSet(date: String, winPoints: Int) async {
        guard !isViewingPastSeason else { return }
        isWriting = true
        defer { isWriting = false }
        do {
            let record = try await APIClient.upsertRecord(date: date, winPoints: winPoints, mode: mode)
            upsert(record)
        } catch {
            errorMessage = "Couldn't save that point."
        }
    }

    /// Edit an existing record in place (`PUT /me/records/:id`). Handles a date change by
    /// dropping the old day entry once the server confirms. No-op while read-only.
    func updatePoint(_ point: Point, date: String, winPoints: Int) async {
        guard !isViewingPastSeason else { return }
        isWriting = true
        defer { isWriting = false }
        do {
            let updated = try await APIClient.updateRecord(id: point.remoteId, date: date, winPoints: winPoints)
            if point.day != String(updated.date.prefix(10)) {
                points.removeAll { $0.remoteId == point.remoteId }
            }
            upsert(updated)
        } catch {
            errorMessage = "Couldn't update that point."
            await load()
        }
    }

    /// Delete a record (`DELETE /me/records/:id`), optimistically removing it locally.
    /// No-op while read-only.
    func deletePoint(_ point: Point) async {
        guard !isViewingPastSeason else { return }
        points.removeAll { $0.remoteId == point.remoteId }
        do {
            try await APIClient.deleteRecord(id: point.remoteId)
        } catch {
            errorMessage = "Couldn't delete that point."
            await load()
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
