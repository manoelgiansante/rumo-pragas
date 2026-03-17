import SwiftUI

struct AuthView: View {
    @Bindable var viewModel: AuthViewModel
    @State private var appeared = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

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
            if reduceMotion {
                appeared = true
            } else {
                withAnimation(.easeOut(duration: 0.8)) {
                    appeared = true
                }
            }
        }
    }

    private var heroSection: some View {
        ZStack(alignment: .bottomLeading) {
            ZStack {
                AppTheme.meshBackground
                    .frame(height: 310)

                VStack(spacing: 0) {
                    Spacer()
                    LinearGradient(
                        stops: [
                            .init(color: .clear, location: 0),
                            .init(color: Color(.systemBackground).opacity(0.7), location: 0.7),
                            .init(color: Color(.systemBackground), location: 1.0)
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                    .frame(height: 120)
                }
            }
            .frame(height: 310)

            VStack(alignment: .leading, spacing: 12) {
                ZStack {
                    Circle()
                        .fill(.white.opacity(0.15))
                        .frame(width: 68, height: 68)
                    Image(systemName: "leaf.fill")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundStyle(.white)
                        .symbolEffect(.breathe, options: .repeating.speed(0.3), isActive: !reduceMotion)
                }
                .opacity(appeared ? 1 : 0)
                .scaleEffect(appeared ? 1 : 0.8)

                VStack(alignment: .leading, spacing: 6) {
                    Text("Rumo Pragas")
                        .font(.system(.largeTitle, design: .default, weight: .bold))
                        .foregroundStyle(.white)

                    Text("Inteligência artificial para\nproteção de lavouras")
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.9))
                        .lineSpacing(2)
                }
                .opacity(appeared ? 1 : 0)
                .offset(y: appeared ? 0 : 12)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 24)
        }
        .frame(height: 310)
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
                        .foregroundStyle(AppTheme.coral)
                        .font(.caption)
                    Text(error)
                        .font(.footnote)
                        .foregroundStyle(AppTheme.coral)
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
            .tint(AppTheme.accent)
            .clipShape(.rect(cornerRadius: 14))
            .disabled(viewModel.isLoading)
            .shadow(color: AppTheme.accent.opacity(0.25), radius: 12, y: 6)

            if !viewModel.isSignUp {
                Button {
                    viewModel.resetEmail = viewModel.email
                    viewModel.resetMessage = nil
                    viewModel.showResetPassword = true
                } label: {
                    Text("Esqueceu sua senha?")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(AppTheme.accent)
                }
                .frame(maxWidth: .infinity, alignment: .trailing)
            }

            VStack(spacing: 8) {
                Text("Ao continuar, você concorda com nossos")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                HStack(spacing: 4) {
                    if let url = URL(string: "https://rumopragas.com.br/termos") {
                        Link("Termos de Uso", destination: url)
                            .font(.caption2.weight(.medium))
                    }
                    Text("e")
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                    if let url = URL(string: "https://rumopragas.com.br/privacidade") {
                        Link("Política de Privacidade", destination: url)
                            .font(.caption2.weight(.medium))
                    }
                }
            }
            .padding(.top, 8)

            Spacer(minLength: 40)
        }
        .padding(.horizontal, 24)
        .sheet(isPresented: $viewModel.showResetPassword) {
            ResetPasswordSheet(viewModel: viewModel)
        }
    }
}

struct ResetPasswordSheet: View {
    @Bindable var viewModel: AuthViewModel
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(spacing: 12) {
                    ZStack {
                        Circle()
                            .fill(AppTheme.accent.opacity(0.12))
                            .frame(width: 80, height: 80)
                        Image(systemName: "envelope.badge.fill")
                            .font(.system(size: 34))
                            .foregroundStyle(AppTheme.accent)
                    }

                    Text("Recuperar Senha")
                        .font(.title2.bold())
                    Text("Digite seu e-mail para receber um link de recuperação de senha.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(.top, 20)

                PremiumTextField(
                    icon: "envelope.fill",
                    placeholder: "E-mail",
                    text: $viewModel.resetEmail
                )
                .textContentType(.emailAddress)
                .keyboardType(.emailAddress)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 24)

                if let msg = viewModel.resetMessage {
                    HStack(spacing: 8) {
                        Image(systemName: msg.contains("enviado") ? "checkmark.circle.fill" : "exclamationmark.triangle.fill")
                            .font(.caption)
                        Text(msg)
                            .font(.footnote)
                    }
                    .foregroundStyle(msg.contains("enviado") ? AppTheme.accent : AppTheme.coral)
                    .padding(.horizontal, 24)
                    .transition(.opacity)
                }

                Button {
                    Task { await viewModel.requestPasswordReset() }
                } label: {
                    Group {
                        if viewModel.isResetting {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Text("Enviar Link")
                                .fontWeight(.bold)
                        }
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 54)
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.accent)
                .clipShape(.rect(cornerRadius: 14))
                .disabled(viewModel.isResetting)
                .padding(.horizontal, 24)

                Spacer()
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Fechar") { dismiss() }
                }
            }
        }
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
            .accessibilityLabel(isVisible ? "Ocultar senha" : "Mostrar senha")
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemBackground))
        .clipShape(.rect(cornerRadius: 12))
    }
}
