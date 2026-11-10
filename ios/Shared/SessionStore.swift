import Foundation
import Security

struct StoredCookie: Codable, Equatable {
    let name: String
    let value: String
    let domain: String
    let path: String
    let secure: Bool
    let expires: Date?

    init(_ cookie: HTTPCookie) {
        name = cookie.name; value = cookie.value; domain = cookie.domain
        path = cookie.path; secure = cookie.isSecure; expires = cookie.expiresDate
    }

    var isSession: Bool {
        ["next-auth.session-token", "__Secure-next-auth.session-token"].contains {
            name == $0 || name.hasPrefix($0 + ".")
        }
    }

    func matches(_ url: URL, now: Date = Date()) -> Bool {
        let host = url.host?.lowercased() ?? ""
        let cookieHost = domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let requestPath = url.path.isEmpty ? "/" : url.path
        let pathMatches = requestPath == path || (requestPath.hasPrefix(path) && (path.hasSuffix("/") || requestPath.dropFirst(path.count).hasPrefix("/")))
        return host == cookieHost && pathMatches && (!secure || url.scheme == "https") && (expires == nil || expires! > now)
    }
}

struct SessionRecord: Codable {
    let id: UUID
    let origin: String
    let cookies: [StoredCookie]

    init(origin: String, cookies: [StoredCookie], id: UUID = UUID()) {
        self.id = id; self.origin = origin; self.cookies = cookies
    }
}

@MainActor protocol SessionVault {
    func read() throws -> SessionRecord?
    func write(_ record: SessionRecord) throws
    func clear() throws
}

@MainActor final class KeychainSessionStore: SessionVault {
    private let service: String

    init(service: String = "com.alexzidros.imagesh.session") { self.service = service }

    private var query: [String: Any] {
        var query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: "primary"
        ]
        if let group = Bundle.main.object(forInfoDictionaryKey: "SharedKeychainAccessGroup") as? String,
           !group.contains("$("), !group.isEmpty {
            query[kSecAttrAccessGroup as String] = group
        }
        return query
    }

    func read() throws -> SessionRecord? {
        var request = query
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        try check(status)
        guard let data = result as? Data else { throw APIError.storage("Unreadable session.") }
        do { return try JSONDecoder().decode(SessionRecord.self, from: data) }
        catch { try clear(); return nil }
    }

    func write(_ record: SessionRecord) throws {
        let data = try JSONEncoder().encode(record)
        let update = [kSecValueData as String: data]
        let status = SecItemUpdate(query as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var item = query
            item[kSecValueData as String] = data
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            try check(SecItemAdd(item as CFDictionary, nil))
        } else { try check(status) }
    }

    func clear() throws {
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecItemNotFound { try check(status) }
    }

    private func check(_ status: OSStatus) throws {
        guard status == errSecSuccess else {
            throw APIError.storage(SecCopyErrorMessageString(status, nil) as String? ?? "Keychain error \(status).")
        }
    }
}
