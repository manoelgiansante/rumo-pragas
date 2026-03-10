import SwiftUI

struct DiagnosisCardView: View {
    let diagnosis: DiagnosisResult

    var body: some View {
        HStack(spacing: 14) {
            ZStack {
                RoundedRectangle(cornerRadius: 14)
                    .fill(
                        LinearGradient(
                            colors: [
                                diagnosis.severityLevel.color.opacity(0.15),
                                diagnosis.severityLevel.color.opacity(0.05)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 56, height: 56)
                Image(systemName: diagnosis.isHealthy ? "checkmark.circle.fill" : diagnosis.severityLevel.icon)
                    .font(.title3)
                    .foregroundStyle(diagnosis.isHealthy ? AppTheme.accent : diagnosis.severityLevel.color)
            }

            VStack(alignment: .leading, spacing: 5) {
                Text(diagnosis.displayName)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)

                HStack(spacing: 6) {
                    if let crop = diagnosis.cropType {
                        HStack(spacing: 3) {
                            Image(systemName: crop.icon)
                                .font(.system(size: 9))
                            Text(crop.displayName)
                        }
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(crop.accentColor.opacity(0.1))
                        .foregroundStyle(crop.accentColor)
                        .clipShape(Capsule())
                    }

                    Text(diagnosis.severityLevel.displayName)
                        .font(.caption2.weight(.medium))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(diagnosis.severityLevel.color.opacity(0.1))
                        .foregroundStyle(diagnosis.severityLevel.color)
                        .clipShape(Capsule())
                }

                Text(formattedDate(diagnosis.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }

            Spacer()

            Image(systemName: "chevron.right")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.quaternary)
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .shadow(color: .black.opacity(0.04), radius: 6, y: 3)
    }

    private func formattedDate(_ dateString: String) -> String {
        DateFormatUtility.mediumDate(dateString)
    }
}
