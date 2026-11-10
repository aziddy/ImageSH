import SwiftUI

@MainActor final class AppModel: ObservableObject {
    enum Phase { case checking, signedOut, signedIn }
    @Published private(set) var phase: Phase = .checking
    @Published private(set) var client: APIClient?
    @Published private(set) var images: [ImageRecord] = []
    @Published private(set) var loading = false
    @Published private(set) var signingIn = false
    @Published var errorMessage: String?
    private let vault: SessionVault = KeychainSessionStore()

    init() {
        #if DEBUG && targetEnvironment(simulator)
        if ProcessInfo.processInfo.arguments.contains("-ImageSHUITesting") {
            try? vault.clear()
            AppConfiguration.serverAddress = ProcessInfo.processInfo.environment["IMAGESH_TEST_SERVER"] ?? AppConfiguration.defaultServer
        }
        #endif
    }

    func bootstrap() async {
        guard phase == .checking else { return }
        do {
            let api = try APIClient(origin: AppConfiguration.serverURL(from: AppConfiguration.serverAddress), vault: vault)
            guard api.hasSession else { phase = .signedOut; return }
            do { try await api.validateSession() }
            catch APIError.unauthenticated { phase = .signedOut; return }
            catch { errorMessage = error.localizedDescription }
            client = api; phase = .signedIn
            await refresh()
        } catch { errorMessage = error.localizedDescription; phase = .signedOut }
    }

    func signIn(server: String, username: String, password: String) async {
        guard !signingIn else { return }
        signingIn = true; errorMessage = nil
        defer { signingIn = false }
        do {
            let origin = try AppConfiguration.serverURL(from: server)
            let api = try APIClient(origin: origin, vault: vault)
            try await api.signIn(username: username, password: password)
            AppConfiguration.serverAddress = origin.absoluteString
            client = api; phase = .signedIn
            await refresh()
        } catch { errorMessage = error.localizedDescription }
    }

    func refreshIfSignedIn() async {
        guard phase == .signedIn else { return }
        await refresh()
    }

    func refresh() async {
        guard let client, !loading else { return }
        loading = true
        defer { loading = false }
        do { images = try await client.images(); errorMessage = nil }
        catch { handle(error) }
    }

    func rename(_ image: ImageRecord, to name: String) async {
        guard let client else { return }
        do {
            let updated = try await client.rename(image, to: name)
            if let index = images.firstIndex(where: { $0.id == image.id }) { images[index] = updated }
        } catch { handle(error); if error as? APIError == .notFound { images.removeAll { $0.id == image.id } } }
    }

    func delete(_ image: ImageRecord) async {
        guard let client else { return }
        do { try await client.delete(image); images.removeAll { $0.id == image.id } }
        catch { handle(error); if error as? APIError == .notFound { images.removeAll { $0.id == image.id } } }
    }

    func signOut() async {
        let oldClient = client
        do { try vault.clear() }
        catch { errorMessage = error.localizedDescription; return }
        client = nil; images = []; phase = .signedOut; errorMessage = nil
        try? await oldClient?.signOut()
    }

    func changeServer(to text: String) async {
        do {
            let origin = try AppConfiguration.serverURL(from: text)
            let previousAddress = AppConfiguration.serverAddress
            AppConfiguration.serverAddress = origin.absoluteString
            await signOut()
            if phase != .signedOut { AppConfiguration.serverAddress = previousAddress }
        } catch { errorMessage = error.localizedDescription }
    }

    func sessionExpired() {
        client = nil; images = []; phase = .signedOut
        errorMessage = APIError.unauthenticated.localizedDescription
    }

    private func handle(_ error: Error) {
        if error as? APIError == .unauthenticated { sessionExpired() }
        else if !(error is CancellationError) { errorMessage = error.localizedDescription }
    }
}
