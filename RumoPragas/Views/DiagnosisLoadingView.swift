import SwiftUI

struct DiagnosisLoadingView: View {
    let viewModel: DiagnosisViewModel
    @State private var pulseScale: CGFloat = 1.0
    @State private var rotationAngle: Double = 0

    var body: some View {
        VStack(spacing: 36) {
            Spacer()

            ZStack {
                ForEach(0..<3, id: \.self) { i in
                    Circle()
                        .stroke(
                            AppTheme.brandGreen.opacity(0.15 - Double(i) * 0.04),
                            lineWidth: 2
                        )
                        .frame(width: CGFloat(140 + i * 30), height: CGFloat(140 + i * 30))
                        .scaleEffect(pulseScale)
                        .animation(
                            .easeInOut(duration: 1.8)
                                .repeatForever(autoreverses: true)
                                .delay(Double(i) * 0.2),
                            value: pulseScale
                        )
                }

                Circle()
                    .stroke(Color(.systemGray5), lineWidth: 5)
                    .frame(width: 120, height: 120)

                Circle()
                    .trim(from: 0, to: viewModel.progress)
                    .stroke(
                        AngularGradient(
                            colors: [AppTheme.brandGreen.opacity(0.3), AppTheme.brandGreen],
                            center: .center
                        ),
                        style: StrokeStyle(lineWidth: 5, lineCap: .round)
                    )
                    .frame(width: 120, height: 120)
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut(duration: 0.5), value: viewModel.progress)

                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [AppTheme.brandGreen.opacity(0.15), .clear],
                                center: .center,
                                startRadius: 0,
                                endRadius: 40
                            )
                        )
                        .frame(width: 80, height: 80)

                    Image(systemName: "leaf.fill")
                        .font(.system(size: 32, weight: .medium))
                        .foregroundStyle(AppTheme.brandGreen)
                        .rotationEffect(.degrees(rotationAngle))
                        .symbolEffect(.pulse, options: .repeating)
                }
            }

            VStack(spacing: 10) {
                Text(viewModel.statusMessage)
                    .font(.title3.weight(.semibold))
                    .contentTransition(.numericText())
                    .animation(.snappy, value: viewModel.statusMessage)

                Text("\(Int(viewModel.progress * 100))%")
                    .font(.system(.headline, design: .default, weight: .bold).monospacedDigit())
                    .foregroundStyle(AppTheme.brandGreen)

                ProgressView(value: viewModel.progress)
                    .tint(AppTheme.brandGreen)
                    .padding(.horizontal, 60)
            }

            Spacer()

            VStack(spacing: 4) {
                Image(systemName: "cpu.fill")
                    .font(.caption)
                    .foregroundStyle(.tertiary)
                Text("IA especializada em fitossanidade")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
            .padding(.bottom, 32)
        }
        .frame(maxWidth: .infinity)
        .onAppear {
            pulseScale = 1.06
            withAnimation(.linear(duration: 8).repeatForever(autoreverses: false)) {
                rotationAngle = 360
            }
        }
    }
}
