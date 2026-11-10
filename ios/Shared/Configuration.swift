import Foundation

enum AppConfiguration {
    static let appGroup = "group.com.alexzidros.imagesh"
    static let defaultServer = "https://imagesh.alexzidros.com"
    static let maxUploadBytes = 10 * 1024 * 1024
    static let defaults = UserDefaults(suiteName: appGroup) ?? .standard

    static var serverAddress: String {
        get { defaults.string(forKey: "serverAddress") ?? defaultServer }
        set { defaults.set(newValue, forKey: "serverAddress") }
    }

    static func serverURL(from text: String) throws -> URL {
        let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        let address = text.contains("://") ? text : "https://" + text
        guard var parts = URLComponents(string: address),
              parts.scheme?.lowercased() == "https",
              let host = parts.host, !host.isEmpty,
              parts.user == nil, parts.password == nil,
              parts.query == nil, parts.fragment == nil,
              parts.path.isEmpty || parts.path == "/" else {
            throw APIError.invalidServer
        }
        parts.scheme = "https"
        parts.host = host.lowercased()
        parts.path = ""
        guard let url = parts.url else { throw APIError.invalidServer }
        return url
    }
}
