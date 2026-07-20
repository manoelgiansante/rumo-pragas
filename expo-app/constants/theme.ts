// Design tokens: Rumo Pragas IA — DS "old money agro" premium (redesign CEO 20/jul).
// Fundo CREME #F7F3EC/#FFFDF7 (quente, legível no sol), folha-floresta profunda #0B3D2E
// como ÂNCORA de marca (headers/hero/CTA) e dourado #C89B3C como destaque premium/severidade.
// A cor de AÇÃO principal vive no gradiente hero (folha profunda); o verde-campo #2E7D32
// permanece como tint de ícones/links. Contraste AA garantido para texto.
export const Colors = {
  // AÇÃO / tint de ícone e link — verde-campo (usado em superfícies claras)
  accent: '#2E7D32', // 4.98:1 como texto sobre #FAFAF7 (AA); 5.13:1 white sobre accent (AA)
  accentDark: '#1B5E20', // ponta escura do verde-campo (gradiente/sombra de ação)
  accentLight: '#4CAF50', // ponta clara do verde-campo
  // MARCA / ÂNCORA — folha-floresta profunda (headers, hero e CTA primário — diretriz CEO 20/jul)
  brand: '#0B3D2E',
  brandDark: '#06281D',
  brandLight: '#145A45',
  techBlue: '#435044', // tom de suporte terroso (de-emphasized; NÃO é azul — evita AI slop)
  techIndigo: '#7A5C2E',
  warmAmber: '#C89B3C', // ocre/dourado-trigo — ÍCONE/FUNDO/BORDA (falha WCAG AA como texto pequeno)
  // Dourado premium ("old money") — mesma família do warmAmber, com pontas p/ gradiente e realce.
  gold: '#C89B3C',
  goldDeep: '#A87C2C', // ponta escura do dourado (gradiente/sombra do selo premium)
  goldSoft: '#E7D3A1', // dourado claro (linha-fio / halo sobre a folha profunda)
  earthText: '#8A6A1F', // ocre escurecido p/ TEXTO em fundo claro (~4.6:1, WCAG AA)
  coral: '#B3462E',
  info: '#3E6B7A', // suporte frio terroso (substitui teal/ciano #00BCD4/#009688 = AI slop)
  white: '#FFFFFF',
  black: '#000000',
  background: '#F7F3EC', // creme quente — base "old money" legível no sol (diretriz CEO 20/jul)
  card: '#FFFDF7', // branco-creme — cartão premium sobre o fundo creme
  cardElevated: '#FFFFFF', // branco puro p/ cartões que precisam saltar do creme
  cardDark: '#14201B',
  backgroundDark: '#0A130F',
  text: '#0F1A14',
  textDark: '#F2F7F4',
  textSecondary: '#435044',
  textTertiary: '#6B6455',
  separator: '#E5DECD',
  separatorDark: '#1F2F29',
  systemGray: '#8A8373',
  systemGray2: '#A8A18E',
  systemGray3: '#BAB097',
  systemGray4: '#CEC7B4',
  systemGray5: '#E5DECD',
  systemGray6: '#F1EBDD', // superfície agrupada quente, distinta do bg creme #F7F3EC
};

export const DarkColors = {
  card: '#1C1C1E',
  input: '#2C2C2E',
  surface: '#2C2C2E',
  surfaceSecondary: '#3A3A3C',
  separator: '#38383A',
};

// Sequential ramp (dark leaf → lighter leaf). NO rainbow, NO tech blue.
// `hero` é a marca (folha-floresta). `gold` é o selo premium ("old money").
export const Gradients: {
  hero: readonly [string, string, ...string[]];
  heroDeep: readonly [string, string, ...string[]];
  tech: readonly [string, string, ...string[]];
  mesh: readonly [string, string, ...string[]];
  gold: readonly [string, string, ...string[]];
} = {
  hero: ['#06281D', '#0B3D2E', '#145A45'],
  // Diagonal mais dramática p/ o hero/CTA protagonista — folha escura → folha viva.
  heroDeep: ['#041B13', '#0B3D2E', '#12503C'],
  tech: ['#0B3D2E', '#145A45'],
  mesh: ['#06281D', '#0B3D2E', '#145A45', '#0F4A37', '#0B3D2E', '#081F17'],
  gold: ['#E7D3A1', '#C89B3C', '#A87C2C'],
};

// Elevação premium — sombras suaves e coerentes por nível (usar `...Shadows.card`).
// Em dark mode o consumidor zera shadowColor; aqui é a régua do tema claro.
export const Shadows = {
  card: {
    shadowColor: '#0B3D2E',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  raised: {
    shadowColor: '#0B3D2E',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.1,
    shadowRadius: 18,
    elevation: 6,
  },
  hero: {
    shadowColor: '#041B13',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 10,
  },
} as const;

// Severidade semântica compartilhada (result + biblioteca + histórico). Cor NUNCA
// é o único canal (WCAG 1.4.1): sempre acompanhada de rótulo/ícone. `text` é o tom
// AA sobre fundo claro; `tint` é a cor cheia do banner/ícone; `bg`/`border` o realce suave.
export const SeverityPalette = {
  critical: { tint: '#B3462E', text: '#8F2F1C', bg: '#F6E6E0', border: '#E8C6BA', icon: 'flame' },
  high: { tint: '#C2611F', text: '#8A4212', bg: '#F8EBDD', border: '#EAD2B6', icon: 'warning' },
  medium: {
    tint: '#C89B3C',
    text: '#8A6A1F',
    bg: '#F6EED8',
    border: '#E7D8AE',
    icon: 'alert-circle',
  },
  low: { tint: '#2E7D32', text: '#1B5E20', bg: '#E7F0E4', border: '#CBE0C6', icon: 'leaf' },
  none: {
    tint: '#2E7D32',
    text: '#1B5E20',
    bg: '#E7F0E4',
    border: '#CBE0C6',
    icon: 'checkmark-circle',
  },
} as const;

export type SeverityKey = keyof typeof SeverityPalette;

export function severityStyle(key?: string | null) {
  const k = (key ?? 'medium') as SeverityKey;
  return SeverityPalette[k] ?? SeverityPalette.medium;
}

// 10-step sequential green ramp for charts (tokens.chartSequential)
export const chartSequential = [
  '#E8EFE9',
  '#C6D7C9',
  '#A1BDA6',
  '#7CA285',
  '#5C8B67',
  '#3F754E',
  '#27613A',
  '#145A45',
  '#0B3D2E',
  '#06281D',
] as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

export const FontSize = {
  caption2: 11,
  caption: 12,
  footnote: 13,
  subheadline: 15,
  body: 17,
  headline: 17,
  title3: 20,
  title2: 22,
  title: 28,
  largeTitle: 34,
};

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

// Tipografia de marca — Poppins (âncora do Design System AgroRumo).
// Fontes bundladas localmente via @expo-google-fonts/poppins (sem fetch de rede);
// `app/_layout.tsx` carrega os 4 pesos com useFonts e inclui `fontsReady` no gate
// do splash (o watchdog de 10s continua soberano — fonte NUNCA pode travar o boot,
// ver defesa Apple 2.1(a) no _layout). Em React Native o peso vem do ARQUIVO da
// fonte: use SEMPRE fontFamily + fontWeight juntos (padrão Campo Vivo aprovado):
//   fontFamily: FontFamily.semibold, fontWeight: FontWeight.semibold
export const FontFamily = {
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  // Itálico real (nome científico de praga) — Android NÃO sintetiza itálico de
  // fonte custom; usar esta face em vez de fontStyle: 'italic'.
  italic: 'Poppins_400Regular_Italic',
} as const;
