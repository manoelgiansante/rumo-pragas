/**
 * Catálogo MIP — Outras culturas (bonus)
 *
 * Trigo, sorgo, pastagem, eucalipto — entradas chave para completar
 * o portfólio de culturas atendidas pelo Rumo Pragas.
 *
 * Fontes:
 *  - EMBRAPA Trigo (Passo Fundo)
 *  - EMBRAPA Milho e Sorgo
 *  - EMBRAPA Gado de Corte / Embrapa Pecuária Sudeste
 *  - IPEF / IRAC / FRAC 2026
 *  - MAPA / Agrofit
 */

import type { MipEntry } from './types';

const REF_EMBRAPA = {
  source: 'EMBRAPA' as const,
  url: 'https://www.embrapa.br/',
  ano: 2025,
  titulo: 'EMBRAPA — manejo cultivares',
};

const REF_IRAC = {
  source: 'IRAC' as const,
  url: 'https://irac-online.org/mode-of-action/classification-online/',
  ano: 2026,
  titulo: 'IRAC MoA 11.5',
};

const REF_FRAC = {
  source: 'FRAC' as const,
  url: 'https://www.frac.info/',
  ano: 2026,
  titulo: 'FRAC Code List 2026',
};

const REF_MAPA = {
  source: 'MAPA' as const,
  url: 'https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons',
  ano: 2026,
  titulo: 'MAPA / Agrofit',
};

