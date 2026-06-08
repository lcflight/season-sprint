import SwiftUI

/// App-wide settings: graph display toggles + account. Opened from the toolbar gear.
struct SettingsSheet: View {
    @Bindable var settings: AppSettings
    let isLive: Bool
    let onSignOut: () async -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Toggle("Rank overlay", isOn: $settings.showRankOverlay)
                    Toggle("Average pace line", isOn: $settings.showAveragePace)
                    Toggle("Deviation wedge", isOn: $settings.showDeviationWedge)
                        .disabled(!settings.showAveragePace)
                    Toggle("Pace sub-graph", isOn: $settings.showPaceGraph)
                } header: {
                    Text("Graph")
                } footer: {
                    Text("Rank overlay shades threshold bands. Average pace projects your points/day to season end; the deviation wedge adds a confidence band. The pace sub-graph compares required vs earned points per day.")
                }

                Section {
                    HStack {
                        Text("Live updates")
                        Spacer()
                        Text(isLive ? "Connected" : "Off")
                            .foregroundStyle(isLive ? .green : .secondary)
                    }
                } header: {
                    Text("Status")
                }

                Section {
                    Button("Sign out", role: .destructive) {
                        Task {
                            await onSignOut()
                            dismiss()
                        }
                    }
                } header: {
                    Text("Account")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}
