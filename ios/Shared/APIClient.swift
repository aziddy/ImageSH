import Foundation

final class RequestDelegate: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
    private let onProgress: (@MainActor (Double) -> Void)?
    init(onProgress: (@MainActor (Double) -> Void)? = nil) { self.onProgress = onProgress }

    // API redirects are inspected by the caller; never forward credentials to another origin.
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
                    newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didSendBodyData bytesSent: Int64,
                    totalBytesSent: Int64, totalBytesExpectedToSend: Int64) {
        guard totalBytesExpectedToSend > 0 else { return }
        let fraction = min(1, Double(totalBytesSent) / Double(totalBytesExpectedToSend))
        Task { @MainActor in onProgress?(fraction) }
    }
}

@MainActor final class APIClient {
    let origin: URL
    private let vault: SessionVault
    private let session: URLSession
    private var cookies: [StoredCookie] = []
    private var persistSession = true
    private var sessionID: UUID?
    private var signingIn = false

    init(origin: URL, vault: SessionVault, configuration: URLSessionConfiguration = .ephemeral) throws {
        self.origin = origin
        self.vault = vault
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 30
        configuration.timeoutIntervalForResource = 120
        self.session = URLSession(configuration: configuration, delegate: RequestDelegate(), delegateQueue: nil)
        try reloadSession()
    }

    var hasSession: Bool { cookies.contains { $0.isSession && $0.matches(origin.appendingPathComponent("api")) } }

    func reloadSession() throws {
        cookies.removeAll { $0.isSession }
        sessionID = nil
        if let record = try vault.read(), record.origin == origin.absoluteString {
            sessionID = record.id
            cookies += record.cookies.filter { $0.isSession && $0.matches(origin.appendingPathComponent("api")) }
        }
    }

    func signIn(username: String, password: String) async throws {
        cookies = []
        try vault.clear()
        sessionID = UUID()
        signingIn = true
        defer { signingIn = false }
        do {
            let token: CSRF = try await get("api/auth/csrf")
            let body = Self.formData([
                "username": username, "password": password, "csrfToken": token.csrfToken,
                "callbackUrl": origin.appendingPathComponent("admin").absoluteString, "json": "true"
            ])
            let (data, _) = try await request("api/auth/callback/credentials", method: "POST", body: body,
                                            contentType: "application/x-www-form-urlencoded")
            let response = try JSONDecoder().decode(AuthResponse.self, from: data)
            if let url = URLComponents(string: response.url), url.queryItems?.contains(where: { $0.name == "error" }) == true {
                throw APIError.invalidCredentials
            }
            try await validateSession()
        } catch {
            try clearSession()
            if error as? APIError == .unauthenticated { throw APIError.invalidCredentials }
            throw error
        }
    }

    func validateSession() async throws {
        try reloadSession()
        let response: AuthSession = try await get("api/auth/session")
        guard response.user?.id != nil, hasSession else {
            try clearSession()
            throw APIError.unauthenticated
        }
    }

    func signOut() async throws {
        persistSession = false
        // Clear shared storage immediately, including when the server is unavailable.
        if try vault.read()?.id == sessionID { try vault.clear() }
        defer { cookies = []; sessionID = nil }
        let token: CSRF = try await get("api/auth/csrf")
        _ = try await request("api/auth/signout", method: "POST",
                              body: Self.formData(["csrfToken": token.csrfToken, "json": "true"]),
                              contentType: "application/x-www-form-urlencoded")
    }

    func clearSession() throws {
        cookies = []
        if try vault.read()?.id == sessionID { try vault.clear() }
        sessionID = nil
    }

    func images() async throws -> [ImageRecord] {
        try requireSession()
        let response: ImagesResponse = try await get("api/admin/images")
        return response.images
    }

    func rename(_ image: ImageRecord, to name: String) async throws -> ImageRecord {
        try requireSession()
        let body = try JSONEncoder().encode(["name": name.trimmingCharacters(in: .whitespacesAndNewlines)])
        let (data, _) = try await request("api/admin/images/" + safeID(image.id), method: "PATCH", body: body,
                                        contentType: "application/json")
        return try ImageJSON.decoder().decode(ImageUpdateResponse.self, from: data).imageData
    }

    func changeLifetime(_ image: ImageRecord, to lifetime: Lifetime) async throws -> ImageRecord {
        try requireSession()
        let body = try JSONEncoder().encode(["expiration": lifetime.rawValue])
        let (data, _) = try await request("api/admin/images/" + safeID(image.id), method: "PATCH", body: body,
                                        contentType: "application/json")
        return try ImageJSON.decoder().decode(ImageUpdateResponse.self, from: data).imageData
    }

    func delete(_ image: ImageRecord) async throws {
        try requireSession()
        _ = try await request("api/admin/images/" + safeID(image.id), method: "DELETE")
    }

