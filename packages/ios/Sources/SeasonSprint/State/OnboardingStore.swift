import Foundation
import Observation
import ClerkKit

/// Decides whether to show the first-launch "enter your current totals" prompt, and saves
/// what the user enters as today's record in each mode.
///
/// A user is considered new when they have no records at all, in either mode — detection is
/// server-side so it holds across devices and platforms, rather than re-prompting after every
/// reinstall. The resolved flag marks onboarding as settled by any route — saved, skipped, or
/// found to already have records — so later launches skip the probe entirely instead of
/// refetching every mode just to rediscover the user isn't new.
///
/// That flag is scoped per user id: signing out leaves it behind, so a single global key would
/// let the first account to resolve onboarding silently suppress it for anyone who signs in on
/// the device afterwards — dropping a genuinely new user onto a zero graph.
@MainActor
@Observable
final class OnboardingStore {
    /// nil until the check completes, so the caller can hold the dashboard back instead of
    /// flashing it and then covering it with the prompt.
    private(set) var isNeeded: Bool?
    private(set) var isSaving = false
    private(set) var errorMessage: String?

    private let defaults = UserDefaults.standard

    /// Per-user key, or nil if the signed-in user can't be identified — in which case we
    /// fail safe by probing rather than trusting a flag that may belong to another account.
    private var resolvedKey: String? {
        guard let userId = Clerk.shared.user?.id else { return nil }
        return "onboarding.resolved.\(userId)"
    }

    func check() async {
        if let key = resolvedKey, defaults.bool(forKey: key) {
            isNeeded = false
            return
        }
        do {
            var hasAny = false
            for mode in GameMode.allCases {
                let records = try await APIClient.getRecords(mode: mode)
                if !records.isEmpty {
                    hasAny = true
                    break
                }
            }
            isNeeded = !hasAny
            if hasAny {
                // Already has data, so they're settled — record that so later launches
                // skip this probe instead of re-asking the server every time.
                markResolved()
            }
        } catch {
            // Never let a failed probe block the app — fall through to the dashboard, which
            // surfaces its own load error if the API is genuinely down.
            isNeeded = false
        }
    }

    /// Persist the totals the user filled in as today's record, one per mode. `values` only
    /// carries the modes they actually entered — a player who only plays one mode shouldn't
    /// get a phantom 0 in the other, which would anchor that mode's graph and pace at zero.
    func save(_ values: [GameMode: Int]) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let today = Self.todayString()
            for (mode, winPoints) in values {
                _ = try await APIClient.upsertRecord(date: today, winPoints: winPoints, mode: mode)
            }
            dismiss()
        } catch {
            errorMessage = "Could not save. Please try again."
        }
    }

    func skip() {
        dismiss()
    }

    private func dismiss() {
        markResolved()
        isNeeded = false
    }

    private func markResolved() {
        guard let key = resolvedKey else { return }
        defaults.set(true, forKey: key)
    }

    /// Today in the device's local timezone as `YYYY-MM-DD`, matching the date-only wire
    /// format the server expects (see packages/shared/src/records.ts).
    private static func todayString() -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
