import React, { createContext, useContext, useState, useCallback } from 'react';
import type { DiagnosisResult } from '../types/diagnosis';

interface DiagnosisState {
  imageUri: string | null;
  imageBase64: string | null;
  selectedCrop: string | null;
  result: DiagnosisResult | null;
  errorMessage: string | null;
  /**
   * Optional user-dictated notes (push-to-talk voice transcript) captured on
   * the camera screen. Empty by default — only populated when
   * `EXPO_PUBLIC_VOICE_ENABLED === 'true'` AND the user actually used the mic
   * button. Available to downstream screens (e.g. result.tsx) for future
   * contextual display.
   */
  notes: string;
}

interface DiagnosisContextType extends DiagnosisState {
  setImage: (uri: string, base64: string) => void;
  setCrop: (cropId: string) => void;
  setResult: (result: DiagnosisResult) => void;
  setError: (message: string) => void;
  /** Replace notes verbatim (used by future manual UI). */
  setNotes: (notes: string) => void;
  /** Append a transcript chunk to notes (used by voice push-to-talk). */
  appendNotes: (chunk: string) => void;
  reset: () => void;
}

const initial: DiagnosisState = {
  imageUri: null,
  imageBase64: null,
  selectedCrop: null,
  result: null,
  errorMessage: null,
  notes: '',
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

  const setNotes = useCallback((notes: string) => {
    setState((prev) => ({ ...prev, notes }));
  }, []);

  const appendNotes = useCallback((chunk: string) => {
    const trimmed = chunk.trim();
    if (trimmed.length === 0) return;
    setState((prev) => ({
      ...prev,
      notes: prev.notes ? `${prev.notes} ${trimmed}` : trimmed,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initial);
  }, []);

  return (
    <DiagnosisContext.Provider
      value={{
        ...state,
        setImage,
        setCrop,
        setResult,
        setError,
        setNotes,
        appendNotes,
        reset,
      }}
    >
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
