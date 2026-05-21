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
        acao: 'Monitoramento intensivo + iscas tóxicas em bordadura',
      },
      medio: {
        criterio: '5-10 % botões OU 1-3 adultos/armadilha',
        acao: 'Aplicação química em bordadura + área toda se subindo',
      },
      alto: {
        criterio: '> 10 % botões OU > 3 adultos/armadilha',
        acao: 'Aplicação imediata área total + reaplicação 5-7 dias',
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
      mecanico: [
        'Armadilhas de feromônio (grandlure) 1/10-20 ha em bordas',
        'Catação manual em pequenas áreas',
      ],
      quimico: {
        classes: ['organofosforados', 'piretroides', 'neonicotinoides'],
        ingredientesAtivos: [
          {
            nome: 'Malation',
            graudeIRACouFRAC: 'IRAC 1B',
            produtosComerciais: [
              {
                nome: 'Malation 1000 EC',
                formulacao: 'EC',
                dosagem: '1,5-2,0 L p.c./ha',
                intervaloAplicacoes: '5-7 dias',
                intervaloSegurancaDias: 2,
                carencia: 7,
              },
            ],
          },
          {
            nome: 'Etiprole',
            graudeIRACouFRAC: 'IRAC 2B',
            produtosComerciais: [
              {
                nome: 'Etiprole 200 SC',
                formulacao: 'SC',
                dosagem: '500-750 mL p.c./ha',
                intervaloAplicacoes: '7 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
          {
            nome: 'Beta-ciflutrina',
            graudeIRACouFRAC: 'IRAC 3A',
            produtosComerciais: [
              {
                nome: 'Beta-ciflutrina 100 EC',
                formulacao: 'EC',
                dosagem: '100-150 mL p.c./ha',
                intervaloAplicacoes: '5-7 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'Bicudo exige aplicações frequentes (5-7 dias) — alto risco resistência',
          'Rotação rigorosa IRAC obrigatória',
          'Aplicações iniciais em bordadura economizam químico',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar IRAC 1B → 2B → 3A → 4A. NÃO repetir mesmo grupo 2x consecutivas. ' +
      'Destruição de soqueiras é fundamental para reduzir pressão.',
    monitoramento: {
      metodo: 'Armadilhas grandlure + amostragem 100 botões/talhão. Borda da lavoura prioritária.',
      frequencia: '2x/semana a partir B1',
      nivelControle: '5 % botões atacados OU 1 bicudo/armadilha/semana',
    },
    observacoesAgronomicas:
      'PRAGA #1 do algodão brasileiro. Apenas vazio sanitário regional efetivo controla a ' +
      'longo prazo. Áreas individuais não conseguem manejo isolado. Programa NACIONAL de ' +
      'controle do bicudo é coordenado pela ABRAPA.',
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
        acao: 'Monitoramento + armadilhas feromônio',
      },
      medio: {
        criterio: '5-10 %',
        acao: 'Aplicação química seletiva',
      },
      alto: {
        criterio: '> 10 %',
        acao: 'Aplicação química',
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
      mecanico: ['Armadilhas feromônio (pectinolure)'],
      quimico: {
        classes: ['diamidas', 'espinosinas'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida',
                formulacao: 'SC',
                dosagem: '40-60 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
        ],
        observacoes: ['Algodão Bt resolve > 90 % dos casos — Bt é defesa #1'],
      },
    },
    rotacaoResistencia: 'Refúgio Bt + rotação IRAC quando aplicar químico.',
    monitoramento: {
      metodo: 'Armadilhas feromônio + amostragem maçãs',
      frequencia: 'Semanal',
      nivelControle: '5 % maçãs atacadas em algodão convencional',
    },
    observacoesAgronomicas: 'Algodão Bt reduziu drasticamente a importância — manter refúgio.',
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
        acao: 'Conservar inimigos naturais',
      },
      medio: {
        criterio: '5-10 adultos/folha',
        acao: 'IGR ou Beauveria',
      },
      alto: {
        criterio: '> 10 adultos/folha',
        acao: 'Aplicação química com rotação IRAC',
      },
    },
    mip: {
      cultural: ['Janela livre de hospedeiros', 'Cultivares menos suscetíveis'],
      biologico: ['Beauveria bassiana', 'Encarsia formosa', 'Eretmocerus mundus'],
      mecanico: ['Armadilhas amarelas'],
      quimico: {
        classes: ['IGR', 'cetoenois', 'neonicotinoides'],
        ingredientesAtivos: [
          {
            nome: 'Pyriproxyfen (IGR)',
            graudeIRACouFRAC: 'IRAC 7C',
            produtosComerciais: [
              {
                nome: 'IGR juvenil',
                formulacao: 'EC',
                dosagem: '500 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
          {
            nome: 'Spirotetramate',
            graudeIRACouFRAC: 'IRAC 23',
            produtosComerciais: [
              {
                nome: 'Cetoenol',
                formulacao: 'OD',
                dosagem: '300-400 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Atingir face inferior é crítico (bicos cônicos, volume alto)'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 7C → 23 → 4A → 9B. Resistência altíssima.',
    monitoramento: {
      metodo: 'Inspeção folhas + armadilhas amarelas',
      frequencia: 'Semanal',
      nivelControle: '5-10 adultos/folha',
    },
    observacoesAgronomicas:
      'Praga crescente. Pluma melada perde valor — manejar antes da abertura de capulhos.',
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
        acao: 'Inimigos naturais (joaninhas, crisopídeos)',
      },
      medio: {
        criterio: '50-70 %',
        acao: 'Aplicação seletiva',
      },
      alto: {
        criterio: '> 70 %',
        acao: 'Aplicação química',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada'],
      biologico: ['Joaninhas', 'Crisopídeos', 'Aphidius', 'Beauveria'],
      mecanico: ['Inspeção'],
      quimico: {
        classes: ['neonicotinoides', 'IGR'],
        ingredientesAtivos: [
          {
            nome: 'Imidacloprido',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Imidacloprido 700 WG',
                formulacao: 'WG',
                dosagem: '100-150 g p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
        ],
        observacoes: ['Pulgão tem ALTA resistência a neonicotinoides — rotação rigorosa'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 9 → 23.',
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal V3+',
      nivelControle: '50 % plantas colonizadas',
    },
    observacoesAgronomicas: 'Costuma ser controlado por inimigos naturais — preservá-los.',
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
        acao: 'Monitoramento + Neoseiulus',
      },
      medio: {
        criterio: 'Manchões com deformação',
        acao: 'Acaricida seletivo',
      },
      alto: {
        criterio: 'Generalizado',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Adubação equilibrada'],
      biologico: ['Neoseiulus californicus'],
      mecanico: ['Inspeção visual sintomas (ácaro não visível)'],
      quimico: {
        classes: ['acaricidas específicos'],
        ingredientesAtivos: [
          {
            nome: 'Abamectina',
            graudeIRACouFRAC: 'IRAC 6',
            produtosComerciais: [
              {
                nome: 'Abamectina 18 EC',
                formulacao: 'EC',
                dosagem: '300-500 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Aplicar quando sintomas iniciais (encarquilhamento)'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 6 → 25 → 21A.',
    monitoramento: {
      metodo: 'Inspeção visual sintomas (não dos ácaros)',
      frequencia: 'Semanal',
      nivelControle: 'Sintomas em brotos',
    },
    observacoesAgronomicas: 'Diagnose visual pelo sintoma (ácaro é microscópico).',
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
        acao: 'Aplicação preventiva',
      },
      medio: {
        criterio: 'Severidade 10-25 %',
        acao: 'Aplicação tripla mistura + multissítio',
      },
      alto: {
        criterio: '> 25 % com desfolha',
        acao: 'Aplicação imediata + revisão cultivar',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação', 'Dessecação tardia em soqueiras'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas', 'multissitios'],
        ingredientesAtivos: [
          {
            nome: 'Fluxapiroxade + Piraclostrobina',
            graudeIRACouFRAC: 'FRAC 7 + 11',
            produtosComerciais: [
              {
                nome: 'Mistura SDHI + estrobilurina',
                formulacao: 'SC',
                dosagem: '0,5-0,8 L p.c./ha',
                intervaloAplicacoes: '14-21 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Mancozebe (multissítio)',
            graudeIRACouFRAC: 'FRAC M3',
            produtosComerciais: [
              {
                nome: 'Mancozebe WG',
                formulacao: 'WG',
                dosagem: '1,5-2,0 kg p.c./ha',
                intervaloAplicacoes: '10-14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: [
          'Resistência DOCUMENTADA a QoI (FRAC 11) e DMI (FRAC 3) em MT',
          'Multissítio em TODAS as aplicações',
          'Programa começa no aparecimento dos primeiros sintomas',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar FRAC 7 → 11 → 3 + multissítio sempre. Não exceder 2x mesmo grupo.',
    monitoramento: {
      metodo: 'Inspeção folhas baixeiras',
      frequencia: 'Semanal B1+',
      nivelControle: 'Primeiros sintomas',
    },
    observacoesAgronomicas:
      'Doença #1 do algodão BR. Perdas potenciais > 30 %. Manejo agressivo de resistência é crítico.',
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
        acao: 'Cultivar resistente cobre',
      },
      medio: {
        criterio: 'Manchões',
        acao: 'Aplicação cúprica',
      },
      alto: {
        criterio: 'Generalizada com nervo preto',
        acao: 'Cúprico + cultivar resistente próximo ciclo',
      },
    },
    mip: {
      cultural: ['CULTIVARES RESISTENTES (defesa primária)', 'Tratamento de sementes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Sementes certificadas (semente-transmitido)'],
      quimico: {
        classes: ['cúpricos'],
        ingredientesAtivos: [
          {
            nome: 'Oxicloreto de Cobre',
            graudeIRACouFRAC: 'FRAC M1',
            produtosComerciais: [
              {
                nome: 'Cobre WP',
                formulacao: 'WP',
                dosagem: '2,5-4,0 kg p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Antibióticos não são alternativa econômica em campo'],
      },
    },
    rotacaoResistencia: 'Foco em cultivar resistente.',
    monitoramento: {
      metodo: 'Inspeção visual',
      frequencia: 'Semanal pós-chuvas',
      nivelControle: 'Sintomas iniciais',
    },
    observacoesAgronomicas:
      'Bactéria semente-transmitida — sementes certificadas resolvem boa parte.',
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
        acao: 'Cultivar resistente cobre',
      },
      medio: {
        criterio: 'Manchões',
        acao: 'Aplicação fungicida + revisão cultivar',
      },
      alto: {
        criterio: 'Generalizado',
        acao: 'Revisão completa do programa',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Tratamento sementes', 'Rotação'],
      biologico: ['Trichoderma TS'],
      mecanico: ['Sementes certificadas'],
      quimico: {
        classes: ['triazois', 'estrobilurinas'],
        ingredientesAtivos: [
          {
            nome: 'Carbendazim (TS)',
            graudeIRACouFRAC: 'FRAC 1',
            produtosComerciais: [
              {
                nome: 'TS padrão',
                formulacao: 'SC',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: 'Único',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
        ],
        observacoes: ['Sementes sadias resolvem 80 % dos casos'],
      },
    },
    rotacaoResistencia: 'Rotação FRAC.',
    monitoramento: {
      metodo: 'Inspeção brotos',
      frequencia: 'Semanal V3+',
      nivelControle: 'Sintomas isolados',
    },
    observacoesAgronomicas: 'Semente-transmitida — controle via TS + cultivar.',
    referencias: [REF_EMBRAPA_ALG, REF_FRAC, REF_MAPA],
  },
];
