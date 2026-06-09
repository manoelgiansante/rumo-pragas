// Design tokens: Rumo Pragas palette (@agrorumo/tokens — pragas)
// Deep leaf green (#0B3D2E) + ochre earth (#C89B3C) + warm off-white (not SaaS grey).
//
// AgroRumo family anchor (shared across the portfolio — kept for cross-app
// coherence; the pragas surface intentionally leans into the deeper leaf green
// instead of the brighter brand green to read as "field/plant health"):
//   brand green #4CAF2F · brand dark #0D2B1E · brand amber #F4B400.
// The pragas vertical accent is the deep leaf green below.
export const Brand = {
  green: '#4CAF2F',
  dark: '#0D2B1E',
  amber: '#F4B400',
} as const;

export const Colors = {
  accent: '#0B3D2E',
  accentDark: '#06281D',
  accentLight: '#145A45',
  techBlue: '#435044', // support tone (de-emphasized, was bright blue = AI slop)
  techIndigo: '#7A5C2E',
  warmAmber: '#C89B3C',
  coral: '#B3462E',
  white: '#FFFFFF',
  black: '#000000',
  background: '#F7F3EC',
  card: '#FFFDF7',
  cardDark: '#14201B',
  backgroundDark: '#0A130F',
  text: '#0F1A14',
  textDark: '#F2F7F4',
  textSecondary: '#435044',
  textTertiary: '#8A8373',
  separator: '#E5DECD',
  separatorDark: '#1F2F29',
  systemGray: '#8A8373',
  systemGray2: '#A8A18E',
  systemGray3: '#BAB097',
  systemGray4: '#CEC7B4',
  systemGray5: '#E5DECD',
  systemGray6: '#F7F3EC',

  // Semantic aliases (single source of truth for status meaning — these map to
  // the existing palette so adopting them is pixel-identical, but screens no
  // longer hardcode "coral === error" by convention).
  success: '#0B3D2E',
  warning: '#C89B3C',
  error: '#B3462E',
  info: '#435044',
};

// Dark-mode surface tokens (complete map). Previously partial + unused; kept
// backward-compatible keys (card/input/surface) and rounded out so any future
// dark styling resolves from one place instead of inline literals like #1C1C1E.
export const DarkColors = {
  background: '#0A130F',
  card: '#1C1C1E',
  cardElevated: '#222226',
  input: '#2C2C2E',
  surface: '#2C2C2E',
  surfaceSecondary: '#3A3A3C',
  separator: '#38383A',
  text: '#F2F7F4',
  textSecondary: '#A8A18E',
};

// Sequential ramp (dark leaf → lighter leaf). NO rainbow, NO tech blue.
export const Gradients: Record<string, readonly [string, string, ...string[]]> = {
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

// Centralized elevation tokens. Soft, leaf-toned shadows (not flat grey) so the
// whole app shares one shadow language instead of redefining offsets/opacity
// per screen. iOS reads shadow*, Android reads elevation — both provided.
export const Shadows = {
  card: {
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.24,
    shadowRadius: 12,
    elevation: 6,
  },
  cta: {
    shadowColor: Colors.accentDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 8,
  },
} as const;
