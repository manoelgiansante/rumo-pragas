/**
 * Catálogo MIP — Cana-de-açúcar (Saccharum spp.)
 *
 * Cultura #3 BR em área. Foco nas pragas e doenças da soqueira
 * (rebrota) e canaviais comerciais Sudeste/Centro-Oeste.
 *
 * Fontes consultadas:
 *  - RIDESA (Rede Interuniversitária para Desenvolvimento do Setor Sucroenergético)
 *  - IAC — Instituto Agronômico de Campinas (Programa Cana)
 *  - CTC — Centro de Tecnologia Canavieira
 *  - MAPA / Agrofit
 *  - IRAC / FRAC 2026
 */

import type { MipEntry } from './types';

const REF_RIDESA = {
  source: 'EMBRAPA' as const, // Schema canônico não tem RIDESA; usar EMBRAPA como genérico
  url: 'https://www.ridesa.com.br/',
  ano: 2025,
  titulo: 'RIDESA — manejo cultivares cana RB',
};

const REF_IAC = {
  source: 'EMBRAPA' as const,
  url: 'https://www.iac.sp.gov.br/areasdepesquisa/cana/',
  ano: 2025,
  titulo: 'IAC — Programa Cana de Açúcar',
};

const REF_IRAC = {
  source: 'IRAC' as const,
  url: 'https://irac-online.org/mode-of-action/classification-online/',
  ano: 2026,
  titulo: 'IRAC Mode of Action Classification 11.5',
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

export const CANA_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // PRAGAS — CANA
  // ============================================================
  {
    id: 'cana_broca_diatraea',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Broca-da-cana',
    nomesAlternativos: ['broca rosada', 'Diatraea'],
    nomeCientifico: 'Diatraea saccharalis',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Lagarta perfura colmos abrindo galerias internas. "Coração morto" em plantas ' +
        'jovens. Galerias permitem entrada de Fusarium e Colletotrichum (podridões), ' +
        'reduzindo ATR (Açúcar Total Recuperável). Lagarta branca-creme com cabeça ' +
        'marrom, até 3 cm.',
      palavrasChave: [
        'broca da cana',
        'galeria no colmo',
        'coração morto cana',
        'lagarta dentro do colmo',
        'diatraea',
        'colmo perfurado',
        'cana com furos',
      ],
      estagioAcometido: ['colmos', 'soqueira'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Ciclo 50-60 dias. Mariposa adulta postura em massas (até 100 ovos) face inferior ' +
      'das folhas. Lagarta entra no colmo via gema axilar.',
    condicoesFavorecimento: {
      temperatura: '22-30 °C',
      umidade: 'Moderada',
      estacao: 'Crescimento ativo (out-mar)',
    },
    niveisDano: {
      baixo: {
        criterio: 'Intensidade de Infestação (II) < 3 %',
      },
      medio: {
        criterio: 'II 3-8 %',
      },
      alto: {
        criterio: 'II > 8 %',
      },
    },
    mip: {
      cultural: [
        'Cultivares resistentes (RB, IAC, SP)',
        'Plantio escalonado',
        'Queima da palha NÃO recomendada (afeta inimigos)',
        'Adubação equilibrada',
      ],
      biologico: [
        'Cotesia flavipes (parasitoide de lagartas) — programa massal Brasil',
        'Trichogramma galloi (parasitoide de ovos)',
        'Beauveria bassiana',
        'Metarhizium anisopliae',
      ],
    },
    monitoramento: {
      metodo:
        'Análise destrutiva: cortar 25 colmos/talhão, contar internódios com galerias / ' +
        'total internódios × 100 = Intensidade de Infestação (II)',
      frequencia: 'Mensal',
      nivelControle: 'II = 3 % é nível de ação',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cana_cigarrinha_raizes',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Cigarrinha-das-raízes',
    nomesAlternativos: ['Mahanarva', 'cigarrinha da cana'],
    nomeCientifico: 'Mahanarva fimbriolata',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Ninfas sugadoras nas raízes superficiais protegidas por espuma branca ("saliva ' +
        'de cuco"). Adultos pretos com manchas vermelho-alaranjadas no abdômen. Causa ' +
        'amarelecimento, secamento de touceiras, redução de produtividade e ATR.',
      palavrasChave: [
        'cigarrinha da cana',
        'espuma branca na base',
        'saliva de cuco',
        'cana amarelando',
        'touceira secando',
        'mahanarva',
      ],
      estagioAcometido: ['raízes', 'touceiras'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Alta umidade do solo (período chuvoso)',
      estacao: 'Out-abr',
      observacoes: ['Colheita mecânica + palhada acumulada favorecem'],
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
      cultural: ['Cultivares menos suscetíveis', 'Drenagem de áreas baixas'],
      biologico: ['Metarhizium anisopliae — controle massal brasileiro', 'Beauveria bassiana'],
    },
    monitoramento: {
      metodo: 'Quadrado de 1 m² + contagem adultos/ninfas',
      frequencia: 'Quinzenal out-abr',
      nivelControle: '5 adultos/m² ou 4-5 espumas/m²',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cana_migdolus',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Migdolus / Bicho-da-cana',
    nomesAlternativos: ['Migdolus', 'bicho da cana'],
    nomeCientifico: 'Migdolus fryanus',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Larva (lagarta branco-amarelada com cabeça marrom escura, até 5 cm) ataca ' +
        'raízes e rizomas no solo. Plantas amarelecem, tombam ou morrem em manchões. ' +
        'Ciclo longo (2-3 anos) torna controle difícil.',
      palavrasChave: [
        'migdolus',
        'bicho da cana',
        'manchas de plantas mortas cana',
        'cana tombando',
        'larva no solo cana',
      ],
      estagioAcometido: ['raízes', 'rizomas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: 'Subterrâneo',
      umidade: 'Variada',
      estacao: 'Ciclo plurianual',
      observacoes: ['Reformas tardias acumulam pressão'],
    },
    niveisDano: {
      baixo: {
        criterio: 'Focos pequenos',
      },
      medio: {
        criterio: 'Manchões emergindo',
      },
      alto: {
        criterio: 'Talhões com falhas grandes',
      },
    },
    mip: {
      cultural: ['Reforma + descompactação', 'Cultivares vigorosas'],
      biologico: ['Metarhizium anisopliae', 'Beauveria bassiana'],
    },
    monitoramento: {
      metodo: 'Amostragem solo (trincheira ou trado)',
      frequencia: 'Pré-reforma e pós-plantio',
      nivelControle: '1 larva/m² em amostragem',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cana_sphenophorus',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Gorgulho-da-cana',
    nomesAlternativos: ['Sphenophorus', 'bicudo da cana'],
    nomeCientifico: 'Sphenophorus levis',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Larva broca o rizoma (broca-do-rizoma), causando morte de touceiras e falhas. ' +
        'Adulto besouro preto com rostro pronunciado (~12 mm). Difícil detecção visual.',
      palavrasChave: [
        'gorgulho da cana',
        'sphenophorus',
        'rizoma perfurado',
        'cana com falhas',
        'broca do rizoma',
      ],
      estagioAcometido: ['rizoma', 'touceira'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-30 °C',
      umidade: 'Variada',
      estacao: 'Soqueiras avançadas',
    },
    niveisDano: {
      baixo: {
        criterio: '< 0,5 adulto/m linear',
      },
      medio: {
        criterio: '0,5-1 adulto/m',
      },
      alto: {
        criterio: '> 1 adulto/m',
      },
    },
    mip: {
      cultural: ['Reforma planejada', 'Cultivares vigorosas'],
      biologico: ['Beauveria bassiana', 'Metarhizium'],
    },
    monitoramento: {
      metodo: 'Armadilhas de toletes (1/ha)',
      frequencia: 'Mensal',
      nivelControle: '0,5 adulto/m linear',
    },
    referencias: [REF_RIDESA, REF_IRAC, REF_MAPA],
  },

  {
    id: 'cana_cupim',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Cupins-de-montículo',
    nomesAlternativos: ['cupim subterrâneo', 'Heterotermes'],
    nomeCientifico: 'Heterotermes spp. / Procornitermes spp.',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Atacam toletes plantados — falhas na brotação. Ninhos subterrâneos visíveis ' +
        'em alguns casos. Comprometem stand inicial.',
      palavrasChave: [
        'cupim na cana',
        'tolete atacado',
        'falhas na brotação cana',
        'cupim subterrâneo',
      ],
      estagioAcometido: ['toletes', 'brotação'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: 'Subterrâneo',
      umidade: 'Variada',
      estacao: 'Plantio',
    },
    niveisDano: {
      baixo: {
        criterio: 'Falhas isoladas',
      },
      medio: {
        criterio: 'Falhas em manchões',
      },
      alto: {
        criterio: 'Stand muito comprometido',
      },
    },
    mip: {
      cultural: ['Cultivares vigorosas', 'Limpeza terreno pré-plantio'],
      biologico: ['Metarhizium'],
    },
    monitoramento: {
      metodo: 'Inspeção solo + falhas brotação',
      frequencia: 'Plantio + brotação',
      nivelControle: 'Histórico de área',
    },
    referencias: [REF_IAC, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // DOENÇAS — CANA
  // ============================================================
  {
    id: 'cana_ferrugem_marrom',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem-marrom',
    nomesAlternativos: ['Puccinia melanocephala'],
    nomeCientifico: 'Puccinia melanocephala',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pústulas alongadas marrom-escuras na face inferior das folhas (até 8 mm), ' +
        'com halo amarelado. Em alta severidade, desfolha e perda de produtividade.',
      palavrasChave: ['pústulas marrons cana', 'ferrugem marrom', 'cana com pústulas'],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Alta',
      estacao: 'Crescimento ativo',
    },
    niveisDano: {
      baixo: {
        criterio: 'Pústulas isoladas',
      },
      medio: {
        criterio: 'Severidade 10-20 %',
      },
      alto: {
        criterio: '> 20 %',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes (RB, IAC, SP)', 'Plantio diversificado'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Mensal',
      nivelControle: 'Pústulas + clima',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cana_ferrugem_alaranjada',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem-alaranjada',
    nomesAlternativos: ['Puccinia kuehnii'],
    nomeCientifico: 'Puccinia kuehnii',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pústulas alaranjadas/amarelo-vivo na face inferior, distintas da marrom pela cor. ' +
        'Causou epidemias severas no Brasil a partir de 2009 em cultivares antes consideradas resistentes.',
      palavrasChave: ['pústulas laranjas cana', 'ferrugem alaranjada', 'puccinia kuehnii'],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-30 °C',
      umidade: 'Alta',
      estacao: 'Verão úmido',
    },
    niveisDano: {
      baixo: {
        criterio: 'Pústulas isoladas',
      },
      medio: {
        criterio: 'Severidade 10-20 %',
      },
      alto: {
        criterio: '> 20 %',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Diversificação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Mensal',
      nivelControle: 'Pústulas + clima',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cana_carvao',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Carvão da cana',
    nomesAlternativos: ['Sporisorium scitamineum'],
    nomeCientifico: 'Sporisorium scitamineum',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Chicote escuro emergindo do ápice da planta (estrutura longa, recurvada, cheia ' +
        'de esporos pretos). Plantas afetadas perfilham excessivamente, ficam raquíticas.',
      palavrasChave: [
        'chicote preto cana',
        'carvão da cana',
        'esporos pretos no ápice',
        'planta com chicote',
      ],
      estagioAcometido: ['ápice', 'planta toda'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Baixa a moderada',
      estacao: 'Brotação',
    },
    niveisDano: {
      baixo: {
        criterio: 'Plantas isoladas com chicote',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Alta incidência',
      },
    },
    mip: {
      cultural: [
        'Cultivares resistentes (defesa #1)',
        'Tratamento térmico de toletes (52 °C / 30 min)',
        'Eliminação de plantas doentes',
      ],
      biologico: [],
    },
    monitoramento: {
      metodo: 'Inspeção visual de chicotes',
      frequencia: 'Mensal',
      nivelControle: 'Qualquer planta com chicote',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_FRAC, REF_MAPA],
  },

  {
    id: 'cana_escaldadura',
    type: 'doenca',
    category: 'bacteria',
    nomeComum: 'Escaldadura-das-folhas',
    nomesAlternativos: ['Xanthomonas albilineans'],
    nomeCientifico: 'Xanthomonas albilineans',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Estrias brancas longitudinais nas folhas (paralelas à nervura central). Em ' +
        'estágio avançado: amarelecimento, morte de touceiras, brotação de gemas laterais.',
      palavrasChave: [
        'estrias brancas cana',
        'escaldadura cana',
        'xanthomonas',
        'listras brancas paralelas',
      ],
      estagioAcometido: ['folhas', 'planta toda'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Alta',
      estacao: 'Verão',
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
        'Cultivares resistentes',
        'Tratamento térmico toletes (52 °C / 30 min)',
        'Limpeza de ferramentas/máquinas',
      ],
      biologico: [],
    },
    monitoramento: {
      metodo: 'Inspeção visual de estrias',
      frequencia: 'Mensal',
      nivelControle: 'Qualquer sintoma exige investigação',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_MAPA],
  },

  {
    id: 'cana_mosaico',
    type: 'doenca',
    category: 'virus',
    nomeComum: 'Mosaico da cana',
    nomesAlternativos: ['SCMV', 'vírus do mosaico'],
    nomeCientifico: 'Sugarcane mosaic virus (SCMV)',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Padrão de mosaico verde-claro e verde-escuro nas folhas mais novas. Plantas ' +
        'podem ficar raquíticas. Transmitido por pulgões (Rhopalosiphum maidis, R. padi).',
      palavrasChave: [
        'mosaico na cana',
        'manchas claras e escuras na folha',
        'scmv',
        'folhas mosqueadas',
      ],
      estagioAcometido: ['folhas novas', 'planta toda'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '22-28 °C',
      umidade: 'Variada',
      estacao: 'Pressão de pulgões',
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
      cultural: ['Cultivares resistentes', 'Material plantio sadio'],
      biologico: ['Controle indireto via inimigos de pulgões'],
    },
    monitoramento: {
      metodo: 'Inspeção visual de folhas novas',
      frequencia: 'Mensal',
      nivelControle: 'Qualquer planta com mosaico',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_MAPA],
  },

  {
    id: 'cana_podridao_vermelha',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Podridão-vermelha',
    nomesAlternativos: ['Colletotrichum falcatum'],
    nomeCientifico: 'Colletotrichum falcatum',
    culturas: ['cana'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Internodos com coloração vermelho-vinho (cortando o colmo). Frequente em ' +
        'colmos furados pela broca (Diatraea). Reduz ATR, prejudica fermentação.',
      palavrasChave: [
        'podridão vermelha cana',
        'colmo vermelho por dentro',
        'colletotrichum',
        'galeria com vermelho',
      ],
      estagioAcometido: ['colmos (interno)'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Alta',
      estacao: 'Pós ataque broca',
      observacoes: ['Broca é principal porta de entrada'],
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados',
      },
      medio: {
        criterio: 'Manchões',
      },
      alto: {
        criterio: 'Alta incidência',
      },
    },
    mip: {
      cultural: ['Controle integrado da broca-da-cana (DIATRAEA)', 'Cultivares resistentes'],
      biologico: ['Indireto via Cotesia flavipes (controla broca)'],
    },
    monitoramento: {
      metodo: 'Análise destrutiva conjunta com broca',
      frequencia: 'Pré-corte',
      nivelControle: 'Associado a II da broca',
    },
    referencias: [REF_RIDESA, REF_IAC, REF_FRAC, REF_MAPA],
  },
];
