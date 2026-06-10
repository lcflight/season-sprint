import SwiftUI

/// Set the goal: pick a rank tier, or enter a custom value. Stored per-mode.
struct GoalControlView: View {
    @Bindable var store: DashboardStore
    @State private var customText = ""
    @State private var editingCustom = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Goal")
                        .font(.headline)
                    Text("Tap to change")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    ForEach(store.thresholds.reversed(), id: \.points) { t in
                        Button("\(t.badge) — \(t.points)") { store.goal = t.points }
                    }
                    Divider()
                    Button("Custom…") {
                        customText = "\(store.goal)"
                        editingCustom = true
                    }
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "target")
                        Text("\(store.goal)")
                            .monospacedDigit()
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption2.weight(.semibold))
                    }
                    .font(.body.weight(.semibold))
                    .padding(.horizontal, 14)
                    .padding(.vertical, 8)
                    .background(Color.accentColor, in: Capsule())
                    .foregroundStyle(.white)
                }
            }

            if editingCustom {
                HStack {
                    TextField("Goal value", text: $customText)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)
                    Button("Set") {
                        if let v = Int(customText.trimmingCharacters(in: .whitespaces)), v > 0 {
                            store.goal = v
                        }
                        editingCustom = false
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
