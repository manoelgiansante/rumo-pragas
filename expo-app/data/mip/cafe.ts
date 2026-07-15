/**
 * Catálogo MIP — Café (Coffea arabica e C. canephora)
 *
 * Cultura prioritária AgroRumo (público MG, ES, SP, BA cafeeiros).
 *
 * Fontes consultadas:
 *  - EMBRAPA Café (Brasília) + Fundação Procafé
 *  - IAC + IBC programas históricos
 *  - MAPA / Agrofit
 *  - IRAC / FRAC 2026
 */

import type { MipEntry } from './types';

const REF_EMBRAPA_CAFE = {
  source: 'EMBRAPA' as const,
  url: 'https://www.embrapa.br/cafe',
  ano: 2025,
  titulo: 'EMBRAPA Café — Manual de manejo',
};

const REF_PROCAFE = {
  source: 'EMBRAPA' as const,
  url: 'https://www.fundacaoprocafe.com.br/',
  ano: 2025,
  titulo: 'Fundação Procafé — boletins técnicos',
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

export const CAFE_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // PRAGAS — CAFÉ
  // ============================================================
  {
    id: 'cafe_broca_do_cafe',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Broca-do-café',
    nomesAlternativos: ['broca dos frutos'],
    nomeCientifico: 'Hypothenemus hampei',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequeno besouro preto (1,5-2 mm) que perfura o fruto pela parte apical (coroa) e ' +
        'destrói as sementes. Frutos broqueados apresentam orifício escuro na coroa e perda ' +
        'parcial ou total dos grãos. Reduz tipo e bebida.',
      palavrasChave: [
        'furo no fruto do café',
        'broca do café',
        'fruto perfurado coroa',
        'hypothenemus',
        'café broqueado',
      ],
      estagioAcometido: ['frutos verdes e maduros'],
      severidadeVisual: 'alta',
    },
    cicloVida: 'Ciclo 35-45 dias dentro do fruto. Sobrevive em frutos remanescentes da safra.',
    condicoesFavorecimento: {
      temperatura: '20-30 °C',
      umidade: 'Alta',
      estacao: 'Frutificação',
      observacoes: ['Frutos no chão pós-colheita = reservatório'],
    },
    niveisDano: {
      baixo: {
        criterio: '< 3 % frutos broqueados',
      },
      medio: {
        criterio: '3-5 % frutos',
      },
      alto: {
        criterio: '> 5 % frutos',
      },
    },
    mip: {
      cultural: [
        'Repasse pós-colheita (catar frutos do chão e da planta)',
        'Cultivares mais resistentes (escolha varietal)',
        'Pruga (poda) sanitária',
        'Higiene de talhão',
      ],
      biologico: [
        'Beauveria bassiana (referência educativa; validar registro para cultura e alvo)',
        'Cephalonomia stephanoderis (vespa parasitoide — programas de liberação)',
      ],
    },
    monitoramento: {
      metodo: 'Armadilhas + amostragem de 100 frutos/talhão',
      frequencia: 'Quinzenal frutificação',
      nivelControle: '3 % frutos broqueados',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_PROCAFE, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cafe_bicho_mineiro',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Bicho-mineiro',
    nomesAlternativos: ['mineiro', 'Leucoptera'],
    nomeCientifico: 'Leucoptera coffeella',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Lagarta minadora forma minas (galerias) marrons-claras na face superior das folhas. ' +
        'Desfolha em alta severidade. Lagarta verde-amarelada, pequena (< 5 mm). Adulto ' +
        'mariposa branca com pintas pretas.',
      palavrasChave: [
        'mina nas folhas do café',
        'bicho mineiro',
        'manchas marrons na folha café',
        'desfolha café',
        'leucoptera',
        'galerias na folha',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Baixa a moderada (épocas secas)',
      estacao: 'Estiagens (jun-set)',
    },
    niveisDano: {
      baixo: {
        criterio: '< 20 % folhas minadas',
      },
      medio: {
        criterio: '20-30 % folhas minadas',
      },
      alto: {
        criterio: '> 30 % folhas com mina',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Irrigação reduz pressão'],
      biologico: ['Vespas parasitoides (Closterocerus, Mirax)', 'Bacillus thuringiensis'],
    },
    monitoramento: {
      metodo: 'Amostragem de 100 folhas (3º ou 4º par) por talhão',
      frequencia: 'Quinzenal',
      nivelControle: '20-30 % folhas com minas vivas',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_PROCAFE, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cafe_acaro_vermelho',
    type: 'praga',
    category: 'acaro',
    nomeComum: 'Ácaro-vermelho do café',
    nomesAlternativos: ['Oligonychus'],
    nomeCientifico: 'Oligonychus ilicis',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pontuações esbranquiçadas → bronzeamento avermelhado na face superior das ' +
        'folhas. Aspecto "queimado". Em alta severidade, desfolha. Ácaro vermelho-escuro, ' +
        '< 0,5 mm. Concentra na face superior (diferente de ácaro-rajado).',
      palavrasChave: [
        'folhas bronzeadas café',
        'ácaro vermelho café',
        'pontos esbranquiçados',
        'café queimado',
        'oligonychus',
      ],
      estagioAcometido: ['folhas (face superior)'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: 'Quente e seco',
      umidade: 'Baixa',
      estacao: 'Estiagem',
    },
    niveisDano: {
      baixo: {
        criterio: 'Ácaros isolados',
      },
      medio: {
        criterio: 'Bronzeamento incipiente',
      },
      alto: {
        criterio: 'Bronzeamento generalizado',
      },
    },
    mip: {
      cultural: ['Irrigação', 'Adubação equilibrada'],
      biologico: ['Neoseiulus (ácaro predador)', 'Stethorus (joaninha pequena)'],
    },
    monitoramento: {
      metodo: 'Inspeção visual + lupa 10x',
      frequencia: 'Quinzenal estiagem',
      nivelControle: 'Pontuações em 30 % das folhas',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cafe_cochonilha_roseta',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Cochonilha-da-roseta',
    nomesAlternativos: ['cochonilha branca'],
    nomeCientifico: 'Planococcus citri',
    culturas: ['cafe', 'citros'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Cochonilhas brancas algodonosas concentradas em rosetas (junção dos frutos com o ramo) ' +
        'e raízes. Causam queda de frutos, debilitamento e melaço → fumagina.',
      palavrasChave: [
        'cochonilha branca café',
        'algodão branco nos frutos',
        'cochonilha roseta',
        'planococcus',
        'queda de frutos',
      ],
      estagioAcometido: ['rosetas (frutos+ramo)', 'raízes'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: 'Quente',
      umidade: 'Variada',
      estacao: 'Frutificação',
    },
    niveisDano: {
      baixo: {
        criterio: 'Focos isolados',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Talhão comprometido',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada', 'Manejo de formigas (cortadeiras)'],
      biologico: ['Beauveria bassiana', 'Cryptolaemus montrouzieri (joaninha)'],
    },
    monitoramento: {
      metodo: 'Inspeção rosetas e raízes',
      frequencia: 'Mensal',
      nivelControle: 'Focos com 10+ cochonilhas/roseta',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // DOENÇAS — CAFÉ
  // ============================================================
  {
    id: 'cafe_ferrugem_cafeeiro',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem do cafeeiro',
    nomesAlternativos: ['ferrugem alaranjada', 'Hemileia'],
    nomeCientifico: 'Hemileia vastatrix',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pústulas amarelo-alaranjadas pulverulentas na face inferior das folhas. Manchas ' +
        'amarelas correspondentes na face superior. Desfolha intensa em alta severidade, ' +
        'reduzindo carga próxima safra.',
      palavrasChave: [
        'ferrugem do café',
        'pústulas alaranjadas folha café',
        'pó alaranjado embaixo da folha',
        'café desfolhado',
        'hemileia',
        'manchas amarelas no café',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'alta',
    },
    cicloVida: 'Esporos dispersos por chuva e vento. Ciclo 25-40 dias.',
    condicoesFavorecimento: {
      temperatura: '21-25 °C',
      umidade: 'Alta, molhamento foliar > 6 h',
      estacao: 'Período chuvoso (out-mar)',
    },
    niveisDano: {
      baixo: {
        criterio: 'Incidência < 10 %',
      },
      medio: {
        criterio: 'Incidência 10-30 %',
      },
      alto: {
        criterio: '> 30 % incidência',
      },
    },
    mip: {
      cultural: [
        'Cultivares resistentes (Catucaí, Iapar, Obatã, IPR Cores)',
        'Espaçamento adequado',
        'Adubação equilibrada (excesso N agrava)',
        'Poda sanitária',
      ],
      biologico: ['Bacillus subtilis', 'Trichoderma'],
    },
    monitoramento: {
      metodo: 'Amostragem 100 folhas/talhão (3º par)',
      frequencia: 'Mensal',
      nivelControle:
        'Incidência observada no início das chuvas: registrar e consultar um engenheiro agrônomo.',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_PROCAFE, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cafe_cercosporiose',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Cercosporiose do café',
    nomesAlternativos: ['olho-pardo', 'olho-de-pomba'],
    nomeCientifico: 'Cercospora coffeicola',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas circulares marrom-claras com centro branco-acinzentado e halo amarelo ' +
        'nas folhas ("olho-pardo"). Em frutos: manchas escuras deprimidas. Causa desfolha ' +
        'e perda de qualidade do grão.',
      palavrasChave: [
        'olho pardo café',
        'manchas circulares café',
        'cercosporiose café',
        'manchas com centro branco',
        'olho de pomba',
      ],
      estagioAcometido: ['folhas', 'frutos'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Alta',
      estacao: 'Estiagens com deficiência nutricional',
      observacoes: ['Café desnutrido / mal adubado é mais suscetível'],
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % folhas',
      },
      medio: {
        criterio: '10-25 %',
      },
      alto: {
        criterio: '> 25 % desfolha',
      },
    },
    mip: {
      cultural: [
        'Adubação equilibrada (N+P+K+Ca+Mg+B+Zn)',
        'Cultivares menos suscetíveis',
        'Irrigação adequada',
      ],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Amostragem folhas',
      frequencia: 'Mensal',
      nivelControle: '10 % folhas afetadas',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_PROCAFE, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cafe_mancha_phoma',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-de-Phoma',
    nomesAlternativos: ['queima do broto', 'Phoma'],
    nomeCientifico: 'Phoma costarricensis',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas escuras irregulares em folhas, brotos e ramos novos. Mortalidade de ' +
        'pontos de crescimento (brotos terminais). Mais severa em altitudes elevadas ' +
        'e clima frio.',
      palavrasChave: ['manchas pretas café', 'queima de broto café', 'phoma', 'brotos secando'],
      estagioAcometido: ['brotos novos', 'folhas novas', 'ramos jovens'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '15-22 °C (frio)',
      umidade: 'Alta',
      estacao: 'Inverno em altitudes > 800 m',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Brotação afetada em manchões',
      },
      alto: {
        criterio: 'Mortalidade generalizada de brotos',
      },
    },
    mip: {
      cultural: ['Quebra-ventos', 'Cultivares menos suscetíveis', 'Adubação equilibrada'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção brotos novos',
      frequencia: 'Quinzenal inverno em altitude',
      nivelControle: 'Sintomas iniciais em brotos',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cafe_mancha_mantegosa',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-mantegosa',
    nomesAlternativos: ['Colletotrichum coffeanum'],
    nomeCientifico: 'Colletotrichum coffeanum',
    culturas: ['cafe'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas oleosas amarelo-amantegadas em folhas, frutos e ramos. Frutos podem ' +
        'cair antes de amadurecer. Em casos severos, seca completa de ramos produtivos.',
      palavrasChave: [
        'mancha mantegosa',
        'manchas amareladas oleosas café',
        'frutos caindo verdes',
        'colletotrichum café',
      ],
      estagioAcometido: ['folhas', 'frutos', 'ramos'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '18-25 °C',
      umidade: 'Alta',
      estacao: 'Chuvas prolongadas',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Queda generalizada de frutos',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Adubação', 'Poda sanitária'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção frutos e folhas',
      frequencia: 'Mensal',
      nivelControle: 'Sintomas em frutos próximos colheita',
    },
    referencias: [REF_EMBRAPA_CAFE, REF_FRAC, REF_MAPA],
  },
];
