import SwiftUI
import UniformTypeIdentifiers

final class ShareViewController: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let items = extensionContext?.inputItems as? [NSExtensionItem] ?? []
        let providers = items.flatMap { $0.attachments ?? [] }
        let root = ShareExtensionView(provider: providers.count == 1 ? providers.first : nil) { [weak self] in
            self?.extensionContext?.completeRequest(returningItems: nil)
        }
        let host = UIHostingController(rootView: root)
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        host.didMove(toParent: self)
    }
}

private struct ShareExtensionView: View {
    let provider: NSItemProvider?
    let onFinish: () -> Void
    @State private var source: ImportedImage?
    @State private var client: APIClient?
    @State private var message: String?
    @State private var needsLogin = false

    var body: some View {
        NavigationStack {
            Group {
                if let source, let client, !needsLogin {
                    UploadComposer(source: source, client: client, isExtension: true, onUploaded: { _ in },
                                   onFinish: onFinish, onAuthenticationExpired: { needsLogin = true })
                } else if needsLogin {
                    ContentUnavailableView {
                        Label("Sign in to ImageSH", systemImage: "person.crop.circle.badge.exclamationmark")
                    } description: {
                        Text("Open the ImageSH app and sign in, then share this image again.")
                    } actions: { Button("Done", action: onFinish) }
                } else if let message {
                    ContentUnavailableView {
                        Label("Couldn’t open image", systemImage: "photo.badge.exclamationmark")
                    } description: { Text(message) } actions: { Button("Done", action: onFinish) }
                } else {
                    ProgressView("Opening ImageSH…").frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            }
            .toolbar {
                if source == nil || needsLogin {
                    ToolbarItem(placement: .cancellationAction) { Button("Cancel", action: onFinish) }
                }
            }
        }
        .task {
            do {
                let api = try APIClient(origin: AppConfiguration.serverURL(from: AppConfiguration.serverAddress), vault: KeychainSessionStore())
                guard api.hasSession else { needsLogin = true; return }
                guard let provider else { throw ImageImportError.unsupported }
                let image = try await ImageImporter.load(provider)
                guard !Task.isCancelled else { return }
                client = api; source = image
            } catch { message = error.localizedDescription }
        }
    }
}
