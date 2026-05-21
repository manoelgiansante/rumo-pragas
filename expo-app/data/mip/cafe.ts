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
        acao: 'Repasse de colheita + Beauveria',
      },
      medio: {
        criterio: '3-5 % frutos',
        acao: 'Beauveria + aplicação química seletiva',
      },
      alto: {
        criterio: '> 5 % frutos',
        acao: 'Aplicação química com rotação IRAC',
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
        'Beauveria bassiana — eficaz e amplamente registrado',
        'Cephalonomia stephanoderis (vespa parasitoide — programas de liberação)',
      ],
      mecanico: ['Armadilhas com álcool + metanol (1:1) p/ monitoramento'],
      quimico: {
        classes: ['neonicotinoides', 'piretroides'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida',
                formulacao: 'SC',
                dosagem: '300-500 mL p.c./ha',
                intervaloAplicacoes: '21-30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Endosulfan (DESCONTINUADO no Brasil)',
            graudeIRACouFRAC: 'IRAC 2A',
            produtosComerciais: [],
          },
          {
            nome: 'Cipermetrina',
            graudeIRACouFRAC: 'IRAC 3A',
            produtosComerciais: [
              {
                nome: 'Cipermetrina 250 EC',
                formulacao: 'EC',
                dosagem: '50-100 mL p.c./ha',
                intervaloAplicacoes: '30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: [
          'Beauveria é a defesa biológica primária — ampla adoção em MG',
          'Aplicar quando broca está fora do fruto (entre orifícios)',
        ],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 28 → 3A. Priorizar Beauveria.',
    monitoramento: {
      metodo: 'Armadilhas + amostragem de 100 frutos/talhão',
      frequencia: 'Quinzenal frutificação',
      nivelControle: '3 % frutos broqueados',
    },
    observacoesAgronomicas:
      'Praga #1 do café no Brasil. Repasse de colheita reduz dramaticamente a próxima safra. ' +
      'Beauveria é case de sucesso brasileiro.',
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
        acao: 'Monitoramento + conservar inimigos naturais',
      },
      medio: {
        criterio: '20-30 % folhas minadas',
        acao: 'Aplicação seletiva',
      },
      alto: {
        criterio: '> 30 % folhas com mina',
        acao: 'Aplicação química imediata',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Irrigação reduz pressão'],
      biologico: ['Vespas parasitoides (Closterocerus, Mirax)', 'Bacillus thuringiensis'],
      mecanico: ['Inspeção sistemática'],
      quimico: {
        classes: ['neonicotinoides', 'IGR', 'diamidas'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam (foliar/sistêmico)',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Tiametoxam 250 WG',
                formulacao: 'WG',
                dosagem: '200-400 g p.c./ha',
                intervaloAplicacoes: '30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida',
                formulacao: 'SC',
                dosagem: '300 mL p.c./ha',
                intervaloAplicacoes: '30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Resistência a piretroides documentada em algumas regiões'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 28 → 6.',
    monitoramento: {
      metodo: 'Amostragem de 100 folhas (3º ou 4º par) por talhão',
      frequencia: 'Quinzenal',
      nivelControle: '20-30 % folhas com minas vivas',
    },
    observacoesAgronomicas:
      'Praga típica de estiagens. Irrigação reduz pressão. Cultivares Catuaí têm tolerância ' +
      'moderada.',
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
        acao: 'Monitoramento + Neoseiulus',
      },
      medio: {
        criterio: 'Bronzeamento incipiente',
        acao: 'Acaricida seletivo',
      },
      alto: {
        criterio: 'Bronzeamento generalizado',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Irrigação', 'Adubação equilibrada'],
      biologico: ['Neoseiulus (ácaro predador)', 'Stethorus (joaninha pequena)'],
      mecanico: ['Inspeção lupa'],
      quimico: {
        classes: ['acaricidas seletivos'],
        ingredientesAtivos: [
          {
            nome: 'Abamectina',
            graudeIRACouFRAC: 'IRAC 6',
            produtosComerciais: [
              {
                nome: 'Abamectina 18 EC',
                formulacao: 'EC',
                dosagem: '300-600 mL p.c./ha',
                intervaloAplicacoes: '21 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Enxofre molhável',
            graudeIRACouFRAC: 'FRAC M2 / IRAC UN',
            produtosComerciais: [
              {
                nome: 'Enxofre 800 WP',
                formulacao: 'WP',
                dosagem: '5-7 kg p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Acaricidas seletivos para preservar inimigos'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 6 → 23.',
    monitoramento: {
      metodo: 'Inspeção visual + lupa 10x',
      frequencia: 'Quinzenal estiagem',
      nivelControle: 'Pontuações em 30 % das folhas',
    },
    observacoesAgronomicas:
      'Praga oportunista de estiagem. Inimigos naturais geralmente controlam.',
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
        acao: 'Aplicação localizada',
      },
      medio: {
        criterio: 'Manchões',
        acao: 'Aplicação química + Beauveria',
      },
      alto: {
        criterio: 'Talhão comprometido',
        acao: 'Aplicação química sistêmica',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada', 'Manejo de formigas (cortadeiras)'],
      biologico: ['Beauveria bassiana', 'Cryptolaemus montrouzieri (joaninha)'],
      mecanico: ['Inspeção rosetas'],
      quimico: {
        classes: ['neonicotinoides sistêmicos', 'óleo mineral'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam (solo/foliar)',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Tiametoxam 250 WG',
                formulacao: 'WG',
                dosagem: '200-400 g p.c./ha',
                intervaloAplicacoes: '60 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Sistêmico atinge raízes (cochonilha subterrânea)'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 23.',
    monitoramento: {
      metodo: 'Inspeção rosetas e raízes',
      frequencia: 'Mensal',
      nivelControle: 'Focos com 10+ cochonilhas/roseta',
    },
    observacoesAgronomicas: 'Controle de formigas reduz pressão (formigas protegem cochonilhas).',
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
        acao: 'Aplicação preventiva no início chuvas',
      },
      medio: {
        criterio: 'Incidência 10-30 %',
        acao: 'Aplicação curativa cobre + triazol',
      },
      alto: {
        criterio: '> 30 % incidência',
        acao: 'Aplicação imediata + revisão programa próxima safra',
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
      mecanico: ['Monitoramento sistemático'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'cúpricos', 'carboxamidas'],
        ingredientesAtivos: [
          {
            nome: 'Epoxiconazol + Piraclostrobina',
            graudeIRACouFRAC: 'FRAC 3 + 11',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '1,0-1,5 L p.c./ha',
                intervaloAplicacoes: '60-90 dias',
                intervaloSegurancaDias: 1,
                carencia: 60,
              },
            ],
          },
          {
            nome: 'Oxicloreto de Cobre',
            graudeIRACouFRAC: 'FRAC M1',
            produtosComerciais: [
              {
                nome: 'Cobre oxicloreto 500 WP',
                formulacao: 'WP',
                dosagem: '2,5-4,0 kg p.c./ha',
                intervaloAplicacoes: '30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: [
          'Programa de aplicações começa no início das chuvas',
          'Cúprico em rotação melhora controle e adiciona nutrição (Cu)',
          'Resistência a QoI documentada em algumas regiões — sempre em mistura',
        ],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC 3 → 11 → cúpricos. Cultivar resistente é defesa #1.',
    monitoramento: {
      metodo: 'Amostragem 100 folhas/talhão (3º par)',
      frequencia: 'Mensal',
      nivelControle: '5 % incidência inicial chuvas = aplicar',
    },
    observacoesAgronomicas:
      'Doença mais importante do café arábica no Brasil. Cultivares resistentes ' +
      'reduziram drasticamente custo de manejo nos últimos 20 anos.',
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
        acao: 'Adubação correta + monitoramento',
      },
      medio: {
        criterio: '10-25 %',
        acao: 'Aplicação cúprica + triazol',
      },
      alto: {
        criterio: '> 25 % desfolha',
        acao: 'Aplicação imediata + correção nutricional',
      },
    },
    mip: {
      cultural: [
        'Adubação equilibrada (N+P+K+Ca+Mg+B+Zn)',
        'Cultivares menos suscetíveis',
        'Irrigação adequada',
      ],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'cúpricos'],
        ingredientesAtivos: [
          {
            nome: 'Tebuconazol + Trifloxistrobina',
            graudeIRACouFRAC: 'FRAC 3 + 11',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '0,75-1,0 L p.c./ha',
                intervaloAplicacoes: '45 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Frequentemente controlada junto com ferrugem'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + cúprico.',
    monitoramento: {
      metodo: 'Amostragem folhas',
      frequencia: 'Mensal',
      nivelControle: '10 % folhas afetadas',
    },
    observacoesAgronomicas:
      'Doença oportunista — café bem nutrido tem menor incidência. Manejo nutricional ' +
      'é mais barato que químico.',
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
        acao: 'Cúprico preventivo',
      },
      medio: {
        criterio: 'Brotação afetada em manchões',
        acao: 'Aplicação curativa triazol + cúprico',
      },
      alto: {
        criterio: 'Mortalidade generalizada de brotos',
        acao: 'Aplicação imediata + revisão programa',
      },
    },
    mip: {
      cultural: ['Quebra-ventos', 'Cultivares menos suscetíveis', 'Adubação equilibrada'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'cúpricos'],
        ingredientesAtivos: [
          {
            nome: 'Tebuconazol + Cobre',
            graudeIRACouFRAC: 'FRAC 3 + M1',
            produtosComerciais: [
              {
                nome: 'Mistura/aplicações sequenciais',
                formulacao: 'SC+WP',
                dosagem: 'Ver bulas individuais',
                intervaloAplicacoes: '30-45 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Vento é importante no espalhamento — quebra-ventos ajudam muito'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + cúprico.',
    monitoramento: {
      metodo: 'Inspeção brotos novos',
      frequencia: 'Quinzenal inverno em altitude',
      nivelControle: 'Sintomas iniciais em brotos',
    },
    observacoesAgronomicas:
      'Praga típica de cafés de altitude. Quebra-ventos arborizados reduzem dramaticamente o dano.',
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
        acao: 'Cúprico preventivo',
      },
      medio: {
        criterio: 'Manchões',
        acao: 'Triazol + cúprico',
      },
      alto: {
        criterio: 'Queda generalizada de frutos',
        acao: 'Aplicação imediata + revisão programa',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Adubação', 'Poda sanitária'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'cúpricos'],
        ingredientesAtivos: [
          {
            nome: 'Triazol + cobre',
            graudeIRACouFRAC: 'FRAC 3 + M1',
            produtosComerciais: [
              {
                nome: 'Aplicação rotativa',
                formulacao: 'SC+WP',
                dosagem: 'Ver bulas',
                intervaloAplicacoes: '30 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Costuma associar-se a ferrugem — programa conjunto'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + cúprico.',
    monitoramento: {
      metodo: 'Inspeção frutos e folhas',
      frequencia: 'Mensal',
      nivelControle: 'Sintomas em frutos próximos colheita',
    },
    observacoesAgronomicas:
      'Pode causar perdas severas em safras chuvosas. Programa preventivo é essencial em ' +
      'regiões com histórico.',
    referencias: [REF_EMBRAPA_CAFE, REF_FRAC, REF_MAPA],
  },
];
