import SwiftUI

/// Collapsible reference of all rank tiers for the current mode, highlighting the
/// band the player is currently in.
struct RankReferenceView: View {
    let thresholds: [Threshold]
    let rank: RankInfo

    var body: some View {
        DisclosureGroup("Rank thresholds") {
            VStack(spacing: 0) {
                ForEach(thresholds.reversed(), id: \.points) { t in
                    let isCurrent = t.points == rank.currentFloor && rank.badge == t.badge
                    HStack {
                        Text(t.badge)
                            .fontWeight(isCurrent ? .bold : .regular)
                        Spacer()
                        Text("\(t.points)")
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                    .background(isCurrent ? Color.accentColor.opacity(0.15) : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
            }
            .padding(.top, 4)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
