import SwiftUI

enum AppTheme {
    static let brandGreen = Color(red: 0.13, green: 0.54, blue: 0.26)
    static let brandDarkGreen = Color(red: 0.06, green: 0.30, blue: 0.14)
    static let brandGold = Color(red: 0.80, green: 0.68, blue: 0.28)
    static let brandEarth = Color(red: 0.42, green: 0.32, blue: 0.18)

    static let heroGradient = LinearGradient(
        colors: [
            Color(red: 0.04, green: 0.18, blue: 0.08),
            Color(red: 0.08, green: 0.32, blue: 0.14),
            Color(red: 0.13, green: 0.54, blue: 0.26)
        ],
        startPoint: .topLeading,
        endPoint: .bottomTrailing
    )

    static var meshBackground: some View {
        MeshGradient(
            width: 3, height: 3,
            points: [
                [0.0, 0.0], [0.5, 0.0], [1.0, 0.0],
                [0.0, 0.5], [0.5, 0.5], [1.0, 0.5],
                [0.0, 1.0], [0.5, 1.0], [1.0, 1.0]
            ],
            colors: [
                Color(red: 0.03, green: 0.12, blue: 0.05),
                Color(red: 0.06, green: 0.22, blue: 0.10),
                Color(red: 0.04, green: 0.16, blue: 0.07),
                Color(red: 0.08, green: 0.28, blue: 0.12),
                Color(red: 0.13, green: 0.42, blue: 0.20),
                Color(red: 0.10, green: 0.34, blue: 0.16),
                Color(red: 0.05, green: 0.18, blue: 0.08),
                Color(red: 0.08, green: 0.26, blue: 0.12),
                Color(red: 0.04, green: 0.14, blue: 0.06)
            ]
        )
        .ignoresSafeArea()
    }
}

struct PremiumCardModifier: ViewModifier {
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(.rect(cornerRadius: 16))
            .shadow(color: .black.opacity(0.08), radius: 12, y: 6)
    }
}

extension View {
    func premiumCard(padding: CGFloat = 16) -> some View {
        modifier(PremiumCardModifier(padding: padding))
    }
}
