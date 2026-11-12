import Foundation
import ImageIO
import UIKit
import UniformTypeIdentifiers

enum ImageImportError: LocalizedError {
    case unsupported, unreadable, encoding
    var errorDescription: String? {
        switch self {
        case .unsupported: "Choose a JPEG, PNG, HEIC, GIF, or WebP image."
        case .unreadable: "This image couldn’t be opened. Try exporting it from Photos or choosing another file."
        case .encoding: "This image couldn’t be prepared. Try choosing another image."
        }
    }
}

/// Owns a private temporary copy; provider URLs can disappear as soon as their callback returns.
final class ImportedImage: Identifiable, @unchecked Sendable {
    let id = UUID()
    let fileURL: URL
    let originalName: String
    private let directory: URL

    private init(directory: URL, fileURL: URL, originalName: String) throws {
        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, nil),
              CGImageSourceGetCount(source) > 0,
              let type = CGImageSourceGetType(source),
              UTType(type as String)?.conforms(to: .image) == true else { throw ImageImportError.unsupported }
        self.directory = directory
        self.fileURL = fileURL
        self.originalName = originalName
    }

    deinit { try? FileManager.default.removeItem(at: directory) }

    static func copyFile(at url: URL, name: String? = nil) throws -> ImportedImage {
        let directory = try makeDirectory()
        do {
            let destination = directory.appendingPathComponent("original")
            try FileManager.default.copyItem(at: url, to: destination)
            return try ImportedImage(directory: directory, fileURL: destination, originalName: cleanName(name ?? url.lastPathComponent))
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    static func fromData(_ data: Data, name: String) throws -> ImportedImage {
        let directory = try makeDirectory()
        do {
            let destination = directory.appendingPathComponent("original")
            try data.write(to: destination, options: [.atomic, .completeFileProtectionUnlessOpen])
            return try ImportedImage(directory: directory, fileURL: destination, originalName: cleanName(name))
        } catch {
            try? FileManager.default.removeItem(at: directory)
            throw error
        }
    }

    static func fromImage(_ image: UIImage, name: String) throws -> ImportedImage {
        guard let data = image.jpegData(compressionQuality: 0.9) else { throw ImageImportError.encoding }
        return try fromData(data, name: name)
    }

    func prepare(scale: Double) throws -> PreparedImage {
        guard let source = CGImageSourceCreateWithURL(fileURL as CFURL, [kCGImageSourceShouldCache: false] as CFDictionary),
              let identifier = CGImageSourceGetType(source),
              let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
              let width = properties[kCGImagePropertyPixelWidth] as? Int,
              let height = properties[kCGImagePropertyPixelHeight] as? Int else { throw ImageImportError.unreadable }
        let orientation = properties[kCGImagePropertyOrientation] as? Int ?? 1
        let rotated = (5...8).contains(orientation)
        let originalWidth = rotated ? height : width
        let originalHeight = rotated ? width : height
        let type = UTType(identifier as String)
        let mime = type?.preferredMIMEType ?? ""
        let keepOriginal = scale >= 1 && ["image/jpeg", "image/png", "image/gif", "image/webp"].contains(mime)
        guard let thumbnail = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: 1000,
            kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary) else { throw ImageImportError.unreadable }
        let preview = UIImage(cgImage: thumbnail)
        if keepOriginal {
            return try PreparedImage(owner: self, fileURL: fileURL, mimeType: mime,
                                     filename: uploadFilename(type: type ?? .jpeg), width: originalWidth,
                                     height: originalHeight, preview: preview, converted: false)
        }

        // Bound decoded memory in the share extension, including 48 MP HEIC photos.
        let maxDimension = max(1, min(4096, Int((Double(max(width, height)) * max(0.01, min(1, scale))).rounded())))
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: maxDimension,
            kCGImageSourceShouldCacheImmediately: true
        ] as CFDictionary) else { throw ImageImportError.unreadable }
        let hasAlpha = [.first, .last, .premultipliedFirst, .premultipliedLast, .alphaOnly].contains(image.alphaInfo)
        let outputType: UTType = (mime == "image/png" || mime == "image/gif" || hasAlpha) ? .png : .jpeg
        let destinationURL = directory.appendingPathComponent(UUID().uuidString).appendingPathExtension(outputType.preferredFilenameExtension!)
        guard let destination = CGImageDestinationCreateWithURL(destinationURL as CFURL, outputType.identifier as CFString, 1, nil) else {
            throw ImageImportError.encoding
        }
        CGImageDestinationAddImage(destination, image, [
            kCGImageDestinationLossyCompressionQuality: 0.85,
            kCGImagePropertyOrientation: 1
        ] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw ImageImportError.encoding }
        return try PreparedImage(owner: self, fileURL: destinationURL, mimeType: outputType.preferredMIMEType!,
                                 filename: uploadFilename(type: outputType), width: image.width, height: image.height,
                                 preview: preview, converted: mime != outputType.preferredMIMEType || maxDimension < max(width, height))
    }

    private func uploadFilename(type: UTType) -> String {
        let stem = (originalName as NSString).deletingPathExtension
        return (stem.isEmpty ? "image" : stem) + "." + (type.preferredFilenameExtension ?? "jpg")
    }

    private static func cleanName(_ name: String) -> String {
        let name = (name as NSString).lastPathComponent.trimmingCharacters(in: .whitespacesAndNewlines)
        return name.isEmpty ? "image" : String(name.prefix(200))
    }

    private static func makeDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ImageSH-" + UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true,
                                              attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
        return url
    }
}

