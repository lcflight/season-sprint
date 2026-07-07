import SwiftUI

/// Segmented World Tour / Ranked pill, mirroring the web's ModeSwitcher.vue.
struct ModeSwitcherView: View {
    @Binding var selected: GameMode

    var body: some View {
        HStack(spacing: 4) {
            ForEach(GameMode.allCases, id: \.self) { mode in
                segment(for: mode)
            }
        }
        .padding(4)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 14))
        .padding(.horizontal, 16)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }

    private func segment(for mode: GameMode) -> some View {
        let isSelected = mode == selected
        return Button {
            selected = mode
        } label: {
            Text(mode.label)
                .font(.subheadline.weight(.black))
                .frame(maxWidth: .infinity)
                .padding(.vertical, 9)
                .foregroundStyle(isSelected ? Color.black : Color.secondary)
                .background {
                    if isSelected {
                        RoundedRectangle(cornerRadius: 10)
                            .fill(LinearGradient(colors: [.yellow, .yellow.opacity(0.85)], startPoint: .top, endPoint: .bottom))
                    }
                }
        }
        .buttonStyle(.plain)
    }
}
