/**
 * Tests for contexts/DiagnosisContext.tsx
 */
import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { DiagnosisProvider, useDiagnosis } from '../../contexts/DiagnosisContext';
import type { DiagnosisResult } from '../../types/diagnosis';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <DiagnosisProvider>{children}</DiagnosisProvider>
);

describe('DiagnosisContext', () => {
  it('throws when used outside provider', () => {
    // Suppress console.error for expected error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => {
      renderHook(() => useDiagnosis());
    }).toThrow('useDiagnosis must be used within DiagnosisProvider');
    spy.mockRestore();
  });

  it('starts with all null/empty state', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    expect(result.current.imageUri).toBeNull();
    expect(result.current.imageBase64).toBeNull();
    expect(result.current.selectedCrop).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('setImage updates imageUri and imageBase64', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    act(() => {
      result.current.setImage('file://photo.jpg', 'base64data');
    });

    expect(result.current.imageUri).toBe('file://photo.jpg');
    expect(result.current.imageBase64).toBe('base64data');
  });

  it('setCrop updates selectedCrop', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    act(() => {
      result.current.setCrop('soybean');
    });

    expect(result.current.selectedCrop).toBe('soybean');
  });

  it('setResult updates result', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    const diagResult: DiagnosisResult = {
      id: '123',
      user_id: 'u1',
      crop: 'soy',
      pest_name: 'Rust',
      created_at: '2025-01-01',
    };

    act(() => {
      result.current.setResult(diagResult);
    });

    expect(result.current.result).toEqual(diagResult);
  });

  it('setError updates errorMessage', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    act(() => {
      result.current.setError('Something went wrong');
    });

    expect(result.current.errorMessage).toBe('Something went wrong');
  });

  it('reset clears all state', () => {
    const { result } = renderHook(() => useDiagnosis(), { wrapper });

    act(() => {
      result.current.setImage('file://photo.jpg', 'base64data');
      result.current.setCrop('corn');
      result.current.setError('error');
    });

    expect(result.current.imageUri).toBe('file://photo.jpg');
    expect(result.current.selectedCrop).toBe('corn');

    act(() => {
      result.current.reset();
    });

    expect(result.current.imageUri).toBeNull();
    expect(result.current.imageBase64).toBeNull();
    expect(result.current.selectedCrop).toBeNull();
    expect(result.current.result).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });
});
