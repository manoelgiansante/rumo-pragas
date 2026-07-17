/**
 * Catálogo MIP — Algodão (Gossypium hirsutum)
 *
 * Cultura prioritária BR Centro-Oeste e Nordeste. Algodão é "campeão"
 * de pragas — exige MIP rigoroso com Manejo Integrado de Resistência.
 *
 * Fontes consultadas:
 *  - EMBRAPA Algodão (Campina Grande)
 *  - ABRAPA — Associação Brasileira dos Produtores de Algodão
 *  - IMAmt — Instituto Mato-Grossense do Algodão
 *  - IRAC / FRAC 2026
 *  - MAPA / Agrofit
 */

import type { MipEntry } from './types';

const REF_EMBRAPA_ALG = {
  source: 'EMBRAPA' as const,
  url: 'https://www.embrapa.br/algodao',
  ano: 2025,
  titulo: 'EMBRAPA Algodão — Sistemas de produção',
};

const REF_ABRAPA = {
  source: 'EMBRAPA' as const,
  url: 'https://www.abrapa.com.br/',
  ano: 2025,
  titulo: 'ABRAPA — boletins técnicos',
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

export const ALGODAO_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // PRAGAS — ALGODÃO
  // ============================================================
  {
    id: 'algodao_bicudo',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Bicudo-do-algodoeiro',
    nomesAlternativos: ['bicudo', 'Anthonomus'],
    nomeCientifico: 'Anthonomus grandis',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequeno besouro marrom-acinzentado (6-8 mm) com rostro pronunciado (focinho ' +
        'longo). Adultos perfuram botões florais e maçãs para alimentação e postura. ' +
        'Botões/maçãs atacados caem ("queda de botões"). Maças amareladas, "carolas" ' +
        '(brácteas se abrem) no chão.',
      palavrasChave: [
        'bicudo do algodão',
        'queda de botões',
        'maçãs caídas',
        'anthonomus',
        'besouro de rostro',
        'botões furados algodão',
        'maçãs amareladas',
      ],
      estagioAcometido: ['botões florais', 'maçãs jovens'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Ciclo 20-25 dias. Adulto longevo (vários meses). Sobrevive na entressafra em ' +
      'plantas hospedeiras silvestres e restos de cultura.',
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Variada',
      estacao: 'Florescimento (B1 em diante)',
      observacoes: [
        'Plantios sucessivos elevam pressão regional',
        'Falta de destruição de soqueiras agrava',
      ],
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 % botões atacados OU < 1 adulto/armadilha/semana',
      },
      medio: {
        criterio: '5-10 % botões OU 1-3 adultos/armadilha',
      },
      alto: {
        criterio: '> 10 % botões OU > 3 adultos/armadilha',
      },
    },
    mip: {
      cultural: [
        'DESTRUIÇÃO DE SOQUEIRAS obrigatória (vazio sanitário regional)',
        'Plantio na janela legal',
        'Cultivares precoces',
        'Borduras de algodão (iscas)',
      ],
      biologico: [
        'Beauveria bassiana (eficácia parcial)',
        'Catolaccus grandis (parasitoide — programas pontuais)',
      ],
    },
    monitoramento: {
      metodo: 'Armadilhas grandlure + amostragem 100 botões/talhão. Borda da lavoura prioritária.',
      frequencia: '2x/semana a partir B1',
      nivelControle: '5 % botões atacados OU 1 bicudo/armadilha/semana',
    },
    referencias: [REF_EMBRAPA_ALG, REF_ABRAPA, REF_IRAC, REF_MAPA],
  },

  {
    id: 'algodao_lagarta_rosada',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Lagarta-rosada',
    nomesAlternativos: ['Pectinophora', 'rosada'],
    nomeCientifico: 'Pectinophora gossypiella',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Lagarta rosada (3-13 mm) dentro de maçãs em formação. Causa "rosetação" (botões ' +
        'florais não abrem normalmente) e dano interno em sementes. Maçãs atacadas com ' +
        'orifícios de saída pequenos. Reduz qualidade da fibra.',
      palavrasChave: [
        'lagarta rosada algodão',
        'roseta no algodão',
        'maçã com lagarta rosa',
        'pectinophora',
        'botão não abre',
      ],
      estagioAcometido: ['botões florais', 'maçãs em formação', 'sementes'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Variada',
      estacao: 'Florescimento e enchimento maçãs',
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 % maçãs/botões atacados',
      },
      medio: {
        criterio: '5-10 %',
      },
      alto: {
        criterio: '> 10 %',
      },
    },
    mip: {
      cultural: [
        'Algodão Bt (eventos com Cry1Ac, Cry2Ab) — alta eficácia',
        'Destruição de soqueiras',
        'Plantio na janela legal',
        'Refúgio Bt obrigatório',
      ],
      biologico: ['Trichogramma'],
    },
    monitoramento: {
      metodo: 'Armadilhas feromônio + amostragem maçãs',
      frequencia: 'Semanal',
      nivelControle: '5 % maçãs atacadas em algodão convencional',
    },
    referencias: [REF_EMBRAPA_ALG, REF_ABRAPA, REF_IRAC, REF_MAPA],
  },

  {
    id: 'algodao_mosca_branca',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Mosca-branca (algodão)',
    nomesAlternativos: ['Bemisia'],
    nomeCientifico: 'Bemisia tabaci',
    culturas: ['algodao', 'soja', 'tomate'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Adultos brancos (~1 mm) na face inferior das folhas. Ninfas amareladas sésseis. ' +
        'Causa "fumagina" (fungo preto sobre melaço excretado). Em alta população, melaço ' +
        'em pluma reduz qualidade da fibra. Vetor de viroses.',
      palavrasChave: [
        'mosca branca algodão',
        'fumagina algodão',
        'pluma melada',
        'melado nas folhas',
        'bemisia algodão',
      ],
      estagioAcometido: ['folhas', 'plumas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Baixa a moderada',
      estacao: 'Verão seco',
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 adultos/folha',
      },
      medio: {
        criterio: '5-10 adultos/folha',
      },
      alto: {
        criterio: '> 10 adultos/folha',
      },
    },
    mip: {
      cultural: ['Janela livre de hospedeiros', 'Cultivares menos suscetíveis'],
      biologico: ['Beauveria bassiana', 'Encarsia formosa', 'Eretmocerus mundus'],
    },
    monitoramento: {
      metodo: 'Inspeção folhas + armadilhas amarelas',
      frequencia: 'Semanal',
      nivelControle: '5-10 adultos/folha',
    },
    referencias: [REF_EMBRAPA_ALG, REF_IRAC, REF_MAPA],
  },

  {
    id: 'algodao_pulgao',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Pulgão-do-algodoeiro',
    nomesAlternativos: ['Aphis gossypii'],
    nomeCientifico: 'Aphis gossypii',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Colônias verde-amareladas na face inferior das folhas. Enrolamento de folhas, ' +
        'melaço, fumagina. Vetor de viroses (vermelhão, mosaico).',
      palavrasChave: [
        'pulgão algodão',
        'enrolamento folhas algodão',
        'colônia verde embaixo da folha',
        'fumagina',
        'aphis',
      ],
      estagioAcometido: ['folhas novas', 'brotos'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Variada',
      estacao: 'V3 em diante',
    },
    niveisDano: {
      baixo: {
        criterio: '< 50 % plantas colonizadas',
      },
      medio: {
        criterio: '50-70 %',
      },
      alto: {
        criterio: '> 70 %',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada'],
      biologico: ['Joaninhas', 'Crisopídeos', 'Aphidius', 'Beauveria'],
    },
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal V3+',
      nivelControle: '50 % plantas colonizadas',
    },
    referencias: [REF_EMBRAPA_ALG, REF_IRAC, REF_MAPA],
  },

  {
    id: 'algodao_acaro_branco',
    type: 'praga',
    category: 'acaro',
    nomeComum: 'Ácaro-branco',
    nomesAlternativos: ['Polyphagotarsonemus'],
    nomeCientifico: 'Polyphagotarsonemus latus',
    culturas: ['algodao', 'tomate'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Folhas novas com aspecto bronzeado, deformadas, encarquilhadas. Brotos terminais ' +
        'paralisam crescimento. Ácaro minúsculo (< 0,3 mm), invisível a olho nu — diagnose ' +
        'por sintoma típico.',
      palavrasChave: [
        'folhas encarquilhadas algodão',
        'ácaro branco',
        'bronzeamento folha nova',
        'brotos paralisados',
        'polyphagotarsonemus',
      ],
      estagioAcometido: ['folhas novas', 'brotos terminais'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Alta',
      estacao: 'Verão úmido',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Manchões com deformação',
      },
      alto: {
        criterio: 'Generalizado',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada'],
      biologico: ['Neoseiulus californicus'],
    },
    monitoramento: {
      metodo: 'Inspeção visual sintomas (não dos ácaros)',
      frequencia: 'Semanal',
      nivelControle: 'Sintomas em brotos',
    },
    referencias: [REF_EMBRAPA_ALG, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // DOENÇAS — ALGODÃO
  // ============================================================
  {
    id: 'algodao_ramularia',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-de-ramulária',
    nomesAlternativos: ['Ramularia areola'],
    nomeCientifico: 'Ramularia areola',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas angulares brancas-pulverulentas na face inferior das folhas, ' +
        'evoluindo para necrose marrom. Desfolha em alta severidade. Doença #1 do ' +
        'algodão brasileiro.',
      palavrasChave: [
        'ramulária algodão',
        'mancha branca pulverulenta',
        'manchas angulares brancas',
        'desfolha algodão',
        'ramularia',
      ],
      estagioAcometido: ['folhas baixeiras → superiores'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-28 °C',
      umidade: 'Alta, molhamento foliar > 12 h',
      estacao: 'B1 em diante',
    },
    niveisDano: {
      baixo: {
        criterio: 'Primeiros sintomas baixeiros',
      },
      medio: {
        criterio: 'Severidade 10-25 %',
      },
      alto: {
        criterio: '> 25 % com desfolha',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação', 'Dessecação tardia em soqueiras'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção folhas baixeiras',
      frequencia: 'Semanal B1+',
      nivelControle: 'Primeiros sintomas',
    },
    referencias: [REF_EMBRAPA_ALG, REF_ABRAPA, REF_FRAC, REF_MAPA],
  },

  {
    id: 'algodao_mancha_angular',
    type: 'doenca',
    category: 'bacteria',
    nomeComum: 'Mancha-angular',
    nomesAlternativos: ['Xanthomonas algodão'],
    nomeCientifico: 'Xanthomonas citri pv. malvacearum',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas angulares aquosas escuras nas folhas (limitadas pelas nervuras). ' +
        'Em hastes: manchas escuras alongadas ("nervo preto"). Maçãs com manchas ' +
        'escuras → grãos pretos.',
      palavrasChave: [
        'mancha angular algodão',
        'nervo preto algodão',
        'manchas aquosas escuras folha',
        'xanthomonas algodão',
        'maças com mancha escura',
      ],
      estagioAcometido: ['folhas', 'hastes', 'maçãs'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Alta',
      estacao: 'Chuvas com vento',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Generalizada com nervo preto',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Sementes sadias e certificadas', 'Rotação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal pós-chuvas',
      nivelControle: 'Sintomas iniciais',
    },
    referencias: [REF_EMBRAPA_ALG, REF_MAPA],
  },

  {
    id: 'algodao_ramulose',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ramulose',
    nomesAlternativos: ['Colletotrichum gossypii var. cephalosporioides'],
    nomeCientifico: 'Colletotrichum gossypii var. cephalosporioides',
    culturas: ['algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Brotos terminais com aspecto enrolado, encurvados. Plantas com superbroto ' +
        '(perfilhamento excessivo). Maçãs deformadas.',
      palavrasChave: [
        'ramulose algodão',
        'broto enrolado',
        'superbroto',
        'planta deformada algodão',
      ],
      estagioAcometido: ['brotos', 'planta toda'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-28 °C',
      umidade: 'Alta',
      estacao: 'Crescimento vegetativo',
    },
    niveisDano: {
      baixo: {
        criterio: 'Plantas isoladas',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Generalizado',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Sementes sadias e certificadas', 'Rotação'],
      biologico: ['Agentes biológicos somente após validação profissional e no AGROFIT'],
    },
    monitoramento: {
      metodo: 'Inspeção brotos',
      frequencia: 'Semanal V3+',
      nivelControle: 'Sintomas isolados',
    },
    referencias: [REF_EMBRAPA_ALG, REF_FRAC, REF_MAPA],
  },
];
