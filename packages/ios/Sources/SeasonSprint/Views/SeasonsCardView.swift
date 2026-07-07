import SwiftUI

/// Season picker + compare overlay. Mirrors SeasonControls.vue: the current season is always
/// selectable, past seasons appear once they have data, and the whole module explains itself
/// (rather than showing empty menus) until there's a past season to look at.
struct SeasonsCardView: View {
    let store: DashboardStore

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Seasons").font(.headline)

            if store.seasonModuleDisabled {
                Text("Log points across more than the current season to unlock historical comparisons.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                seasonRow(
                    label: "Season",
                    options: store.seasonOptions,
                    selectedKey: store.viewedSeasonKey ?? store.currentSeasonKey,
                    placeholder: nil
                ) { key in
                    store.viewSeason(key == store.currentSeasonKey ? nil : key)
                }
                seasonRow(
                    label: "Compare",
                    options: store.overlayOptions,
                    selectedKey: store.overlaySeasonKey,
                    placeholder: "None"
                ) { key in
                    store.setOverlaySeason(key)
                }
                if store.isViewingPastSeason {
                    Text("Viewing a past season — read-only. Switch back to the current season to log points.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }

    private func seasonRow(
        label: String,
        options: [SeasonOption],
        selectedKey: String?,
        placeholder: String?,
        onSelect: @escaping (String?) -> Void
    ) -> some View {
        let selectedLabel = options.first(where: { $0.key == selectedKey })?.displayName ?? placeholder ?? "—"
        return HStack {
            Text(label)
            Spacer()
            Menu {
                if let placeholder {
                    Button(placeholder) { onSelect(nil) }
                }
                ForEach(options) { option in
                    Button(option.displayName) { onSelect(option.key) }
                }
            } label: {
                HStack(spacing: 4) {
                    Text(selectedLabel)
                    Image(systemName: "chevron.up.chevron.down")
                        .font(.caption2.weight(.semibold))
                }
            }
        }
    }
}
