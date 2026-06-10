import SwiftUI

/// Live-link status shown as a database symbol. Hidden when there is no link;
/// amber and fading in/out while connecting; steady green once connected.
struct LiveIndicatorView: View {
    let status: LiveStatus
    @State private var dim = false

    var body: some View {
        if status != .disconnected {
            Image(systemName: "cylinder.split.1x2")
                .font(.caption)
                .foregroundStyle(status == .connected ? Color.green : Color.yellow)
                .opacity(status == .connecting && dim ? 0.25 : 1)
                .onAppear { syncAnimation() }
                .onChange(of: status) { syncAnimation() }
        }
    }

    private func syncAnimation() {
        if status == .connecting {
            dim = false
            withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) {
                dim = true
            }
        } else {
            withAnimation(.default) { dim = false }
        }
    }
}
