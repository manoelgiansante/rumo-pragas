/**
 * Tests for MipCard — empty state and safe educational guidance.
 * The app is 100% free, so every level is selectable and there is no CTA.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockRouterPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockRouterPush(...args) },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Simple interpolation for {{count}} and {{level}}
      if (opts) {
        return Object.entries(opts).reduce(
          (acc, [k, v]) => acc.replace(`{{${k}}}`, String(v)),
          key,
        );
      }
      return key;
    },
  }),
}));

import { MipCard } from '../../components/MipCard';
import type { UseMipKnowledgeResult, MipLevelData } from '../../hooks/useMipKnowledge';
import type { MipEntry, MipRecommendation } from '../../data/mip';

function makeRecommendation(level: 'baixo' | 'medio' | 'alto'): MipRecommendation {
  return {
    entryId: 'soja_ferrugem_asiatica',
    nomeComum: 'Ferrugem asiática da soja',
    infestationLevel: level,
    acoesCulturais: ['Rotação de culturas', 'Vazio sanitário'],
    acoesBiologicas: ['Bacillus subtilis'],
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal',
      nivelControle: 'Primeira pústula',
    },
  };
}

function makeEntry(): MipEntry {
  return {
    id: 'soja_ferrugem_asiatica',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem asiática da soja',
    nomesAlternativos: ['ferrugem'],
    nomeCientifico: 'Phakopsora pachyrhizi',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao: 'Pústulas marrons',
      palavrasChave: ['ferrugem'],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {},
    niveisDano: {
      baixo: { criterio: 'Primeiras pústulas' },
      medio: { criterio: '5-10% de severidade' },
      alto: { criterio: '> 25% de severidade' },
    },
    mip: {
      cultural: ['Rotação'],
      biologico: ['Bacillus'],
    },
    monitoramento: {
      metodo: 'Visual',
      frequencia: 'Semanal',
      nivelControle: 'Primeira pústula',
    },
    referencias: [{ source: 'EMBRAPA', ano: 2024 }],
  };
}

function makeKnowledge(opts: { empty?: boolean } = {}): UseMipKnowledgeResult {
  if (opts.empty) {
    return { entry: null, levels: [], matchScore: 0, empty: true };
  }
  const levels: MipLevelData[] = (['baixo', 'medio', 'alto'] as const).map((level) => ({
    level,
    recommendation: makeRecommendation(level),
  }));
  return { entry: makeEntry(), levels, matchScore: 8, empty: false };
}

describe('MipCard', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
  });

  it('returns null when not enabled', () => {
    const { toJSON } = render(<MipCard knowledge={makeKnowledge()} enabled={false} />);
    expect(toJSON()).toBeNull();
  });

  it('renders empty state when no entry matched', () => {
    const { getByTestId, getByText } = render(
      <MipCard knowledge={makeKnowledge({ empty: true })} />,
    );
    expect(getByTestId('mip-card-empty')).toBeTruthy();
    expect(getByText('mip.emptyState')).toBeTruthy();
  });

  it('renders all three levels without a plan gate', () => {
    const { getByTestId } = render(<MipCard knowledge={makeKnowledge()} />);
    expect(getByTestId('mip-chip-baixo')).toBeTruthy();
    expect(getByTestId('mip-chip-medio')).toBeTruthy();
    expect(getByTestId('mip-chip-alto')).toBeTruthy();
  });

  it('selects the tapped level and never navigates away (free build)', () => {
    const onAnalytics = jest.fn();
    const { getByTestId } = render(
      <MipCard knowledge={makeKnowledge()} onAnalyticsEvent={onAnalytics} />,
    );
    fireEvent.press(getByTestId('mip-chip-medio'));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(onAnalytics).toHaveBeenCalledWith(
      'mip_level_selected',
      expect.objectContaining({ level: 'medio' }),
    );
    expect(onAnalytics.mock.calls[0][1]).not.toHaveProperty('tier');
  });

  it('selects the high level without navigating', () => {
    const onAnalytics = jest.fn();
    const { getByTestId } = render(
      <MipCard knowledge={makeKnowledge()} onAnalyticsEvent={onAnalytics} />,
    );
    fireEvent.press(getByTestId('mip-chip-alto'));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(onAnalytics).toHaveBeenCalledWith(
      'mip_level_selected',
      expect.objectContaining({ level: 'alto' }),
    );
  });

  it('never renders an upgrade CTA', () => {
    const { queryByTestId } = render(<MipCard knowledge={makeKnowledge()} />);
    expect(queryByTestId('mip-upgrade-cta')).toBeNull();
  });

  it('always renders the current regulatory disclaimer', () => {
    const { getByText } = render(<MipCard knowledge={makeKnowledge()} />);
    expect(getByText('mip.regulatoryDisclaimer')).toBeTruthy();
  });

  it('does not display endorsements or actionable chemical fields from catalog data', () => {
    const { queryByText, getByTestId } = render(<MipCard knowledge={makeKnowledge()} />);
    fireEvent.press(getByTestId('mip-chip-alto'));
    expect(queryByText(/EMBRAPA|MAPA/i)).toBeNull();
    expect(queryByText(/Azoxistrobina|Produto X|0,4 L\/ha|14 dias|carência/i)).toBeNull();
    expect(queryByText('mip.chemicalActions')).toBeNull();
    expect(queryByText('mip.commercialProductsLabel')).toBeNull();
  });

  it('matches snapshot', () => {
    const { toJSON } = render(<MipCard knowledge={makeKnowledge()} />);
    expect(toJSON()).toMatchSnapshot();
  });
});
