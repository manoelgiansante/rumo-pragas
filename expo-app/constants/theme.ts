// Design tokens: Rumo Pragas IA — DS claro/profissional p/ agronegócio (diretriz CEO 02/jul).
// Fundo claro #FAFAF7 (legível no sol), verde-campo #2E7D32→#4CAF50 como cor PRIMÁRIA/ação,
// terra/dourado-trigo (#C89B3C) como acento da vertical. A folha profunda (#0B3D2E) permanece
// só como MARCA em gradiente/hero — nunca como CTA. Contraste AA garantido para texto.
export const Colors = {
  // AÇÃO / primária — verde-campo (diretriz CEO #2E7D32→#4CAF50)
  accent: '#2E7D32', // 4.98:1 como texto sobre #FAFAF7 (AA); 5.13:1 white sobre accent (AA)
  accentDark: '#1B5E20', // ponta escura do verde-campo (gradiente/sombra de ação)
  accentLight: '#4CAF50', // ponta clara do verde-campo
  // MARCA — folha profunda (base de gradiente/hero; NÃO usar como CTA/ícone de ação)
  brand: '#0B3D2E',
  brandDark: '#06281D',
  brandLight: '#145A45',
  techBlue: '#435044', // tom de suporte terroso (de-emphasized; NÃO é azul — evita AI slop)
  techIndigo: '#7A5C2E',
  warmAmber: '#C89B3C', // ocre/dourado-trigo — ÍCONE/FUNDO/BORDA (falha WCAG AA como texto pequeno)
  earthText: '#8A6A1F', // ocre escurecido p/ TEXTO em fundo claro (~4.6:1, WCAG AA)
  coral: '#B3462E',
  info: '#3E6B7A', // suporte frio terroso (substitui teal/ciano #00BCD4/#009688 = AI slop)
  white: '#FFFFFF',
  black: '#000000',
  background: '#FAFAF7', // diretriz CEO — branco quase puro, legível no sol
  card: '#FFFFFF', // cartão limpo sobre o off-white
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
  systemGray6: '#F2EFE6', // superfície cinza clara (grouped lists) distinta do bg #FAFAF7
};

export const DarkColors = {
  card: '#1C1C1E',
  input: '#2C2C2E',
  surface: '#2C2C2E',
  surfaceSecondary: '#3A3A3C',
  separator: '#38383A',
};

// Sequential ramp (dark leaf → lighter leaf). NO rainbow, NO tech blue.
export const Gradients: {
  hero: readonly [string, string, ...string[]];
  tech: readonly [string, string, ...string[]];
  mesh: readonly [string, string, ...string[]];
} = {
  hero: ['#06281D', '#0B3D2E', '#145A45'],
  tech: ['#0B3D2E', '#145A45'],
  mesh: ['#06281D', '#0B3D2E', '#145A45', '#0F4A37', '#0B3D2E', '#081F17'],
};

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