struct PreparedImage: @unchecked Sendable {
    let owner: ImportedImage
    let fileURL: URL
    let mimeType: String
    let filename: String
    let width: Int
    let height: Int
    let preview: UIImage
    let converted: Bool
    let byteCount: Int

    init(owner: ImportedImage, fileURL: URL, mimeType: String, filename: String, width: Int, height: Int,
         preview: UIImage, converted: Bool) throws {
        self.owner = owner; self.fileURL = fileURL; self.mimeType = mimeType; self.filename = filename
        self.width = width; self.height = height; self.preview = preview; self.converted = converted
        self.byteCount = try fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
    }
}

enum ImageImporter {
    static func load(_ provider: NSItemProvider) async throws -> ImportedImage {
        let suggestedName = provider.suggestedName
        if let type = provider.registeredTypeIdentifiers.first(where: { UTType($0)?.conforms(to: .image) == true }) {
            do {
                return try await withCheckedThrowingContinuation { continuation in
                    provider.loadFileRepresentation(forTypeIdentifier: type) { url, error in
                        do {
                            guard let url else { throw error ?? ImageImportError.unreadable }
                            continuation.resume(returning: try ImportedImage.copyFile(at: url, name: suggestedName))
                        } catch { continuation.resume(throwing: error) }
                    }
                }
            } catch {
                // Clipboard providers sometimes expose data without a file representation.
                return try await withCheckedThrowingContinuation { continuation in
                    provider.loadDataRepresentation(forTypeIdentifier: type) { data, error in
                        do {
                            guard let data else { throw error ?? ImageImportError.unreadable }
                            continuation.resume(returning: try ImportedImage.fromData(data, name: suggestedName ?? "image"))
                        } catch { continuation.resume(throwing: error) }
                    }
                }
            }
        }
        if provider.hasItemConformingToTypeIdentifier(UTType.fileURL.identifier) {
            return try await withCheckedThrowingContinuation { continuation in
                provider.loadItem(forTypeIdentifier: UTType.fileURL.identifier) { item, error in
                    do {
                        let url = (item as? URL) ?? (item as? Data).flatMap { URL(dataRepresentation: $0, relativeTo: nil) }
                        guard let url else { throw error ?? ImageImportError.unsupported }
                        let scoped = url.startAccessingSecurityScopedResource()
                        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                        continuation.resume(returning: try ImportedImage.copyFile(at: url))
                    } catch { continuation.resume(throwing: error) }
                }
            }
        }
        throw ImageImportError.unsupported
    }
}

struct MultipartUpload {
    let fileURL: URL
    let contentType: String

    init(image: PreparedImage, name: String, lifetime: Lifetime) throws {
        let boundary = "ImageSH-" + UUID().uuidString
        contentType = "multipart/form-data; boundary=" + boundary
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(boundary + ".multipart")
        fileURL = url
        FileManager.default.createFile(atPath: url.path, contents: nil, attributes: [.protectionKey: FileProtectionType.completeUnlessOpen])
        do {
            let output = try FileHandle(forWritingTo: url)
            defer { try? output.close() }
            func write(_ string: String) throws { try output.write(contentsOf: Data(string.utf8)) }
            for (key, value) in [("expiration", lifetime.rawValue), ("name", name.trimmingCharacters(in: .whitespacesAndNewlines))] {
                try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(key)\"\r\n\r\n\(value)\r\n")
            }
            // Prevent a filename from injecting multipart headers.
            let filename = image.filename.replacingOccurrences(of: "\r", with: "_").replacingOccurrences(of: "\n", with: "_")
                .replacingOccurrences(of: "\"", with: "_").replacingOccurrences(of: "\\", with: "_")
            try write("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(image.mimeType)\r\n\r\n")
            let input = try FileHandle(forReadingFrom: image.fileURL)
            defer { try? input.close() }
            while let chunk = try input.read(upToCount: 64 * 1024), !chunk.isEmpty { try output.write(contentsOf: chunk) }
            try write("\r\n--\(boundary)--\r\n")
        } catch {
            try? FileManager.default.removeItem(at: url)
            throw error
        }
    }
}
