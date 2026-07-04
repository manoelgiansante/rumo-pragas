# 03 — Auditoria de Design & UX · Rumo Pragas IA

> Fase 1 (AUDIT-ONLY, read-only) · branch `perfect/pragas-launch-2026-07-02` · 2026-07-02
> Escopo: consistência de espaçamento/tipografia/cor, tokens vs hardcoded, dark mode, contraste WCAG AA (uso no SOL/campo), touch targets ≥44pt (mão suja/luva), responsividade web, ícones.
> **Nada foi alterado.** Toda proposta de aplicação visual é Onda 2, mediante aprovação do CEO.

## Nota de design (estado atual): **6.5 / 10**

Fundação de tokens **real e madura** (`constants/theme.ts` com Spacing 4/8pt, BorderRadius 8/12/16/24, FontSize escala tipo Apple, FontWeight, Colors, Gradients, chartSequential 10-step). Acessibilidade estrutural boa (accessibilityLabel/Role/Hint presentes, testID, skeletons de loading, empty/error states com ícone+título+dica). O que puxa a nota pra baixo é **inconsistência sistêmica**: duas famílias de verde convivendo (AI-slop), **contraste reprovado em amarelo/cinza usados como texto** (defeito funcional real pra uso no sol, não cosmético), `DarkColors` morto + dark mode 100% ad-hoc, e 84 cores hex hardcoded fora do token.

---

## Delta vs diretriz do CEO

Diretriz: *fundo claro `#FAFAF7`, verde-campo `#2E7D32 → #4CAF50`, acentos terrosos, visual clean/claro/profissional.*

| Aspecto | Diretriz CEO | Estado atual (`theme.ts`) | Delta |
|---|---|---|---|
| Fundo | `#FAFAF7` (branco quase puro) | `#F7F3EC` (off-white quente/bege) | Fundo atual mais escuro/amarelado; `#FAFAF7` só aparece **hardcoded** em `+not-found.tsx:43` |
| Verde primário | `#2E7D32 → #4CAF50` (verde-campo vivo) | `#0B3D2E` (folha profunda, quase preto-esverdeado) | **Grande** — o app é muito mais escuro/sóbrio que a diretriz |
| Acentos terrosos | sim | `#C89B3C` (ocre) presente | Alinhado no conceito, mas o ocre falha em contraste (ver D1) |

Ou seja: o app **não segue** a diretriz atual — segue um DS "folha profunda + ocre" (provavelmente do design-sync `@agrorumo/tokens`). A proposta no apêndice reconcilia os dois: mantém a personalidade terrosa da vertical, mas **clareia o fundo pra `#FAFAF7`** e **introduz um verde de ação `#2E7D32/#388E3C`** para CTAs/estados (mais legível no sol que o `#0B3D2E` sobre gradiente), preservando o verde-folha escuro só como base de gradiente/marca.

---

## Achados

### D1 · ALTO — Contraste reprovado (WCAG AA) em amarelo e cinza usados como TEXTO — legibilidade no sol
`Colors.warmAmber` (`#C89B3C`) é usado como **cor de texto** em ~8 lugares e rende **~2.3:1** sobre fundo claro — reprova AA (4.5:1) e até AA-large (3:1). Idem `Colors.textTertiary`/`systemGray` (`#8A8373`) como texto de legenda ≈ **3.4:1** (reprova AA normal). Isto é um defeito **funcional** para um app usado a céu aberto (glare reduz o contraste efetivo ainda mais).
- Amarelo-como-texto: `app/(tabs)/index.tsx:223,641` (pending), `app/diagnosis/result.tsx:1413,1438` (warning/nível bloqueado), `app/diagnosis/camera.tsx:432` (tips), `app/diagnosis/pest/[id].tsx:629` (warning), `components/MipCard.tsx:604`.
- Cinza-terciário-como-texto: `app/(tabs)/settings.tsx:879`, `app/(auth)/login.tsx:623,698,749`, `components/DiagnosisCard.tsx:251,265`, `components/ChatBubble.tsx:171`.
- **Fix:** criar tokens de texto derivados escuros o suficiente — `warnText: #8A6A1F` (já existe uso solto em `UsageCounter`/`TopAlternatives`: `#8a6a1f` ≈ 4.6:1 ✅) e `textTertiary` → escurecer para `#6B6455` (≈ 4.6:1). Substituir os usos-como-texto por esses tokens (o ocre `#C89B3C` continua OK como cor de **ícone/fundo/borda**, só não como texto pequeno). gate=false (só escurece token; sem mudança de layout).

