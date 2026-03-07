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

    private let tokenKey = "auth_access_token"

    init() {
        if let saved = UserDefaults.standard.string(forKey: tokenKey), !saved.isEmpty {
            accessToken = saved
            isAuthenticated = true
        }
    }

    func signIn() async {
        guard !email.isEmpty, !password.isEmpty else {
            errorMessage = "Preencha todos os campos"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await SupabaseService.shared.signIn(email: email, password: password)
            if let token = response.accessToken {
                accessToken = token
                currentUser = response.user
                UserDefaults.standard.set(token, forKey: tokenKey)
                isAuthenticated = true
            }
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = "Falha no login. Verifique suas credenciais."
        }
        isLoading = false
    }

    func signUp() async {
        guard !email.isEmpty, !password.isEmpty, !fullName.isEmpty else {
            errorMessage = "Preencha todos os campos"
            return
        }
        guard password.count >= 6 else {
            errorMessage = "Senha deve ter pelo menos 6 caracteres"
            return
        }
        isLoading = true
        errorMessage = nil
        do {
            let response = try await SupabaseService.shared.signUp(
                email: email,
                password: password,
                fullName: fullName
            )
            if let token = response.accessToken {
                accessToken = token
                currentUser = response.user
                UserDefaults.standard.set(token, forKey: tokenKey)
                isAuthenticated = true
            } else {
                errorMessage = "Conta criada! Verifique seu e-mail para confirmar."
            }
        } catch let error as APIError {
            errorMessage = error.errorDescription
        } catch {
            errorMessage = "Falha no cadastro. Tente novamente."
        }
        isLoading = false
    }

    func signOut() {
        if let token = accessToken {
            Task {
                try? await SupabaseService.shared.signOut(token: token)
            }
        }
        accessToken = nil
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: tokenKey)
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
            signOut()
        }
    }
}
