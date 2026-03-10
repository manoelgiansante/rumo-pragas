import Foundation

enum DateFormatUtility {
    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private static let isoFallback = ISO8601DateFormatter()

    private static let shortFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "dd/MM"
        return f
    }()

    private static let mediumFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateStyle = .medium
        f.timeStyle = .short
        f.locale = Locale(identifier: "pt_BR")
        return f
    }()

    static func parse(_ dateString: String) -> Date? {
        isoFormatter.date(from: dateString) ?? isoFallback.date(from: dateString)
    }

    static func shortDate(_ dateString: String) -> String {
        guard let date = parse(dateString) else { return "" }
        return shortFormatter.string(from: date)
    }

    static func mediumDate(_ dateString: String) -> String {
        guard let date = parse(dateString) else { return dateString }
        return mediumFormatter.string(from: date)
    }
}
