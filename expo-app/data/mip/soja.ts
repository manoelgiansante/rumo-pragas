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
      },
      medio: {
        criterio: '5-10 % de severidade visual em folhas baixeiras',
      },
      alto: {
        criterio: '> 25 % de severidade, desfolha em andamento',
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
        'Bacillus subtilis (referência educativa; validar registro para cultura e alvo)',
        'Bacillus amyloliquefaciens',
        'Trichoderma asperellum (manejo integrado com solo)',
      ],
    },
    monitoramento: {
      metodo:
        'Inspeção semanal de folhas baixeiras (face inferior). Coleta de 10 folhas ' +
        'por talhão / análise com lupa 10x ou kit imunológico.',
      frequencia: 'Semanal a partir de V3, quinzenal antes',
      nivelControle:
        'Primeira pústula confirmada: registrar a ocorrência e consultar um engenheiro agrônomo e o AGROFIT.',
    },
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
      },
      medio: {
        criterio: 'Primeiros focos isolados (< 5 % de plantas afetadas)',
      },
      alto: {
        criterio: '> 20 % de plantas com escleródios ou hastes apodrecidas',
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
        'Coniothyrium minitans (micoparasita; validar registro para cultura e alvo)',
      ],
    },
    monitoramento: {
      metodo: 'Inspeção visual em R1-R5, especialmente em manchões mais úmidos do talhão',
      frequencia: 'Semanal durante florada (R1-R5)',
      nivelControle:
        'Histórico + clima favorável: intensificar o monitoramento e buscar avaliação agronômica.',
    },
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
      },
      medio: {
        criterio: '5-15 % severidade, com desfolha incipiente',
      },
      alto: {
        criterio: '> 15 % com desfolha pronunciada',
      },
    },
    mip: {
      cultural: ['Rotação com gramíneas', 'Cultivares menos suscetíveis', 'Adensamento moderado'],
      biologico: ['Bacillus subtilis', 'Trichoderma'],
    },
    monitoramento: {
      metodo: 'Inspeção de folhas baixeiras semanalmente em R1+',
      frequencia: 'Semanal a partir de V6',
      nivelControle:
        'Manchas confirmadas + clima úmido: registrar e buscar avaliação agronômica no campo.',
    },
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
      },
      medio: {
        criterio: '10-30 %',
      },
      alto: {
        criterio: '> 30 % com desfolha',
      },
    },
    mip: {
      cultural: ['Cultivares resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção visual em safras secas e amenas',
      frequencia: 'Semanal',
      nivelControle: '10 % área foliar coberta',
    },
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
      },
      medio: {
        criterio: 'Manchas em 10-25 % das plantas',
      },
      alto: {
        criterio: '> 25 % com vagens chochas',
      },
    },
    mip: {
      cultural: [
        'Uso de sementes sadias e certificadas',
        'Rotação de culturas',
        'Densidade de plantio adequada',
      ],
      biologico: ['Agentes biológicos somente após validação profissional e no AGROFIT'],
    },
    monitoramento: {
      metodo: 'Inspeção em vagens em R3-R6',
      frequencia: 'Semanal a partir de R3',
      nivelControle: 'Sintomas confirmados em vagens',
    },
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
      },
      medio: {
        criterio: 'Desfolha < 25 % do dossel',
      },
      alto: {
        criterio: 'Desfolha > 25 % antes de R6',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Rotação'],
      biologico: ['Bacillus subtilis'],
    },
    monitoramento: {
      metodo: 'Inspeção visual em folhas baixeiras',
      frequencia: 'Semanal a partir de R3',
      nivelControle:
        'Manchas em folhas baixeiras + clima úmido: registrar e buscar avaliação agronômica.',
    },
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
      },
      medio: {
        criterio: '200-500 cistos/100 cm³',
      },
      alto: {
        criterio: '> 500 cistos/100 cm³',
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
    },
    monitoramento: {
      metodo:
        'Amostragem de solo em ziguezague (20 subamostras / 10 ha). Análise nematológica ' +
        'em laboratório especializado.',
      frequencia: 'Anual pós-colheita',
      nivelControle: 'Qualquer detecção exige plano de manejo',
    },
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
      },
      medio: {
        criterio: '100-300 juvenis/100 cm³',
      },
      alto: {
        criterio: '> 300 juvenis/100 cm³',
      },
    },
    mip: {
      cultural: [
        'Rotação com Crotalaria, milheto, braquiária',
        'Cultivares tolerantes',
        'Evitar trânsito de máquinas de áreas infestadas',
      ],
      biologico: ['Bacillus subtilis', 'Pochonia chlamydosporia', 'Purpureocillium lilacinum'],
    },
    monitoramento: {
      metodo: 'Amostragem de solo + análise nematológica',
      frequencia: 'Anual',
      nivelControle: 'Qualquer detecção exige plano',
    },
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
      },
      medio: {
        criterio: 'Atinge nível controle (2 perc/pano grão)',
      },
      alto: {
        criterio: '> 3 perc/pano',
      },
    },
    mip: {
      cultural: [
        'Plantios escalonados evitam ataques em janela única',
        'Cultivares precoces escapam de ataques tardios',
        'Manejo de plantas hospedeiras na entressafra',
      ],
      biologico: [
        'Conservação de parasitoides de ovos; liberação somente com orientação técnica',
        'Beauveria bassiana (fungo entomopatogênico)',
        'Metarhizium anisopliae',
        'Trichopoda giacomellii (parasitoide de adultos)',
      ],
    },
    monitoramento: {
      metodo: 'Pano-de-batida horizontal 1 m, 4-6 pontos/talhão',
      frequencia: 'Semanal pós-R2',
      nivelControle: '2 percevejos/pano (grão), 1 percevejo/pano (semente)',
    },
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
      },
      medio: {
        criterio: '2 perc/pano',
      },
      alto: {
        criterio: '> 3 perc/pano',
      },
    },
    mip: {
      cultural: ['Igual percevejo-marrom'],
      biologico: ['Telenomus podisi', 'Trissolcus basalis (mais eficaz neste hospedeiro)'],
    },
    monitoramento: {
      metodo: 'Pano-de-batida',
      frequencia: 'Semanal pós-R2',
      nivelControle: '2 percevejos/pano',
    },
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
      },
      medio: {
        criterio: '20-40 lagartas/pano OU 30 % desfolha',
      },
      alto: {
        criterio: '> 40 lagartas/pano',
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
    },
    monitoramento: {
      metodo: 'Pano-de-batida 1 m, contagem lagartas > 1,5 cm',
      frequencia: 'Semanal a partir de V3',
      nivelControle: '20 lagartas grandes/pano OU 30 % desfolha pré-florada / 15 % pós',
    },
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
      },
      medio: {
        criterio: '10-20 lagartas/pano',
      },
      alto: {
        criterio: '> 20 lagartas/pano',
      },
    },
    mip: {
      cultural: ['Cultivares menos suscetíveis', 'Plantio escalonado'],
      biologico: ['Bt (especialmente var. kurstaki)', 'Baculovirus chrysodeixis'],
    },
    monitoramento: {
      metodo: 'Pano-de-batida',
      frequencia: 'Semanal pós-V3',
      nivelControle: '20 lagartas grandes/pano OU 30 % desfolha pré-florada / 15 % pós',
    },
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
      },
      medio: {
        criterio: '1-2 lagartas/m linear OU 10 % vagens atacadas',
      },
      alto: {
        criterio: '> 2 lagartas/m OU > 15 % vagens atacadas',
      },
    },
    mip: {
      cultural: ['Manejo regional integrado', 'Plantio escalonado', 'Rotação com gramíneas'],
      biologico: [
        'Trichogramma pretiosum (ovos)',
        'Helicoverpa zea NPV (vírus específico)',
        'Bt aizawai e kurstaki',
      ],
    },
    monitoramento: {
      metodo: 'Pano-de-batida + armadilhas de feromônio (1/30 ha)',
      frequencia: 'Semanal pós-R1',
      nivelControle: '1-2 lagartas/m linear, atenção a vagens atacadas',
    },
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
      },
      medio: {
        criterio: '5-10 adultos/folha',
      },
      alto: {
        criterio: '> 10 adultos/folha',
      },
    },
    mip: {
      cultural: [
        'Cultivares menos suscetíveis a viroses',
        'Evitar plantios sucessivos hospedeiros',
        'Janela livre de hospedeiros entre safras',
      ],
      biologico: ['Beauveria bassiana', 'Encarsia formosa (parasitoide)', 'Eretmocerus mundus'],
    },
    monitoramento: {
      metodo: 'Inspeção visual de folhas + armadilhas amarelas',
      frequencia: 'Semanal',
      nivelControle: '5-10 adultos/folha trifoliada',
    },
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
      },
      medio: {
        criterio: 'Reboleiras visíveis com bronzeamento',
      },
      alto: {
        criterio: 'Bronzeamento generalizado',
      },
    },
    mip: {
      cultural: ['Evitar veranicos por irrigação', 'Cobertura morta'],
      biologico: ['Neoseiulus californicus (ácaro predador)', 'Beauveria bassiana'],
    },
    monitoramento: {
      metodo: 'Inspeção com lupa 10x face inferior',
      frequencia: 'Semanal em estiagens',
      nivelControle: 'Reboleiras com bronzeamento',
    },
    referencias: [REF_IRAC, REF_MAPA],
  },
];
