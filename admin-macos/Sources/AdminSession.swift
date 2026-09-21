import AppKit
import FirebaseAuth
import FirebaseFunctions
import GoogleSignIn

@MainActor
final class AdminSession: ObservableObject {
    enum State { case signedOut, checking, ready, denied(String) }

    @Published private(set) var state: State = .checking
    @Published private(set) var email = ""
    let api = AdminAPI()
    private var listener: AuthStateDidChangeListenerHandle?

    init() {
        listener = Auth.auth().addStateDidChangeListener { [weak self] _, user in
            Task { @MainActor in
                guard let self else { return }
                guard let user else { self.state = .signedOut; self.email = ""; return }
                self.email = user.email ?? ""
                await self.verify(user: user)
            }
        }
    }

    deinit { if let listener { Auth.auth().removeStateDidChangeListener(listener) } }

    func signIn() async {
        guard let window = NSApp.keyWindow ?? NSApp.windows.first else {
            state = .denied("未能開啟 Google 登入視窗。")
            return
        }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: window)
            guard let idToken = result.user.idToken?.tokenString else { throw SessionError.missingToken }
            let credential = GoogleAuthProvider.credential(
                withIDToken: idToken,
                accessToken: result.user.accessToken.tokenString
            )
            state = .checking
            _ = try await Auth.auth().signIn(with: credential)
        } catch { state = .denied(error.localizedDescription) }
    }

    func signOut() {
        try? Auth.auth().signOut()
        GIDSignIn.sharedInstance.signOut()
        state = .signedOut
    }

    private func verify(user: FirebaseAuth.User) async {
        state = .checking
        do {
            let token = try await user.getIDTokenResult(forcingRefresh: true)
            guard token.claims["admin"] as? Bool == true else { throw SessionError.noAdminClaim }
            _ = try await api.call("adminSession")
            state = .ready
        } catch { state = .denied(error.localizedDescription) }
    }
}

enum SessionError: LocalizedError {
    case missingToken, noAdminClaim
    var errorDescription: String? {
        switch self {
        case .missingToken: "Google 未有提供登入憑證。"
        case .noAdminClaim: "此 Google 帳戶未獲管理員權限。"
        }
    }
}
