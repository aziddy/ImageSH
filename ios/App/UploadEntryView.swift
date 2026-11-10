import SwiftUI
import PhotosUI
import UniformTypeIdentifiers

struct UploadEntryView: View {
    let client: APIClient
    let onUploaded: (ImageRecord) -> Void
    let onAuthenticationExpired: () -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var source: ImportedImage?
    @State private var showingPhotos = false
    @State private var showingFiles = false
    @State private var importing = false
    @State private var errorMessage: String?

    var body: some View {
        Group {
            if let source {
                UploadComposer(source: source, client: client, onUploaded: onUploaded, onFinish: { dismiss() },
                               onAuthenticationExpired: onAuthenticationExpired)
            } else {
                Form {
                    Section {
                        VStack(alignment: .leading, spacing: 10) {
                            Image(systemName: "photo.badge.plus").font(.system(size: 36))
                            Text("Pick an image").font(.title2.bold())
                            Text("Choose a photo, browse Files, or paste an image from your clipboard.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, 12)
                    }
                    Section {
                        Button("Choose from Photos", systemImage: "photo.on.rectangle") { showingPhotos = true }
                        Button("Choose from Files", systemImage: "folder") { showingFiles = true }
                        PasteButton(supportedContentTypes: [.image]) { providers in
                            if let provider = providers.first { load(provider) }
                        }.buttonBorderShape(.roundedRectangle)
                    }
                    if importing { Section { ProgressView("Opening image…") } }
                    if let errorMessage { Section { ErrorMessage(message: errorMessage) } }
                }
                .disabled(importing)
                .navigationTitle("Upload image").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            }
        }
        .sheet(isPresented: $showingPhotos) {
            PhotoPicker { provider in
                showingPhotos = false
                if let provider { load(provider) }
            }.ignoresSafeArea()
        }
        .fileImporter(isPresented: $showingFiles, allowedContentTypes: [.image]) { result in
            do {
                let url = try result.get()
                importing = true; errorMessage = nil
                Task {
                    do {
                        source = try await Task.detached(priority: .userInitiated) {
                            let scoped = url.startAccessingSecurityScopedResource()
                            defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                            return try ImportedImage.copyFile(at: url)
                        }.value
                    } catch { errorMessage = error.localizedDescription }
                    importing = false
                }
            } catch { errorMessage = error.localizedDescription }
        }
    }

    private func load(_ provider: NSItemProvider) {
        importing = true; errorMessage = nil
        Task {
            do { source = try await ImageImporter.load(provider) }
            catch { errorMessage = error.localizedDescription }
            importing = false
        }
    }
}

private struct PhotoPicker: UIViewControllerRepresentable {
    let onSelect: (NSItemProvider?) -> Void
    func makeUIViewController(context: Context) -> PHPickerViewController {
        var configuration = PHPickerConfiguration()
        configuration.filter = .images
        configuration.selectionLimit = 1
        configuration.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: configuration)
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onSelect: onSelect) }
    final class Coordinator: PHPickerViewControllerDelegate {
        let onSelect: (NSItemProvider?) -> Void
        init(onSelect: @escaping (NSItemProvider?) -> Void) { self.onSelect = onSelect }
        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            onSelect(results.first?.itemProvider)
        }
    }
}
