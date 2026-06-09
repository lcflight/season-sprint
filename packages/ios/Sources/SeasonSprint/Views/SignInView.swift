import SwiftUI
import ClerkKit

/// Minimal email-code sign-in built on ClerkKit (we don't use ClerkKitUI's prebuilt
/// views because they rely on the Xcode-only `#Preview` macro, which doesn't build
/// under xtool's cross toolchain). Two steps: send a code, then verify it.
struct SignInView: View {
    @Environment(Clerk.self) private var clerk

    @State private var email = ""
    @State private var code = ""
    @State private var pendingSignIn: SignIn?
    @State private var isWorking = false
    @State private var errorMessage: String?

    private var codeSent: Bool { pendingSignIn != nil }

    var body: some View {
        VStack(spacing: 20) {
            Spacer()
            VStack(spacing: 6) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.largeTitle)
                    .foregroundStyle(.tint)
                Text("Season Sprint")
                    .font(.title.bold())
                Text("Sign in to view your season progress")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            VStack(spacing: 12) {
                if !codeSent {
                    TextField("Email address", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .textFieldStyle(.roundedBorder)

                    Button(action: { Task { await sendCode() } }) {
                        Label("Send code", systemImage: "paperplane")
                            .frame(maxWidth: .infinity)
                            .opacity(isWorking ? 0 : 1)
                            .overlay { if isWorking { ProgressView().tint(.white) } }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(email.isEmpty || isWorking)
                } else {
                    Text("Enter the code sent to \(email)")
                        .font(.footnote)
                        .foregroundStyle(.secondary)

                    TextField("Verification code", text: $code)
                        .textContentType(.oneTimeCode)
                        .keyboardType(.numberPad)
                        .textFieldStyle(.roundedBorder)

                    Button(action: { Task { await verify() } }) {
                        Label("Verify", systemImage: "checkmark.shield")
                            .frame(maxWidth: .infinity)
                            .opacity(isWorking ? 0 : 1)
                            .overlay { if isWorking { ProgressView().tint(.white) } }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(code.isEmpty || isWorking)

                    Button("Use a different email") {
                        pendingSignIn = nil
                        code = ""
                        errorMessage = nil
                    }
                    .font(.footnote)
                }
            }
            .padding(.horizontal)

            // Reserve a stable slot so showing an error doesn't reflow the form.
            Text(errorMessage ?? " ")
                .font(.footnote)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
                .padding(.horizontal)
                .frame(minHeight: 36)
                .opacity(errorMessage == nil ? 0 : 1)

            Spacer()
        }
        .padding()
    }

    private func sendCode() async {
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            pendingSignIn = try await clerk.auth.signInWithEmailCode(emailAddress: email)
        } catch {
            errorMessage = "Couldn't send a code. Check the email and try again."
        }
    }

    private func verify() async {
        guard let signIn = pendingSignIn else { return }
        isWorking = true
        errorMessage = nil
        defer { isWorking = false }
        do {
            // On success Clerk updates its session; the auth gate swaps to the dashboard.
            _ = try await signIn.verifyCode(code)
        } catch {
            errorMessage = "That code didn't work. Try again."
        }
    }
}
