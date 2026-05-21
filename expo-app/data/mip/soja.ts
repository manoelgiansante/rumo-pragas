/**
 * Catálogo MIP — Soja (Glycine max)
 *
 * Cultura #1 do Brasil em área plantada. Foco nas principais
 * pragas e doenças do calendário Centro-Sul.
 *
 * Fontes consultadas:
 *  - EMBRAPA Soja (Londrina) — circulares técnicas safra 24/25
 *  - MAPA / Agrofit — banco de produtos registrados
 *  - IRAC Mode of Action 11.5 (2026)
 *  - FRAC Code List (2026)
 *  - CESB — Comitê Estratégico Soja Brasil (boas práticas MIP)
 */

import type { MipEntry } from './types';

const REF_EMBRAPA_FERRUGEM = {
  source: 'EMBRAPA' as const,
  url: 'https://www.embrapa.br/soja/ferrugem',
  ano: 2025,
  titulo: 'Ferrugem asiática da soja: manejo e prevenção',
};

const REF_EMBRAPA_FUNG_2425 = {
  source: 'EMBRAPA' as const,
  url: 'https://www.infoteca.cnptia.embrapa.br/infoteca/handle/doc/1177349',
  ano: 2025,
  titulo: 'Eficiência de fungicidas para o controle da ferrugem-asiática da soja, safra 2024/2025',
};

const REF_FRAC = {
  source: 'FRAC' as const,
  url: 'https://www.frac.info/',
  ano: 2026,
  titulo: 'FRAC Code List 2026 — Fungicides sorted by mode of action',
};

const REF_IRAC = {
  source: 'IRAC' as const,
  url: 'https://irac-online.org/mode-of-action/classification-online/',
  ano: 2026,
  titulo: 'IRAC Mode of Action Classification Edition 11.5',
};

const REF_CESB = {
  source: 'CESB' as const,
  url: 'https://cesbrasil.org.br/',
  ano: 2025,
  titulo: 'CESB — boas práticas MIP soja',
};

const REF_MAPA = {
  source: 'MAPA' as const,
  url: 'https://agrofit.agricultura.gov.br/agrofit_cons/principal_agrofit_cons',
  ano: 2026,
  titulo: 'MAPA / Agrofit — Sistema de Agrotóxicos Fitossanitários',
};

