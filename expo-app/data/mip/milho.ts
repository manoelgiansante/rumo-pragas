/**
 * Catálogo MIP — Milho (Zea mays)
 *
 * Cultura #2 do Brasil. Foco safrinha (2ª safra) que concentra
 * pressão de Spodoptera frugiperda e cigarrinha vetora de enfezamentos.
 *
 * Fontes consultadas:
 *  - EMBRAPA Milho e Sorgo (Sete Lagoas) — Circulares Técnicas
 *  - MAPA / Agrofit
 *  - IRAC Mode of Action 11.5 (2026)
 *  - FRAC Code List (2026)
 *  - CTNBio (eventos Bt registrados)
 */

import type { MipEntry } from './types';

const REF_EMBRAPA_MILHO = {
  source: 'EMBRAPA' as const,
  url: 'https://www.embrapa.br/milho-e-sorgo',
  ano: 2025,
  titulo: 'EMBRAPA Milho e Sorgo — manejo integrado',
};

const REF_EMBRAPA_CARTUCHO = {
  source: 'EMBRAPA' as const,
  url:
    'https://www.embrapa.br/en/busca-de-noticias/-/noticia/33080973/' +
    'embrapa-oferece-conhecimentos-para-controle-da-lagarta-do-cartucho',
  ano: 2024,
  titulo: 'Embrapa — Controle da lagarta-do-cartucho (Spodoptera frugiperda)',
};

