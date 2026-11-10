import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var model: AppModel
    var body: some View {
        switch model.phase {
        case .checking:
            VStack(spacing: 24) { BrandMark(size: 52); ProgressView("Opening ImageSH…") }
        case .signedOut:
            LoginView()
        case .signedIn:
            if let client = model.client { LibraryView(client: client) }
        }
    }
}

private struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @State private var server = AppConfiguration.serverAddress
    @State private var username = ""
    @State private var password = ""
    @FocusState private var field: Field?
    private enum Field { case server, username, password }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 14) {
                        BrandMark(size: 46)
                        Text("Your images.\nReady to share.").font(.largeTitle.bold()).tracking(-0.7)
                        Text("Sign in to your ImageSH server to upload and manage your images.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }.padding(.vertical, 16).frame(maxWidth: .infinity, alignment: .leading)
                        .listRowBackground(Color.clear).listRowInsets(EdgeInsets(top: 0, leading: 0, bottom: 0, trailing: 0))
                }
                Section("Server") {
                    TextField("https://imagesh.alexzidros.com", text: $server)
                        .keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($field, equals: .server).submitLabel(.next).onSubmit { field = .username }
                        .accessibilityIdentifier("serverAddress")
                }
                Section("Admin account") {
                    TextField("Username", text: $username).textContentType(.username)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .focused($field, equals: .username).submitLabel(.next).onSubmit { field = .password }
                        .accessibilityIdentifier("username")
                    SecureField("Password", text: $password).textContentType(.password)
                        .focused($field, equals: .password).submitLabel(.go).onSubmit(signIn)
                        .accessibilityIdentifier("password")
                }
                if let message = model.errorMessage { Section { ErrorMessage(message: message).accessibilityIdentifier("loginError") } }
                Section {
                    Button(action: signIn) {
                        HStack {
                            Spacer()
                            if model.signingIn { ProgressView() }
                            Text(model.signingIn ? "Signing in…" : "Sign in").fontWeight(.semibold)
                            Spacer()
                        }.padding(.vertical, 5)
                    }
                    .disabled(model.signingIn || username.isEmpty || password.isEmpty || server.isEmpty)
                    .accessibilityIdentifier("signInButton")
                } footer: { Text("Use the same admin account as the website. Your password is never saved in the app.") }
            }
            .navigationTitle("ImageSH").navigationBarTitleDisplayMode(.inline)
            .disabled(model.signingIn)
        }
    }

    private func signIn() {
        guard !username.isEmpty, !password.isEmpty else { return }
        field = nil
        Task { await model.signIn(server: server, username: username, password: password); password = "" }
    }
}

