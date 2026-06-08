import SwiftUI

/// Tier accent colors, roughly matching the web rank palette.
func tierColor(_ badge: String) -> Color {
    switch tierColorName(for: badge) {
    case "bronze": return Color(red: 0.80, green: 0.50, blue: 0.20)
    case "silver": return Color(red: 0.75, green: 0.75, blue: 0.80)
    case "gold": return Color(red: 0.95, green: 0.78, blue: 0.20)
    case "platinum": return Color(red: 0.50, green: 0.80, blue: 0.85)
    case "diamond": return Color(red: 0.45, green: 0.65, blue: 0.95)
    case "emerald": return Color(red: 0.20, green: 0.80, blue: 0.55)
    default: return Color.secondary
    }
}

/// Big rank badge with current points and a progress bar toward the next rank.
struct RankBadgeView: View {
    let rank: RankInfo

    var body: some View {
        let accent = tierColor(rank.badge)
        VStack(spacing: 12) {
            Text(rank.badge)
                .font(.title.bold())
                .foregroundStyle(accent)

            Text("\(rank.points)")
                .font(.system(size: 52, weight: .heavy, design: .rounded))
                .monospacedDigit()
            Text("win points")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let nextTarget = rank.nextTarget, let nextBadge = rank.nextBadge {
                VStack(spacing: 4) {
                    ProgressView(value: rank.progressFraction)
                        .tint(accent)
                    HStack {
                        Text("\(rank.toNext) to \(nextBadge)")
                        Spacer()
                        Text("\(rank.points)/\(nextTarget)")
                            .monospacedDigit()
                    }
                    .font(.caption)
                    .foregroundStyle(.secondary)
                }
            } else {
                Text("Max rank reached")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity)
        .background(accent.opacity(0.12), in: RoundedRectangle(cornerRadius: 16))
    }
}
