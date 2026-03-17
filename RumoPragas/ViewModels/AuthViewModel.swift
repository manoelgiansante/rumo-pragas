import Foundation
import SwiftUI

@Observable
@MainActor
class AuthViewModel {
    var email = ""
    var password = ""
    var fullName = ""
    var isSignUp = false
    var isLoading = false
    var errorMessage: String?
    var isAuthenticated = false
    var accessToken: String?
    var currentUser: SupabaseUser?
    var showResetPassword = false
    var resetEmail = ""
    var resetMessage: String?
    var isResetting = false

    private let accessTokenKey = "auth_access_token"
    private let refreshTokenKey = "auth_refresh_token"

    init() {
        if let saved = KeychainService.load(key: accessTokenKey), !saved.isEmpty {
            accessToken = saved
            isAuthenticated = true
        } else if let legacy = UserDefaults.standard.string(forKey: accessTokenKey), !legacy.isEmpty {
            accessToken = legacy
            isAuthenticated = true
            KeychainService.save(key: accessTokenKey, value: legacy)
            UserDefaults.standard.removeObject(forKey: accessTokenKey)
            UserDefaults.standard.removeObject(forKey: refreshTokenKey)
        }
    }

    var isValidEmail: Bool {
        let pattern = #"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"#
        return email.range(of: pattern, options: .regularExpression) != nil
    }

    func signIn() async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Preencha todos os campos"
            return
        }
        guard isValidEmail else {
            errorMessage = "Digite um e-mail válido"
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        do {
            let response = try await SupabaseService.shared.signIn(email: email, password: password)
            if let token = response.accessToken {
                saveTokens(access: token, refresh: response.refreshToken)
                currentUser = response.user
                isAuthenticated = true
            } else {
                errorMessage = "Verifique seu e-mail para confirmar a conta."
            }
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = "Falha no login. Verifique suas credenciais."
        }
    }

    func signUp() async {
        guard !email.isEmpty, !password.isEmpty, !fullName.isEmpty else {
            errorMessage = "Preencha todos os campos"
            return
        }
        guard isValidEmail else {
            errorMessage = "Digite um e-mail válido"
            return
        }
        guard password.count >= 8 else {
            errorMessage = "Senha deve ter pelo menos 8 caracteres, incluindo uma letra maiúscula e um número"
            return
        }
        guard password.range(of: "[A-Z]", options: .regularExpression) != nil,
              password.range(of: "[0-9]", options: .regularExpression) != nil else {
            errorMessage = "Senha deve conter pelo menos uma letra maiúscula e um número"
            return
        }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        do {
            let response = try await SupabaseService.shared.signUp(
                email: email,
                password: password,
                fullName: fullName
            )
            if let token = response.accessToken {
                saveTokens(access: token, refresh: response.refreshToken)
                currentUser = response.user
                isAuthenticated = true
            } else {
                errorMessage = "Conta criada! Verifique seu e-mail para confirmar."
            }
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = "Falha no cadastro. Tente novamente."
        }
    }

    func requestPasswordReset() async {
        let emailToReset = resetEmail.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !emailToReset.isEmpty else {
            resetMessage = "Digite seu e-mail"
            return
        }
        isResetting = true
        defer { isResetting = false }
        resetMessage = nil
        do {
            try await SupabaseService.shared.resetPassword(email: emailToReset)
            resetMessage = "E-mail de recuperação enviado! Verifique sua caixa de entrada."
        } catch {
            resetMessage = "Não foi possível enviar o e-mail. Verifique o endereço."
        }
    }

    func signOut() {
        if let token = accessToken {
            Task {
                try? await SupabaseService.shared.signOut(token: token)
            }
        }
        accessToken = nil
        currentUser = nil
        KeychainService.delete(key: accessTokenKey)
        KeychainService.delete(key: refreshTokenKey)
        UserDefaults.standard.removeObject(forKey: accessTokenKey)
        isAuthenticated = false
        email = ""
        password = ""
        fullName = ""
    }

    func validateSession() async {
        guard let token = accessToken else {
            isAuthenticated = false
            return
        }
        do {
            currentUser = try await SupabaseService.shared.getUser(token: token)
            isAuthenticated = true
        } catch {
            let refreshed = await refreshSession()
            if !refreshed {
                signOut()
            }
        }
    }

    private func refreshSession() async -> Bool {
        guard let refreshToken = KeychainService.load(key: refreshTokenKey) else { return false }
        do {
            let response = try await SupabaseService.shared.refreshToken(refreshToken)
            if let newAccess = response.accessToken {
                saveTokens(access: newAccess, refresh: response.refreshToken)
                currentUser = response.user
                isAuthenticated = true
                return true
            }
        } catch {
            #if DEBUG
            print("[Auth] Refresh failed: \(error)")
            #endif
        }
        return false
    }

    private func saveTokens(access: String, refresh: String?) {
        accessToken = access
        KeychainService.save(key: accessTokenKey, value: access)
        if let refresh {
            KeychainService.save(key: refreshTokenKey, value: refresh)
        }
    }
}