    func upload(_ image: PreparedImage, name: String, lifetime: Lifetime,
                onProgress: @escaping @MainActor (Double) -> Void) async throws -> ImageRecord {
        try requireSession()
        guard image.byteCount <= AppConfiguration.maxUploadBytes else { throw APIError.tooLarge }
        let multipart = try MultipartUpload(image: image, name: name, lifetime: lifetime)
        defer { try? FileManager.default.removeItem(at: multipart.fileURL) }
        let (data, _) = try await request("api/admin/upload", method: "POST", contentType: multipart.contentType,
                                        uploadFile: multipart.fileURL, onProgress: onProgress)
        let response = try ImageJSON.decoder().decode(UploadResponse.self, from: data)
        return response.image
    }

    func shareURL(for image: ImageRecord) -> URL { origin.appendingPathComponent("i").appendingPathComponent(image.id) }
    func imageURL(for image: ImageRecord) -> URL { origin.appendingPathComponent("api/i").appendingPathComponent(image.id) }

    static func formData(_ values: [String: String]) -> Data {
        var parts = URLComponents()
        parts.queryItems = values.sorted { $0.key < $1.key }.map { URLQueryItem(name: $0.key, value: $0.value) }
        // '+' is literal in credentials but means a space in form encoding.
        return Data((parts.percentEncodedQuery ?? "").replacingOccurrences(of: "+", with: "%2B").utf8)
    }

    private func requireSession() throws {
        try reloadSession()
        guard hasSession else { throw APIError.unauthenticated }
    }

    private func safeID(_ id: String) throws -> String {
        guard !id.isEmpty, id.utf8.allSatisfy({ (48...57).contains($0) || (65...90).contains($0) || (97...122).contains($0) || $0 == 45 || $0 == 95 }) else {
            throw APIError.invalidResponse
        }
        return id
    }

    private func get<T: Decodable>(_ path: String) async throws -> T {
        let (data, _) = try await request(path)
        do { return try ImageJSON.decoder().decode(T.self, from: data) }
        catch { throw APIError.invalidResponse }
    }

    private func request(_ path: String, method: String = "GET", body: Data? = nil, contentType: String? = nil,
                         uploadFile: URL? = nil, onProgress: (@MainActor (Double) -> Void)? = nil) async throws -> (Data, HTTPURLResponse) {
        var request = URLRequest(url: origin.appendingPathComponent(path))
        request.httpMethod = method
        request.httpBody = body
        request.httpShouldHandleCookies = false
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let contentType { request.setValue(contentType, forHTTPHeaderField: "Content-Type") }
        let applicable = cookies.filter { $0.matches(request.url!) }.sorted { $0.path.count > $1.path.count }
        if !applicable.isEmpty {
            request.setValue(applicable.map { "\($0.name)=\($0.value)" }.joined(separator: "; "), forHTTPHeaderField: "Cookie")
        }
        let data: Data
        let rawResponse: URLResponse
        if let uploadFile {
            (data, rawResponse) = try await session.upload(for: request, fromFile: uploadFile,
                                                          delegate: RequestDelegate(onProgress: onProgress))
        } else {
            (data, rawResponse) = try await session.data(for: request)
        }
        guard let response = rawResponse as? HTTPURLResponse else { throw APIError.invalidResponse }
        let fields = response.allHeaderFields.reduce(into: [String: String]()) { $0[String(describing: $1.key)] = String(describing: $1.value) }
        for cookie in HTTPCookie.cookies(withResponseHeaderFields: fields, for: request.url!) {
            let item = StoredCookie(cookie)
            guard item.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased() == origin.host?.lowercased() else { continue }
            cookies.removeAll { $0.name == item.name && $0.path == item.path && $0.domain == item.domain }
            if item.expires == nil || item.expires! > Date() { cookies.append(item) }
        }
        if persistSession, hasSession {
            let saved = try vault.read()
            // An extension response must not resurrect a session cleared by the main app.
            guard signingIn || saved?.id == sessionID else {
                cookies = []
                throw APIError.unauthenticated
            }
            try vault.write(SessionRecord(origin: origin.absoluteString, cookies: cookies.filter(\.isSession), id: sessionID ?? UUID()))
        }
        let location = response.value(forHTTPHeaderField: "Location") ?? ""
        if response.statusCode == 401 || response.statusCode == 403 || ((300..<400).contains(response.statusCode) && (location.contains("/login") || location.contains("/api/auth/signin"))) {
            try clearSession()
            throw APIError.unauthenticated
        }
        if response.statusCode == 404 { throw APIError.notFound }
        guard (200..<300).contains(response.statusCode) else {
            let error = try? JSONDecoder().decode(ErrorResponse.self, from: data)
            throw error.map { APIError.server($0.error) } ?? .invalidResponse
        }
        guard response.mimeType == "application/json" else { throw APIError.invalidResponse }
        return (data, response)
    }
}

private struct CSRF: Decodable { let csrfToken: String }
private struct AuthResponse: Decodable { let url: String }
private struct AuthSession: Decodable {
    struct User: Decodable { let id: String? }
    let user: User?
}
private struct ImagesResponse: Decodable { let images: [ImageRecord] }
private struct ImageUpdateResponse: Decodable { let imageData: ImageRecord }
private struct UploadResponse: Decodable { let image: ImageRecord }
private struct ErrorResponse: Decodable { let error: String }
