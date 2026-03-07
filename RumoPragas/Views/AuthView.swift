import SwiftUI

struct AuthView: View {
    @Bindable var viewModel: AuthViewModel
    @State private var animateGradient = false
    @State private var appeared = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                heroSection
                formSection
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .ignoresSafeArea(edges: .top)
        .background(Color(.systemBackground))
        .onAppear {
            withAnimation(.easeOut(duration: 0.8)) {
                appeared = true
            }
        }
    }

    private var heroSection: some View {
        ZStack(alignment: .bottomLeading) {
            ZStack {
                AppTheme.meshBackground
                    .frame(height: 320)

                VStack(spacing: 0) {
                    Spacer()
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: Color(.systemBackground).opacity(0.6), location: 0.7),
                            .init(color: Color(.systemBackground), location: 1.0)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 120)
                }
            }
            .frame(height: 320)

            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.1))
                        .frame(width: 72, height: 72)
                    Circle()
                        .fill(.white.opacity(0.06))
                        .frame(width: 56, height: 56)
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(.white)
                        .symbolEffect(.breathe, options: .repeating.speed(0.3))
                }
                .opacity(appeared ? 1 : 0)
                .scaleEffect(appeared ? 1 : 0.8)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Rumo Pragas")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                        .foregroundStyle(.white)

                    Text("Inteligência artificial para\nproteção de lavouras")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.7))
                        .lineSpacing(2)
                }
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 12)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(height: 320)
    }

    private var formSection: some View {
        VStack(spacing: 20) {
            Picker("", selection: $viewModel.isSignUp) {
                Text("Entrar").tag(false)
                Text("Criar Conta").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.top, 8)

            VStack(spacing: 14) {
                if viewModel.isSignUp {
                    PremiumTextField(
                        icon: "person.fill",
                        placeholder: "Nome completo",
                        text: $viewModel.fullName
                    )
                    .textContentType(.name)
                    .autocorrectionDisabled()
                    .transition(.move(edge: .top).combined(with: .opacity))
                }

                PremiumTextField(
                    icon: "envelope.fill",
                    placeholder: "E-mail",
                    text: $viewModel.email
                )
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()

                PremiumSecureField(
                    icon: "lock.fill",
                    placeholder: "Senha",
                    text: $viewModel.password,
                    contentType: viewModel.isSignUp ? .newPassword : .password
                )
            }
            .animation(.snappy(duration: 0.3), value: viewModel.isSignUp)

            if let error = viewModel.errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.red)
                        .font(.caption)
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(.red)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 4)
                .transition(.opacity)
            }

            Button {
                Task {
                    if viewModel.isSignUp {
                        await viewModel.signUp()
                    } else {
                        await viewModel.signIn()
                    }
                }
            } label: {
                Group {
                    if viewModel.isLoading {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Text(viewModel.isSignUp ? "Criar Conta" : "Entrar")
                            .fontWeight(.bold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 54)
            }
            .buttonStyle(.borderedProminent)
            .tint(AppTheme.brandGreen)
            .clipShape(.rect(cornerRadius: 14))
            .disabled(viewModel.isLoading)
            .shadow(color: AppTheme.brandGreen.opacity(0.3), radius: 12, y: 6)

            VStack(spacing: 8) {
                Text("Ao continuar, você concorda com nossos")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                HStack(spacing: 4) {
                    Link("Termos de Uso", destination: URL(string: "https://rumopragas.com.br/termos")!)
                        .font(.caption2.weight(.medium))
                    Text("e")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    Link("Política de Privacidade", destination: URL(string: "https://rumopragas.com.br/privacidade")!)
                        .font(.caption2.weight(.medium))
                }
            }
            .padding(.top, 8)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 24)
    }
}

struct PremiumTextField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 20)
            TextField(placeholder, text: $text)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground))
        .clipShape(.rect(cornerRadius: 12))
    }
}

struct PremiumSecureField: View {
    let icon: String
    let placeholder: String
    @Binding var text: String
    var contentType: UITextContentType = .password
    @State private var isVisible = false

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(width: 20)

            Group {
                if isVisible {
                    TextField(placeholder, text: $text)
                } else {
                    SecureField(placeholder, text: $text)
                }
            }
            .textContentType(contentType)

            Button {
                isVisible.toggle()
            } label: {
                Image(systemName: isVisible ? "eye.slash.fill" : "eye.fill")
                    .font(.subheadline)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground))
        .clipShape(.rect(cornerRadius: 12))
    }
}
