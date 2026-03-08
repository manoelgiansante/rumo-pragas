import SwiftUI

struct EditProfileSheet: View {
    @Bindable var viewModel: SettingsViewModel
    var token: String?
    var userId: String?
    @Environment(\.dismiss) private var dismiss

    let roles = ["produtor", "agronomo", "tecnico", "consultor", "estudante"]
    let states = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]

    var body: some View {
        NavigationStack {
            Form {
                Section("Informações Pessoais") {
                    TextField("Nome", text: $viewModel.userName)
                        .textContentType(.name)

                    Picker("Função", selection: $viewModel.userRole) {
                        ForEach(roles, id: \.self) { role in
                            Text(roleLabel(role)).tag(role)
                        }
                    }
                }

                Section("Localização") {
                    TextField("Cidade", text: $viewModel.userCity)
                    Picker("Estado", selection: $viewModel.userState) {
                        Text("Selecionar").tag("")
                        ForEach(states, id: \.self) { state in
                            Text(state).tag(state)
                        }
                    }
                }

                Section("Culturas") {
                    ForEach(CropType.allCases) { crop in
                        Toggle(crop.displayName, isOn: Binding(
                            get: { viewModel.userCrops.contains(crop.rawValue) },
                            set: { isOn in
                                if isOn {
                                    viewModel.userCrops.append(crop.rawValue)
                                } else {
                                    viewModel.userCrops.removeAll { $0 == crop.rawValue }
                                }
                            }
                        ))
                        .tint(AppTheme.accent)
                    }
                }

                if let error = viewModel.saveError {
                    Section {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Editar Perfil")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            await viewModel.saveProfile(token: token, userId: userId)
                            if viewModel.saveSuccess {
                                dismiss()
                            }
                        }
                    } label: {
                        if viewModel.isSavingProfile {
                            ProgressView()
                        } else {
                            Text("Salvar")
                        }
                    }
                    .disabled(viewModel.isSavingProfile)
                }
            }
        }
    }

    private func roleLabel(_ role: String) -> String {
        switch role {
        case "produtor": "Produtor Rural"
        case "agronomo": "Agrônomo"
        case "tecnico": "Técnico Agrícola"
        case "consultor": "Consultor MIP"
        case "estudante": "Estudante"
        default: role
        }
    }
}
