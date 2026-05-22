/**
 * Tipos do catálogo MIP (Manejo Integrado de Pragas) — Rumo Pragas
 *
 * Schema canônico para entries de pragas, doenças e ervas daninhas
 * em culturas brasileiras. Usado por:
 *   - Telas de detalhe diagnóstico
 *   - Helpers IA (matching por palavras-chave de sintomas)
 *   - Recomendações de manejo por nível de infestação
 *
 * IMPORTANTE: Todos os dados aqui apresentados são de caráter informativo
 * (fontes: EMBRAPA, MAPA/Agrofit, IRAC, FRAC, CESB). NÃO substituem
 * receituário agronômico. O app SEMPRE exibe disclaimer recomendando
 * consulta a agrônomo licenciado antes da aplicação química.
 */

/**
 * Tipo principal de entrada no catálogo.
 *  - praga: insetos, ácaros, nematoides, etc.
 *  - doenca: fungos, bactérias, vírus
 *  - erva-daninha: plantas daninhas (reservado p/ expansão futura)
 */
export type MipEntryType = 'praga' | 'doenca' | 'erva-daninha';

/**
 * Categoria fina dentro do tipo, ajuda no agrupamento visual e em
 * heurísticas de IA. Cada `MipEntryType` aceita um subconjunto:
 *  - praga: inseto | acaro | nematoide
 *  - doenca: fungo | bacteria | virus
 *  - erva-daninha: erva (placeholder)
 */
export type MipEntryCategory =
  | 'inseto'
  | 'acaro'
  | 'nematoide'
  | 'fungo'
  | 'bacteria'
  | 'virus'
  | 'erva';

/** Severidade visual da praga/doença (impacto agronômico geral). */
export type MipSeverityVisual = 'baixa' | 'media' | 'alta';

/** Nível de infestação observado em campo → diferente de severidade do agente. */
export type InfestationLevel = 'baixo' | 'medio' | 'alto';

/** Fontes oficiais que o app cita ao usuário final. */
export type MipSourceKey =
  | 'EMBRAPA'
  | 'MAPA'
  | 'IRAC'
  | 'FRAC'
  | 'CESB'
  | 'HRAC'
  | 'WSSA'
  | 'ANDAV'
  | 'AENDA';

/** Referência bibliográfica citável. */
export interface MipReference {
  source: MipSourceKey;
  /** URL pública (opcional, mas preferível p/ rastreabilidade). */
  url?: string;
  /** Ano da publicação/edição da fonte consultada. */
  ano: number;
  /** Título ou rótulo curto (opcional). */
  titulo?: string;
}

/** Descrição estruturada de sintomas — base para matching IA. */
export interface MipSymptoms {
  /** Texto livre p/ exibição ao usuário (PT-BR). */
  descricao: string;
  /**
   * Palavras-chave normalizadas (lowercase, sem acento) usadas pelo
   * helper `searchByKeywords` para matching simples. Inclua sinônimos
   * populares que o produtor brasileiro usaria.
   * Exemplo: ['pústulas amarelas', 'folhas com manchas marrons',
   *          'lagarta verde de listras']
   */
  palavrasChave: string[];
  /** Órgãos/estágios da planta acometidos. */
  estagioAcometido: string[];
  /** Severidade visual em campo (não confundir com `InfestationLevel`). */
  severidadeVisual: MipSeverityVisual;
}

/** Condições ambientais que favorecem ocorrência. */
export interface MipFavoringConditions {
  temperatura?: string;
  umidade?: string;
  estacao?: string;
  /** Notas extras (ex: 'plantios sucessivos sem rotação'). */
  observacoes?: string[];
}

/**
 * Critério + ação por nível de infestação. Ex:
 *  - baixo: '< 2 lagartas/m linear' → 'Monitorar semanalmente'
 *  - medio: '2-4 lagartas/m linear' → 'Aplicar Bt / liberar Trichogramma'
 *  - alto:  '> 4 lagartas/m linear' → 'Aplicar inseticida químico'
 */
export interface MipDamageLevel {
  /** Critério quantitativo ou qualitativo p/ enquadramento. */
  criterio: string;
  /** Ação recomendada. */
  acao: string;
}

export interface MipDamageLevels {
  baixo: MipDamageLevel;
  medio: MipDamageLevel;
  alto: MipDamageLevel;
}

/**
 * Produto comercial registrado (ou descrito genericamente quando
 * não temos certeza do registro MAPA). NUNCA inventar registros —
 * deixar `registroMAPA: undefined` se não confirmado em Agrofit.
 */