const REF_IRAC = {
  source: 'IRAC' as const,
  url: 'https://irac-online.org/mode-of-action/classification-online/',
  ano: 2026,
  titulo: 'IRAC Mode of Action Classification Edition 11.5',
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

export const MILHO_MIP_ENTRIES: MipEntry[] = [
  // ============================================================
  // PRAGAS — MILHO
  // ============================================================
  {
    id: 'milho_lagarta_cartucho',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Lagarta-do-cartucho',
    nomesAlternativos: ['Spodoptera frugiperda', 'lagarta militar', 'cartucheira'],
    nomeCientifico: 'Spodoptera frugiperda',
    culturas: ['milho', 'sorgo', 'soja', 'algodao'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Raspagens nas folhas novas, evoluindo para furos e perfuração do cartucho ' +
        '("destruição do cartucho"). Folhas emergentes saem com fileiras de furos ' +
        'simétricos. Lagarta cinza-esverdeada com 4 pontos pretos formando trapézio ' +
        'no penúltimo segmento + Y invertido claro na cabeça. Até 4 cm.',
      palavrasChave: [
        'cartucho do milho perfurado',
        'folhas com furos alinhados',
        'lagarta do cartucho',
        'spodoptera',
        'lagarta cinza no milho',
        'cartucheira',
        'Y invertido na cabeça',
        'raspagem em folhas novas',
      ],
      estagioAcometido: ['cartucho', 'folhas novas', 'pendão', 'espiga'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Ciclo 30-40 dias. Mariposa adulta voa à noite, postura em massas de ~150 ovos ' +
      'na face inferior das folhas. 6 ínstares larvais. Empupa no solo.',
    condicoesFavorecimento: {
      temperatura: '25-32 °C',
      umidade: 'Baixa a moderada (favorece sobrevivência)',
      estacao: 'Safrinha (jan-mai), pressão alta o ano todo',
      observacoes: [
        'Safrinha concentra pressão',
        'Plantios escalonados na região aumentam pressão regional',
      ],
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % de plantas com raspagens (V2-V4)',
        acao: 'Bt (Bacillus thuringiensis) ou baculovírus',
      },
      medio: {
        criterio: '10-20 % de plantas com cartucho atacado',
        acao: 'Bt + IGR ou diamida, rotação IRAC',
      },
      alto: {
        criterio: '> 20 % com cartuchos atacados OU presença de lagartas grandes',
        acao: 'Aplicação química imediata com IRAC 28 ou 5',
      },
    },
    mip: {
      cultural: [
        'Plantio na janela recomendada (escapar de picos)',
        'Eliminação de soqueiras (sorgo, cana, milho voluntário)',
        'Rotação com não-hospedeiras (leguminosas)',
        'Híbridos Bt (Cry1A.105, Cry2Ab2, Vip3A) com refúgio obrigatório',
      ],
      biologico: [
        'Baculovirus spodoptera (BVS)',
        'Bacillus thuringiensis var. kurstaki / aizawai',
        'Telenomus remus (parasitoide de ovos)',
        'Trichogramma pretiosum',
        'Doru luteipes (tesourinha — predador natural conservar!)',
      ],
      mecanico: ['Armadilhas de feromônio para monitoramento'],
      quimico: {
        classes: ['diamidas', 'espinosinas', 'IGR', 'metoxifenozide'],
        ingredientesAtivos: [
          {
            nome: 'Clorantraniliprole',
            graudeIRACouFRAC: 'IRAC 28',
            produtosComerciais: [
              {
                nome: 'Diamida ribodina',
                formulacao: 'SC',
                dosagem: '40-60 mL p.c./ha',
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
                nome: 'Inibidor síntese quitina',
                formulacao: 'EC',
                dosagem: '300-500 mL p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'RESISTÊNCIA documentada de S. frugiperda a Cry1F, piretroides, e diamidas em algumas regiões',
          'Bt isolado NÃO é suficiente — sempre combinar com biológico ou químico em pressão alta',
          'Aplicar ANTES da lagarta entrar no cartucho (mais difícil atingir)',
          'Refúgio Bt obrigatório (10-20 % conforme tecnologia)',
        ],
      },
    },
    rotacaoResistencia:
      'Rotacionar IRAC 28 → 5 → 15 → 18. Bt + biológico em V2-V4 evita seleção de ' +
      'resistentes em químicos. Refúgio estrutural obrigatório.',
    monitoramento: {
      metodo:
        'Inspeção visual em 10 plantas/talhão. Contagem de raspagens, furos, lagartas. ' +
        'Armadilhas de feromônio (Lure) 1/30 ha para detectar pico de voo.',
      frequencia: 'Bi-semanal V2-V8, semanal V8 em diante',
      nivelControle: '10 % de plantas atacadas em V2-V4 / 20 % V5+',
    },
    observacoesAgronomicas:
      'Praga #1 do milho no Brasil. Manejo integrado é OBRIGATÓRIO — Bt sozinho falha. ' +
      'Em algumas regiões há populações já resistentes a múltiplos IAs. Acompanhar boletins regionais.',
    referencias: [REF_EMBRAPA_CARTUCHO, REF_EMBRAPA_MILHO, REF_IRAC, REF_MAPA],
  },

  {
    id: 'milho_cigarrinha',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Cigarrinha-do-milho',
    nomesAlternativos: ['Dalbulus maidis', 'cigarrinha vetora'],
    nomeCientifico: 'Dalbulus maidis',
    culturas: ['milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Inseto sugador pequeno (4 mm), amarelo-pálido com 2 pontos pretos na cabeça. ' +
        'Sucção em si causa pouco dano direto — o problema é a TRANSMISSÃO de molicutes ' +
        'que causam ENFEZAMENTOS (vermelho, pálido) e vírus do raiado-fino. Plantas ' +
        'enfezadas: avermelhamento de bordas, espigas pequenas/sem grãos, plantas mortas.',
      palavrasChave: [
        'cigarrinha do milho',
        'enfezamento vermelho',
        'enfezamento pálido',
        'milho avermelhando',
        'milho não enche espiga',
        'plantas com espiga falhada',
        'dalbulus',
        'raiado fino',
      ],
      estagioAcometido: ['planta toda (via molicutes)'],
      severidadeVisual: 'alta',
    },
    cicloVida:
      'Ciclo 25-30 dias. Sobrevive em milho voluntário (tiguera) na entressafra — ' +
      'fonte primária de inóculo de molicutes.',
    condicoesFavorecimento: {
      temperatura: '22-32 °C',
      umidade: 'Variada',
      estacao: 'Safrinha (mar-jun) crítica',
      observacoes: [
        'Tiguera de milho = reservatório',
        'Plantios sucessivos elevam pressão regional',
      ],
    },
    niveisDano: {
      baixo: {
        criterio: '< 1 cigarrinha/planta em V2-V6',
        acao: 'TS sistêmico já protege fase crítica',
      },
      medio: {
        criterio: '1-3 cigarrinhas/planta',
        acao: 'Aplicação foliar com neonicotinoide ou piretroide',
      },
      alto: {
        criterio: '> 3 cigarrinhas/planta',
        acao: 'Aplicação imediata + reaplicação 7-10 dias',
      },
    },
    mip: {
      cultural: [
        'CONTROLE DE TIGUERA (milho voluntário) obrigatório — vazio sanitário',
        'Plantio na janela recomendada (não atrasar safrinha)',
        'Híbridos tolerantes a enfezamentos',
        'Não sucessão milho-milho (espalhar regionalmente)',
      ],
      biologico: ['Beauveria bassiana (eficácia parcial em adultos)'],
      mecanico: ['Armadilhas amarelas adesivas'],
      quimico: {
        classes: ['neonicotinoides', 'piretroides', 'TS sistêmico'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam (TS)',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'TS tiametoxam',
                formulacao: 'FS',
                dosagem: 'Conforme bula (sementes)',
                intervaloAplicacoes: 'TS único',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
          {
            nome: 'Acetamiprido + Bifentrina',
            graudeIRACouFRAC: 'IRAC 4A + 3A',
            produtosComerciais: [
              {
                nome: 'Mistura neonic + piretroide',
                formulacao: 'SC',
                dosagem: '150-200 mL p.c./ha',
                intervaloAplicacoes: '7-10 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: [
          'TS protege apenas até V4-V6 — após, monitorar foliar',
          'Aplicações foliares devem cobrir base e topo (cigarrinha móvel)',
        ],
      },
    },
    rotacaoResistencia: 'Alternar IRAC 4A → 3A. Sempre TS + foliar conforme MIP.',
    monitoramento: {
      metodo: 'Inspeção visual + armadilhas amarelas',
      frequencia: '2x/semana V2-V8',
      nivelControle: '1 cigarrinha/planta em V2-V4 (período crítico)',
    },
    observacoesAgronomicas:
      'Praga EMERGENTE com importância crescente. Causou perdas > 50 % em safrinhas ' +
      'recentes. Manejo regional integrado (eliminar tiguera) é crítico. Híbrido ' +
      'tolerante reduz mas não elimina dano.',
    referencias: [REF_EMBRAPA_MILHO, REF_IRAC, REF_MAPA],
  },

  {
    id: 'milho_percevejo_barriga_verde',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Percevejo-barriga-verde',
    nomesAlternativos: ['Dichelops'],
    nomeCientifico: 'Dichelops melacanthus',
    culturas: ['milho', 'soja', 'trigo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Sucção em plântulas (V1-V4) causa "encharutamento" — plantas com folhas ' +
        'enroladas, paralisadas no crescimento. Adulto marrom-claro com escudo barriga ' +
        'verde. Ataque concentrado em emergência.',
      palavrasChave: [
        'milho encharutado',
        'folhas enroladas no milho',
        'planta paralisada',
        'percevejo no milho',
        'percevejo barriga verde',
        'dichelops',
      ],
      estagioAcometido: ['plântulas V1-V4'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '24-30 °C',
      umidade: 'Variada',
      estacao: 'Plantio safra e safrinha pós-soja',
    },
    niveisDano: {
      baixo: {
        criterio: '< 1 perc/m linear',
        acao: 'TS sistêmico controla',
      },
      medio: {
        criterio: '1-2 perc/m linear',
        acao: 'Aplicação foliar de piretroide ou neonic',
      },
      alto: {
        criterio: '> 2 perc/m linear',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: [
        'Plantio direto sob palhada de soja = atrai percevejos remanescentes',
        'Dessecação 14 dias antes plantio',
        'Controle de plantas hospedeiras em entressafra',
      ],
      biologico: ['Telenomus podisi'],
      mecanico: ['Inspeção pós-emergência'],
      quimico: {
        classes: ['neonicotinoides', 'piretroides'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam + Lambda-cialotrina',
            graudeIRACouFRAC: 'IRAC 4A + 3A',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '150-250 mL p.c./ha',
                intervaloAplicacoes: '10 dias',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['Atacar precocemente — encharutamento é irreversível'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 3A → 1B.',
    monitoramento: {
      metodo: 'Pano-de-batida ou inspeção solo na emergência',
      frequencia: 'Diária V1-V4',
      nivelControle: '1 percevejo/m linear',
    },
    observacoesAgronomicas:
      'Sintoma "encharutamento" reduz produtividade > 30 % em ataques severos. ' +
      'TS é a melhor defesa.',
    referencias: [REF_EMBRAPA_MILHO, REF_IRAC, REF_MAPA],
  },

  {
    id: 'milho_lagarta_elasmo',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Lagarta-elasmo',
    nomesAlternativos: ['broca do colo', 'broca da raiz'],
    nomeCientifico: 'Elasmopalpus lignosellus',
    culturas: ['milho', 'soja', 'amendoim', 'sorgo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Lagarta verde-azulada com listras transversais. Perfura colmo no nível do solo, ' +
        'causa morte da planta ou "coração morto" (folha central seca). Comum em ' +
        'plantios em solos secos e arenosos.',
      palavrasChave: [
        'lagarta no colo do milho',
        'coração morto no milho',
        'planta murchando do meio',
        'lagarta verde azulada',
        'broca do colo',
        'elasmo',
      ],
      estagioAcometido: ['colo da planta', 'plântula'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '> 28 °C',
      umidade: 'Baixa (solos secos)',
      estacao: 'Veranicos pós-plantio',
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 % plantas com coração morto',
        acao: 'Monitoramento + irrigação se possível',
      },
      medio: {
        criterio: '5-10 % plantas atacadas',
        acao: 'TS + aplicação dirigida ao solo',
      },
      alto: {
        criterio: '> 10 % com falhas',
        acao: 'Replantio possível + tratamento sulco',
      },
    },
    mip: {
      cultural: ['Plantio em condições adequadas de umidade', 'Cobertura morta', 'Rotação'],
      biologico: ['Beauveria bassiana'],
      mecanico: ['Inspeção solo'],
      quimico: {
        classes: ['neonicotinoides TS', 'piretroides solo'],
        ingredientesAtivos: [
          {
            nome: 'Tiametoxam TS',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'TS sistêmico',
                formulacao: 'FS',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: 'TS único',
                intervaloSegurancaDias: 0,
                carencia: 0,
              },
            ],
          },
        ],
        observacoes: ['TS é a melhor defesa preventiva'],
      },
    },
    rotacaoResistencia: 'TS rotacionar com químicos sulco IRAC distinto.',
    monitoramento: {
      metodo: 'Inspeção visual de plantas murchas',
      frequencia: 'Diária V1-V5',
      nivelControle: '5 % plantas com coração morto',
    },
    observacoesAgronomicas:
      'Praga oportunista em veranicos. Manejo de solo (cobertura, umidade) reduz dano.',
    referencias: [REF_EMBRAPA_MILHO, REF_IRAC, REF_MAPA],
  },

  {
    id: 'milho_pulgao',
    type: 'praga',
    category: 'inseto',
    nomeComum: 'Pulgão-do-milho',
    nomesAlternativos: ['pulgão verde', 'Rhopalosiphum'],
    nomeCientifico: 'Rhopalosiphum maidis',
    culturas: ['milho', 'sorgo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Colônias verdes nas folhas e pendão. Sucção causa amarelecimento e enrolamento. ' +
        'Excretam melaço → fumagina. Vetor de viroses (vírus do mosaico-da-cana, BYDV).',
      palavrasChave: [
        'pulgão verde no milho',
        'colônia no pendão',
        'fumagina no milho',
        'melado pegajoso',
        'pulgão',
      ],
      estagioAcometido: ['folhas', 'pendão', 'espiga'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Moderada',
      estacao: 'Pré-pendoamento',
    },
    niveisDano: {
      baixo: {
        criterio: 'Colônias pequenas isoladas',
        acao: 'Conservar inimigos naturais (joaninhas, crisopídeos)',
      },
      medio: {
        criterio: 'Colônias generalizadas em pendão',
        acao: 'Aplicação seletiva com IGR ou neonic',
      },
      alto: {
        criterio: 'Pendões e folhas cobertos',
        acao: 'Aplicação química',
      },
    },
    mip: {
      cultural: ['Híbridos menos suscetíveis', 'Adubação equilibrada'],
      biologico: ['Joaninhas (Eriopis, Hippodamia)', 'Crisopídeos', 'Aphidius (parasitoides)'],
      mecanico: ['Inspeção visual'],
      quimico: {
        classes: ['neonicotinoides', 'IGR', 'piretroides'],
        ingredientesAtivos: [
          {
            nome: 'Imidacloprido',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Imidacloprido 700 WG',
                formulacao: 'WG',
                dosagem: '100-200 g p.c./ha',
                intervaloAplicacoes: '14 dias',
                intervaloSegurancaDias: 1,
                carencia: 21,
              },
            ],
          },
        ],
        observacoes: ['Preservar inimigos naturais quando possível'],
      },
    },
    rotacaoResistencia: 'Rotacionar IRAC 4A → 9 → 23.',
    monitoramento: {
      metodo: 'Inspeção visual pendão e folhas',
      frequencia: 'Semanal pré-pendoamento',
      nivelControle: 'Colônias generalizadas',
    },
    observacoesAgronomicas:
      'Frequentemente controlado por inimigos naturais. Evitar aplicações desnecessárias.',
    referencias: [REF_EMBRAPA_MILHO, REF_IRAC, REF_MAPA],
  },

  // ============================================================
  // DOENÇAS — MILHO
  // ============================================================
  {
    id: 'milho_enfezamento_vermelho',
    type: 'doenca',
    category: 'bacteria',
    nomeComum: 'Enfezamento vermelho',
    nomesAlternativos: ['molicutes', 'enfezamento'],
    nomeCientifico: 'Spiroplasma kunkelii',
    culturas: ['milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Avermelhamento intenso das bordas e nervuras das folhas, plantas raquíticas, ' +
        'espigas pequenas, falhadas ou sem grãos. Florescimento desuniforme. Transmitida ' +
        'EXCLUSIVAMENTE por cigarrinha-do-milho (Dalbulus maidis).',
      palavrasChave: [
        'milho avermelhado',
        'bordas vermelhas nas folhas',
        'enfezamento vermelho',
        'espiga pequena',
        'planta raquítica',
        'florescimento desuniforme',
        'milho que não enche',
      ],
      estagioAcometido: ['planta toda'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '22-30 °C',
      umidade: 'Variada',
      estacao: 'Safrinha (mar-jun)',
      observacoes: ['Sintomas aparecem 30-50 dias após infecção', 'Sem cigarrinha = sem doença'],
    },
    niveisDano: {
      baixo: {
        criterio: '< 5 % plantas sintomáticas',
        acao: 'Manejo agressivo cigarrinha próximo ciclo',
      },
      medio: {
        criterio: '5-20 % plantas',
        acao: 'Avaliar replantio + plano cigarrinha intensificado',
      },
      alto: {
        criterio: '> 20 % plantas',
        acao: 'Perda já instalada — focar próximo ciclo',
      },
    },
    mip: {
      cultural: [
        'CONTROLE da cigarrinha-do-milho é controle do enfezamento',
        'Eliminação de milho tiguera (vazio sanitário 60 dias)',
        'Híbridos tolerantes',
        'Plantio na janela (evitar safrinha muito tardia)',
      ],
      biologico: ['Indireto via Beauveria em cigarrinha'],
      mecanico: ['Monitoramento cigarrinha'],
      quimico: {
        classes: ['controle do vetor (cigarrinha)'],
        ingredientesAtivos: [
          {
            nome: 'TS tiametoxam + foliar acetamiprido',
            graudeIRACouFRAC: 'IRAC 4A',
            produtosComerciais: [
              {
                nome: 'Ver Cigarrinha-do-milho',
                formulacao: 'FS+SC',
                dosagem: 'Conforme bula',
                intervaloAplicacoes: 'Conforme cigarrinha',
                intervaloSegurancaDias: 1,
                carencia: 14,
              },
            ],
          },
        ],
        observacoes: ['NÃO existe controle químico DA DOENÇA — só do vetor'],
      },
    },
    rotacaoResistencia: 'Igual cigarrinha — rotação IRAC 4A/3A.',
    monitoramento: {
      metodo: 'Inspeção visual cigarrinha + sintomas plantas',
      frequencia: 'Semanal V2-V8',
      nivelControle: 'Foco no vetor (cigarrinha)',
    },
    observacoesAgronomicas:
      'Doença EMERGENTE com perdas massivas em safrinhas recentes. Único controle efetivo = ' +
      'manejo do vetor + híbridos tolerantes + vazio sanitário.',
    referencias: [REF_EMBRAPA_MILHO, REF_MAPA],
  },

  {
    id: 'milho_helmintosporiose',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Helmintosporiose / Mancha-de-Turcicum',
    nomesAlternativos: ['Exserohilum turcicum'],
    nomeCientifico: 'Exserohilum turcicum',
    culturas: ['milho', 'sorgo'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas alongadas e elípticas (charuto) cinza-esverdeadas a marrons nas folhas. ' +
        'Em alta severidade, coalescem causando "queima" foliar. Mais severa em climas ' +
        'amenos e úmidos.',
      palavrasChave: [
        'manchas charuto no milho',
        'manchas alongadas marrons',
        'queima foliar milho',
        'helmintosporiose',
        'turcicum',
      ],
      estagioAcometido: ['folhas baixeiras → superiores'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '18-25 °C',
      umidade: 'Alta, molhamento foliar prolongado',
      estacao: 'Safra e safrinha em regiões frias',
    },
    niveisDano: {
      baixo: {
        criterio: 'Lesões isoladas em baixeiras',
        acao: 'Híbrido resistente cobre',
      },
      medio: {
        criterio: 'Severidade 10-20 %',
        acao: 'Aplicação fungicida triazol + estrobilurina',
      },
      alto: {
        criterio: '> 20 % severidade pré-pendoamento',
        acao: 'Aplicação imediata + revisão híbrido próximo ciclo',
      },
    },
    mip: {
      cultural: ['Híbridos resistentes (Ht genes)', 'Rotação', 'Eliminar restos culturais'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'multissitios'],
        ingredientesAtivos: [
          {
            nome: 'Azoxistrobina + Ciproconazol',
            graudeIRACouFRAC: 'FRAC 11 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '0,3-0,4 L p.c./ha',
                intervaloAplicacoes: '20-25 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Aplicar em V8-VT (pré-pendoamento) tem melhor retorno'],
      },
    },
    rotacaoResistencia: 'Alternar FRAC 11 → 3 → 7.',
    monitoramento: {
      metodo: 'Inspeção visual a partir de V6',
      frequencia: 'Semanal V6-VT',
      nivelControle: 'Lesões + clima úmido = aplicar',
    },
    observacoesAgronomicas:
      'Doença regional — mais severa em climas amenos (Sul, planaltos). Híbrido resistente é a defesa primária.',
    referencias: [REF_EMBRAPA_MILHO, REF_FRAC, REF_MAPA],
  },

  {
    id: 'milho_ferrugem_polysora',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Ferrugem-polissora',
    nomesAlternativos: ['ferrugem tropical', 'Puccinia polysora'],
    nomeCientifico: 'Puccinia polysora',
    culturas: ['milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Pústulas alaranjadas/marrons na face SUPERIOR das folhas (diferença da ferrugem-comum ' +
        'que tem pústulas em ambas faces). Pequenas (1-2 mm), circulares. Em alta severidade, ' +
        'desfolha intensa e secagem precoce.',
      palavrasChave: [
        'pústulas alaranjadas milho',
        'ferrugem tropical',
        'manchinhas laranjas',
        'desfolha milho',
        'polysora',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'alta',
    },
    condicoesFavorecimento: {
      temperatura: '25-30 °C (favorece tropical)',
      umidade: 'Alta',
      estacao: 'Verão quente e úmido',
    },
    niveisDano: {
      baixo: {
        criterio: 'Pústulas isoladas',
        acao: 'Híbrido resistente cobre',
      },
      medio: {
        criterio: 'Severidade 10-25 %',
        acao: 'Aplicação tripla mistura',
      },
      alto: {
        criterio: '> 25 % pré-enchimento',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Híbridos resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis (parcial)'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas'],
        ingredientesAtivos: [
          {
            nome: 'Tripla mistura (FRAC 11+7+3)',
            graudeIRACouFRAC: 'FRAC 11 + 7 + 3',
            produtosComerciais: [
              {
                nome: 'Tripla mistura comercial',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha',
                intervaloAplicacoes: '20-25 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Aplicar em V8-VT para máxima proteção'],
      },
    },
    rotacaoResistencia: 'Rotacionar grupos FRAC + multissítio.',
    monitoramento: {
      metodo: 'Inspeção visual face superior',
      frequencia: 'Semanal V6-VT',
      nivelControle: 'Pústulas + clima quente úmido',
    },
    observacoesAgronomicas:
      'Ferrugem mais agressiva em climas tropicais. Pode causar perdas > 30 % em ataques severos.',
    referencias: [REF_EMBRAPA_MILHO, REF_FRAC, REF_MAPA],
  },

  {
    id: 'milho_mancha_branca',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Mancha-branca do milho',
    nomesAlternativos: ['Phaeosphaeria', 'mancha de feoesferia'],
    nomeCientifico: 'Pantoea ananatis / Phaeosphaeria maydis',
    culturas: ['milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas pequenas (5-15 mm) inicialmente aquosas, depois necrosadas com centro ' +
        'branco-palha e bordas escuras. Distribuídas por toda a folha. Doença mais ' +
        'comum em todas as regiões.',
      palavrasChave: [
        'manchas brancas no milho',
        'mancha branco palha',
        'pontuações brancas folhas',
        'mancha branca',
        'phaeosphaeria',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '20-28 °C',
      umidade: 'Alta',
      estacao: 'V6 em diante',
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % severidade',
        acao: 'Híbrido resistente cobre',
      },
      medio: {
        criterio: '10-25 %',
        acao: 'Aplicação tripla mistura',
      },
      alto: {
        criterio: '> 25 % pré-enchimento',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Híbridos resistentes', 'Rotação'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas'],
        ingredientesAtivos: [
          {
            nome: 'Piraclostrobina + Epoxiconazol',
            graudeIRACouFRAC: 'FRAC 11 + 3',
            produtosComerciais: [
              {
                nome: 'Mistura comercial',
                formulacao: 'SC',
                dosagem: '0,5-0,75 L p.c./ha',
                intervaloAplicacoes: '20-25 dias',
                intervaloSegurancaDias: 1,
                carencia: 35,
              },
            ],
          },
        ],
        observacoes: ['Híbrido resistente é mais barato que controle químico'],
      },
    },
    rotacaoResistencia: 'Rotacionar FRAC + multissítio.',
    monitoramento: {
      metodo: 'Inspeção visual a partir de V6',
      frequencia: 'Semanal',
      nivelControle: '10 % severidade + clima favorável',
    },
    observacoesAgronomicas:
      'Mais frequente no Centro-Oeste e Sudeste. Híbridos modernos têm boa tolerância.',
    referencias: [REF_EMBRAPA_MILHO, REF_FRAC, REF_MAPA],
  },

  {
    id: 'milho_cercosporiose',
    type: 'doenca',
    category: 'fungo',
    nomeComum: 'Cercosporiose',
    nomesAlternativos: ['mancha-de-cercospora'],
    nomeCientifico: 'Cercospora zeae-maydis',
    culturas: ['milho'],
    imageUrls: [],
    sintomas: {
      descricao:
        'Manchas retangulares cinza-pálidas (5-50 mm) entre as nervuras das folhas. ' +
        'Em alta severidade, queima foliar e perda foto-síntese.',
      palavrasChave: [
        'manchas retangulares milho',
        'manchas cinzas entre nervuras',
        'cercospora milho',
      ],
      estagioAcometido: ['folhas'],
      severidadeVisual: 'media',
    },
    condicoesFavorecimento: {
      temperatura: '22-28 °C',
      umidade: 'Alta umidade prolongada',
      estacao: 'R1-R5',
    },
    niveisDano: {
      baixo: {
        criterio: '< 10 % severidade',
        acao: 'Híbrido resistente cobre',
      },
      medio: {
        criterio: '10-25 %',
        acao: 'Aplicação tripla mistura',
      },
      alto: {
        criterio: '> 25 %',
        acao: 'Aplicação imediata',
      },
    },
    mip: {
      cultural: ['Híbridos resistentes', 'Rotação', 'Eliminar restos culturais'],
      biologico: ['Bacillus subtilis'],
      mecanico: ['Monitoramento'],
      quimico: {
        classes: ['triazois', 'estrobilurinas', 'carboxamidas'],
        ingredientesAtivos: [
          {
            nome: 'Tripla mistura padrão',
            graudeIRACouFRAC: 'FRAC 11 + 7 + 3',
            produtosComerciais: [
              {
                nome: 'Tripla comercial',
                formulacao: 'SC',
                dosagem: '0,4-0,6 L p.c./ha',
                intervaloAplicacoes: '20-25 dias',
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
      metodo: 'Inspeção visual',
      frequencia: 'Semanal a partir de V8',
      nivelControle: '10 % severidade + clima',
    },
    observacoesAgronomicas: 'Frequente em regiões úmidas. Resistência QoI documentada.',
    referencias: [REF_EMBRAPA_MILHO, REF_FRAC, REF_MAPA],
  },
];