export const SOJA_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // DOENÇAS — SOJA
  // ============================================================
  {
    id: 'soja_ferrugem_asiatica',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem asiática da soja',
    nomesAlternativos: ['ferrugem da soja', 'ferrugem-asiática'],
    nomeCientifico: 'Phakopsora pachyrhizi',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequenas pontuações (urédias) marrons/castanhas na face inferior das folhas, ' +
        'envoltas por halo amarelado visível na face superior. Pústulas liberam pó de ' +
        'esporos quando esfregadas. Desfolha precoce em alta severidade reduz vagem e grão.',
      palavrasChave: [
        'pústulas marrons na face inferior da folha',
        'pontos amarelos na face superior',
        'pó marrom nas folhas',
        'desfolha precoce',
        'urédias castanhas',
        'mancha angular marrom',
        'soja amarelando',
        'ferrugem',
      ],
      estagioAcometido: ['folhas baixeiras', 'folhas medianas', 'folhas superiores'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Fungo biotrófico obrigatório. Esporos (urediniósporos) dispersam por vento a longa ' +
      'distância. Ciclo de 7-14 dias do esporo à nova pústula em condições favoráveis. ' +
      'Sobrevive no vazio sanitário em soja voluntária (tiguera).',
    condicoesFavorecimento: {
      temperatura: '18-27 °C',
      umidade: 'Molhamento foliar > 6 h, umidade relativa > 75 %',
      estacao: 'Safra de verão (out-mar), maior pressão jan-fev',
      observacoes: [
        'Plantios tardios concentram pressão de inóculo',
        'Ausência de vazio sanitário (90 dias) eleva risco',
      ],
    },
    niveisDano: {
      baixo: {
        criterio:
          'Primeiras pústulas isoladas (1ª aparição confirmada) — qualquer estágio fenológico',
        acao:
          'Aplicar imediatamente fungicida preventivo (multissítio + triazol ou ' +
          'tripla mistura), independentemente da severidade visual.',
      },
      medio: {
        criterio: '5-10 % de severidade visual em folhas baixeiras',
        acao:
          'Aplicação curativa com tripla mistura (triazol + estrobilurina + carboxamida) ' +
          'associada a multissítio (mancozebe/clorotalonil). Reaplicação 14 dias.',
      },
      alto: {
        criterio: '> 25 % de severidade, desfolha em andamento',
        acao:
          'Controle curativo é PALIATIVO — perda já instalada. Aplicação de resgate ' +
          'com tripla mistura + multissítio e revisão do plano de safra (cultivares ' +
          'precoces, vazio sanitário rígido no próximo ciclo).',
      },
    },
    mip: {
      cultural: [
        'Vazio sanitário obrigatório (mín. 90 dias sem soja viva)',
        'Eliminação de soja tiguera (voluntária) em entressafra',
        'Semeadura no início da janela recomendada',
        'Cultivares precoces escapam de picos de inóculo tardios',
        'Uso de cultivares com gene Rpp (resistência parcial)',
      ],
      biologico: [
        'Bacillus subtilis (fungicida biológico registrado)',
        'Bacillus amyloliquefaciens',
        'Trichoderma asperellum (manejo integrado com solo)',
      ],
      mecanico: [
        'Monitoramento semanal a partir de V3',
        'Coleta de folhas baixeiras para análise visual / kit rápido',
      ],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas', 'multissitios'],
        ingredientesAtivos: [
          {
            nome: 'Azoxistrobina + Benzovindiflupir + Difenoconazol (tripla)',
            graudeIRACouFRAC: 'FRAC 11 + 7 + 3',
            produtosComerciais: [
              {
                nome: 'Fungicida tripla mistura padrão de mercado',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha (consultar bula)',
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
                nome: 'Mancozebe WG genérico',
                formulacao: 'WG',
                dosagem: '1,5-2,0 kg p.c./ha',
                intervaloAplicacoes: '10-14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Protioconazol + Trifloxistrobina',
            graudeIRACouFRAC: 'FRAC 3 + 11',
            produtosComerciais: [
              {
                nome: 'Mistura triazol + estrobilurina',
                formulacao: 'EC',
                dosagem: '0,4 L p.c./ha (consultar bula)',
                intervaloAplicacoes: '14-21 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
        ],
        observacoes: [
          'P. pachyrhizi apresenta resistência quantitativa documentada a ISDH, IQe e IDM ' +
            '(FRAC 7, 11 e 3) — SEMPRE associar multissítio (FRAC M3/M5)',
          'Rotação OBRIGATÓRIA de modos de ação entre aplicações',
          'Estrobilurina (FRAC 11) NUNCA isolada — sempre em mistura com triazol ' +
            'e/ou carboxamida (recomendação FRAC-BR)',
          'Volume de calda > 150 L/ha terrestre para boa cobertura baixeira',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar grupos FRAC a cada aplicação (3 → 11 → 7). Multissítio (M3/M5) ' +
      'em TODAS as aplicações para retardar resistência. Limite máximo 2 aplicações ' +
      'consecutivas com mesmo grupo (recomendação FRAC-BR).',
    monitoramento: {
      metodo:
        'Inspeção semanal de folhas baixeiras (face inferior). Coleta de 10 folhas ' +
        'por talhão / análise com lupa 10x ou kit imunológico.',
      frequencia: 'Semanal a partir de V3, quinzenal antes',
      nivelControle: 'PRIMEIRA pústula confirmada → aplicar. Não esperar atingir limiar visual.',
    },
    observacoesAgronomicas:
      'Doença #1 da soja no Brasil. Perdas potenciais > 80 % sem manejo. Vazio sanitário ' +
      'é tão crítico quanto fungicida. Consulte sempre Consórcio Antiferrugem da EMBRAPA ' +
      'para alertas regionais em tempo real.',
    referencias: [REF_EMBRAPA_FERRUGEM, REF_EMBRAPA_FUNG_2425, REF_FRAC, REF_CESB, REF_MAPA],
  },

  {
    id: 'soja_mofo_branco',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mofo-branco',
    nomesAlternativos: ['podridão-de-sclerotinia', 'sclerotinia'],
    nomeCientifico: 'Sclerotinia sclerotiorum',
    culturas: ['soja', 'feijao', 'algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas aquosas em hastes e vagens, evoluindo para massa cotonosa branca ' +
        '(micélio). Formação de escleródios pretos (do tamanho de grãos de feijão) ' +
        'no interior das hastes e na superfície. Murcha e morte das plantas atacadas.',
      palavrasChave: [
        'massa branca cotonosa na haste',
        'mofo branco na soja',
        'escleródios pretos',
        'murcha após florada',
        'haste apodrecida',
        'algodão branco nas plantas',
      ],
      estagioAcometido: ['haste', 'vagens', 'folhas inferiores'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Escleródios sobrevivem 5-10 anos no solo. Germinam em apotécios → liberam ' +
      'ascósporos → infectam pétalas senescentes → colonizam haste.',
    condicoesFavorecimento: {
      temperatura: '15-22 °C (clima ameno)',
      umidade: 'Alta umidade prolongada, microclima fechado',
      estacao: 'Florada (R1-R3), em safras frias e úmidas',
      observacoes: [
        'Plantios adensados aumentam microclima favorável',
        'Áreas altas (> 700 m) e plantios em sucessão soja-feijão',
      ],
    },
    niveisDano: {
      baixo: {
        criterio: 'Histórico de área com mofo + clima favorável (sem sintoma visível)',
        acao: 'Aplicação preventiva em R1 (início florada) com fluazinam ou procimidona',
      },
      medio: {
        criterio: 'Primeiros focos isolados (< 5 % de plantas afetadas)',
        acao:
          'Aplicação curativa imediata + segunda aplicação 10 dias depois, ' +
          'sem reentrada na área molhada.',
      },
      alto: {
        criterio: '> 20 % de plantas com escleródios ou hastes apodrecidas',
        acao:
          'Controle químico paliativo. Planejar rotação 3-4 anos com não-hospedeiras ' +
          '(milho, sorgo, gramíneas) e adoção de cobertura morta densa.',
      },
    },
    mip: {
      cultural: [
        'Rotação 3+ anos com gramíneas (milho, sorgo, braquiária)',
        'Cobertura morta densa (palhada) — barreira física a apotécios',
        'Espaçamento mais aberto entrelinhas em áreas históricas',
        'Cultivares menos sensíveis (porte ereto, ciclo precoce)',
        'Evitar irrigação na florada em pivôs',
      ],
      biologico: [
        'Trichoderma harzianum / asperellum (parasitismo de escleródios)',
        'Bacillus subtilis e B. amyloliquefaciens',
        'Coniothyrium minitans (micoparasita registrado MAPA)',
      ],
      mecanico: [
        'Limpeza de máquinas entre talhões para evitar disseminação de escleródios',
        'Catação manual de plantas afetadas em pequenas áreas',
      ],
      quimico: {
        classes: ['benzimidazois', 'dicarboximidas', 'piridinilmetil-benzamidas'],
        ingredientesAtivos: [
          {
            nome: 'Fluazinam',
            graudeIRACouFRAC: 'FRAC 29',
            produtosComerciais: [
              {
                nome: 'Fluazinam 500 SC',
                formulacao: 'SC',
                dosagem: '1,0-1,5 L p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Procimidona',
            graudeIRACouFRAC: 'FRAC 2',
            produtosComerciais: [
              {
                nome: 'Procimidona 500 SC',
                formulacao: 'SC',
                dosagem: '1,0 L p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: [
          'Aplicação SEMPRE preventiva ou no início de florada (R1)',
          'Volume de calda alto (200-300 L/ha) para penetração no dossel',
          'Bicos cônicos vazios e angulação dupla melhoram cobertura',
        ],
      },
    },
    rotacaoResistencia:
      'Alternar FRAC 29 e FRAC 2. Incluir biológicos (Trichoderma/Coniothyrium) em ' +
      'pré-plantio para reduzir banco de escleródios.',
    monitoramento: {
      metodo: 'Inspeção visual em R1-R5, especialmente em manchões mais úmidos do talhão',
      frequencia: 'Semanal durante florada (R1-R5)',
      nivelControle: 'Histórico + clima favorável já justifica aplicação preventiva',
    },
    observacoesAgronomicas:
      'Doença "policíclica de longo prazo" — manejo começa 3 anos antes do plantio. ' +
      'Áreas com histórico exigem plano integrado (rotação + cobertura + biológico + químico).',
    referencias: [REF_FRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_mancha_alvo',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-alvo',
    nomesAlternativos: ['target spot', 'corinespora'],
    nomeCientifico: 'Corynespora cassiicola',
    culturas: ['soja', 'algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas circulares marrom-escuras com anéis concêntricos (alvo de tiro), ' +
        'rodeadas por halo amarelo. Centro pode rachar. Em alta severidade causa ' +
        'desfolha intensa nas baixeiras.',
      palavrasChave: [
        'manchas circulares com anéis',
        'alvo de tiro nas folhas',
        'desfolha baixeira',
        'mancha marrom com halo amarelo',
        'mancha em alvo',
      ],
      estagioAcometido: ['folhas baixeiras', 'pecíolos', 'vagens'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '24-32 °C',
      umidade: 'Alta umidade, chuvas frequentes',
      estacao: 'R1-R5, mais agressiva em safras chuvosas',
    },
    niveisDano: {
      baixo: {
        criterio: 'Manchas isoladas nas baixeiras (< 5 % severidade)',
        acao: 'Monitoramento; aplicação no bloco com ferrugem se programado',
      },
      medio: {
        criterio: '5-15 % severidade, com desfolha incipiente',
        acao: 'Aplicação de tripla mistura + multissítio',
      },
      alto: {
        criterio: '> 15 % com desfolha pronunciada',
        acao: 'Controle + revisão de cultivar/cultivos sucessivos',
      },
    },
    mip: {
      cultural: ['Rotação com gramíneas', 'Cultivares menos suscetíveis', 'Adensamento moderado'],
      biologico: ['Bacillus subtilis', 'Trichoderma'],
      mecanico: ['Monitoramento sistemático em baixeiras'],
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
                carencia: 21,
              },
            ],
          },
          {
            nome: 'Mancozebe',
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
          'Resistência documentada a IQe (FRAC 11) e IDM (FRAC 3) em algumas regiões',
          'Multissítio é elemento-chave para preservar moléculas',
        ],
      },
    },
    rotacaoResistencia:
      'Alternar FRAC 7, 11 e 3 com multissítio em todas aplicações. Não exceder ' +
      '2 aplicações consecutivas do mesmo grupo.',
    monitoramento: {
      metodo: 'Inspeção de folhas baixeiras semanalmente em R1+',
      frequencia: 'Semanal a partir de V6',
      nivelControle: 'Manchas confirmadas + clima úmido = aplicar',
    },
    observacoesAgronomicas:
      'Frequentemente associada à ferrugem no mesmo manejo. Cultivares variam muito ' +
      'em suscetibilidade — escolha bem o material.',
    referencias: [REF_FRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_oidio',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Oídio da soja',
    nomesAlternativos: ['cinza', 'mofo-cinzento'],
    nomeCientifico: 'Microsphaera diffusa',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pó branco-acinzentado cobrindo face superior das folhas, hastes e pecíolos. ' +
        'Folhas podem amarelar e cair em alta severidade.',
      palavrasChave: [
        'pó branco nas folhas',
        'aspecto empoeirado',
        'mofo cinza',
        'oídio',
        'folhas com cinza',
      ],
      estagioAcometido: ['folhas', 'hastes', 'pecíolos'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '18-24 °C (clima ameno e seco)',
      umidade: 'Baixa umidade no dossel, orvalho noturno',
      estacao: 'Safras secas e amenas',
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % de área foliar coberta',
        acao: 'Monitoramento',
      },
      medio: {
        criterio: '10-30 %',
        acao: 'Aplicação curativa com triazol ou enxofre',
      },
      alto: {
        criterio: '> 30 % com desfolha',
        acao: 'Aplicação + revisão cultivar para próximo ciclo',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Inspeção visual'],
      quimico: {
        classes: ['triazois', 'enxofre', 'estrobilurinas'],
        ingredientesAtivos: [
          {
            nome: 'Difenoconazol',
            graudeIRACouFRAC: 'FRAC 3',
            produtosComerciais: [
              {
                nome: 'Difenoconazol 250 EC',
                formulacao: 'EC',
                dosagem: '0,3 L p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
          {
            nome: 'Enxofre',
            graudeIRACouFRAC: 'FRAC M2',
            produtosComerciais: [
              {
                nome: 'Enxofre molhável',
                formulacao: 'WP',
                dosagem: '3,0-5,0 kg p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Geralmente controlado pelas aplicações para ferrugem'],
      },
    },
    rotacaoResistencia: 'Alternar FRAC 3 com multissítios (M2/M3).',
    monitoramento: {
      metodo: 'Inspeção visual em safras secas e amenas',
      frequencia: 'Semanal',
      nivelControle: '10 % área foliar coberta',
    },
    observacoesAgronomicas:
      'Doença menos importante hoje devido a cultivares resistentes amplamente adotados.',
    referencias: [REF_FRAC, REF_MAPA],
  },

  {
    id: 'soja_antracnose',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Antracnose da soja',
    nomesAlternativos: ['antracnose'],
    nomeCientifico: 'Colletotrichum truncatum',
    culturas: ['soja', 'feijao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas escuras irregulares em vagens, hastes e pecíolos. Vagens chochas ou ' +
        'com grãos pequenos. Em sementes, manchas escuras e queda de plântulas no plantio.',
      palavrasChave: [
        'manchas pretas na vagem',
        'vagens chochas',
        'grãos pequenos',
        'manchas escuras na haste',
        'antracnose',
      ],
      estagioAcometido: ['vagens', 'hastes', 'sementes', 'plântulas'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Alta umidade',
      estacao: 'Florada e enchimento de grãos',
    },
    niveisDano: {
      baixo: {
        criterio: 'Sintomas isolados em poucas plantas',
        acao: 'Tratar via fungicida programado p/ ferrugem',
      },
      medio: {
        criterio: 'Manchas em 10-25 % das plantas',
        acao: 'Aplicação curativa com tripla mistura',
      },
      alto: {
        criterio: '> 25 % com vagens chochas',
        acao: 'Controle químico + revisão de tratamento de sementes',
      },
    },
    mip: {
      cultural: [
        'Tratamento de sementes obrigatório',
        'Rotação de culturas',
        'Densidade de plantio adequada',
      ],
      biologico: ['Trichoderma no tratamento de sementes'],
      mecanico: ['Sementes certificadas'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas'],
        ingredientesAtivos: [
          {
            nome: 'Carbendazim + Tiram (tratamento sementes)',
            graudeIRACouFRAC: 'FRAC 1 + M3',
            produtosComerciais: [
              {
                nome: 'Mistura TS padrão',
                formulacao: 'SC',
                dosagem: '200 mL p.c./100 kg sementes',
                intervaloAplicacoes: 'Único (TS)',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
          {
            nome: 'Azoxistrobina + Difenoconazol (foliar)',
            graudeIRACouFRAC: 'FRAC 11 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '0,3-0,4 L p.c./ha',
                intervaloAplicacoes: '14-21 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['TS é a defesa #1 contra antracnose'],
      },
    },
    rotacaoResistencia: 'Alternar grupos FRAC, sempre com multissítio.',
    monitoramento: {
      metodo: 'Inspeção em vagens em R3-R6',
      frequencia: 'Semanal a partir de R3',
      nivelControle: 'Sintomas confirmados em vagens',
    },
    observacoesAgronomicas:
      'Patógeno é semente-transmitido. Sementes certificadas + TS resolvem 80 % do problema.',
    referencias: [REF_FRAC, REF_MAPA],
  },

  {
    id: 'soja_dfc_septoria',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-parda (DFC)',
    nomesAlternativos: ['septoriose', 'doenças de final de ciclo'],
    nomeCientifico: 'Septoria glycines',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequenas manchas marrom-avermelhadas (1-2 mm) em folhas baixeiras a partir ' +
        'de R3, evoluindo para amarelecimento e desfolha precoce. Compõe junto com ' +
        'Cercospora as Doenças de Final de Ciclo (DFC).',
      palavrasChave: [
        'manchinhas marrons baixeiras',
        'desfolha de baixo para cima',
        'mancha parda',
        'septoria',
        'amarelecimento de baixo para cima',
      ],
      estagioAcometido: ['folhas baixeiras → médias → superiores'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '22-28 °C',
      umidade: 'Alta umidade prolongada',
      estacao: 'R3-R6 (enchimento)',
    },
    niveisDano: {
      baixo: {
        criterio: 'Manchas isoladas em baixeiras',
        acao: 'Manejo conjunto com ferrugem',
      },
      medio: {
        criterio: 'Desfolha < 25 % do dossel',
        acao: 'Aplicação tripla + multissítio',
      },
      alto: {
        criterio: 'Desfolha > 25 % antes de R6',
        acao: 'Controle e revisão cultivar para próximo ciclo',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas', 'multissitios'],
        ingredientesAtivos: [
          {
            nome: 'Tripla mistura padrão (ver ferrugem)',
            graudeIRACouFRAC: 'FRAC 11 + 7 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura comercial tripla',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha',
                intervaloAplicacoes: '14-21 dias',
                intervaloSegurancaDias: 1,
                carencia: 30,
              },
            ],
          },
        ],
        observacoes: ['Controle geralmente subproduto do manejo de ferrugem'],
      },
    },
    rotacaoResistencia: 'Igual ferrugem: rotação FRAC + multissítio sempre.',
    monitoramento: {
      metodo: 'Inspeção visual em folhas baixeiras',
      frequencia: 'Semanal a partir de R3',
      nivelControle: 'Manchas em baixeiras + clima úmido = aplicar',
    },
    observacoesAgronomicas: 'DFC reduz peso de grãos em ciclo final — controlar antes de R5.',
    referencias: [REF_FRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_nematoide_cisto',
    type: 'praga',
    category: 'nematoide',
    nomeComum: 'Nematoide do cisto da soja',
    nomesAlternativos: ['NCS', 'cisto'],
    nomeCientifico: 'Heterodera glycines',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas (reboleiras) de plantas amareladas e raquíticas no campo. Sistema ' +
        'radicular com cistos brancos/amarelos (femeas) visíveis a olho nu (0,3-0,5 mm). ' +
        'Plantas com nodulação reduzida, deficiência nutricional.',
      palavrasChave: [
        'reboleiras de plantas amareladas',
        'manchas de plantas raquíticas',
        'cistos brancos nas raízes',
        'pontinhos brancos nas raízes',
        'soja amarelando em manchas',
        'nematoide',
      ],
      estagioAcometido: ['raízes', 'planta inteira'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Cistos (femeas mortas) sobrevivem 8-10 anos no solo. Eclosão estimulada por ' +
      'exsudatos radiculares de soja. Ciclo 24-30 dias.',
    condicoesFavorecimento: {
      temperatura: 'Solo 20-30 °C',
      umidade: 'Solo úmido (mas não encharcado)',
      estacao: 'Safra de verão',
      observacoes: ['Solos arenosos favorecem disseminação', 'Monocultivo agrava'],
    },
    niveisDano: {
      baixo: {
        criterio: '< 200 cistos/100 cm³ de solo',
        acao: 'Manejo cultural (rotação) + cultivar resistente',
      },
      medio: {
        criterio: '200-500 cistos/100 cm³',
        acao: 'Rotação obrigatória + cultivar resistente + nematicida biológico',
      },
      alto: {
        criterio: '> 500 cistos/100 cm³',
        acao: 'Rotação 2+ safras com não-hospedeiras + nematicida químico tratamento solo',
      },
    },
    mip: {
      cultural: [
        'Rotação com milho, sorgo, braquiária, algodão',
        'Cultivares resistentes/tolerantes (PI 88788, Peking)',
        'Sucessão com Crotalaria spectabilis (planta armadilha)',
        'Limpeza de máquinas entre talhões',
      ],
      biologico: [
        'Bacillus subtilis (cepas nematicidas)',
        'Pochonia chlamydosporia',
        'Purpureocillium lilacinum',
        'Trichoderma asperellum',
      ],
      mecanico: ['Análise de solo p/ identificação de raças', 'Mapeamento focos'],
      quimico: {
        classes: ['carbamatos', 'organofosforados nematicidas', 'fluoropirimidinas'],
        ingredientesAtivos: [
          {
            nome: 'Fluensulfona',
            graudeIRACouFRAC: 'IRAC UN',
            produtosComerciais: [
              {
                nome: 'Nematicida fluoropirimidina',
                formulacao: 'GR',
                dosagem: 'Conforme bula (sulco de plantio)',
                intervaloAplicacoes: 'Aplicação única / plantio',
                intervaloSegurancaDias: 14,
                carencia: 90,
              },
            ],
          },
          {
            nome: 'Abamectina (tratamento sementes)',
            graudeIRACouFRAC: 'IRAC 6',
            produtosComerciais: [
              {
                nome: 'TS abamectina',
                formulacao: 'FS',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: 'TS único',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
        ],
        observacoes: [
          'Nematicidas químicos NÃO eliminam — só reduzem população',
          'Resposta econômica depende de combinar TODOS os pilares MIP',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar fontes de resistência (PI 88788, Peking, etc) entre safras para ' +
      'evitar quebra de resistência. Não usar mesma cultivar 3 safras seguidas.',
    monitoramento: {
      metodo:
        'Amostragem de solo em ziguezague (20 subamostras / 10 ha). Análise nematológica ' +
        'em laboratório especializado.',
      frequencia: 'Anual pós-colheita',
      nivelControle: 'Qualquer detecção exige plano de manejo',
    },
    observacoesAgronomicas:
      'Praga "silenciosa" — sintoma visual aparece quando dano já é alto. Amostragem ' +
      'preventiva é essencial. Limpeza de máquinas vindas de áreas infestadas é crítica.',
    referencias: [REF_EMBRAPA_FERRUGEM, REF_MAPA, REF_CESB],
  },

  {
    id: 'soja_nematoide_galhas',
    type: 'praga',
    category: 'nematoide',
    nomeComum: 'Nematoide das galhas',
    nomesAlternativos: ['meloidogyne', 'nematoide-galhador'],
    nomeCientifico: 'Meloidogyne incognita / M. javanica',
    culturas: ['soja', 'algodao', 'milho', 'tomate'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Reboleiras de plantas raquíticas. Raízes com galhas (engrossamentos) ' +
        'arredondadas ou alongadas — diagnóstico-chave. Plantas amareladas, baixa ' +
        'produtividade.',
      palavrasChave: [
        'galhas nas raízes',
        'raízes engrossadas',
        'reboleiras de plantas pequenas',
        'meloidogyne',
        'engrossamento nas raízes',
        'nó nas raízes',
      ],
      estagioAcometido: ['raízes', 'planta inteira'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: 'Solo 25-30 °C',
      umidade: 'Solo úmido',
      estacao: 'Verão',
      observacoes: ['Solos arenosos', 'Monocultivos sucessivos'],
    },
    niveisDano: {
      baixo: {
        criterio: '< 100 juvenis/100 cm³',
        acao: 'Rotação + cultivar tolerante',
      },
      medio: {
        criterio: '100-300 juvenis/100 cm³',
        acao: 'Rotação + biológico + TS',
      },
      alto: {
        criterio: '> 300 juvenis/100 cm³',
        acao: 'Rotação 2 safras + nematicida químico',
      },
    },
    mip: {
      cultural: [
        'Rotação com Crotalaria, milheto, braquiária',
        'Cultivares tolerantes',
        'Evitar trânsito de máquinas de áreas infestadas',
      ],
      biologico: ['Bacillus subtilis', 'Pochonia chlamydosporia', 'Purpureocillium lilacinum'],
      mecanico: ['Mapeamento de focos'],
      quimico: {
        classes: ['nematicidas químicos', 'TS com inseticidas/nematicidas'],
        ingredientesAtivos: [
          {
            nome: 'Abamectina (TS)',
            graudeIRACouFRAC: 'IRAC 6',
            produtosComerciais: [
              {
                nome: 'TS padrão',
                formulacao: 'FS',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: 'TS único',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
        ],
        observacoes: ['Mesma observação do NCS — químico só reduz, não elimina'],
      },
    },
    rotacaoResistencia: 'Combinar rotação + biológicos + cultivar tolerante.',
    monitoramento: {
      metodo: 'Amostragem de solo + análise nematológica',
      frequencia: 'Anual',
      nivelControle: 'Qualquer detecção exige plano',
    },
    observacoesAgronomicas:
      'Polífago — afeta múltiplas culturas. Rotação correta exige conhecer espécies ' +
      '(M. incognita vs M. javanica diferem em hospedeiras).',
    referencias: [REF_EMBRAPA_FERRUGEM, REF_MAPA],
  },

  // ============================================================
  // PRAGAS INSETOS — SOJA
  // ============================================================
  {
    id: 'soja_percevejo_marrom',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Percevejo-marrom',
    nomesAlternativos: ['percevejo da soja', 'maria-fedida'],
    nomeCientifico: 'Euschistus heros',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Sucção em vagens em formação e grãos — vagens chochas, grãos enrugados, ' +
        'manchas escuras nos grãos ("grão picado"). Em alta população, retenção foliar ' +
        '("soja louca"). Adultos marrons, ~11 mm, escudo nas costas.',
      palavrasChave: [
        'percevejo marrom na soja',
        'maria fedida',
        'vagens chochas',
        'grão picado',
        'grão enrugado',
        'soja louca',
        'manchas escuras nos grãos',
        'retenção foliar',
      ],
      estagioAcometido: ['vagens', 'grãos em formação'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Ciclo 30-45 dias. Sobrevive em entressafra em hospedeiros (cordia, ervas). ' +
      'Postura em massas de ~12 ovos. Adultos longevos (vários meses).',
    condicoesFavorecimento: {
      temperatura: '24-30 °C',
      umidade: 'Alta',
      estacao: 'R3-R7 (enchimento vagens)',
    },
    niveisDano: {
      baixo: {
        criterio: 'Produção sementes: 1 perc/pano-de-batida; produção grão: 2 perc/pano',
        acao: 'Monitoramento intensificado',
      },
      medio: {
        criterio: 'Atinge nível controle (2 perc/pano grão)',
        acao: 'Biológico (Telenomus podisi) OU aplicação de inseticida em rotação IRAC',
      },
      alto: {
        criterio: '> 3 perc/pano',
        acao: 'Aplicação química imediata + reaplicação se necessário',
      },
    },
    mip: {
      cultural: [
        'Plantios escalonados evitam ataques em janela única',
        'Cultivares precoces escapam de ataques tardios',
        'Manejo de plantas hospedeiras na entressafra',
      ],
      biologico: [
        'Telenomus podisi (parasitoide de ovos) — liberar 5.000 a 10.000/ha em R1',
        'Beauveria bassiana (fungo entomopatogênico)',
        'Metarhizium anisopliae',
        'Trichopoda giacomellii (parasitoide de adultos)',
      ],
      mecanico: ['Pano-de-batida 1 m semanal pós-R2'],
      quimico: {
        classes: ['neonicotinoides', 'piretroides', 'organofosforados', 'oxidiazinas'],
        ingredientesAtivos: [
          {
            nome: 'Imidacloprido + Bifentrina',
            graudeIRACouFRAC: 'IRAC 4A + 3A',
            produtosComerciais: [
              {
                nome: 'Mistura neonicotinoide + piretroide',
                formulacao: 'SC',
                dosagem: '0,5-1,0 L p.c./ha',
                intervaloAplicacoes: '10-14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
          {
            nome: 'Acefato',
            graudeIRACouFRAC: 'IRAC 1B',
            produtosComerciais: [
              {
                nome: 'Acefato 750 SP',
                formulacao: 'SP',
                dosagem: '600-1.000 g p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Indoxacarbe',
            graudeIRACouFRAC: 'IRAC 22A',
            produtosComerciais: [
              {
                nome: 'Indoxacarbe 300 SC',
                formulacao: 'SC',
                dosagem: '60-100 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'Resistência DOCUMENTADA de E. heros a neonicotinoides em várias regiões',
          'Rotação IRAC obrigatória — não repetir mesmo grupo 2x seguidas',
          'Aplicar nas horas mais frescas (manhã/tarde), volume > 100 L/ha',
        ],
      },
    },
    rotacaoResistencia:
      'Alternar IRAC 4A → 1B → 3A → 22A entre aplicações. Combinar com ' +
      'biológico (Telenomus) em pré-florada para reduzir pressão.',
    monitoramento: {
      metodo: 'Pano-de-batida horizontal 1 m, 4-6 pontos/talhão',
      frequencia: 'Semanal pós-R2',
      nivelControle: '2 percevejos/pano (grão), 1 percevejo/pano (semente)',
    },
    observacoesAgronomicas:
      'Praga #1 do enchimento de vagens. Manejo regional integrado (Areas Manejadas ' +
      'Coletivamente) reduz dramaticamente a pressão. Vazio sanitário ajuda muito.',
    referencias: [REF_IRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM, REF_CESB],
  },

  {
    id: 'soja_percevejo_verde_pequeno',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Percevejo-verde-pequeno',
    nomesAlternativos: ['percevejo verde pequeno'],
    nomeCientifico: 'Piezodorus guildinii',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Sintomas iguais ao percevejo-marrom, mas é mais danoso por inseto. Adulto ' +
        'verde com faixa transversal alaranjada/marrom no escudo. Ataque concentrado ' +
        'em vagens novas.',
      palavrasChave: [
        'percevejo verde pequeno',
        'percevejo com faixa marrom',
        'vagens chochas',
        'grão picado verde',
      ],
      estagioAcometido: ['vagens', 'grãos'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '24-30 °C',
      umidade: 'Alta',
      estacao: 'R3-R6',
    },
    niveisDano: {
      baixo: {
        criterio: '1 perc/pano (já mais danoso individualmente)',
        acao: 'Aplicação ou Telenomus',
      },
      medio: {
        criterio: '2 perc/pano',
        acao: 'Aplicação química',
      },
      alto: {
        criterio: '> 3 perc/pano',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Igual percevejo-marrom'],
      biologico: ['Telenomus podisi', 'Trissolcus basalis (mais eficaz neste hospedeiro)'],
      mecanico: ['Pano-de-batida'],
      quimico: {
        classes: ['neonicotinoides', 'piretroides', 'organofosforados'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam + Lambda-cialotrina',
            graudeIRACouFRAC: 'IRAC 4A + 3A',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '150-200 mL p.c./ha',
                intervaloAplicacoes: '10-14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
        ],
        observacoes: ['Mesma rotação IRAC do percevejo-marrom'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 1B → 3A → 22A.',
    monitoramento: {
      metodo: 'Pano-de-batida',
      frequencia: 'Semanal pós-R2',
      nivelControle: '2 percevejos/pano',
    },
    observacoesAgronomicas:
      'Mais danoso por indivíduo que E. heros. Tem menor frequência mas exige ação rápida.',
    referencias: [REF_IRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_lagarta_da_soja',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Lagarta-da-soja',
    nomesAlternativos: ['lagarta verde da soja'],
    nomeCientifico: 'Anticarsia gemmatalis',
    culturas: ['soja'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Desfolha (consumo de área foliar) — lagartas verdes (jovens) a marrons ' +
        '(maduras), com listras longitudinais brancas no dorso, até 4 cm. Movem-se em ' +
        'movimento de "agarrar" característico. Consomem folhas inteiras.',
      palavrasChave: [
        'lagarta verde na soja',
        'desfolha',
        'lagarta com listras brancas',
        'folhas com furos',
        'folhas comidas',
        'anticarsia',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'media',
    },
    cicloVida: 'Ciclo 25-30 dias. Postura em massas. Adulto mariposa cinza-claro.',
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Moderada',
      estacao: 'V3-R3',
    },
    niveisDano: {
      baixo: {
        criterio: '< 20 lagartas grandes/pano OU < 30 % desfolha pré-florada',
        acao: 'Monitoramento; usar Bt se subindo',
      },
      medio: {
        criterio: '20-40 lagartas/pano OU 30 % desfolha',
        acao: 'Aplicação biológica (Bt, baculovírus) ou IGR (inibidor crescimento)',
      },
      alto: {
        criterio: '> 40 lagartas/pano',
        acao: 'Aplicação química seletiva',
      },
    },
    mip: {
      cultural: ['Manejo de ervas daninhas hospedeiras', 'Rotação'],
      biologico: [
        'Baculovirus anticarsia (BVA) — específico, sem impacto em inimigos',
        'Bacillus thuringiensis (Bt)',
        'Trichogramma pretiosum (parasitoide de ovos)',
        'Telenomus remus',
      ],
      mecanico: ['Pano-de-batida'],
      quimico: {
        classes: ['inibidores crescimento (IGR)', 'diamidas', 'espinosinas'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida — alta seletividade',
                formulacao: 'SC',
                dosagem: '30-50 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Espinosade / Espinetoram',
            graudeIRACouFRAC: 'IRAC 5',
            produtosComerciais: [
              {
                nome: 'Espinosina seletiva',
                formulacao: 'SC',
                dosagem: '100-200 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Lufenuron (IGR)',
            graudeIRACouFRAC: 'IRAC 15',
            produtosComerciais: [
              {
                nome: 'IGR específico lagartas',
                formulacao: 'EC',
                dosagem: '150-300 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'PRIORIZAR biológicos (BVA, Bt) — Anticarsia é altamente susceptível',
          'Evitar piretroides amplos — preserve inimigos naturais',
        ],
      },
    },
    rotacaoResistencia:
      'Alternar IRAC 5 → 28 → 15 quando houver pressão. Bt e BVA preservam moléculas químicas.',
    monitoramento: {
      metodo: 'Pano-de-batida 1 m, contagem lagartas > 1,5 cm',
      frequencia: 'Semanal a partir de V3',
      nivelControle: '20 lagartas grandes/pano OU 30 % desfolha pré-florada / 15 % pós',
    },
    observacoesAgronomicas:
      'Praga histórica clássica da soja. BVA brasileiro é caso de sucesso mundial em controle biológico.',
    referencias: [REF_IRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM, REF_CESB],
  },

  {
    id: 'soja_lagarta_falsa_medideira',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Lagarta-falsa-medideira',
    nomesAlternativos: ['mede-palmo', 'falsa medideira'],
    nomeCientifico: 'Chrysodeixis includens',
    culturas: ['soja', 'algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Desfolha com aspecto "rendilhado" — preserva nervuras. Lagarta verde-clara ' +
        'com finas listras longitudinais brancas, anda em movimento de "mede-palmo". ' +
        'Até 3,5 cm. Concentra-se em folhas do baixeiro.',
      palavrasChave: [
        'lagarta mede palmo',
        'mede-palmo na soja',
        'folhas rendilhadas',
        'desfolha de baixo',
        'lagarta com listras brancas finas',
      ],
      estagioAcometido: ['folhas baixeiras → médias'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C',
      umidade: 'Alta',
      estacao: 'R1-R5',
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 lagartas/pano',
        acao: 'Bt ou monitoramento',
      },
      medio: {
        criterio: '10-20 lagartas/pano',
        acao: 'Bt + diamida ou IGR',
      },
      alto: {
        criterio: '> 20 lagartas/pano',
        acao: 'Aplicação química seletiva',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Plantio escalonado'],
      biologico: ['Bt (especialmente var. kurstaki)', 'Baculovirus chrysodeixis'],
      mecanico: ['Pano-de-batida'],
      quimico: {
        classes: ['diamidas', 'espinosinas', 'IGR'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida',
                formulacao: 'SC',
                dosagem: '30-50 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Metoxifenozide (IGR)',
            graudeIRACouFRAC: 'IRAC 18',
            produtosComerciais: [
              {
                nome: 'IGR ecdísônio agonista',
                formulacao: 'SC',
                dosagem: '150-200 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'Chrysodeixis tem TOLERÂNCIA NATURAL maior que Anticarsia a Bt',
          'Resistência documentada a piretroides (IRAC 3) em várias regiões',
          'Diamidas (IRAC 28) requerem rotação',
        ],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 28 → 5 → 18. Evitar piretroides isolados.',
    monitoramento: {
      metodo: 'Pano-de-batida',
      frequencia: 'Semanal pós-V3',
      nivelControle: '20 lagartas grandes/pano OU 30 % desfolha pré-florada / 15 % pós',
    },
    observacoesAgronomicas:
      'Hoje mais importante que Anticarsia em algumas regiões. Resistência a inseticidas ' +
      'tradicionais cresceu nas últimas safras.',
    referencias: [REF_IRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_helicoverpa_armigera',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Helicoverpa armigera',
    nomesAlternativos: ['lagarta da espiga', 'helicoverpa'],
    nomeCientifico: 'Helicoverpa armigera',
    culturas: ['soja', 'algodao', 'milho', 'tomate'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Ataca PRINCIPALMENTE estruturas reprodutivas — perfura vagens (soja), maçãs ' +
        '(algodão), espiga (milho). Lagarta varia de verde a marrom-avermelhada, com ' +
        'listras laterais. Até 5 cm. Comportamento canibal (1 lagarta por estrutura).',
      palavrasChave: [
        'lagarta na vagem',
        'vagem furada',
        'helicoverpa',
        'lagarta da espiga',
        'lagarta com listras laterais',
        'lagarta marrom avermelhada',
      ],
      estagioAcometido: ['vagens', 'estruturas reprodutivas'],
      severidadeVisual: 'alta',
    },
    cicloVida: 'Ciclo 30-40 dias. Postura individual em folhas/estruturas reprodutivas.',
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Variada',
      estacao: 'R3 em diante (vagens)',
    },
    niveisDano: {
      baixo: {
        criterio: '< 1 lagarta/m linear',
        acao: 'Monitoramento intensivo',
      },
      medio: {
        criterio: '1-2 lagartas/m linear OU 10 % vagens atacadas',
        acao: 'Diamida ou espinosina',
      },
      alto: {
        criterio: '> 2 lagartas/m OU > 15 % vagens atacadas',
        acao: 'Aplicação imediata + reaplicação 10-14 dias',
      },
    },
    mip: {
      cultural: ['Manejo regional integrado', 'Plantio escalonado', 'Rotação com gramíneas'],
      biologico: [
        'Trichogramma pretiosum (ovos)',
        'Helicoverpa zea NPV (vírus específico)',
        'Bt aizawai e kurstaki',
      ],
      mecanico: ['Monitoramento com armadilha de feromônio'],
      quimico: {
        classes: ['diamidas', 'espinosinas', 'metoxifenozide'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida — referência',
                formulacao: 'SC',
                dosagem: '50-100 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Espinetoram',
            graudeIRACouFRAC: 'IRAC 5',
            produtosComerciais: [
              {
                nome: 'Espinosina',
                formulacao: 'SC',
                dosagem: '150-250 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'Helicoverpa armigera tem RESISTÊNCIA documentada a piretroides',
          'Rotação IRAC obrigatória — usar diamidas com responsabilidade',
        ],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 28 → 5 → 18. Não aplicar mesma diamida 2x seguidas.',
    monitoramento: {
      metodo: 'Pano-de-batida + armadilhas de feromônio (1/30 ha)',
      frequencia: 'Semanal pós-R1',
      nivelControle: '1-2 lagartas/m linear, atenção a vagens atacadas',
    },
    observacoesAgronomicas:
      'Praga introduzida no Brasil em 2013, hoje endêmica. Polífaga, manejo regional ' +
      'é crítico. Acompanhar boletins regionais.',
    referencias: [REF_IRAC, REF_MAPA, REF_EMBRAPA_FERRUGEM],
  },

  {
    id: 'soja_mosca_branca',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Mosca-branca',
    nomesAlternativos: ['mosca branca'],
    nomeCientifico: 'Bemisia tabaci (biotipo MEAM1)',
    culturas: ['soja', 'algodao', 'tomate'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pequenas moscas brancas (~1 mm) em nuvens ao tocar a planta. Ninfas sésseis ' +
        'amareladas na face inferior das folhas. Excretam melaço → fumagina (fungo ' +
        'preto). Vetor de viroses (mosaico-dourado, queima-do-broto).',
      palavrasChave: [
        'mosca branca',
        'nuvem branca na planta',
        'fumagina preta',
        'melado nas folhas',
        'ninfas amarelas embaixo da folha',
        'soja com pó preto',
      ],
      estagioAcometido: ['folhas', 'planta toda (viroses)'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Baixa a moderada',
      estacao: 'Verão seco, principalmente safrinha',
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 adultos/folha trifoliada',
        acao: 'Monitoramento + inimigos naturais',
      },
      medio: {
        criterio: '5-10 adultos/folha',
        acao: 'Aplicação biológica (Beauveria) ou IGR',
      },
      alto: {
        criterio: '> 10 adultos/folha',
        acao: 'Aplicação química com rotação IRAC',
      },
    },
    mip: {
      cultural: [
        'Cultivares menos suscetíveis a viroses',
        'Evitar plantios sucessivos hospedeiros',
        'Janela livre de hospedeiros entre safras',
      ],
      biologico: ['Beauveria bassiana', 'Encarsia formosa (parasitoide)', 'Eretmocerus mundus'],
      mecanico: ['Armadilhas amarelas adesivas'],
      quimico: {
        classes: ['neonicotinoides', 'IGR', 'cetoenois'],
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
                nome: 'Cetoenol sistêmico',
                formulacao: 'OD',
                dosagem: '300-400 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'Mosca-branca tem ALTA pressão de resistência — rotação rigorosa',
          'Atingir face inferior das folhas é crítico (bicos cônicos)',
          'Neonicotinoides foliares: cuidado com resistência cruzada',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar IRAC 4A → 7C → 23 → 9B. Nunca usar mesmo grupo 2x consecutivas.',
    monitoramento: {
      metodo: 'Inspeção visual de folhas + armadilhas amarelas',
      frequencia: 'Semanal',
      nivelControle: '5-10 adultos/folha trifoliada',
    },
    observacoesAgronomicas:
      'Pressão crescente nas últimas safras, especialmente safrinha. Manejo regional ' +
      'integrado é essencial. Viroses podem causar perda total mesmo com poucas moscas.',
    referencias: [REF_IRAC, REF_MAPA],
  },

  {
    id: 'soja_acaro_rajado',
    type: 'praga',
    category: 'acaro',
    nomeComum: 'Ácaro-rajado',
    nomesAlternativos: ['ácaro vermelho da soja'],
    nomeCientifico: 'Tetranychus urticae',
    culturas: ['soja', 'algodao', 'milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pontuações amarelo-esbranquiçadas na face superior das folhas → bronzeamento ' +
        '→ ressecamento. Teias finas na face inferior. Ácaros minúsculos (< 0,5 mm), ' +
        'amarelo-esverdeados com 2 manchas escuras no dorso.',
      palavrasChave: [
        'pontinhos amarelos nas folhas',
        'bronzeamento foliar',
        'teia nas folhas',
        'folha ressecada de cima para baixo',
        'ácaro',
      ],
      estagioAcometido: ['folhas (face inferior)'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '> 28 °C',
      umidade: 'Baixa (seca prolongada)',
      estacao: 'Veranicos, safras secas',
    },
    niveisDano: {
      baixo: {
        criterio: 'Pontos isolados nas baixeiras',
        acao: 'Monitoramento',
      },
      medio: {
        criterio: 'Reboleiras visíveis com bronzeamento',
        acao: 'Acaricida seletivo + biológico',
      },
      alto: {
        criterio: 'Bronzeamento generalizado',
        acao: 'Aplicação imediata com rotação IRAC',
      },
    },
    mip: {
      cultural: ['Evitar veranicos por irrigação', 'Cobertura morta'],
      biologico: ['Neoseiulus californicus (ácaro predador)', 'Beauveria bassiana'],
      mecanico: ['Monitoramento com lupa 10x'],
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
                dosagem: '200-300 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
          {
            nome: 'Espirodiclofeno',
            graudeIRACouFRAC: 'IRAC 23',
            produtosComerciais: [
              {
                nome: 'Acaricida cetoenol',
                formulacao: 'SC',
                dosagem: '150-200 mL p.c./ha',
                intervaloAplicacoes: '21 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Aplicar com volume alto p/ molhar face inferior'],
      },
    },
    rotacaoResistencia: 'Alternar IRAC 6 → 23 → 25.',
    monitoramento: {
      metodo: 'Inspeção com lupa 10x face inferior',
      frequencia: 'Semanal em estiagens',
      nivelControle: 'Reboleiras com bronzeamento',
    },
    observacoesAgronomicas:
      'Surto típico em veranicos. Acaricidas seletivos preservam Neoseiulus (predador natural).',
    referencias: [REF_IRAC, REF_MAPA],
  },
];