### D2 · MÉDIO — Duas famílias de verde convivendo (AI-slop / drift de paleta)
O tema define verde-folha profundo (`#0B3D2E` + rampa), mas há verdes/teals **legados vivos** espalhados: `#0F6B4D`, `#1A966B`, `#29B887`, `#4CAF50` (onboarding, result, MipCard) e teal `#009688`/`#00BCD4` (WeatherCard). O comentário do próprio `theme.ts:6-7` chama o azul/teal brilhante de "AI slop" e diz tê-lo removido — mas ele sobrevive em `components/WeatherCard.tsx:105,117`.
- Evidência: `app/onboarding.tsx:45,59` (gradientes `#0F6B4D/#29B887` ≠ `Gradients.hero`), `app/diagnosis/result.tsx` (múltiplos `#1A966B`/`#4CAF50`), `components/MipCard.tsx:251` (`#4CAF50`), `components/WeatherCard.tsx:105,117`.
- **Fix:** unificar todos os verdes de ação no verde-campo do DS (`#2E7D32/#388E3C`) e os gradientes na rampa única `Gradients.hero`; trocar teals do WeatherCard por tokens (`accent`/`techBlue` já existe como tom de suporte). gate=false.

### D3 · MÉDIO — `DarkColors` é código morto; dark mode 100% ad-hoc, sem `ColorScheme` de chaves iguais
`DarkColors` está definido em `theme.ts:31-37` mas **nunca é importado** em lugar nenhum. O dark mode é feito com **126 overrides inline** `isDark && styles.xxxDark` espalhados nas 23 telas (todas usam `useColorScheme`). Não existe um `ColorScheme = Record<keyof typeof lightColors, string>` com light+dark compartilhando chaves — isso torna o dark frágil, divergente por tela e caro de manter, e é exatamente a armadilha que o princípio de DS quer evitar. Além disso `DarkColors` usa cinzas iOS genéricos (`#1C1C1E/#2C2C2E`) que **não pertencem à família terrosa** — se fosse ligado, quebraria a identidade.
- **Fix:** Onda 2 — mover para `lightColors`/`darkColors` com as MESMAS chaves + hook `useThemeColors()`; migrar os 126 `isDark &&` progressivamente. gate=false (refactor, invisível se bem feito).

### D4 · MÉDIO — 84 cores hex hardcoded fora do token
Fora do `theme.ts`, há **84** literais hex em `app/` + `components/`. Concentração: `app/diagnosis/result.tsx` (48), `app/diagnosis/pest/[id].tsx` (10), `app/(tabs)/settings.tsx` (8), `app/(auth)/login.tsx` (8), `app/onboarding.tsx` (7), `app/(tabs)/ai-chat.tsx` (7). Parte é template HTML de PDF (ver D8), mas a maioria é UI RN real (`#8E8E93`, `#F2F2F7`, `#2C2C2E`, `#E5E5EA`, etc. — cinzas iOS que deveriam ser `systemGray*`).
- **Fix:** mapear cada literal ao token equivalente; onde não há token, criar. gate=false.

### D5 · MÉDIO — Touch targets abaixo de 44pt sem `hitSlop` (mão com luva/suja)
Vários alvos interativos têm dimensão < 44pt e nem todos têm `hitSlop`: `backBtn 36×36` em `app/diagnosis/crop-select.tsx:171-178` (sem hitSlop) e `app/(tabs)/settings.tsx:768` (36), chips/botões `height: 32/38` em `app/diagnosis/result.tsx:1232,1390` e `app/diagnosis/pest/[id].tsx:564`, `height: 30` em `settings.tsx:899`. A diretriz de uso no campo (mão suja/luva) torna isto relevante.
- **Fix:** garantir área efetiva ≥44pt via `hitSlop={{top:8,bottom:8,left:8,right:8}}` ou `minHeight/minWidth: 44` nos alvos-ícone. gate=false.