export interface MipCommercialProduct {
  /** Nome comercial OU rótulo descritivo se sem marca específica. */
  nome: string;
  /** Tipo de formulação: SC, EC, WG, WP, OD, CS, FS, GR... */
  formulacao: string;
  /** Dosagem em intervalo (ex: '50-80 mL p.c./ha'). */
  dosagem: string;
  /** Intervalo entre aplicações em dias ou expressão (ex: '14-21 dias'). */
  intervaloAplicacoes: string;
  /** Intervalo de segurança / reentrada na lavoura (dias). */
  intervaloSegurancaDias: number;
  /** Período de carência colheita (dias). */
  carencia: number;
  /** Registro MAPA quando confirmado (deixe undefined se não souber). */
  registroMAPA?: string;
}

/** Ingrediente ativo + grupo IRAC/FRAC + produtos comerciais. */
export interface MipActiveIngredient {
  /** Nome técnico do IA (ex: 'Lambda-cialotrina', 'Azoxistrobina'). */
  nome: string;
  /**
   * Grupo IRAC (insetos/ácaros) ou FRAC (fungos) ou HRAC (herbicidas).
   * Formato: 'IRAC 3A', 'FRAC 11', 'FRAC 3', 'HRAC 9'.
   */
  graudeIRACouFRAC: string;
  produtosComerciais: MipCommercialProduct[];
}

/** Estratégia química completa. */
export interface MipChemicalStrategy {
  /** Classes químicas usadas (ex: ['piretroides', 'neonicotinoides']). */
  classes: string[];
  ingredientesAtivos: MipActiveIngredient[];
  /** Observações de manejo (rotação IRAC/FRAC, mistura tanque...). */
  observacoes: string[];
}

/** Estratégias do MIP (Manejo Integrado de Pragas). */
export interface MipStrategy {
  /** Práticas culturais (rotação, plantio escalonado, vazio sanitário). */
  cultural: string[];
  /** Controle biológico (parasitoides, predadores, entomopatógenos). */
  biologico: string[];
  /** Controle mecânico (catação, armadilhas, barreiras). */
  mecanico: string[];
  /** Controle químico estruturado. */
  quimico: MipChemicalStrategy;
}

/** Monitoramento e níveis de controle. */
export interface MipMonitoring {
  metodo: string;
  frequencia: string;
  /** Nível de controle (limiar p/ ação). */
  nivelControle: string;
}

/**
 * Entrada principal do catálogo MIP.
 * Cada arquivo por cultura exporta um array `MipEntry[]`.
 */
export interface MipEntry {
  /** Slug snake_case único globalmente. Ex: 'soja_ferrugem_asiatica'. */
  id: string;
  type: MipEntryType;
  category: MipEntryCategory;
  /** Nome comum em PT-BR (principal). */
  nomeComum: string;
  /** Sinônimos populares (regional + apelidos). */
  nomesAlternativos: string[];
  /** Nome científico (gênero + espécie). */
  nomeCientifico: string;
  /** Culturas afetadas (use IDs de `constants/crops.ts`). */
  culturas: string[];
  /**
   * URLs de imagens. Por ora vazio — outro agente popula depois
   * via storage Supabase / CDN.
   */
  imageUrls: string[];
  sintomas: MipSymptoms;
  /** Ciclo de vida resumido (opcional). */
  cicloVida?: string;
  condicoesFavorecimento: MipFavoringConditions;
  niveisDano: MipDamageLevels;
  mip: MipStrategy;
  /** Recomendação geral antirresistência. */
  rotacaoResistencia: string;
  monitoramento: MipMonitoring;
  /** Observações agronômicas finais. */
  observacoesAgronomicas: string;
  /** Referências citadas. */
  referencias: MipReference[];
}

/**
 * Recomendação consolidada retornada por `getRecommendation`.
 * Combina nível de infestação com estratégia MIP.
 */
export interface MipRecommendation {
  entryId: string;
  nomeComum: string;
  infestationLevel: InfestationLevel;
  acaoPrincipal: string;
  acoesCulturais: string[];
  acoesBiologicas: string[];
  acoesMecanicas: string[];
  /** Sugestão química APENAS quando nível justifica (médio/alto). */
  acoesQuimicas?: {
    classes: string[];
    ingredientesAtivosSugeridos: string[];
    observacoes: string[];
  };
  rotacaoResistencia: string;
  monitoramento: MipMonitoring;
  /** Disclaimer obrigatório agrônomo. */
  disclaimerCREA: string;
  referencias: MipReference[];
}
