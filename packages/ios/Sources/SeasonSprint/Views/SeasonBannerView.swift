import SwiftUI

/// Current-season banner: name · end date · days remaining. Mirrors the web App.vue banner.
struct SeasonBannerView: View {
    let season: Season?

    var body: some View {
        if let season {
            HStack(spacing: 8) {
                Text(season.name)
                    .font(.subheadline.bold())
                Text("· ends \(season.end, format: .dateTime.month().day())")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
                Text("\(daysLeft(season.end)) days left")
                    .font(.caption.bold())
                    .foregroundStyle(.tint)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity)
            .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
        }
    }

    private func daysLeft(_ end: Date) -> Int {
        max(0, Int((end.timeIntervalSinceNow / 86_400).rounded()))
    }
}
