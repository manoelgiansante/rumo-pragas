/**
 * Tests for MipCard — loading/empty states, level selection, references.
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
    acaoPrincipal: `Ação ${level}`,
    acoesCulturais: ['Rotação de culturas', 'Vazio sanitário'],
    acoesBiologicas: ['Bacillus subtilis'],
    acoesMecanicas: ['Monitoramento semanal'],
    rotacaoResistencia: 'Alternar FRAC 3 / 7 / 11',
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal',
      nivelControle: 'Primeira pústula',
    },
    disclaimerCREA: 'Disclaimer CREA fixo de teste — não substitui receituário.',
    referencias: [
      { source: 'EMBRAPA', ano: 2024, url: 'https://embrapa.br' },
      { source: 'MAPA', ano: 2024 },
    ],
    ...(level !== 'baixo'
      ? {
          acoesQuimicas: {
            classes: ['triazois'],
            ingredientesAtivosSugeridos: ['Azoxistrobina (FRAC 11)'],
            observacoes: ['Rotacionar IRAC'],
          },
        }
      : {}),
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
      baixo: { criterio: 'Primeiras pústulas', acao: 'Aplicar preventivo' },
      medio: { criterio: '5-10% de severidade', acao: 'Aplicação curativa' },
      alto: { criterio: '> 25% de severidade', acao: 'Aplicação de resgate' },
    },
    mip: {
      cultural: ['Rotação'],
      biologico: ['Bacillus'],
      mecanico: ['Inspeção'],
      quimico: {
        classes: ['triazois'],
        ingredientesAtivos: [
          {
            nome: 'Azoxistrobina',
            graudeIRACouFRAC: 'FRAC 11',
            produtosComerciais: [
              {
                nome: 'Produto X',
                formulacao: 'SC',
                dosagem: '0,4 L/ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Rotacionar IRAC'],
      },
    },
    rotacaoResistencia: 'Alternar FRAC',
    monitoramento: {
      metodo: 'Visual',
      frequencia: 'Semanal',
      nivelControle: 'Primeira pústula',
    },
    observacoesAgronomicas: '',
    referencias: [{ source: 'EMBRAPA', ano: 2024 }],
  };
}

function makeKnowledge(
  tier: 'free' | 'pro',
  opts: { loading?: boolean; empty?: boolean } = {},
): UseMipKnowledgeResult {
  if (opts.loading) {
    return { loading: true, entry: null, levels: [], matchScore: 0, empty: false };
  }
  if (opts.empty) {
    return { loading: false, entry: null, levels: [], matchScore: 0, empty: true };
  }
  const unlocked = new Set<'baixo' | 'medio' | 'alto'>(
    tier === 'pro' ? ['baixo', 'medio', 'alto'] : ['baixo'],
  );
  const levels: MipLevelData[] = (['baixo', 'medio', 'alto'] as const).map((level) => ({
    level,
    unlocked: unlocked.has(level),
    recommendation: makeRecommendation(level),
  }));
  return { loading: false, entry: makeEntry(), levels, matchScore: 8, empty: false };
}

describe('MipCard', () => {
  beforeEach(() => {
    mockRouterPush.mockClear();
  });

  it('returns null when not enabled', () => {
    const { toJSON } = render(
      <MipCard knowledge={makeKnowledge('pro')} tier="pro" enabled={false} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders skeleton while loading', () => {
    const { getByTestId } = render(
      <MipCard knowledge={makeKnowledge('pro', { loading: true })} tier="pro" />,
    );
    expect(getByTestId('mip-card-skeleton')).toBeTruthy();
  });

  it('renders empty state when no entry matched', () => {
    const { getByTestId, getByText } = render(
      <MipCard knowledge={makeKnowledge('pro', { empty: true })} tier="pro" />,
    );
    expect(getByTestId('mip-card-empty')).toBeTruthy();
    expect(getByText('mip.emptyState')).toBeTruthy();
  });

  it('renders all three chips with one unlocked for free tier', () => {
    const { getByTestId } = render(<MipCard knowledge={makeKnowledge('free')} tier="free" />);
    expect(getByTestId('mip-chip-baixo')).toBeTruthy();
    expect(getByTestId('mip-chip-medio')).toBeTruthy();
    expect(getByTestId('mip-chip-alto')).toBeTruthy();
  });

  it('selects the tapped level and never navigates away (free build)', () => {
    const onAnalytics = jest.fn();
    const { getByTestId } = render(
      <MipCard knowledge={makeKnowledge('free')} tier="free" onAnalyticsEvent={onAnalytics} />,
    );
    fireEvent.press(getByTestId('mip-chip-medio'));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(onAnalytics).toHaveBeenCalledWith(
      'mip_level_selected',
      expect.objectContaining({ level: 'medio', tier: 'free' }),
    );
  });

  it('selects any chip without navigating for pro users', () => {
    const onAnalytics = jest.fn();
    const { getByTestId } = render(
      <MipCard knowledge={makeKnowledge('pro')} tier="pro" onAnalyticsEvent={onAnalytics} />,
    );
    fireEvent.press(getByTestId('mip-chip-alto'));
    expect(mockRouterPush).not.toHaveBeenCalled();
    expect(onAnalytics).toHaveBeenCalledWith(
      'mip_level_selected',
      expect.objectContaining({ level: 'alto', tier: 'pro' }),
    );
  });

  it('never renders an upgrade CTA', () => {
    const { queryByTestId } = render(<MipCard knowledge={makeKnowledge('free')} tier="free" />);
    expect(queryByTestId('mip-upgrade-cta')).toBeNull();
  });

  it('always renders the CREA disclaimer', () => {
    const { getByText } = render(<MipCard knowledge={makeKnowledge('free')} tier="free" />);
    expect(getByText(/Disclaimer CREA fixo de teste/i)).toBeTruthy();
  });

  it('renders the source references', () => {
    const { getByText } = render(<MipCard knowledge={makeKnowledge('pro')} tier="pro" />);
    expect(getByText('EMBRAPA')).toBeTruthy();
    expect(getByText('MAPA')).toBeTruthy();
  });

  it('matches snapshot for free tier', () => {
    const { toJSON } = render(<MipCard knowledge={makeKnowledge('free')} tier="free" />);
    expect(toJSON()).toMatchSnapshot();
  });

  it('matches snapshot for pro tier', () => {
    const { toJSON } = render(<MipCard knowledge={makeKnowledge('pro')} tier="pro" />);
    expect(toJSON()).toMatchSnapshot();
  });
});
