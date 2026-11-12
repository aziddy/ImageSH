import SwiftUI
import PhotosUI
import AVFoundation
import UniformTypeIdentifiers

struct UploadEntryView: View {
    let client: APIClient
    let onUploaded: (ImageRecord) -> Void
    let onAuthenticationExpired: () -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @State private var source: ImportedImage?
    @State private var showingCamera = false
    @State private var showingCameraPermissionAlert = false
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
                            Text("Take a photo, choose from Photos or Files, or paste an image from your clipboard.")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }.padding(.vertical, 12)
                    }
                    Section {
                        Button("Take a Photo", systemImage: "camera") { Task { await openCamera() } }
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
        .fullScreenCover(isPresented: $showingCamera) {
            CameraPicker { result in
                showingCamera = false
                guard let result else { return }
                do { load(try result.get()) }
                catch { errorMessage = error.localizedDescription }
            }.ignoresSafeArea()
        }
        .alert("Allow Camera Access", isPresented: $showingCameraPermissionAlert) {
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Enable camera access for ImageSH in Settings to take a photo.")
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

    @MainActor private func openCamera() async {
        guard !importing else { return }
        errorMessage = nil
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            errorMessage = "The camera is unavailable on this device. Choose an image from Photos or Files instead."
            return
        }
        importing = true
        defer { importing = false }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            showingCamera = true
        case .notDetermined:
            if await AVCaptureDevice.requestAccess(for: .video) { showingCamera = true }
            else { showingCameraPermissionAlert = true }
        case .denied:
            showingCameraPermissionAlert = true
        case .restricted:
            errorMessage = "Camera access is restricted on this device. Choose an image from Photos or Files instead."
        @unknown default:
            errorMessage = "Camera access is unavailable. Choose an image from Photos or Files instead."
        }
    }

    private func load(_ image: UIImage) {
        importing = true; errorMessage = nil
        Task {
            do {
                source = try await Task.detached(priority: .userInitiated) {
                    try ImportedImage.fromImage(image, name: "Camera photo.jpg")
                }.value
            } catch { errorMessage = error.localizedDescription }
            importing = false
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

private struct CameraPicker: UIViewControllerRepresentable {
    // A nil result means the user cancelled without taking a photo.
    let onSelect: (Result<UIImage, Error>?) -> Void
    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.mediaTypes = [UTType.image.identifier]
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }
    func updateUIViewController(_ uiViewController: UIImagePickerController, context: Context) {}
    func makeCoordinator() -> Coordinator { Coordinator(onSelect: onSelect) }
    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let onSelect: (Result<UIImage, Error>?) -> Void
        init(onSelect: @escaping (Result<UIImage, Error>?) -> Void) { self.onSelect = onSelect }
        func imagePickerController(_ picker: UIImagePickerController,
                                   didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = info[.originalImage] as? UIImage { onSelect(.success(image)) }
            else { onSelect(.failure(ImageImportError.unreadable)) }
        }
        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { onSelect(nil) }
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