### D6 · BAIXO — Adoção de tokens parcial (espaçamento/peso inline)
Apesar de 262 usos de `Spacing.*`, há **~220 literais** de padding/margin numéricos e **73** `fontWeight: '600'/'700'` inline (vs 82 via `FontWeight`). Ritmo de espaçamento é majoritariamente 4/8pt, mas há valores fora da escala (`14`, `18`, `6`, `2`) que quebram o ritmo.
- **Fix:** normalizar para a escala `Spacing`/`FontWeight` na migração Onda 2. gate=false.

### D7 · BAIXO — Ícones de clima em teal brilhante (contradiz o próprio DS)
`components/WeatherCard.tsx:105,117` usa `#00BCD4` (ciano) e `#009688` (teal) nos ícones de umidade/vento — os tons que `theme.ts` marca como "AI slop de-emphasized". Fora de família e "app genérico".
- **Fix:** trocar por `Colors.techBlue` (tom de suporte terroso já no tema) ou tokens `info`. gate=false.

### D8 · BAIXO — Relatório PDF exportado usa a paleta verde ANTIGA
O template HTML de export em `app/diagnosis/result.tsx:452-469` usa `#0F6B4D`/`#1A966B` (verde legado) no cabeçalho/barras — o PDF que o produtor compartilha tem marca **diferente** do app. Inconsistência de marca em artefato voltado ao cliente.
- **Fix:** parametrizar as cores do HTML pelos tokens do DS. gate=false.

### D9 · BAIXO — Sem família tipográfica de marca (usa fonte do sistema)
Nenhum `useFonts`/`fontFamily` carregado — o app renderiza na fonte do sistema (San Francisco/Roboto). A âncora de DS AgroRumo pede Poppins (fallback sistema). Não é bug, mas é o delta que separa "app genérico" de "app de portfólio". A escala de peso/tamanho já está pronta pra receber a fonte.
- **Fix:** carregar Poppins (700/600/500/400) via `expo-font` e plugar em `FontFamily` token. gate=**true** (adiciona asset/binário → decisão do CEO; e toca todos os textos).

---

## Apêndice — Proposta de Design System em tokens (Onda 2) · **gate=true (proposta inteira)**

> Requer aprovação explícita do CEO antes de qualquer aplicação. Reconcilia a diretriz do CEO (fundo `#FAFAF7`, verde-campo `#2E7D32→#4CAF50`, terrosos) com o DS "folha profunda + ocre" já em uso. Todos os valores abaixo passam AA para o uso previsto (texto ≥4.5:1, ícone/UI ≥3:1). Funciona em iOS/Android/Web (react-native-web) — apenas objetos JS, sem API nativa.

### A. `constants/theme.ts` proposto (chaves iguais light/dark)

```ts
// Marca AgroRumo Pragas — verde-campo + terra, fundo claro legível no sol.
const brand = {
  // Verde de MARCA (base de gradiente/hero) — folha profunda
  leaf900: '#06281D',
  leaf800: '#0B3D2E',
  leaf700: '#145A45',
  // Verde de AÇÃO (CTAs, estados, ícones ativos) — verde-campo da diretriz CEO
  green700: '#2E7D32',
  green600: '#388E3C',
  green500: '#4CAF50',
  // Terra/ocre — acento da vertical
  earth600: '#8A6A1F', // ocre p/ TEXTO (AA ✅ ~4.6:1)
  earth500: '#C89B3C', // ocre p/ ícone/fundo/borda (NÃO texto pequeno)
  earthTint: '#F2E6C9',
  // Semânticos
  danger: '#B3462E',
  warning: '#8A6A1F',
  success: '#2E7D32',
  info: '#3E6B7A',
};

export const lightColors = {
  // superfícies
  background: '#FAFAF7',   // diretriz CEO
  surface:    '#FFFFFF',
  card:       '#FFFFFF',
  separator:  '#E7E3DA',
  // marca/ação
  brand:      brand.leaf800,
  brandDark:  brand.leaf900,
  accent:     brand.green700,  // ação
  accentAlt:  brand.green600,
  earth:      brand.earth500,
  earthText:  brand.earth600,
  // texto (todos AA sobre background)
  text:          '#0F1A14',
  textSecondary: '#435044',   // ~7.5:1 ✅
  textTertiary:  '#6B6455',   // ESCURECIDO — ~4.6:1 ✅ (era #8A8373 ~3.4:1 ✗)
  onAccent:      '#FFFFFF',
  // semânticos
  danger: brand.danger, warning: brand.warning, success: brand.success, info: brand.info,
} as const;

export type ColorScheme = Record<keyof typeof lightColors, string>;

export const darkColors: ColorScheme = {
  background: '#0A130F',
  surface:    '#14201B',
  card:       '#14201B',
  separator:  '#1F2F29',
  brand:      brand.leaf700,
  brandDark:  brand.leaf800,
  accent:     brand.green500, // mais claro no escuro p/ legibilidade
  accentAlt:  brand.green600,
  earth:      brand.earth500,
  earthText:  '#E0C271',
  text:          '#F2F7F4',
  textSecondary: '#B8C2BB',
  textTertiary:  '#8F998F',
  onAccent:      '#06281D',
  danger: '#E27A63', warning: '#E0C271', success: brand.green500, info: '#7FB0C0',
} as const;

// Spacing/BorderRadius/FontSize/FontWeight: manter os atuais (já corretos 4/8pt, 8/12/16/24).
export const FontFamily = { // Onda 2 D9
  regular: 'Poppins_400Regular', medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold', bold: 'Poppins_700Bold',
} as const;
```

