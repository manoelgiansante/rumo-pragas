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
        acao: 'Monitoramento',
      },
      medio: {
        criterio: 'Risco climático médio',
        acao: 'Aplicação preventiva em 50 % antese',
      },
      alto: {
        criterio: 'Risco alto + sintomas iniciais',
        acao: 'Aplicação imediata + reaplicação 7-10 dias',
      },
    },
    mip: {
      cultural: ['Cultivares moderadamente resistentes', 'Rotação', 'Manejo restos culturais'],
      biologico: ['Trichoderma'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'multissitios'],
        ingredientesAtivos: [
          {
            nome: 'Protioconazol + Tebuconazol',
            graudeIRACouFRAC: 'FRAC 3 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura triazois',
                formulacao: 'EC',
                dosagem: '0,75-1,0 L p.c./ha',
                intervaloAplicacoes: '10-14 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Janela é curta — aplicação em 50 % antese é crítica'],
      },
    },
    rotacaoResistencia: 'Rotacionar triazois + multissítio.',
    monitoramento: {
      metodo: 'Acompanhar previsão climática + fenologia',
      frequencia: 'Diária no espigamento',
      nivelControle: 'Risco climático + 50 % antese',
    },
    observacoesAgronomicas: 'Doença #1 do trigo no Sul. Janela de controle é dias.',
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
        acao: 'Aplicação programada',
      },
      medio: {
        criterio: 'Sintomas em manchões',
        acao: 'Aplicação tripla mistura',
      },
      alto: {
        criterio: 'Generalizada',
        acao: 'Controle paliativo + cultivar próximo ciclo',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Plantio na janela', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas'],
        ingredientesAtivos: [
          {
            nome: 'Azoxistrobina + Tebuconazol',
            graudeIRACouFRAC: 'FRAC 11 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Resistência QoI documentada — sempre em mistura'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + multissítio.',
    monitoramento: {
      metodo: 'Inspeção espigas + clima',
      frequencia: 'Semanal espigamento',
      nivelControle: 'Risco climático + sintomas',
    },
    observacoesAgronomicas: 'Brusone tem foco regional Centro-Oeste — pode dizimar lavouras.',
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
        acao: 'Cultivar resistente cobre',
      },
      medio: {
        criterio: '10-25 %',
        acao: 'Aplicação fungicida',
      },
      alto: {
        criterio: '> 25 %',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas'],
        ingredientesAtivos: [
          {
            nome: 'Tripla mistura padrão',
            graudeIRACouFRAC: 'FRAC 11 + 7 + 3',
            produtosComerciais: [
              {
                nome: 'Tripla comercial',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha',
                intervaloAplicacoes: '14-21 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Cultivares resistentes mudam de eficácia rapidamente'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + cultivar resistente.',
    monitoramento: {
      metodo: 'Inspeção folhas',
      frequencia: 'Semanal',
      nivelControle: '5 % severidade',
    },
    observacoesAgronomicas: 'Doença de evolução rápida. Cultivar resistente é a chave.',
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
        acao: 'Monitoramento',
      },
      medio: {
        criterio: '1-3 moscas/panícula',
        acao: 'Aplicação química',
      },
      alto: {
        criterio: '> 3 moscas/panícula',
        acao: 'Aplicação imediata + reaplicação 3-5 dias',
      },
    },
    mip: {
      cultural: [
        'Plantio uniforme (florescimento concentrado)',
        'Cultivares com pelos na espigueta',
      ],
      biologico: [],
      mecanico: ['Monitoramento visual'],
      quimico: {
        classes: ['piretroides'],
        ingredientesAtivos: [
          {
            nome: 'Lambda-cialotrina',
            graudeIRACouFRAC: 'IRAC 3A',
            produtosComerciais: [
              {
                nome: 'Lambda 50 EC',
                formulacao: 'EC',
                dosagem: '100-150 mL p.c./ha',
                intervaloAplicacoes: '3-5 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Aplicar nas horas frescas — janela curta'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 3A → 1B.',
    monitoramento: {
      metodo: 'Inspeção panículas',
      frequencia: 'Diária no florescimento',
      nivelControle: '1 mosca/panícula',
    },
    observacoesAgronomicas: 'Praga limita produtividade em sorgo granífero.',
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
        acao: 'Metarhizium',
      },
      medio: {
        criterio: '5-10 adultos/m²',
        acao: 'Metarhizium intensivo',
      },
      alto: {
        criterio: '> 10 adultos/m²',
        acao: 'Aplicação química + Metarhizium',
      },
    },
    mip: {
      cultural: [
        'Cultivares de braquiária resistentes (Marandu, Piatã, Paiaguás)',
        'Pastejo rotacionado',
        'Adubação equilibrada',
      ],
      biologico: ['Metarhizium anisopliae — controle massal brasileiro'],
      mecanico: ['Inspeção visual'],
      quimico: {
        classes: ['piretroides', 'neonicotinoides'],
        ingredientesAtivos: [
          {
            nome: 'Lambda-cialotrina',
            graudeIRACouFRAC: 'IRAC 3A',
            produtosComerciais: [
              {
                nome: 'Lambda 50 EC',
                formulacao: 'EC',
                dosagem: '150 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Metarhizium é primeira escolha (sem carência)'],
      },
    },
    rotacaoResistencia: 'Metarhizium preserva químicos.',
    monitoramento: {
      metodo: 'Quadrado 1 m² + contagem',
      frequencia: 'Quinzenal',
      nivelControle: '5 adultos/m²',
    },
    observacoesAgronomicas: 'Praga regional importante. Metarhizium é solução brasileira líder.',
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
        acao: 'ERRADICAÇÃO IMEDIATA + controle psilídeo',
      },
      medio: {
        criterio: 'Manchões',
        acao: 'Erradicação + controle agressivo psilídeo',
      },
      alto: {
        criterio: 'Talhão comprometido',
        acao: 'Erradicação total + replantio com mudas certificadas',
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
      mecanico: ['Inspeção visual sistemática'],
      quimico: {
        classes: ['controle do psilídeo (vetor)'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam (sistêmico solo/foliar)',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Tiametoxam 250 WG',
                formulacao: 'WG',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: '30-45 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['NÃO HÁ CURA — manejo é via vetor + erradicação'],
      },
    },
    rotacaoResistencia: 'Rotação IRAC psilídeo (4A → 3A → 28).',
    monitoramento: {
      metodo: 'Inspeção visual mensal + armadilhas amarelas psilídeo',
      frequencia: 'Mensal',
      nivelControle: 'Qualquer planta com sintoma = erradicar',
    },
    observacoesAgronomicas:
      'DOENÇA #1 da citricultura mundial. SP perdeu mais de 25 % de pés em 15 anos. ' +
      'Manejo é REGIONAL — propriedades isoladas não conseguem. Fundecitrus coordena.',
    referencias: [REF_EMBRAPA, REF_MAPA],
  },
];