private struct LibraryView: View {
    let client: APIClient
    @EnvironmentObject private var model: AppModel
    @State private var showingUpload = false
    @State private var showingSettings = false
    @State private var selected: ImageRecord?
    @State private var sharing: ImageRecord?
    @State private var renaming: ImageRecord?
    @State private var newName = ""
    @State private var deleting: ImageRecord?
    @State private var sort: SortOrder = .newest
    @State private var copiedID: String?
    private enum SortOrder: String, CaseIterable, Identifiable {
        case newest = "Newest", expiry = "Expiring soon", name = "Name"
        var id: String { rawValue }
    }
    private var sortedImages: [ImageRecord] {
        model.images.sorted {
            switch sort {
            case .newest: $0.uploadedAt > $1.uploadedAt
            case .expiry: $0.expiresAt < $1.expiresAt
            case .name: $0.displayName.localizedStandardCompare($1.displayName) == .orderedAscending
            }
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    HStack {
                        Text("\(model.images.count) \(model.images.count == 1 ? "image" : "images")")
                            .font(.subheadline).foregroundStyle(.secondary)
                        Spacer()
                        Picker("Sort images", selection: $sort) {
                            ForEach(SortOrder.allCases) { Text($0.rawValue).tag($0) }
                        }.pickerStyle(.menu).labelsHidden().accessibilityLabel("Sort images")
                    }
                    if let error = model.errorMessage {
                        VStack(alignment: .leading, spacing: 10) {
                            ErrorMessage(message: error)
                            Button("Try again") { Task { await model.refresh() } }
                        }.padding().frame(maxWidth: .infinity, alignment: .leading)
                            .background(.quaternary.opacity(0.5), in: RoundedRectangle(cornerRadius: 14))
                    }
                    if model.loading && model.images.isEmpty {
                        ProgressView("Loading images…").frame(maxWidth: .infinity).padding(.top, 60)
                    } else if model.images.isEmpty {
                        ContentUnavailableView("Nothing here yet", systemImage: "photo.on.rectangle.angled",
                                               description: Text("Upload an image to create a share link."))
                            .padding(.top, 32)
                    } else {
                        TimelineView(.periodic(from: .now, by: 30)) { context in
                            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150, maximum: 260), spacing: 12)], spacing: 16) {
                                ForEach(sortedImages) { image in card(image, now: context.date) }
                            }
                        }
                    }
                }.padding(20)
            }
            .background(Color(uiColor: .systemGroupedBackground))
            .navigationTitle("ImageSH")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Settings", systemImage: "gearshape") { showingSettings = true }
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { showingUpload = true } label: {
                    Label("Upload image", systemImage: "plus").fontWeight(.semibold).frame(maxWidth: .infinity)
                }.buttonStyle(.borderedProminent).controlSize(.large)
                    .padding(.horizontal, 20).padding(.vertical, 12).background(.bar)
            }
            .refreshable { await model.refresh() }
            .sheet(isPresented: $showingUpload) {
                NavigationStack {
                    UploadEntryView(client: client, onUploaded: { _ in Task { await model.refresh() } },
                                    onAuthenticationExpired: { showingUpload = false; model.sessionExpired() })
                }
            }
            .sheet(isPresented: $showingSettings) { SettingsView() }
            .sheet(item: $selected) { image in
                NavigationStack {
                    ImageDetailView(image: image, client: client)
                        .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { selected = nil } } }
                }
            }
            .sheet(item: $sharing) { image in
                NavigationStack { ShareResultView(image: image, url: client.shareURL(for: image), onDone: { sharing = nil }) }
            }
            .alert("Rename image", isPresented: Binding(get: { renaming != nil }, set: { if !$0 { renaming = nil } })) {
                TextField("Image name", text: $newName)
                Button("Cancel", role: .cancel) { renaming = nil }
                Button("Save") {
                    if let image = renaming { Task { await model.rename(image, to: newName) } }
                    renaming = nil
                }.disabled(newName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
            .confirmationDialog("Delete image?", isPresented: Binding(get: { deleting != nil }, set: { if !$0 { deleting = nil } }), titleVisibility: .visible) {
                Button("Delete image", role: .destructive) {
                    if let image = deleting { Task { await model.delete(image) } }
                    deleting = nil
                }
            } message: { Text("The image and its public share link will stop working.") }
        }
    }

    private func card(_ image: ImageRecord, now: Date) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Button { selected = image } label: {
                Color(uiColor: .secondarySystemGroupedBackground).aspectRatio(1, contentMode: .fit)
                    .overlay { RemoteImage(url: client.imageURL(for: image)) }.clipped()
            }.buttonStyle(.plain).accessibilityLabel("Open \(image.displayName)")
            VStack(alignment: .leading, spacing: 10) {
                Text(image.displayName).font(.subheadline.weight(.medium)).lineLimit(1)
                LifetimeIndicator(image: image, now: now)
                HStack {
                    Button {
                        UIPasteboard.general.url = client.shareURL(for: image); copiedID = image.id
                        Task { try? await Task.sleep(for: .seconds(2)); if copiedID == image.id { copiedID = nil } }
                    } label: {
                        Label(copiedID == image.id ? "Copied" : "Copy link", systemImage: copiedID == image.id ? "checkmark" : "link")
                            .font(.caption.weight(.medium)).frame(maxWidth: .infinity)
                    }.buttonStyle(.bordered)
                    Menu {
                        ShareLink(item: client.shareURL(for: image)) { Label("Share link", systemImage: "square.and.arrow.up") }
                        Button("Show QR code", systemImage: "qrcode") { sharing = image }
                        Button("Rename", systemImage: "pencil") { newName = image.displayName; renaming = image }
                        Button("Delete", systemImage: "trash", role: .destructive) { deleting = image }
                    } label: { Image(systemName: "ellipsis").frame(width: 32, height: 32).contentShape(Rectangle()) }
                        .accessibilityLabel("More actions for \(image.displayName)")
                }
            }.padding(.horizontal, 12).padding(.bottom, 12)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 16))
        .clipShape(RoundedRectangle(cornerRadius: 16))
    }
}

private struct ImageDetailView: View {
    let image: ImageRecord
    let client: APIClient
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                RemoteImage(url: client.imageURL(for: image), fit: true).frame(minHeight: 220, maxHeight: 500)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                Text(image.displayName).font(.title2.bold())
                LabeledContent("Size", value: ByteCountFormatter.string(fromByteCount: Int64(image.size), countStyle: .file))
                LabeledContent("Uploaded", value: image.uploadedAt.formatted(date: .abbreviated, time: .shortened))
                LabeledContent("Expires", value: image.expiresAt.formatted(date: .abbreviated, time: .shortened))
                ShareLink(item: client.shareURL(for: image)) { Label("Share link", systemImage: "square.and.arrow.up").frame(maxWidth: .infinity) }
                    .buttonStyle(.borderedProminent).controlSize(.large)
            }.padding(20)
        }.navigationTitle("Image").navigationBarTitleDisplayMode(.inline)
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var server = AppConfiguration.serverAddress
    @State private var changingServer = false
    @State private var busy = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(AppConfiguration.serverAddress).font(.subheadline).textSelection(.enabled)
                    Button("Change server") { changingServer = true }
                } header: { Text("Server") } footer: { Text("Changing servers signs you out. You can then sign in with that server’s admin account.") }
                Section {
                    Button("Sign out", role: .destructive) {
                        busy = true
                        Task { await model.signOut(); busy = false; dismiss() }
                    }
                }
                Section { LabeledContent("Version", value: "1.0 (1)") }
                if let error = model.errorMessage { Section { ErrorMessage(message: error) } }
            }
            .navigationTitle("Settings").navigationBarTitleDisplayMode(.inline)
            .disabled(busy)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .alert("Change server", isPresented: $changingServer) {
                TextField("HTTPS server address", text: $server).textInputAutocapitalization(.never).autocorrectionDisabled()
                Button("Cancel", role: .cancel) {}
                Button("Change") {
                    busy = true
                    Task { await model.changeServer(to: server); busy = false; if model.phase == .signedOut { dismiss() } }
                }
            } message: { Text("You’ll sign in again after changing servers.") }
        }
    }
}