### B. Hook de acesso (elimina os 126 `isDark && styles.xxxDark`)

```ts
// hooks/useThemeColors.ts
import { useColorScheme } from 'react-native';
import { lightColors, darkColors, type ColorScheme } from '../constants/theme';
export function useThemeColors(): ColorScheme {
  return useColorScheme() === 'dark' ? darkColors : lightColors;
}
```
Padrão de tela: `const c = useThemeColors();` e estilos que dependem de tema passam a ser inline `{ color: c.text }` OU `useMemo(() => makeStyles(c), [c])`. Mantém as `StyleSheet` estáticas para tudo que não muda com tema.

### C. Plano de aplicação por tela (ordem sugerida, incremental e reversível)

| Onda | Tela/arquivo | Ação | Risco |
|---|---|---|---|
| 2.0 | `constants/theme.ts` | Introduzir `lightColors/darkColors/ColorScheme` mantendo `Colors` como alias temporário (`export const Colors = lightColors`) p/ não quebrar imports | baixo |
| 2.1 | `components/WeatherCard.tsx` | D7 — trocar `#00BCD4/#009688` por tokens `info`/`accent` | baixo |
| 2.1 | `app/(tabs)/index.tsx`, `result.tsx`, `camera.tsx`, `pest/[id].tsx`, `MipCard.tsx` | D1 — amarelo/cinza-como-texto → `earthText`/`textTertiary` novos | baixo |
| 2.2 | `app/onboarding.tsx` | D2 — gradientes → `Gradients.hero`; verdes → `accent` | médio (visual) |
| 2.2 | `settings.tsx`, `login.tsx`, `ai-chat.tsx`, `edit-profile.tsx` | D4 — cinzas iOS hardcoded → `systemGray*`/tokens | baixo |
| 2.3 | Todas as 23 telas | D3 — migrar `isDark && styles.*` → `useThemeColors()` (1 tela por commit) | médio |
| 2.3 | Alvos-ícone (`crop-select`, `settings`, `result`, `pest`) | D5 — `hitSlop`/`minHeight 44` | baixo |
| 2.4 | `app/diagnosis/result.tsx` (PDF HTML) | D8 — cores do template via tokens | baixo |
| 2.4 | `_layout.tsx` raiz | D9 — `expo-font` + Poppins (gate CEO à parte) | médio |

Cada onda: `typecheck` + `lint --max-warnings 0` + `jest` verdes; validar em iOS/Android/Web; screenshot antes/depois. **Nada aplicado sem OK do CEO.**

---

## O que NÃO consegui verificar nesta fase
- Contraste **medido em tela real sob sol** (calculado por fórmula WCAG; o glare real pode ser pior).
- Render web efetivo (react-native-web) das telas com gradiente/PDF — só leitura estática de código.
- Se o design-sync `@agrorumo/tokens` (claude.ai/design) tem uma paleta canônica mais nova que deveria ser a fonte da verdade (referência em `reference_design_sync_agrorumo_tokens_2026_07_02.md`) — recomendo o CEO decidir a fonte da verdade antes da Onda 2.
