import SwiftUI

struct UploadComposer: View {
    let source: ImportedImage
    let client: APIClient
    var isExtension = false
    let onUploaded: (ImageRecord) -> Void
    let onFinish: () -> Void
    let onAuthenticationExpired: () -> Void
    @State private var name = ""
    @State private var lifetime: Lifetime = .oneDay
    @State private var scale = 1.0
    @State private var committedScale = 1.0
    @State private var prepared: PreparedImage?
    @State private var preparing = true
    @State private var uploading = false
    @State private var progress = 0.0
    @State private var errorMessage: String?
    @State private var result: ImageRecord?
    @State private var uploadTask: Task<Void, Never>?
    @FocusState private var nameFocused: Bool

    var body: some View {
        Group {
            if let result {
                ShareResultView(image: result, url: client.shareURL(for: result), allowSystemSharing: !isExtension, copyOnAppear: true, onDone: onFinish)
            } else {
                Form {
                    Group {
                    Section {
                        if let prepared {
                            Image(uiImage: prepared.preview).resizable().scaledToFit()
                                .frame(maxWidth: .infinity).frame(height: 210)
                                .accessibilityLabel("Image preview")
                        } else { ProgressView("Preparing image…").frame(maxWidth: .infinity).frame(height: 180) }
                        Text(source.originalName).font(.subheadline).lineLimit(2).foregroundStyle(.secondary)
                    }
                    Section("Share settings") {
                        TextField("Name (optional)", text: $name)
                            .focused($nameFocused).submitLabel(.done).onSubmit { nameFocused = false }
                            .accessibilityIdentifier("uploadName")
                        Picker("Lives for", selection: $lifetime) {
                            ForEach(Lifetime.allCases) { Text($0.label).tag($0) }
                        }
                    }
                    Section {
                        HStack {
                            Text("Reduce size")
                            Spacer()
                            Text(scale, format: .percent.precision(.fractionLength(0))).monospacedDigit().foregroundStyle(.secondary)
                        }
                        Slider(value: $scale, in: 0.25...1, step: 0.05) { editing in
                            if !editing { committedScale = scale }
                        }.accessibilityLabel("Image scale")
                        if preparing { ProgressView("Resizing…") }
                        else if let prepared {
                            Text("Upload: \(prepared.width) × \(prepared.height) px · \(FileSize.string(prepared.byteCount)) (\(prepared.byteCount) bytes)")
                                .font(.footnote).foregroundStyle(prepared.byteCount > AppConfiguration.maxUploadBytes ? .red : .secondary)
                            if prepared.converted {
                                Text("Prepared as \(prepared.mimeType == "image/png" ? "PNG" : "JPEG"). Converted images are limited to 4096 px on the longest side.")
                                    .font(.footnote).foregroundStyle(.secondary)
                            }
                            if prepared.byteCount > AppConfiguration.maxUploadBytes {
                                ErrorMessage(message: APIError.tooLarge.localizedDescription)
                            }
                        }
                    } footer: {
                        Text("Images can be up to \(FileSize.string(AppConfiguration.maxUploadBytes)). Your server may apply a different limit. The saved file size may change after server processing.")
                    }
                    }.disabled(uploading)
                    if let errorMessage { Section { ErrorMessage(message: errorMessage) } }
                    if uploading {
                        Section {
                            ProgressView(value: progress)
                            Text(progress < 1 ? "Uploading… \(Int(progress * 100))%" : "Finishing upload…")
                                .font(.subheadline).foregroundStyle(.secondary)
                        }
                    }
                    Section {
                        Button(action: upload) {
                            Label(uploading ? "Uploading…" : "Upload image", systemImage: "arrow.up.circle.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .disabled(preparing || uploading || abs(scale - committedScale) > 0.001 || prepared == nil || (prepared?.byteCount ?? 0) > AppConfiguration.maxUploadBytes)
                        .accessibilityIdentifier("uploadButton")
                    }
                }
                .scrollDismissesKeyboard(.interactively)
                .navigationTitle("Upload image").navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button(uploading ? "Cancel upload" : "Cancel") { uploadTask?.cancel(); onFinish() }
                    }
                }
                .interactiveDismissDisabled(uploading)
                .task(id: committedScale) {
                    preparing = true
                    errorMessage = nil
                    let requestedScale = committedScale
                    do {
                        let image = try await Task.detached(priority: .userInitiated) { try source.prepare(scale: requestedScale) }.value
                        guard !Task.isCancelled else { return }
                        prepared = image
                    } catch {
                        guard !Task.isCancelled else { return }
                        prepared = nil
                        errorMessage = error.localizedDescription
                    }
                    preparing = false
                }
            }
        }
        .onDisappear { uploadTask?.cancel() }
    }

    private func upload() {
        guard let prepared, !uploading else { return }
        nameFocused = false
        uploading = true; progress = 0; errorMessage = nil
        uploadTask = Task {
            do {
                let image = try await client.upload(prepared, name: name, lifetime: lifetime) { progress = $0 }
                guard !Task.isCancelled else { return }
                result = image
                onUploaded(image)
            } catch {
                guard !Task.isCancelled else { return }
                errorMessage = error.localizedDescription
                if error as? APIError == .unauthenticated { onAuthenticationExpired() }
            }
            uploading = false
        }
    }
}
