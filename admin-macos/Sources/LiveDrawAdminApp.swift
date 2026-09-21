import AppKit
import FirebaseAppCheck
import FirebaseCore
import GoogleSignIn
import SwiftUI

final class LiveDrawAppCheckProviderFactory: NSObject, AppCheckProviderFactory {
    func createProvider(with app: FirebaseApp) -> AppCheckProvider? {
        AppAttestProvider(app: app)
    }
}

@main
struct LiveDrawAdminApp: App {
    @StateObject private var session: AdminSession

    init() {
        #if APP_CHECK_DEBUG
        AppCheck.setAppCheckProviderFactory(AppCheckDebugProviderFactory())
        #else
        AppCheck.setAppCheckProviderFactory(LiveDrawAppCheckProviderFactory())
        #endif
        FirebaseApp.configure()
        if let clientID = FirebaseApp.app()?.options.clientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
        _session = StateObject(wrappedValue: AdminSession())
    }

    var body: some Scene {
        WindowGroup("LiveDraw Admin") {
            RootView().environmentObject(session).frame(minWidth: 1040, minHeight: 680)
                .onOpenURL { url in GIDSignIn.sharedInstance.handle(url) }
        }
        .windowStyle(.hiddenTitleBar)
    }
}
