import SwiftUI
import UIKit

/// The bundled app logo, loaded from the resource bundle.
extension Image {
    static var seasonSprintLogo: Image? {
        guard let url = Bundle.module.url(forResource: "Logo", withExtension: "png"),
              let uiImage = UIImage(contentsOfFile: url.path) else { return nil }
        return Image(uiImage: uiImage)
    }
}

/// Centered branded splash: logo + app name + spinner, with an optional caption.
/// Reused for the auth-loading and initial-data-loading states.
struct BrandedLoadingView: View {
    var message: String?

    var body: some View {
        VStack(spacing: 18) {
            if let logo = Image.seasonSprintLogo {
                logo
                    .resizable()
                    .scaledToFit()
                    .frame(width: 104, height: 104)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .shadow(color: .black.opacity(0.25), radius: 10, y: 4)
            } else {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 56))
                    .foregroundStyle(.tint)
            }

            Text("Season Sprint")
                .font(.title2.bold())

            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            ProgressView()
                .tint(.secondary)
                .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
