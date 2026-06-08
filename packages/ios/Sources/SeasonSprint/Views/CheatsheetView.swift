import SwiftUI

/// Collapsible World Tour win-points reference. Read-only (no quick-add this round).
/// Ports packages/web/src/components/PointsCheatsheet.vue.
struct CheatsheetView: View {
    var body: some View {
        DisclosureGroup("World Tour win points") {
            VStack(spacing: 0) {
                ForEach(worldTourCheatsheet) { row in
                    HStack {
                        Text(row.label)
                        Spacer()
                        Text("+\(row.value)")
                            .fontWeight(.bold)
                            .monospacedDigit()
                    }
                    .padding(.vertical, 6)
                    .padding(.horizontal, 8)
                }
            }
            .padding(.top, 4)
        }
        .padding(12)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}
