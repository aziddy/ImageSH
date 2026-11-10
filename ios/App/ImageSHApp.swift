import SwiftUI

@main
struct ImageSHApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            ContentView().environmentObject(model)
                .task { await model.bootstrap() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.refreshIfSignedIn() } }
                }
        }
    }
}
