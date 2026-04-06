import React, { createContext, useContext, useState, useCallback } from 'react';
import type { DiagnosisResult } from '../types/diagnosis';

interface DiagnosisState {
  imageUri: string | null;
  imageBase64: string | null;
  selectedCrop: string | null;
  result: DiagnosisResult | null;
  errorMessage: string | null;
}

interface DiagnosisContextType extends DiagnosisState {
  setImage: (uri: string, base64: string) => void;
  setCrop: (cropId: string) => void;
  setResult: (result: DiagnosisResult) => void;
  setError: (message: string) => void;
  reset: () => void;
}

const initial: DiagnosisState = {
  imageUri: null,
  imageBase64: null,
  selectedCrop: null,
  result: null,
  errorMessage: null,
};

const DiagnosisContext = createContext<DiagnosisContextType | null>(null);

export function DiagnosisProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<DiagnosisState>(initial);

  const setImage = useCallback((uri: string, base64: string) => {
    setState((prev) => ({ ...prev, imageUri: uri, imageBase64: base64 }));
  }, []);

  const setCrop = useCallback((cropId: string) => {
    setState((prev) => ({ ...prev, selectedCrop: cropId }));
  }, []);

  const setResult = useCallback((result: DiagnosisResult) => {
    setState((prev) => ({ ...prev, result }));
  }, []);

  const setError = useCallback((message: string) => {
    setState((prev) => ({ ...prev, errorMessage: message }));
  }, []);

  const reset = useCallback(() => {
    setState(initial);
  }, []);

  return (
    <DiagnosisContext.Provider value={{ ...state, setImage, setCrop, setResult, setError, reset }}>
      {children}
    </DiagnosisContext.Provider>
  );
}

export function useDiagnosis(): DiagnosisContextType {
  const ctx = useContext(DiagnosisContext);
  if (!ctx) {
    throw new Error('useDiagnosis must be used within DiagnosisProvider');
  }
  return ctx;
}
