import XCTest

final class ImageSHUITests: XCTestCase {
    override func setUp() { continueAfterFailure = false }
    func testOnboardingAndInvalidServerValidation() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-ImageSHUITesting", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launch()
        let server = app.textFields["serverAddress"]
        XCTAssertTrue(server.waitForExistence(timeout: 10))
        XCTAssertEqual(server.value as? String, "https://imagesh.alexzidros.com")
        XCTAssertFalse(app.buttons["signInButton"].isEnabled)
        server.tap()
        server.press(forDuration: 1)
        if app.menuItems["Select All"].waitForExistence(timeout: 2) { app.menuItems["Select All"].tap() }
        else { server.doubleTap(); if app.menuItems["Select All"].exists { app.menuItems["Select All"].tap() } }
        // The hardware keyboard shortcut works in simulator even if the edit menu differs by iOS.
        server.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: 100))
        server.typeText("http://example.com")
        app.textFields["username"].tap()
        app.textFields["username"].typeText("test")
        app.secureTextFields["password"].tap()
        app.secureTextFields["password"].typeText("test")
        app.swipeUp()
        app.buttons["signInButton"].tap()
        XCTAssertTrue(app.staticTexts["loginError"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["loginError"].label.contains("HTTPS"))
    }

    func testOptionalBackendUploadAndPhotosShare() throws {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 2
        let probe = BackendProbeResult()
        let completed = DispatchSemaphore(value: 0)
        URLSession(configuration: configuration).dataTask(with: URL(string: "https://localhost:3443/api/auth/providers")!) { _, _, error in
            probe.error = error
            completed.signal()
        }.resume()
        guard completed.wait(timeout: .now() + 4) == .success else { throw XCTSkip("Local integration backend did not respond") }
        if let error = probe.error as? URLError, [.cannotConnectToHost, .notConnectedToInternet].contains(error.code) {
            throw XCTSkip("Optional local integration backend is not running")
        }
        if let error = probe.error { throw error }
        let app = XCUIApplication()
        app.launchArguments = ["-ImageSHUITesting", "-AppleLanguages", "(en)", "-AppleLocale", "en_US"]
        app.launchEnvironment["IMAGESH_TEST_SERVER"] = "https://localhost:3443"
        #if targetEnvironment(simulator)
        app.resetAuthorizationStatus(for: .camera)
        #endif
        app.launch()
        let server = app.textFields["serverAddress"]
        XCTAssertTrue(server.waitForExistence(timeout: 10))
        XCTAssertEqual(server.value as? String, "https://localhost:3443")
        app.textFields["username"].tap(); app.textFields["username"].typeText("ios-qa")
        app.secureTextFields["password"].tap(); app.secureTextFields["password"].typeText("imagesh-integration-only")
        app.swipeUp(); app.buttons["signInButton"].tap()
        XCTAssertTrue(app.buttons["Upload image"].waitForExistence(timeout: 20), app.debugDescription)
        if app.buttons["Not Now"].waitForExistence(timeout: 2) { app.buttons["Not Now"].tap() }
        app.launchArguments = []
        let upload = app.buttons["Upload image"]
        let ready = XCTNSPredicateExpectation(predicate: NSPredicate(format: "hittable == true"), object: upload)
        XCTAssertEqual(XCTWaiter.wait(for: [ready], timeout: 5), .completed)
        upload.tap()
        if app.buttons["Not Now"].exists { app.buttons["Not Now"].tap() }
        let choosePhotos = app.buttons["Choose from Photos"]
        if !choosePhotos.waitForExistence(timeout: 3), upload.exists { upload.tap() }
        XCTAssertTrue(choosePhotos.waitForExistence(timeout: 5), app.debugDescription)
        let takePhoto = app.buttons["Take a Photo"]
        XCTAssertTrue(takePhoto.exists, app.debugDescription)
        capture(app, name: "Upload sources with camera")
        #if targetEnvironment(simulator)
        let cameraPermission = addUIInterruptionMonitor(withDescription: "Camera access") { alert in
            let deny = alert.buttons["Don’t Allow"].exists ? alert.buttons["Don’t Allow"] : alert.buttons["Don't Allow"]
            guard deny.exists else { return false }
            deny.tap()
            return true
        }
        takePhoto.tap()
        app.tap() // Let XCTest handle the system permission interruption.
        let settings = app.alerts["Allow Camera Access"]
        if settings.waitForExistence(timeout: 5) {
            XCTAssertTrue(settings.buttons["Open Settings"].isEnabled)
            settings.buttons["Cancel"].tap()
            takePhoto.tap()
            XCTAssertTrue(settings.waitForExistence(timeout: 5), app.debugDescription)
            settings.buttons["Cancel"].tap()
        } else {
            XCTAssertTrue(app.staticTexts["The camera is unavailable on this device. Choose an image from Photos or Files instead."]
                .waitForExistence(timeout: 5), app.debugDescription)
        }
        removeUIInterruptionMonitor(cameraPermission)
        #endif
        choosePhotos.tap()
        let photo = app.images.matching(NSPredicate(format: "label BEGINSWITH[c] 'Photo,'")).firstMatch
        XCTAssertTrue(photo.waitForExistence(timeout: 10), app.debugDescription)
        // The remote Photos picker can report a visible image as non-hittable to XCTest.
        photo.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        let name = "Native upload QA " + UUID().uuidString.prefix(6)
        let sharedName = "Shared upload QA " + UUID().uuidString.prefix(6)
        XCTAssertTrue(app.textFields["uploadName"].waitForExistence(timeout: 15), app.debugDescription)
        app.textFields["uploadName"].tap(); app.textFields["uploadName"].typeText(name + "\n")
        app.swipeUp()
        app.buttons["uploadButton"].tap()
        XCTAssertTrue(app.staticTexts["Ready to share"].waitForExistence(timeout: 20), app.debugDescription)
        capture(app, name: "Native upload and QR code")
        app.buttons["Done"].tap()

        // Exercise the actual share extension hosted by Photos, including its shared login.
        let photos = XCUIApplication(bundleIdentifier: "com.apple.mobileslideshow")
        photos.launch()
        if photos.buttons["Continue"].waitForExistence(timeout: 3) { photos.buttons["Continue"].tap() }
        let shareButton = photos.buttons["Share"].firstMatch
        if !shareButton.exists {
            if photos.buttons["Library"].exists { photos.buttons["Library"].tap() }
            let picture = photos.images.matching(NSPredicate(format: "label BEGINSWITH[c] 'Photo,'")).firstMatch
            XCTAssertTrue(picture.waitForExistence(timeout: 5), photos.debugDescription)
            picture.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        XCTAssertTrue(shareButton.waitForExistence(timeout: 5), photos.debugDescription)
        shareButton.tap()
        let extensionCell = photos.cells["ImageSH"]
        if !extensionCell.waitForExistence(timeout: 3) {
            let more = photos.cells.matching(identifier: "More").allElementsBoundByIndex.first { $0.isHittable }
            XCTAssertNotNil(more, photos.debugDescription)
            more?.tap()
        }
        XCTAssertTrue(extensionCell.waitForExistence(timeout: 5), photos.debugDescription)
        extensionCell.tap()
        let extensionName = photos.textFields["uploadName"]
        XCTAssertTrue(extensionName.waitForExistence(timeout: 15), photos.debugDescription)
        extensionName.tap(); extensionName.typeText(sharedName + "\n")
        photos.swipeUp(); photos.buttons["uploadButton"].tap()
        XCTAssertTrue(photos.staticTexts["Ready to share"].waitForExistence(timeout: 20), photos.debugDescription)
        capture(photos, name: "Photos share extension uploaded")
        photos.buttons["Done"].tap()

        app.activate()
        for imageName in [name, sharedName] {
            let menu = app.buttons["More actions for \(imageName)"]
            XCTAssertTrue(menu.waitForExistence(timeout: 10), app.debugDescription)
            menu.tap(); app.buttons["Delete"].tap(); app.buttons["Delete image"].tap()
        }
        app.buttons["Settings"].tap(); app.buttons["Sign out"].tap()
        XCTAssertTrue(app.textFields["username"].waitForExistence(timeout: 10))
    }

    private func capture(_ app: XCUIApplication, name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name; attachment.lifetime = .keepAlways
        add(attachment)
    }
}

// The semaphore above synchronizes the callback write with the test's read.
private final class BackendProbeResult: @unchecked Sendable { var error: Error? }
