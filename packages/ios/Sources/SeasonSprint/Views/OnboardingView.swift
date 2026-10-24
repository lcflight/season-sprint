import SwiftUI

/// First-launch prompt asking a new user for their current season totals, so their graph
/// starts from where they actually are instead of zero. Either mode may be left blank.
struct OnboardingView: View {
    let store: OnboardingStore

    // Kept as strings so a blank field stays blank ("don't record this mode") rather than
    // coercing to 0, which would anchor that mode's graph and pace at zero.
    @State private var entries: [GameMode: String] = [:]
    /// World Tour counts fans (Season 12+): `entries[.worldTour]` is the X of the in-game
    /// "X / Y" and this is the Y. Saved as the season total.
    @State private var worldTourRequired = ""
    @FocusState private var focusedMode: GameMode?

    private func trimmed(_ s: String?) -> String { (s ?? "").trimmingCharacters(in: .whitespaces) }

    private var enteredValues: [GameMode: Int] {
        var result: [GameMode: Int] = [:]
        for mode in GameMode.allCases {
            let raw = trimmed(entries[mode])
            guard !raw.isEmpty, let value = Int(raw) else { continue }
            if mode == .worldTour {
                if let required = Int(trimmed(worldTourRequired)),
                   let total = fansTotal(inRank: value, required: required) {
                    result[mode] = total
                }
            } else {
                result[mode] = value
            }
        }
        return result
    }

    // At least one total is needed — otherwise "Get started" would do nothing that
    // "Skip for now" doesn't already do.
    private var canSave: Bool { !enteredValues.isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Welcome to Season Sprint")
                            .font(.title2.bold())
                        Text("Enter where you are now so your graph starts from there. For World Tour, copy the fans shown on the World Tour panel (e.g. 1,250 / 6,000). You can leave a mode blank if you don't play it.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }

                    VStack(spacing: 16) {
                        ForEach(GameMode.allCases, id: \.self) { mode in
                            VStack(alignment: .leading, spacing: 6) {
                                Text(mode.label.uppercased())
                                    .font(.caption.bold())
                                    .foregroundStyle(.secondary)
                                HStack {
                                    TextField(
                                        mode == .worldTour ? "fans" : "points",
                                        text: Binding(
                                            get: { entries[mode] ?? "" },
                                            set: { entries[mode] = $0 }
                                        )
                                    )
                                    .keyboardType(.numberPad)
                                    .textFieldStyle(.roundedBorder)
                                    .focused($focusedMode, equals: mode)
                                    if mode == .worldTour {
                                        Text("/").foregroundStyle(.secondary)
                                        TextField("needed", text: $worldTourRequired)
                                            .keyboardType(.numberPad)
                                            .textFieldStyle(.roundedBorder)
                                    }
                                }
                            }
                        }
                    }

                    if let errorMessage = store.errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    Text("Saved as today's entry — you can edit it any time.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(24)
            }

            VStack(spacing: 10) {
                Button {
                    Task { await store.save(enteredValues) }
                } label: {
                    if store.isSaving {
                        ProgressView()
                            .frame(maxWidth: .infinity)
                    } else {
                        Text("Get started")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(!canSave || store.isSaving)

                Button("Skip for now") { store.skip() }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .disabled(store.isSaving)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") { focusedMode = nil }
            }
        }
    }
}
