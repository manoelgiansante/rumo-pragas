import SwiftUI

struct SettingsView: View {
    @State private var viewModel = SettingsViewModel()
    @State private var showSignOutConfirmation = false
    let authVM: AuthViewModel

    var body: some View {
        NavigationStack {
            List {
                profileSection
                subscriptionSection
                appearanceSection
                aboutSection
                signOutSection
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Configurações")
            .sheet(isPresented: $viewModel.showEditProfile) {
                EditProfileSheet(viewModel: viewModel, token: authVM.accessToken, userId: authVM.currentUser?.id)
            }
            .sheet(isPresented: $viewModel.showPaywall) {
                PaywallView()
            }
        }
        .onAppear {
            viewModel.loadProfile(user: authVM.currentUser)
        }
    }

    private var profileSection: some View {
        Section {
            HStack(spacing: 16) {
                ZStack {
                    Circle()
                        .fill(AppTheme.heroGradient)
                        .frame(width: 60, height: 60)
                        .shadow(color: AppTheme.accent.opacity(0.25), radius: 8, y: 4)
                    Text(String(viewModel.userName.prefix(1)).uppercased())
                        .font(.title2.bold())
                        .foregroundStyle(.white)
                }
                .accessibilityLabel("Avatar de \(viewModel.userName)")

                VStack(alignment: .leading, spacing: 4) {
                    Text(viewModel.userName)
                        .font(.headline)
                    Text(viewModel.userEmail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 4) {
                        Image(systemName: "person.badge.shield.checkmark.fill")
                            .font(.caption2)
                        Text(roleDisplayName(viewModel.userRole))
                            .font(.caption2.weight(.semibold))
                    }
                    .foregroundStyle(AppTheme.accent)
                }

                Spacer()
            }
            .padding(.vertical, 6)

            Button {
                viewModel.showEditProfile = true
            } label: {
                Label("Editar Perfil", systemImage: "pencil.line")
            }
        } header: {
            Text("Perfil")
        }
    }

    private var subscriptionSection: some View {
        Section {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(AppTheme.warmAmber.opacity(0.15))
                        .frame(width: 32, height: 32)
                    Image(systemName: "crown.fill")
                        .font(.subheadline)
                        .foregroundStyle(AppTheme.warmAmber)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("Plano Atual")
                        .font(.subheadline)
                    Text(viewModel.currentPlan.displayName)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(AppTheme.accent)
                }
                Spacer()
                Text(viewModel.currentPlan.price)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            Button {
                viewModel.showPaywall = true
            } label: {
                HStack {
                    Label("Upgrade de Plano", systemImage: "arrow.up.circle.fill")
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
            }
        } header: {
            Text("Assinatura")
        }
    }

    private var appearanceSection: some View {
        Section {
            Toggle(isOn: $viewModel.isDarkMode) {
                Label("Modo Escuro", systemImage: "moon.fill")
            }
            .tint(AppTheme.accent)

            Picker(selection: $viewModel.language) {
                Text("Português").tag("pt")
                Text("Español").tag("es")
            } label: {
                Label("Idioma", systemImage: "globe")
            }

            Toggle(isOn: $viewModel.pushEnabled) {
                Label("Notificações Push", systemImage: "bell.badge.fill")
            }
            .tint(AppTheme.accent)
        } header: {
            Text("Aparência e Preferências")
        }
    }

    private var aboutSection: some View {
        Section {
            if let url = URL(string: "https://rumopragas.com.br/privacidade") {
                Link(destination: url) {
                    HStack {
                        Label("Política de Privacidade", systemImage: "hand.raised.fill")
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            if let url = URL(string: "https://rumopragas.com.br/termos") {
                Link(destination: url) {
                    HStack {
                        Label("Termos de Uso", systemImage: "doc.text.fill")
                        Spacer()
                        Image(systemName: "arrow.up.right")
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }

            HStack {
                Label("Versão", systemImage: "info.circle.fill")
                Spacer()
                Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0")
                    .font(.subheadline.monospacedDigit())
                    .foregroundStyle(.secondary)
            }
        } header: {
            Text("Sobre")
        }
    }

    private var signOutSection: some View {
        Section {
            Button(role: .destructive) {
                showSignOutConfirmation = true
            } label: {
                HStack {
                    Spacer()
                    Label("Sair da Conta", systemImage: "rectangle.portrait.and.arrow.right")
                        .font(.subheadline.weight(.semibold))
                    Spacer()
                }
            }
            .confirmationDialog("Tem certeza que deseja sair?", isPresented: $showSignOutConfirmation, titleVisibility: .visible) {
                Button("Sair", role: .destructive) {
                    authVM.signOut()
                }
                Button("Cancelar", role: .cancel) {}
            }
        }
    }

    private func roleDisplayName(_ role: String) -> String {
        switch role {
        case "produtor": "Produtor Rural"
        case "agronomo": "Agrônomo"
        case "tecnico": "Técnico Agrícola"
        case "consultor": "Consultor MIP"
        case "estudante": "Estudante"
        default: "Produtor Rural"
        }
    }
}
