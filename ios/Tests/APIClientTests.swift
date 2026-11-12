import XCTest
@testable import ImageSH

final class MockURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, [String: String], Data))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, headers, data) = try Self.handler!(request)
            let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil,
                                           headerFields: ["Content-Type": "application/json"].merging(headers) { _, new in new })!
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@MainActor final class MemoryVault: SessionVault {
    var record: SessionRecord?
    func read() throws -> SessionRecord? { record }
    func write(_ record: SessionRecord) throws { self.record = record }
    func clear() throws { record = nil }
}

@MainActor final class APIClientTests: XCTestCase {
    private let origin = URL(string: "https://imagesh.example.com")!

    private func makeClient(vault: MemoryVault) throws -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        return try APIClient(origin: origin, vault: vault, configuration: configuration)
    }

    private func seed(_ vault: MemoryVault) {
        let cookie = HTTPCookie(properties: [.name: "__Secure-next-auth.session-token", .value: "secret", .domain: origin.host!,
                                           .path: "/", .secure: "TRUE", .expires: Date().addingTimeInterval(3600)])!
        vault.record = SessionRecord(origin: origin.absoluteString, cookies: [StoredCookie(cookie)])
    }

    func testLoginUsesCSRFAndPersistsChunkedSessionForExtension() async throws {
        let vault = MemoryVault()
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { request in
            switch request.url!.path {
            case "/api/auth/csrf":
                return (200, ["Set-Cookie": "__Host-next-auth.csrf-token=double-submit; Path=/; Secure; HttpOnly"], Data(#"{"csrfToken":"csrf-value"}"#.utf8))
            case "/api/auth/callback/credentials":
                XCTAssertEqual(request.httpMethod, "POST")
                XCTAssertTrue(request.value(forHTTPHeaderField: "Cookie")!.contains("csrf-token=double-submit"))
                let body = Self.readBody(request)
                let parts = URLComponents(string: "https://form.example/?" + String(decoding: body, as: UTF8.self))!
                let fields = Dictionary(uniqueKeysWithValues: parts.queryItems!.map { ($0.name, $0.value!) })
                XCTAssertEqual(fields["username"], "user+&name")
                XCTAssertEqual(fields["password"], "p+a&ss= word")
                XCTAssertEqual(fields["csrfToken"], "csrf-value")
                XCTAssertEqual(fields["json"], "true")
                return (200, ["Set-Cookie": "__Secure-next-auth.session-token.0=first; Path=/; Secure; HttpOnly, __Secure-next-auth.session-token.1=second; Path=/; Secure; HttpOnly"], Data(#"{"url":"https://imagesh.example.com/admin"}"#.utf8))
            case "/api/auth/session":
                let cookie = request.value(forHTTPHeaderField: "Cookie") ?? ""
                XCTAssertTrue(cookie.contains("session-token.0=first"))
                XCTAssertTrue(cookie.contains("session-token.1=second"))
                return (200, [:], Data(#"{"user":{"id":"1","name":"admin"}}"#.utf8))
            case "/api/admin/images":
                XCTAssertTrue((request.value(forHTTPHeaderField: "Cookie") ?? "").contains("session-token.1=second"))
                return (200, [:], Data(#"{"images":[]}"#.utf8))
            default: throw URLError(.badURL)
            }
        }
        try await client.signIn(username: "user+&name", password: "p+a&ss= word")
        XCTAssertEqual(vault.record?.cookies.count, 2)
        XCTAssertFalse(vault.record!.cookies.contains { $0.name.contains("csrf") })
        let extensionClient = try makeClient(vault: vault)
        let images = try await extensionClient.images()
        XCTAssertTrue(images.isEmpty)
    }

    func testWrongCredentialsNeverLeaveASavedSession() async throws {
        let vault = MemoryVault()
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { request in
            if request.url!.path.hasSuffix("csrf") { return (200, [:], Data(#"{"csrfToken":"token"}"#.utf8)) }
            return (401, [:], Data(#"{"url":"https://imagesh.example.com/login?error=CredentialsSignin"}"#.utf8))
        }
        do { try await client.signIn(username: "bad", password: "bad"); XCTFail("Expected credentials failure") }
        catch { XCTAssertEqual(error as? APIError, .invalidCredentials) }
        XCTAssertNil(vault.record)
    }

    func testAuthRedirectClearsSessionWithoutFollowingLoginPage() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.url!.path, "/api/admin/images")
            return (307, ["Location": "https://imagesh.example.com/login?callbackUrl=admin"], Data())
        }
        do { _ = try await client.images(); XCTFail("Expected expired session") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
        XCTAssertNil(vault.record)
    }

    func testChangingOriginDoesNotSendSavedCredentials() async throws {
        let vault = MemoryVault(); seed(vault)
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MockURLProtocol.self]
        let client = try APIClient(origin: URL(string: "https://other.example.com")!, vault: vault, configuration: configuration)
        MockURLProtocol.handler = { _ in XCTFail("Must not make a request"); throw URLError(.badURL) }
        do { _ = try await client.images(); XCTFail("Expected sign in") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
    }

    func testSignOutClearsSessionEvenWhenOffline() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        do { try await client.signOut() } catch {}
        XCTAssertNil(vault.record)
        XCTAssertFalse(client.hasSession)
    }

    func testOfflineRefreshKeepsSessionForManualRetry() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        do { _ = try await client.images(); XCTFail("Expected connection failure") } catch {}
        XCTAssertNotNil(vault.record)
        XCTAssertTrue(client.hasSession)
    }

    func testEmptySessionResponseRequiresLogin() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { _ in (200, [:], Data("{}".utf8)) }
        do { try await client.validateSession(); XCTFail("Expected expired session") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
        XCTAssertNil(vault.record)
    }

    func testHTMLResponseIsNotMistakenForSuccessfulImageList() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { _ in (200, ["Content-Type": "text/html"], Data("<html>Login</html>".utf8)) }
        do { _ = try await client.images(); XCTFail("Expected invalid response") }
        catch { XCTAssertEqual(error as? APIError, .invalidResponse) }
    }

    func testServerValidationMessageIsShown() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        MockURLProtocol.handler = { _ in (400, [:], Data(#"{"error":"File size exceeds 5MB limit"}"#.utf8)) }
        do { _ = try await client.images(); XCTFail("Expected server error") }
        catch { XCTAssertEqual(error as? APIError, .server("File size exceeds 5MB limit")) }
    }

    func testMetadataMatchesCurrentServerAndExpiration() throws {
        let data = Data(#"{"id":"abc_123-xy","originalName":"photo.jpg","customName":null,"displayName":"photo.jpg","mimeType":"image/jpeg","size":128,"uploadedAt":"2026-11-10T12:00:00.000Z","uploadedBy":"admin","expiresAt":"2026-11-11T12:00:00.000Z"}"#.utf8)
        let image = try ImageJSON.decoder().decode(ImageRecord.self, from: data)
        XCTAssertEqual(image.expiresAt.timeIntervalSince(image.uploadedAt), 86400)
        XCTAssertEqual(image.fractionRemaining(at: image.uploadedAt.addingTimeInterval(43200)), 0.5)
        XCTAssertEqual(image.fractionRemaining(at: image.expiresAt.addingTimeInterval(1)), 0)
    }

    func testLifetimePresetsUseFixedDurationsFromOriginalUpload() {
        // This timestamp crosses the end of daylight saving time in Chicago.
        let uploadedAt = ISO8601DateFormatter().date(from: "2026-11-01T01:30:00-05:00")!
        let durations: [TimeInterval] = [7200, 86400, 259200, 604800, 2592000, 7776000, 15552000, 31536000]
        for (lifetime, expected) in zip(Lifetime.allCases, durations) {
            XCTAssertEqual(lifetime.duration, expected)
            let expiresAt = lifetime.expiration(from: uploadedAt)
            XCTAssertEqual(expiresAt.timeIntervalSince(uploadedAt), expected)
            XCTAssertEqual(Lifetime.matching(uploadedAt: uploadedAt, expiresAt: expiresAt), lifetime)
            XCTAssertEqual(Lifetime.matching(uploadedAt: uploadedAt, expiresAt: expiresAt.addingTimeInterval(0.999)), lifetime)
        }
        XCTAssertNil(Lifetime.matching(uploadedAt: uploadedAt, expiresAt: uploadedAt.addingTimeInterval(2 * 86400)))
        XCTAssertLessThan(Lifetime.oneDay.expiration(from: uploadedAt), uploadedAt.addingTimeInterval(2 * 86400))
    }

    private func lifetimeFixture() throws -> ImageRecord {
        try ImageJSON.decoder().decode(ImageRecord.self, from: Data(#"{"id":"abc_123-xy","originalName":"photo.jpg","customName":null,"displayName":"photo.jpg","mimeType":"image/jpeg","size":128,"uploadedAt":"2026-11-10T12:00:00.000Z","uploadedBy":"admin","expiresAt":"2026-11-17T12:00:00.000Z"}"#.utf8))
    }

    func testChangingLifetimeSendsPresetAndDecodesUpdatedImageWithoutChangingLink() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        let image = try lifetimeFixture()
        let encoder = JSONEncoder(); encoder.dateEncodingStrategy = .iso8601
        var responseImage = try JSONSerialization.jsonObject(with: encoder.encode(image)) as! [String: Any]
        responseImage["expiresAt"] = "2026-12-10T12:00:00.000Z"
        let response = try JSONSerialization.data(withJSONObject: ["success": true, "imageData": responseImage])
        MockURLProtocol.handler = { request in
            XCTAssertEqual(request.url!.path, "/api/admin/images/abc_123-xy")
            XCTAssertEqual(request.httpMethod, "PATCH")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Content-Type"), "application/json")
            XCTAssertEqual(try JSONDecoder().decode([String: String].self, from: Self.readBody(request)), ["expiration": "1m"])
            return (200, [:], response)
        }
        let updated = try await client.changeLifetime(image, to: .oneMonth)
        XCTAssertEqual(updated.uploadedAt, image.uploadedAt)
        XCTAssertEqual(updated.expiresAt, Lifetime.oneMonth.expiration(from: image.uploadedAt))
        XCTAssertEqual(updated.id, image.id)
        XCTAssertEqual(updated.size, image.size)
        XCTAssertEqual(client.shareURL(for: updated), client.shareURL(for: image))
    }

    func testChangingLifetimeSurfacesValidationAndExpiredImageErrors() async throws {
        for (status, expected) in [(400, APIError.server("Choose a lifetime that expires in the future.")), (404, .notFound), (401, .unauthenticated)] {
            let vault = MemoryVault(); seed(vault)
            let client = try makeClient(vault: vault)
            MockURLProtocol.handler = { _ in
                (status, [:], Data(#"{"error":"Choose a lifetime that expires in the future."}"#.utf8))
            }
            do { _ = try await client.changeLifetime(lifetimeFixture(), to: .twoHours); XCTFail("Expected update failure") }
            catch { XCTAssertEqual(error as? APIError, expected) }
            XCTAssertEqual(client.hasSession, status != 401)
        }
    }

    func testServerAddressRequiresHTTPSAndRootOrigin() throws {
        XCTAssertEqual(try AppConfiguration.serverURL(from: " https://imagesh.alexzidros.com/ ").absoluteString, "https://imagesh.alexzidros.com")
        XCTAssertEqual(try AppConfiguration.serverURL(from: "imagesh.alexzidros.com").scheme, "https")
        for address in ["http://example.com", "https://user:secret@example.com", "https://example.com/admin", "https://example.com?token=secret"] {
            XCTAssertThrowsError(try AppConfiguration.serverURL(from: address))
        }
    }

    func testCookieIsBoundToOriginPathAndExpiry() {
        let cookie = HTTPCookie(properties: [.name: "next-auth.session-token", .value: "secret", .domain: origin.host!,
                                           .path: "/api", .secure: "TRUE", .expires: Date().addingTimeInterval(3600)])!
        let item = StoredCookie(cookie)
        XCTAssertTrue(item.matches(origin.appendingPathComponent("api/admin/images")))
        XCTAssertFalse(item.matches(origin.appendingPathComponent("apiculture")))
        XCTAssertFalse(item.matches(URL(string: "https://evil.example.com/api")!))
        XCTAssertFalse(item.matches(URL(string: "http://imagesh.example.com/api")!))
        XCTAssertFalse(item.matches(origin.appendingPathComponent("api"), now: Date().addingTimeInterval(7200)))
    }

    func testInFlightExtensionResponseCannotRestoreSignedOutSession() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        let started = expectation(description: "Request started")
        let gate = DispatchSemaphore(value: 0)
        MockURLProtocol.handler = { _ in
            started.fulfill()
            _ = gate.wait(timeout: .now() + 5)
            return (200, [:], Data(#"{"images":[]}"#.utf8))
        }
        let task = Task { try await client.images() }
        await fulfillment(of: [started], timeout: 3)
        try vault.clear()
        gate.signal()
        do { _ = try await task.value; XCTFail("Expected stale session rejection") }
        catch { XCTAssertEqual(error as? APIError, .unauthenticated) }
        XCTAssertNil(vault.record)
    }

    func testOldClientCannotClearNewLogin() async throws {
        let vault = MemoryVault(); seed(vault)
        let client = try makeClient(vault: vault)
        seed(vault)
        let newSessionID = vault.record!.id
        try client.clearSession()
        XCTAssertEqual(vault.record?.id, newSessionID)
    }

    func testActualSharedKeychainCanPersistReadAndClearSession() throws {
        // A unique service never changes the user's real session, even on a device.
        let service = "com.alexzidros.imagesh.tests." + UUID().uuidString
        let store = KeychainSessionStore(service: service)
        defer { try? store.clear() }
        let vault = MemoryVault(); seed(vault)
        try store.write(vault.record!)
        let secondInstance = KeychainSessionStore(service: service)
        XCTAssertEqual(try secondInstance.read()?.cookies, vault.record?.cookies)
        XCTAssertEqual(try secondInstance.read()?.id, vault.record?.id)
        try store.clear()
        XCTAssertNil(try store.read())
    }

    nonisolated private static func readBody(_ request: URLRequest) -> Data {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return Data() }
        stream.open(); defer { stream.close() }
        var result = Data(), bytes = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&bytes, maxLength: bytes.count)
            if count <= 0 { break }
            result.append(contentsOf: bytes.prefix(count))
        }
        return result
    }
}
