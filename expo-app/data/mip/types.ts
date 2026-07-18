/**
 * Tipos do catálogo MIP (Manejo Integrado de Pragas) — Rumo Pragas
 *
 * Schema canônico para entradas educativas de pragas e doenças
 * em culturas brasileiras. Usado por:
 *   - Telas de detalhe diagnóstico
 *   - Helpers IA (matching por palavras-chave de sintomas)
 *   - Orientação educativa de monitoramento e manejo não químico
 *
 * IMPORTANTE: o bundle não contém produtos comerciais, ingredientes ativos
 * químicos, doses, intervalos ou ações químicas. Referências educativas a
 * agentes biológicos não equivalem a indicação de produto; qualquer uso deve
 * ser validado para cultura/alvo no AGROFIT e por profissional habilitado.
 */

/**
 * Tipo principal de entrada no catálogo.
 *  - praga: insetos, ácaros, nematoides, etc.
 *  - doenca: fungos, bactérias, vírus
 */
export type MipEntryType = 'praga' | 'doenca';

/**
 * Categoria fina dentro do tipo, ajuda no agrupamento visual e em
 * heurísticas de IA. Cada `MipEntryType` aceita um subconjunto:
 *  - praga: inseto | acaro | nematoide
 *  - doenca: fungo | bacteria | virus
 */
export type MipEntryCategory = 'inseto' | 'acaro' | 'nematoide' | 'fungo' | 'bacteria' | 'virus';

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
 * Critério educativo por nível de infestação observado.
 */
export interface MipDamageLevel {
  /** Critério quantitativo ou qualitativo p/ enquadramento. */
  criterio: string;
}

export interface MipDamageLevels {
  baixo: MipDamageLevel;
  medio: MipDamageLevel;
  alto: MipDamageLevel;
}

/** Estratégias do MIP (Manejo Integrado de Pragas). */
export interface MipStrategy {
  /** Práticas culturais (rotação, plantio escalonado, vazio sanitário). */
  cultural: string[];
  /** Controle biológico (parasitoides, predadores, entomopatógenos). */
  biologico: string[];
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
  /** URLs de imagens editoriais verificadas; lista vazia é suportada pela UI. */
  imageUrls: string[];
  sintomas: MipSymptoms;
  /** Ciclo de vida resumido (opcional). */
  cicloVida?: string;
  condicoesFavorecimento: MipFavoringConditions;
  niveisDano: MipDamageLevels;
  mip: MipStrategy;
  monitoramento: MipMonitoring;
  /** Referências citadas. */
  referencias: MipReference[];
}

/**
 * Recomendação consolidada retornada por `getRecommendation`.
 * Combina nível observado com manejo cultural/biológico e monitoramento.
 */
export interface MipRecommendation {
  entryId: string;
  nomeComum: string;
  infestationLevel: InfestationLevel;
  acoesCulturais: string[];
  acoesBiologicas: string[];
  monitoramento: MipMonitoring;
}
