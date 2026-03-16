import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { StorageService } from '../services/storageService';
import { SupabaseService } from '../services/supabaseService';
import { SupabaseUser } from '../types';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  accessToken: string | null;
  currentUser: SupabaseUser | null;
  errorMessage: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => void;
  requestPasswordReset: (email: string) => Promise<string>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ACCESS_TOKEN_KEY = 'auth_access_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<SupabaseUser | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const saveTokens = useCallback(async (access: string, refresh?: string) => {
    setAccessToken(access);
    await StorageService.save(ACCESS_TOKEN_KEY, access);
    if (refresh) {
      await StorageService.save(REFRESH_TOKEN_KEY, refresh);
    }
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = await StorageService.load(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;
    try {
      const response = await SupabaseService.refreshToken(refreshToken);
      if (response.access_token) {
        await saveTokens(response.access_token, response.refresh_token);
        setCurrentUser(response.user || null);
        setIsAuthenticated(true);
        return true;
      }
    } catch {}
    return false;
  }, [saveTokens]);

  useEffect(() => {
    (async () => {
      const savedToken = await StorageService.load(ACCESS_TOKEN_KEY);
      if (savedToken) {
        try {
          const user = await SupabaseService.getUser(savedToken);
          setAccessToken(savedToken);
          setCurrentUser(user);
          setIsAuthenticated(true);
        } catch {
          const refreshed = await refreshSession();
          if (!refreshed) {
            await StorageService.remove(ACCESS_TOKEN_KEY);
            await StorageService.remove(REFRESH_TOKEN_KEY);
          }
        }
      }
      setIsLoading(false);
    })();
  }, [refreshSession]);

  const signIn = async (email: string, password: string) => {
    if (!email || !password) {
      setErrorMessage('Preencha todos os campos');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await SupabaseService.signIn(email, password);
      if (response.access_token) {
        await saveTokens(response.access_token, response.refresh_token);
        setCurrentUser(response.user || null);
        setIsAuthenticated(true);
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Falha no login. Verifique suas credenciais.');
    }
    setIsLoading(false);
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    if (!email || !password || !fullName) {
      setErrorMessage('Preencha todos os campos');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Senha deve ter pelo menos 8 caracteres');
      return;
    }
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await SupabaseService.signUp(email, password, fullName);
      if (response.access_token) {
        await saveTokens(response.access_token, response.refresh_token);
        setCurrentUser(response.user || null);
        setIsAuthenticated(true);
      } else {
        setErrorMessage('Conta criada! Verifique seu e-mail para confirmar.');
      }
    } catch (e: any) {
      setErrorMessage(e.message || 'Falha no cadastro. Tente novamente.');
    }
    setIsLoading(false);
  };

  const signOut = async () => {
    if (accessToken) {
      try { await SupabaseService.signOut(accessToken); } catch {}
    }
    setAccessToken(null);
    setCurrentUser(null);
    setIsAuthenticated(false);
    await StorageService.remove(ACCESS_TOKEN_KEY);
    await StorageService.remove(REFRESH_TOKEN_KEY);
  };

  const requestPasswordReset = async (email: string): Promise<string> => {
    if (!email.trim()) {
      return 'Digite seu e-mail';
    }
    try {
      await SupabaseService.resetPassword(email.trim());
      return 'E-mail de recuperação enviado! Verifique sua caixa de entrada.';
    } catch {
      return 'Não foi possível enviar o e-mail. Verifique o endereço.';
    }
  };

  const clearError = () => setErrorMessage(null);

  return (
    <AuthContext.Provider value={{
      isAuthenticated, isLoading, accessToken, currentUser,
      errorMessage, signIn, signUp, signOut, requestPasswordReset, clearError,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
