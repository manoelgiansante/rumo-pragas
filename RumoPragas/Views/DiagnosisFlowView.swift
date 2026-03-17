import SwiftUI
import PhotosUI

struct DiagnosisFlowView: View {
    @Binding var isPresented: Bool
    let authVM: AuthViewModel
    @State private var diagnosisVM = DiagnosisViewModel()
    @State private var flowStep: FlowStep = .photoSelection
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var showCamera = false
    @State private var cameraImageData: Data?
    @State private var previewImage: UIImage?
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private enum FlowStep {
        case photoSelection
        case cropSelection
        case analyzing
        case result
        case error
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                switch flowStep {
                case .photoSelection:
                    photoSelectionStep
                case .cropSelection:
                    cropSelectionStep
                case .analyzing:
                    analyzingStep
                case .result:
                    resultStep
                case .error:
                    errorStep
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        if flowStep == .cropSelection {
                            selectedPhoto = nil
                            previewImage = nil
                            withAnimation(.snappy) { flowStep = .photoSelection }
                        } else {
                            isPresented = false
                        }
                    } label: {
                        Image(systemName: flowStep == .cropSelection ? "chevron.left" : "xmark")
                            .font(.body.weight(.semibold))
                            .foregroundStyle(.primary)
                            .frame(width: 36, height: 36)
                            .background(.ultraThinMaterial)
                            .clipShape(Circle())
                    }
                    .accessibilityLabel(flowStep == .cropSelection ? "Voltar" : "Fechar")
                }
                ToolbarItem(placement: .principal) {
                    HStack(spacing: 6) {
                        Image(systemName: "camera.viewfinder")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(AppTheme.accent)
                        Text(toolbarTitle)
                            .font(.headline)
                    }
                }
            }
        }
        .onAppear {
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(.easeOut(duration: 0.5)) { appeared = true }
            }
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPickerView(imageData: $cameraImageData)
                .ignoresSafeArea()
        }
        .onChange(of: selectedPhoto) { _, newValue in
            guard let newValue else { return }
            Task {
                if let data = try? await newValue.loadTransferable(type: Data.self) {
                    handleImageSelected(data)
                }
            }
        }
        .onChange(of: cameraImageData) { _, newValue in
            guard let newValue else { return }
            handleImageSelected(newValue)
            cameraImageData = nil
        }
    }

    private var toolbarTitle: String {
        switch flowStep {
        case .photoSelection: return "Diagnosticar Praga"
        case .cropSelection: return "Selecionar Cultura"
        case .analyzing: return "Analisando..."
        case .result: return "Resultado"
        case .error: return "Diagnóstico"
        }
    }

    private var photoSelectionStep: some View {
        ScrollView {
            VStack(spacing: 28) {
                Spacer().frame(height: 12)

                ZStack {
                    Circle()
                        .fill(
                            RadialGradient(
                                colors: [AppTheme.accent.opacity(0.12), AppTheme.accent.opacity(0.02)],
                                center: .center,
                                startRadius: 0,
                                endRadius: 80
                            )
                        )
                        .frame(width: 150, height: 150)

                    Circle()
                        .strokeBorder(AppTheme.accent.opacity(0.2), lineWidth: 2)
                        .frame(width: 120, height: 120)

                    Image(systemName: "camera.viewfinder")
                        .font(.system(size: 48, weight: .light))
                        .foregroundStyle(AppTheme.accent)
                        .symbolEffect(.pulse, options: .repeating.speed(0.5), isActive: !reduceMotion)
                }
                .opacity(appeared ? 1 : 0)
                .scaleEffect(appeared ? 1 : 0.8)

                VStack(spacing: 8) {
                    Text("Identificação por IA")
                        .font(.title.bold())

                    Text("Tire uma foto ou escolha da galeria para identificar pragas e doenças na sua lavoura")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 12)

                VStack(spacing: 14) {
                    Button {
                        showCamera = true
                    } label: {
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(AppTheme.heroGradient)
                                    .frame(width: 54, height: 54)
                                Image(systemName: "camera.fill")
                                    .font(.title2)
                                    .foregroundStyle(.white)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Tirar Foto")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text("Use a câmera para capturar a praga")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .premiumCard(padding: 16)
                    }
                    .sensoryFeedback(.impact(weight: .light), trigger: showCamera)

                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        HStack(spacing: 14) {
                            ZStack {
                                RoundedRectangle(cornerRadius: 14)
                                    .fill(
                                        LinearGradient(
                                            colors: [AppTheme.techBlue, AppTheme.techBlue.opacity(0.75)],
                                            startPoint: .topLeading,
                                            endPoint: .bottomTrailing
                                        )
                                    )
                                    .frame(width: 54, height: 54)
                                Image(systemName: "photo.on.rectangle.angled")
                                    .font(.title2)
                                    .foregroundStyle(.white)
                            }
                            VStack(alignment: .leading, spacing: 3) {
                                Text("Escolher da Galeria")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                Text("Selecione uma foto existente")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(.tertiary)
                        }
                        .premiumCard(padding: 16)
                    }
                }
                .padding(.horizontal, 16)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 20)

                VStack(spacing: 12) {
                    Label("Dicas para melhor resultado", systemImage: "lightbulb.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.warmAmber)

                    VStack(alignment: .leading, spacing: 10) {
                        tipRow(icon: "sun.max.fill", color: .yellow, text: "Boa iluminação natural")
                        tipRow(icon: "arrow.up.left.and.arrow.down.right", color: .cyan, text: "Foco na área afetada, bem de perto")
                        tipRow(icon: "leaf.fill", color: AppTheme.accent, text: "Inclua folhas, caule ou fruto visíveis")
                        tipRow(icon: "photo.stack", color: AppTheme.techIndigo, text: "Imagem nítida sem tremor")
                    }
                    .premiumCard(padding: 16)
                }
                .padding(.horizontal, 16)
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 24)

                Spacer().frame(height: 20)
            }
            .animation(reduceMotion ? nil : .spring(response: 0.6, dampingFraction: 0.85).delay(0.1), value: appeared)
        }
    }

    private func tipRow(icon: String, color: Color, text: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(color)
                .frame(width: 24)
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var cropSelectionStep: some View {
        VStack(spacing: 0) {
            if let previewImage {
                HStack(spacing: 14) {
                    Color(.secondarySystemGroupedBackground)
                        .frame(width: 72, height: 72)
                        .overlay {
                            Image(uiImage: previewImage)
                                .resizable()
                                .aspectRatio(contentMode: .fill)
                                .allowsHitTesting(false)
                        }
                        .clipShape(.rect(cornerRadius: 14))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Imagem selecionada")
                            .font(.subheadline.weight(.semibold))
                        Text("Escolha a cultura para melhor precisão")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Image(systemName: "checkmark.circle.fill")
                        .font(.title2)
                        .foregroundStyle(AppTheme.accent)
                }
                .padding(16)
                .background(Color(.secondarySystemGroupedBackground))
                .clipShape(.rect(cornerRadius: 16))
                .padding(.horizontal, 16)
                .padding(.top, 12)
            }

            CropSelectorSheet(
                selectedCrop: $diagnosisVM.selectedCrop,
                onConfirm: {
                    withAnimation(.snappy) { flowStep = .analyzing }
                    Task { await startDiagnosis() }
                }
            )
        }
    }

    private var analyzingStep: some View {
        DiagnosisLoadingView(viewModel: diagnosisVM)
            .onChange(of: diagnosisVM.isAnalyzing) { _, isAnalyzing in
                if !isAnalyzing {
                    if diagnosisVM.result != nil {
                        withAnimation(.snappy) { flowStep = .result }
                    } else if diagnosisVM.errorMessage != nil {
                        withAnimation(.snappy) { flowStep = .error }
                    }
                }
            }
    }

    private var resultStep: some View {
        Group {
            if let result = diagnosisVM.result {
                DiagnosisResultView(result: result)
            }
        }
    }

    private var errorStep: some View {
        DiagnosisErrorView(message: diagnosisVM.errorMessage ?? "Erro desconhecido") {
            diagnosisVM.reset()
            selectedPhoto = nil
            previewImage = nil
            withAnimation(.snappy) { flowStep = .photoSelection }
        }
    }

    private func handleImageSelected(_ data: Data) {
        diagnosisVM.imageData = data
        previewImage = UIImage(data: data)
        withAnimation(.snappy) { flowStep = .cropSelection }
    }

    private func startDiagnosis() async {
        await diagnosisVM.startDiagnosis(token: authVM.accessToken)
    }
}
