import Foundation

enum Lifetime: String, CaseIterable, Identifiable, Codable {
    case twoHours = "2h", oneDay = "1d", threeDays = "3d", sevenDays = "7d"
    case oneMonth = "1m", threeMonths = "3m", sixMonths = "6m", oneYear = "1y"
    var id: String { rawValue }
    var label: String {
        switch self {
        case .twoHours: "2 hours"
        case .oneDay: "1 day"
        case .threeDays: "3 days"
        case .sevenDays: "7 days"
        case .oneMonth: "1 month"
        case .threeMonths: "3 months"
        case .sixMonths: "6 months"
        case .oneYear: "1 year"
        }
    }
}

struct ImageRecord: Codable, Identifiable, Equatable {
    let id: String
    let originalName: String
    var customName: String?
    var displayName: String
    let mimeType: String
    let size: Int
    let uploadedAt: Date
    let uploadedBy: String
    let expiresAt: Date

    func fractionRemaining(at date: Date) -> Double {
        let total = max(1, expiresAt.timeIntervalSince(uploadedAt))
        return min(1, max(0, expiresAt.timeIntervalSince(date) / total))
    }
}

enum APIError: LocalizedError, Equatable {
    case invalidServer, invalidCredentials, unauthenticated, notFound, invalidResponse
    case server(String), tooLarge, storage(String)

    var errorDescription: String? {
        switch self {
        case .invalidServer: "Enter an HTTPS server address, such as https://imagesh.alexzidros.com."
        case .invalidCredentials: "That username and password don’t match. Check them and try again."
        case .unauthenticated: "Your session has expired. Open ImageSH and sign in again."
        case .notFound: "This image has expired or was deleted."
        case .invalidResponse: "The server returned an unexpected response. Check the server address and try again."
        case .server(let message): message
        case .tooLarge: "This image is over 10 MB. Reduce its size before uploading."
        case .storage(let message): "Couldn’t save your login securely. \(message)"
        }
    }
}

enum ImageJSON {
    static func decoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let text = try decoder.singleValueContainer().decode(String.self)
            let formatter = ISO8601DateFormatter()
            formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            if let date = formatter.date(from: text) { return date }
            formatter.formatOptions = [.withInternetDateTime]
            if let date = formatter.date(from: text) { return date }
            throw DecodingError.dataCorrupted(.init(codingPath: decoder.codingPath, debugDescription: "Invalid date"))
        }
        return decoder
    }
}
