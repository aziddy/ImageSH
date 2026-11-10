import XCTest
import ImageIO
import UniformTypeIdentifiers
@testable import ImageSH

final class ImagePreparationTests: XCTestCase {
    private func fixture(type: UTType = .png, orientation: Int = 1, alpha: Bool = false) throws -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1; format.opaque = !alpha
        let image = UIGraphicsImageRenderer(size: CGSize(width: 80, height: 40), format: format).image { context in
            UIColor.red.withAlphaComponent(alpha ? 0.5 : 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 80, height: 40))
        }
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data, type.identifier as CFString, 1, nil) else {
            throw XCTSkip("Encoder is unavailable for \(type.identifier)")
        }
        CGImageDestinationAddImage(destination, image.cgImage!, [kCGImagePropertyOrientation: orientation] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw XCTSkip("Encoder could not create fixture") }
        return data as Data
    }

    func testHEICBecomesServerCompatibleJPEG() throws {
        let image = try ImportedImage.fromData(fixture(type: .heic), name: "IMG_1001.HEIC")
        let prepared = try image.prepare(scale: 1)
        XCTAssertEqual(prepared.mimeType, "image/jpeg")
        XCTAssertTrue(prepared.filename.hasSuffix(".jpg") || prepared.filename.hasSuffix(".jpeg"))
        XCTAssertEqual(prepared.width, 80)
        XCTAssertTrue(prepared.converted)
        XCTAssertGreaterThan(prepared.byteCount, 0)
    }

    func testPNGResizingPreservesTransparency() throws {
        let image = try ImportedImage.fromData(fixture(alpha: true), name: "transparent.png")
        let prepared = try image.prepare(scale: 0.5)
        XCTAssertEqual(prepared.mimeType, "image/png")
        XCTAssertEqual(prepared.width, 40)
        XCTAssertEqual(prepared.height, 20)
        let source = CGImageSourceCreateWithURL(prepared.fileURL as CFURL, nil)!
        let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)!
        XCTAssertTrue([CGImageAlphaInfo.premultipliedFirst, .premultipliedLast, .first, .last].contains(cgImage.alphaInfo))
    }

    func testJPEGOrientationIsAppliedWhenResizing() throws {
        let image = try ImportedImage.fromData(fixture(type: .jpeg, orientation: 6), name: "rotated.jpg")
        let original = try image.prepare(scale: 1)
        XCTAssertEqual(original.width, 40)
        XCTAssertEqual(original.height, 80)
        let resized = try image.prepare(scale: 0.5)
        XCTAssertEqual(resized.width, 20)
        XCTAssertEqual(resized.height, 40)
        let source = CGImageSourceCreateWithURL(resized.fileURL as CFURL, nil)!
        let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as! [CFString: Any]
        XCTAssertEqual(properties[kCGImagePropertyOrientation] as? Int ?? 1, 1)
    }

    func testFullSizeJPEGIsNotReencoded() throws {
        let data = try fixture(type: .jpeg)
        let image = try ImportedImage.fromData(data, name: "photo.jpg")
        let prepared = try image.prepare(scale: 1)
        XCTAssertEqual(try Data(contentsOf: prepared.fileURL), data)
        XCTAssertFalse(prepared.converted)
    }

    func testUnsupportedFileIsRejected() {
        XCTAssertThrowsError(try ImportedImage.fromData(Data("not an image".utf8), name: "fake.png"))
    }

    func testTemporaryFilesAreCleanedAfterLastOwnerIsReleased() throws {
        var image: ImportedImage? = try ImportedImage.fromData(fixture(), name: "test.png")
        let directory = image!.fileURL.deletingLastPathComponent()
        var prepared: PreparedImage? = try image!.prepare(scale: 0.5)
        image = nil
        XCTAssertTrue(FileManager.default.fileExists(atPath: directory.path))
        XCTAssertGreaterThan(prepared!.byteCount, 0)
        prepared = nil
        XCTAssertFalse(FileManager.default.fileExists(atPath: directory.path))
    }

    func testMultipartContainsBinaryAndEscapesFilename() throws {
        let data = try fixture()
        let image = try ImportedImage.fromData(data, name: "evil\"\r\nheader.png")
        let prepared = try image.prepare(scale: 1)
        let body = try MultipartUpload(image: prepared, name: "  Holiday photo  ", lifetime: .sevenDays)
        defer { try? FileManager.default.removeItem(at: body.fileURL) }
        let bytes = try Data(contentsOf: body.fileURL)
        XCTAssertNotNil(bytes.range(of: data))
        let text = String(decoding: bytes, as: UTF8.self)
        XCTAssertTrue(text.contains("name=\"expiration\"\r\n\r\n7d\r\n"))
        XCTAssertTrue(text.contains("name=\"name\"\r\n\r\nHoliday photo\r\n"))
        XCTAssertFalse(text.contains("filename=\"evil\"\r\n"))
        XCTAssertTrue(text.contains("Content-Type: image/png"))
    }
}
