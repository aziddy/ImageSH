import Foundation

enum FileSize {
    /// Decimal units and rounding shared with the web app. API sizes remain exact bytes.
    static func string(_ bytes: Int) -> String {
        let units = ["B", "KB", "MB", "GB", "TB"]
        var value = Double(bytes)
        var unit = 0
        while value >= 1000 && unit < units.count - 1 {
            value /= 1000
            unit += 1
        }
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.numberStyle = .decimal
        formatter.usesGroupingSeparator = false
        formatter.minimumFractionDigits = 0
        formatter.maximumFractionDigits = 2
        formatter.roundingMode = .halfUp
        return "\(formatter.string(from: NSNumber(value: value))!) \(units[unit])"
    }
}
