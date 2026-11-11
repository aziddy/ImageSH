import XCTest
@testable import ImageSH

/// Optional: run ios/scripts/integration-server.mjs and trust its certificate in the simulator first.
@MainActor final class BackendIntegrationTests: XCTestCase {
    func testRealNextAuthAndImageLifecycle() async throws {
        let origin = URL(string: "https://localhost:3443")!
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 3
        let probe = URLSession(configuration: configuration)
        do {
            let (_, response) = try await probe.data(from: origin.appendingPathComponent("api/auth/providers"))
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
        } catch let error as URLError where [.cannotConnectToHost, .notConnectedToInternet].contains(error.code) {
            throw XCTSkip("Optional local integration backend is not running")
        }

        let client = try APIClient(origin: origin, vault: MemoryVault())
        try await client.signIn(username: "ios-qa", password: "imagesh-integration-only")
        let bitmap = UIGraphicsImageRenderer(size: CGSize(width: 32, height: 16)).image { context in
            UIColor.systemTeal.setFill(); context.fill(CGRect(x: 0, y: 0, width: 32, height: 16))
        }
        let imported = try ImportedImage.fromData(bitmap.pngData()!, name: "ios-integration.png")
        let prepared = try imported.prepare(scale: 1)
        var uploaded: ImageRecord?
        do {
            let image = try await client.upload(prepared, name: "iOS integration", lifetime: .twoHours) { _ in }
            uploaded = image
            XCTAssertEqual(image.displayName, "iOS integration")
            XCTAssertEqual(image.expiresAt.timeIntervalSince(image.uploadedAt), 7200, accuracy: 1)
            let images = try await client.images()
            XCTAssertTrue(images.contains { $0.id == image.id })
            let renamed = try await client.rename(image, to: "Renamed from iOS")
            XCTAssertEqual(renamed.displayName, "Renamed from iOS")
            XCTAssertEqual(renamed.expiresAt, image.expiresAt)
            let request = URLRequest(url: client.imageURL(for: image), cachePolicy: .reloadIgnoringLocalCacheData)
            let (data, response) = try await probe.data(for: request)
            XCTAssertEqual((response as? HTTPURLResponse)?.statusCode, 200)
            XCTAssertEqual(response.mimeType, "image/png")
            XCTAssertFalse(data.isEmpty)
            XCTAssertEqual(data.count, image.size)
            XCTAssertEqual((response as? HTTPURLResponse)?.value(forHTTPHeaderField: "Content-Length"), String(data.count))
            XCTAssertEqual(images.first { $0.id == image.id }?.size, data.count)
            XCTAssertEqual(renamed.size, data.count)
            try await client.delete(image)
            uploaded = nil
            let (_, missing) = try await probe.data(for: request)
            XCTAssertEqual((missing as? HTTPURLResponse)?.statusCode, 404)
            let remaining = try await client.images()
            XCTAssertFalse(remaining.contains { $0.id == image.id })
            try await client.signOut()
            XCTAssertFalse(client.hasSession)
        } catch {
            if let uploaded { try? await client.delete(uploaded) }
            try? await client.signOut()
            throw error
        }
    }
}
