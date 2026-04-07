/**
 * Tests for types/diagnosis.ts helper functions
 */
import {
  getConfidenceLevel,
  getSeverityLevel,
  getDisplayName,
  getScientificName,
  getAllPredictions,
  isHealthy,
  parseNotes,
  SEVERITY_CONFIG,
  CONFIDENCE_LEVELS,
} from '../../types/diagnosis';
import type { DiagnosisResult, AgrioNotesData } from '../../types/diagnosis';

function makeDiagnosis(overrides: Partial<DiagnosisResult> = {}): DiagnosisResult {
  return {
    id: 'diag-1',
    user_id: 'user-1',
    crop: 'soy',
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('getConfidenceLevel', () => {
  it('returns "high" for confidence >= 0.85', () => {
    expect(getConfidenceLevel(0.85)).toBe('high');
    expect(getConfidenceLevel(0.99)).toBe('high');
    expect(getConfidenceLevel(1.0)).toBe('high');
  });

  it('returns "medium" for confidence 0.60–0.84', () => {
    expect(getConfidenceLevel(0.6)).toBe('medium');
    expect(getConfidenceLevel(0.84)).toBe('medium');
  });

  it('returns "low" for confidence 0.40–0.59', () => {
    expect(getConfidenceLevel(0.4)).toBe('low');
    expect(getConfidenceLevel(0.59)).toBe('low');
  });

  it('returns "very_low" for confidence < 0.40', () => {
    expect(getConfidenceLevel(0.39)).toBe('very_low');
    expect(getConfidenceLevel(0.01)).toBe('very_low');
  });

  it('returns "low" for undefined confidence', () => {
    expect(getConfidenceLevel(undefined)).toBe('low');
    expect(getConfidenceLevel(0)).toBe('low');
  });
});

describe('getSeverityLevel', () => {
  it('returns severity from enrichment when valid', () => {
    const result = makeDiagnosis({
      parsedNotes: {
        enrichment: { severity: 'critical' },
      },
    });
    expect(getSeverityLevel(result)).toBe('critical');
  });

  it('returns "medium" as default when no enrichment severity', () => {
    const result = makeDiagnosis();
    expect(getSeverityLevel(result)).toBe('medium');
  });

  it('returns "medium" when enrichment severity is invalid', () => {
    const result = makeDiagnosis({
      parsedNotes: {
        enrichment: { severity: 'unknown' as any },
      },
    });
    expect(getSeverityLevel(result)).toBe('medium');
  });
});

describe('getDisplayName', () => {
  it('returns enrichment name_pt first', () => {
    const result = makeDiagnosis({
      pest_name: 'Rust',
      parsedNotes: { enrichment: { name_pt: 'Ferrugem Asiática' } },
    });
    expect(getDisplayName(result)).toBe('Ferrugem Asiática');
  });

  it('falls back to pest_name', () => {
    const result = makeDiagnosis({ pest_name: 'Soybean Rust' });
    expect(getDisplayName(result)).toBe('Soybean Rust');
  });

  it('falls back to pest_id', () => {
    const result = makeDiagnosis({ pest_id: 'rust-001' });
    expect(getDisplayName(result)).toBe('rust-001');
  });

  it('returns "Diagnostico" as last resort', () => {
    const result = makeDiagnosis();
    expect(getDisplayName(result)).toBe('Diagnostico');
  });
});

describe('getScientificName', () => {
  it('returns scientific name from predictions', () => {
    const result = makeDiagnosis({
      parsedNotes: {
        predictions: [{ id: 'rust', confidence: 0.9, scientific_name: 'Phakopsora pachyrhizi' }],
      },
    });
    expect(getScientificName(result)).toBe('Phakopsora pachyrhizi');
  });

  it('skips Healthy prediction and returns next one', () => {
    const result = makeDiagnosis({
      parsedNotes: {
        predictions: [
          { id: 'Healthy', confidence: 0.8 },
          { id: 'rust', confidence: 0.2, scientific_name: 'P. pachyrhizi' },
        ],
      },
    });
    expect(getScientificName(result)).toBe('P. pachyrhizi');
  });

  it('falls back to id_array when predictions is absent', () => {
    const result = makeDiagnosis({
      parsedNotes: {
        id_array: [{ id: 'mite', confidence: 0.7, scientific_name: 'Tetranychus urticae' }],
      },
    });
    expect(getScientificName(result)).toBe('Tetranychus urticae');
  });

  it('returns undefined when no predictions', () => {
    const result = makeDiagnosis();
    expect(getScientificName(result)).toBeUndefined();
  });
});

describe('getAllPredictions', () => {
  it('returns predictions array when present', () => {
    const preds = [{ id: 'a', confidence: 0.9 }];
    const result = makeDiagnosis({ parsedNotes: { predictions: preds } });
    expect(getAllPredictions(result)).toEqual(preds);
  });

  it('falls back to id_array', () => {
    const idArr = [{ id: 'b', confidence: 0.8 }];
    const result = makeDiagnosis({ parsedNotes: { id_array: idArr } });
    expect(getAllPredictions(result)).toEqual(idArr);
  });

  it('returns empty array when nothing present', () => {
    const result = makeDiagnosis();
    expect(getAllPredictions(result)).toEqual([]);
  });
});

describe('isHealthy', () => {
  it('returns true when pest_id is Healthy', () => {
    expect(isHealthy(makeDiagnosis({ pest_id: 'Healthy' }))).toBe(true);
  });

  it('returns true when pest_name is Healthy', () => {
    expect(isHealthy(makeDiagnosis({ pest_name: 'Healthy' }))).toBe(true);
  });

  it('returns false for non-healthy diagnosis', () => {
    expect(isHealthy(makeDiagnosis({ pest_id: 'rust', pest_name: 'Rust' }))).toBe(false);
  });
});

describe('parseNotes', () => {
  it('parses valid JSON string', () => {
    const data: AgrioNotesData = { message: 'Test', crop: 'soy' };
    expect(parseNotes(JSON.stringify(data))).toEqual(data);
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseNotes('not json')).toBeUndefined();
  });

  it('returns undefined for empty/undefined input', () => {
    expect(parseNotes(undefined)).toBeUndefined();
    expect(parseNotes('')).toBeUndefined();
  });
});

describe('SEVERITY_CONFIG', () => {
  it('has all five severity levels', () => {
    expect(Object.keys(SEVERITY_CONFIG)).toEqual(['critical', 'high', 'medium', 'low', 'none']);
  });

  it('each level has displayName, color, and icon', () => {
    for (const level of Object.values(SEVERITY_CONFIG)) {
      expect(level).toHaveProperty('displayName');
      expect(level).toHaveProperty('color');
      expect(level).toHaveProperty('icon');
      expect(level.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe('CONFIDENCE_LEVELS', () => {
  it('has all four confidence levels', () => {
    expect(Object.keys(CONFIDENCE_LEVELS)).toEqual(['high', 'medium', 'low', 'very_low']);
  });

  it('each level has displayName, color, and percentage', () => {
    for (const level of Object.values(CONFIDENCE_LEVELS)) {
      expect(level).toHaveProperty('displayName');
      expect(level).toHaveProperty('color');
      expect(level).toHaveProperty('percentage');
    }
  });
});
