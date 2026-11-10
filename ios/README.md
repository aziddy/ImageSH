# ImageSH for iPhone

Native SwiftUI app and Photos share extension for the existing ImageSH server. Requires iOS 17 or later. No server changes or third-party iOS packages are needed.

## First launch

The server address defaults to **https://imagesh.alexzidros.com**. Sign in with the same admin username and password as the website. You can change servers in Settings.

Upload a single image from Photos, Files, or the Paste button. Choose a name and expiration, optionally reduce the size, then upload. The link is copied after a successful upload; you can also share it or display its QR code. The library supports sorting, previewing, renaming, and deleting images.

After signing in once, open Photos, select one image, tap **Share**, and choose **ImageSH**. If it is not visible, use **More** to enable it. The extension uses the app's existing login and server settings.

HEIC images are converted to JPEG. Resized PNGs preserve transparency. Converted/resized images are limited to 4096 pixels on the longest side to keep sharing reliable on large iPhone photos. Original JPEG, PNG, GIF, and WebP uploads are passed through at 100% scale; the server applies its existing processing, including flattening GIFs. The app checks a 10 MB upload limit and displays any additional server validation errors.

Uploads run while the editor is open. Failed uploads remain available for manual retry; there is no background queue. If a connection fails after sending the image, check the library before retrying because the server may have completed the upload.

## Build and sign

Open [ImageSH.xcodeproj](ImageSH.xcodeproj) in Xcode. Select the **ImageSH** scheme and your iPhone, then Run. Both targets use automatic signing with the existing paid team **Alexandros Zidros (`9JR2GW6CWR`)**.

| Target | Bundle identifier |
| --- | --- |
| App | `com.alexzidros.imagesh` |
| Share extension | `com.alexzidros.imagesh.share` |

Both targets use App Group `group.com.alexzidros.imagesh` and Keychain access group `9JR2GW6CWR.com.alexzidros.imagesh.shared`. The App Group stores the server setting. Only session cookies are saved in Keychain, scoped to their server; the password is never persisted. Changing servers or signing out clears the shared session. Session IDs prevent an older extension response from restoring a cleared login.

From this directory, build and install on Alex iPhone 14 Pro:

```sh
xcodebuild -project ImageSH.xcodeproj -scheme ImageSH \
  -configuration Debug -destination 'platform=iOS,name=Alex iPhone 14 Pro' \
  -derivedDataPath .build/device -allowProvisioningUpdates build

xcrun devicectl device install app --device 'Alex iPhone 14 Pro' \
  .build/device/Build/Products/Debug-iphoneos/ImageSH.app

xcrun devicectl device process launch --device 'Alex iPhone 14 Pro' \
  com.alexzidros.imagesh
```

The checked-in Xcode project can be used directly. If changing targets or build settings, edit `project.yml` and run `xcodegen generate` (XcodeGen 2.44+). To redraw the icon from the existing favicon motif, run `swift scripts/generate-icon.swift`.

## Tests

Choose an available simulator with `xcrun simctl list devices available`, then:

```sh
xcodebuild -project ImageSH.xcodeproj -scheme ImageSH \
  -destination 'platform=iOS Simulator,id=YOUR_SIMULATOR_UDID' \
  -derivedDataPath .build/simulator -parallel-testing-enabled NO test
```

Keep the default simulator code signing enabled: the shared Keychain tests require the signed entitlements. Tests cover credentials/CSRF, chunked session cookies, expiry and logout, cross-server isolation, stale extension responses, actual Keychain access, image conversion/orientation/transparency, multipart encoding, and onboarding validation. Network tests use an injected URL protocol and never send test credentials to production.

### Optional real-backend integration test

`BackendIntegrationTests` exercises the real NextAuth and image routes against a disposable local Redis. It skips when the local test server is absent. It creates, renames, fetches, and deletes only its own temporary image. The test server overrides all credentials and Redis settings; it does not use production or `.env.local` credentials.

From the repository root, with Docker running:

```sh
docker run --rm -d --name imagesh-ios-integration \
  -p 127.0.0.1:16384:6379 redis:7-alpine \
  redis-server --appendonly no --save '' --requirepass imagesh-integration-only

node ios/scripts/integration-server.mjs
```

In another terminal, trust the temporary certificate in the selected booted simulator, then run the tests:

```sh
xcrun simctl keychain YOUR_SIMULATOR_UDID add-root-cert ios/.build/integration/localhost-cert.pem
xcrun simctl addmedia YOUR_SIMULATOR_UDID src/test-fixtures/images/1.png
```

Stop the Node process and run `docker stop imagesh-ios-integration` afterward. The self-signed certificate and private key are generated under ignored `.build/`, expire after one day, and are used only for localhost. No TLS exceptions are added to the app.

The optional UI integration test signs in to that local server, uploads the seeded photo, uploads another through Photos → Share → ImageSH, and deletes both images. It also skips when the local server is absent.

This setup is for direct device installation. TestFlight and App Store distribution require a separate distribution archive and submission.