export const OUTRAS_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // TRIGO
  // ============================================================
  {
    id: 'trigo_giberela',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Giberela do trigo',
    nomesAlternativos: ['Fusarium head blight', 'FHB'],
    nomeCientifico: 'Fusarium graminearum',
    culturas: ['trigo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Espiguetas branqueadas (descoloridas) precocemente, contrastando com espiguetas ' +
        'verdes. Grãos chochos, enrugados, com micotoxinas (DON). Pode causar queda de ' +
        'PH e rejeição do trigo.',
      palavrasChave: [
        'espiguetas brancas trigo',
        'giberela',
        'fusarium trigo',
        'grão chocho trigo',
        'don micotoxina',
      ],
      estagioAcometido: ['espigas', 'grãos'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '20-26 °C',
      umidade: 'Chuva no espigamento/florescimento',
      estacao: 'Espigamento (set-out)',
    },
    niveisDano: {
      baixo: {
        criterio: 'Risco climático baixo',
      },
      medio: {
        criterio: 'Risco climático médio',
      },
      alto: {
        criterio: 'Risco alto + sintomas iniciais',
      },
    },
    mip: {
      cultural: ['Cultivares moderadamente resistentes', 'Rotação', 'Manejo restos culturais'],
      biologico: ['Trichoderma'],
    },
    monitoramento: {
      metodo: 'Acompanhar previsão climática + fenologia',
      frequencia: 'Diária no espigamento',
      nivelControle: 'Risco climático + 50 % antese',
    },
    referencias: [REF_EMBRAPA, REF_FRAC, REF_MAPA],
  },

  {
    id: 'trigo_brusone',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Brusone do trigo',
    nomesAlternativos: ['Pyricularia'],
    nomeCientifico: 'Magnaporthe oryzae',
    culturas: ['trigo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Branqueamento total ou parcial da espiga (acima de um ponto da raque) — espiga ' +
        '"queima" enquanto outras permanecem verdes. Manchas nas folhas com bordas escuras ' +
        'e centro branco.',
      palavrasChave: ['brusone trigo', 'espiga branca trigo', 'queima da espiga', 'pyricularia'],
      estagioAcometido: ['espigas', 'folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '24-28 °C',
      umidade: 'Alta com molhamento',
      estacao: 'Espigamento',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Sintomas em manchões',
      },
      alto: {
        criterio: 'Generalizada',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Plantio na janela', 'Rotação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção espigas + clima',
      frequencia: 'Semanal espigamento',
      nivelControle: 'Risco climático + sintomas',
    },
    referencias: [REF_EMBRAPA, REF_FRAC, REF_MAPA],
  },

  {
    id: 'trigo_ferrugem_folha',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem-da-folha do trigo',
    nomesAlternativos: ['Puccinia triticina'],
    nomeCientifico: 'Puccinia triticina',
    culturas: ['trigo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pústulas alaranjadas pequenas, circulares, na face superior das folhas. Em alta ' +
        'severidade: queima foliar e perda produtividade.',
      palavrasChave: ['pústulas laranjas trigo', 'ferrugem da folha', 'puccinia trigo'],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '15-25 °C',
      umidade: 'Alta',
      estacao: 'Pré-espigamento',
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % severidade',
      },
      medio: {
        criterio: '10-25 %',
      },
      alto: {
        criterio: '> 25 %',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção folhas',
      frequencia: 'Semanal',
      nivelControle: '5 % severidade',
    },
    referencias: [REF_EMBRAPA, REF_FRAC, REF_MAPA],
  },

  // ============================================================
  // SORGO
  // ============================================================
  {
    id: 'sorgo_mosca_panicula',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Mosca-da-panícula',
    nomesAlternativos: ['Stenodiplosis', 'mosca'],
    nomeCientifico: 'Stenodiplosis sorghicola',
    culturas: ['sorgo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequenas larvas alaranjadas dentro de espiguetas em florescimento. Espiguetas ' +
        'ficam ocas (sem grão). Perdas podem ser totais em alta população.',
      palavrasChave: [
        'mosca da panícula sorgo',
        'espigueta vazia',
        'stenodiplosis',
        'sorgo sem grão',
      ],
      estagioAcometido: ['florescimento', 'espiguetas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Variada',
      estacao: 'Florescimento sorgo',
    },
    niveisDano: {
      baixo: {
        criterio: '< 1 mosca/panícula',
      },
      medio: {
        criterio: '1-3 moscas/panícula',
      },
      alto: {
        criterio: '> 3 moscas/panícula',
      },
    },
    mip: {
      cultural: [
        'Plantio uniforme (florescimento concentrado)',
        'Cultivares com pelos na espigueta',
      ],
      biologico: [],
    },
    monitoramento: {
      metodo: 'Inspeção panículas',
      frequencia: 'Diária no florescimento',
      nivelControle: '1 mosca/panícula',
    },
    referencias: [REF_EMBRAPA, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // PASTAGEM
  // ============================================================
  {
    id: 'pastagem_cigarrinha',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Cigarrinha-das-pastagens',
    nomesAlternativos: ['Deois', 'cigarrinha do capim'],
    nomeCientifico: 'Deois flavopicta / Mahanarva spectabilis',
    culturas: [],
    imageUrls: [],
    sintomas: {
      descricao:
        'Ninfas em espumas brancas na base do colmo. Adultos pretos com manchas amarelas. ' +
        'Sucção causa amarelecimento, secamento e perda de produção forrageira.',
      palavrasChave: [
        'cigarrinha pastagem',
        'espuma branca no pasto',
        'pasto amarelando',
        'deois',
        'mahanarva pastagem',
      ],
      estagioAcometido: ['colmos', 'folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-30 °C',
      umidade: 'Alta umidade do solo',
      estacao: 'Out-mar',
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 adultos/m²',
      },
      medio: {
        criterio: '5-10 adultos/m²',
      },
      alto: {
        criterio: '> 10 adultos/m²',
      },
    },
    mip: {
      cultural: [
        'Cultivares de braquiária resistentes (Marandu, Piatã, Paiaguás)',
        'Pastejo rotacionado',
        'Adubação equilibrada',
      ],
      biologico: ['Metarhizium anisopliae — controle massal brasileiro'],
    },
    monitoramento: {
      metodo: 'Quadrado 1 m² + contagem',
      frequencia: 'Quinzenal',
      nivelControle: '5 adultos/m²',
    },
    referencias: [REF_EMBRAPA, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // CITROS (extra)
  // ============================================================
  {
    id: 'citros_huanglongbing',
    type: 'doenca',
    category: 'bacteria',
    nomeComum: 'Greening / Huanglongbing (HLB)',
    nomesAlternativos: ['HLB', 'greening', 'Candidatus Liberibacter'],
    nomeCientifico: 'Candidatus Liberibacter asiaticus',
    culturas: ['citros'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Mosqueamento amarelo ASSIMÉTRICO nas folhas (mancha diferente em cada lado da ' +
        'nervura — DIAGNOSE CHAVE). Frutos pequenos, deformados, com inversão da maturação ' +
        '(coloração saindo do estilete). Planta morre em 3-5 anos. Transmitido por ' +
        'Diaphorina citri (psilídeo).',
      palavrasChave: [
        'greening citros',
        'huanglongbing',
        'hlb',
        'mosqueamento assimétrico',
        'fruto deformado citros',
        'planta morrendo citros',
        'diaphorina',
      ],
      estagioAcometido: ['planta toda'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: 'Variada',
      umidade: 'Variada',
      estacao: 'Ano todo',
      observacoes: ['Sem psilídeo = sem greening'],
    },
    niveisDano: {
      baixo: {
        criterio: 'Plantas isoladas',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Talhão comprometido',
      },
    },
    mip: {
      cultural: [
        'MUDAS CERTIFICADAS (livres de greening) em viveiros telados',
        'Inspeção mensal obrigatória',
        'Erradicação imediata plantas sintomáticas',
        'Quebra-ventos arborizados',
      ],
      biologico: ['Tamarixia radiata (parasitoide do psilídeo)'],
    },
    monitoramento: {
      metodo: 'Inspeção visual mensal + armadilhas amarelas psilídeo',
      frequencia: 'Mensal',
      nivelControle: 'Qualquer planta com sintoma = erradicar',
    },
    referencias: [REF_EMBRAPA, REF_MAPA],
  },
];
