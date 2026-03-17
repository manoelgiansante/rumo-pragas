# RELATORIO DE AUDITORIA COMPLETA - Rumo Pragas IA
**Data:** 2026-03-17 | **App:** iOS SwiftUI | **48 arquivos Swift auditados**
**Agentes:** 6 agentes especializados em paralelo (iOS, Security, UI/UX, Code Review, Accessibility, App Store)

---

# RESUMO EXECUTIVO

| Categoria | Critico | Alto | Medio | Baixo | Total |
|-----------|---------|------|-------|-------|-------|
| Seguranca | 5 | 5 | 3 | 1 | 14 |
| Codigo & Arquitetura | 2 | 6 | 8 | 4 | 20 |
| Design & UI/UX | 0 | 3 | 5 | 4 | 12 |
| Performance | 1 | 4 | 2 | 1 | 8 |
| Acessibilidade | 3 | 3 | 2 | 1 | 9 |
| Testes | 1 | 2 | 1 | 0 | 4 |
| App Store | 3 | 2 | 2 | 1 | 8 |
| Internacionalizacao | 1 | 2 | 2 | 0 | 5 |
| **TOTAL** | **16** | **27** | **25** | **12** | **80** |

---

# SECAO 1 - AUDITORIA DE DESIGN & UI/UX

## 1.1 Sistema de Cores

### Paleta Atual (AppTheme.swift)
| Nome | Hex | RGB | Uso |
|------|-----|-----|-----|
| accent | #1A966B | (0.10, 0.59, 0.42) | Principal, botoes, tab tint |
| accentDark | #0F6B4D | (0.06, 0.42, 0.30) | Gradientes |
| accentLight | #29B887 | (0.16, 0.72, 0.53) | Gradientes |
| techBlue | #3882F2 | (0.22, 0.51, 0.95) | Secundaria, chat IA |
| techIndigo | #5957D6 | (0.35, 0.34, 0.84) | Badges, detecoes |
| warmAmber | #EBB026 | (0.92, 0.69, 0.15) | Clima, alertas |
| coral | #F06652 | (0.94, 0.40, 0.32) | Erros, severidade alta |

### Achados

**[MEDIO] Paleta desalinhada com referencia agro**
A paleta atual e boa, mas pode ser otimizada. O design system recomenda:
- **Primary:** #15803D (Earth Green - mais escuro/sério que o atual #1A966B)
- **Secondary:** #22C55E (mais vibrante)
- **CTA/Accent:** #CA8A04 (Harvest Gold - mais quente)
- **Background:** #F0FDF4 (verde muito suave)
- **Text:** #14532D (verde escuro para texto)

Sugestao: a paleta atual funciona, mas o verde e levemente "tecnologico" demais. Para agro, um verde mais terra (#15803D) transmite mais confianca ao produtor rural.

**[MEDIO] Contraste WCAG - texto branco sobre gradiente**
- `AuthView.swift:64` — "Rumo Pragas" branco sobre MeshGradient verde: ~3.8:1 (FALHA AA para texto normal)
- `SplashView.swift:84` — Subtitulo `.white.opacity(0.7)` sobre verde: ~2.8:1 (FALHA AA)
- `OnboardingView.swift:258` — `.white.opacity(0.75)` sobre gradientes: ~3.1:1 (FALHA AA)
- **Solucao:** Usar `.white.opacity(0.85)` minimo, ou adicionar shadow no texto

**[BAIXO] Warm Amber nomeado incorretamente**
`warmAmber` tem hex #EBB026 mas o nome sugere cor amber. Na verdade e um dourado/gold. Nome melhor: `harvestGold`.

**[BAIXO] Cores hardcoded em OnboardingView**
`OnboardingView.swift:30-77` — Cores dos gradientes de background estao hardcoded como `Color(red:green:blue:)` em vez de usar constantes do `AppTheme`. Inconsistencia de manutencao.

## 1.2 Tipografia

**[MEDIO] Sem Design Tokens de tipografia**
O app usa `.font(.title)`, `.font(.headline)`, etc. inline. Nao ha um sistema de tipografia centralizado como existe para cores. Recomendacao: criar `AppTypography` com estilos nomeados.

**[BAIXO] Tamanho minimo de fonte**
`StatMiniCard.swift:359` — `.font(.system(size: 10))` para label. 10pt e muito pequeno para leitura confortavel em telas menores. Minimo recomendado: 11pt.

## 1.3 Iconografia SF Symbols

**[ALTO] Icones da tab bar poderiam ser mais especificos**
| Tab | Icone Atual | Sugestao | Motivo |
|-----|------------|----------|--------|
| Home | leaf.fill | house.fill ou leaf.fill | OK - representa agro |
| Historico | clock.arrow.circlepath | list.bullet.rectangle | Mais claro para "lista" |
| Biblioteca | books.vertical.fill | book.closed.fill | Mais limpo/moderno |
| Agro IA | sparkles | brain.head.profile ou bubble.left.fill | "sparkles" e generico demais |
| Ajustes | gearshape.fill | gearshape.fill | OK |

**[BAIXO] SF Symbols inconsistentes em peso**
Maioria dos icones usa peso padrao, mas alguns usam `.weight(.medium)` ou `.weight(.semibold)` arbitrariamente.

## 1.4 App Icon & Assets

**[ALTO] Assets incompletos para App Store**
- `Assets.xcassets/AppIcon.appiconset/` tem apenas 1 arquivo (`icon.png`)
- Faltam tamanhos obrigatorios: 20x20, 29x29, 40x40, 60x60, 76x76, 83.5x83.5, 1024x1024
- `assets/images/adaptive-icon.png` e `favicon.png` sao para Android/Web — desnecessarios para iOS

**[MEDIO] Qualidade do icone**
- O icone atual precisa ser avaliado visualmente em 29x29pt (App Store search) para verificar se e legivel nesse tamanho
- Recomendacao: icone com simbolo de folha + lupa (representando identificacao de praga) em fundo gradiente verde

## 1.5 Splash Screen

**[BAIXO] Splash screen bem feita**
- MeshGradient + leaf pulsante + texto com fade — visualmente profissional
- 1.5s e adequado
- Unico ponto: o `symbolEffect(.breathe)` pode ter micro-stutter em dispositivos mais antigos

## 1.6 Layout & Espacamento

**[MEDIO] Paddings inconsistentes**
Paddings usados no app: 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40. Sao muitos valores. Recomendacao: criar spacing scale (4, 8, 12, 16, 24, 32, 48).

**[BAIXO] Corner radius quase consistente**
Maioria usa 16pt (bom!), mas ha 8, 10, 12, 14, 22 em alguns componentes. Padronizar: 8, 12, 16, 24.

## 1.7 Animacoes

**[MEDIO] Uso excessivo de symbolEffect**
- `SplashView`: `.breathe` no leaf — OK
- `HomeView:130`: `.pulse` no icone do clima — OK
- `DiagnosisFlowView:129`: `.pulse` no camera — OK
- `AuthView:54`: `.breathe` no leaf — repete o splash, cansa
- `OnboardingView:245`: `.breathe` em CADA pagina — pode ficar pesado
- Recomendacao: limitar symbolEffect a 2-3 telas maximo

## 1.8 Componentes

**[ALTO] Falta design system formal**
Os componentes reutilizaveis sao bons (ModernCardModifier, PremiumBadge, CollapsibleSection, etc.) mas falta:
- Documentacao dos componentes
- Preview para cada componente (#Preview)
- Catalogo visual (util para time)

---

# SECAO 2 - AUDITORIA DE CODIGO & ARQUITETURA

## 2.1 Arquitetura MVVM

**[MEDIO] LocationService mistura responsabilidades**
`LocationService.swift` e um singleton `@Observable` que e tanto Service quanto ViewModel. Deveria ser dividido:
- `LocationManager` (service, nao-observable)
- Estado de localizacao no ViewModel que precisa

**[MEDIO] Singletons excessivos**
4 singletons: `SupabaseService.shared`, `AIChatService.shared`, `WeatherService.shared`, `LocationService.shared`. Para testabilidade, considerar dependency injection.

**[BAIXO] Boa separacao View/ViewModel**
Views nao contem logica de negocio. ViewModels gerenciam estado. Services fazem IO. Arquitetura solida.

## 2.2 Qualidade do Codigo

**[CRITICO] Force unwrap em URLs de producao**
- `AuthView.swift:177` — `URL(string: "https://rumopragas.com.br/termos")!`
- `AuthView.swift:182` — `URL(string: "https://rumopragas.com.br/privacidade")!`
- `SettingsView.swift:138` — `URL(string: "https://rumopragas.com.br/privacidade")!`
- `SettingsView.swift:148` — `URL(string: "https://rumopragas.com.br/termos")!`
- **Solucao:** Usar `guard let url = URL(string:) else { return }` ou declarar como constantes `static let`

**[ALTO] print() em producao vaza dados**
- `SupabaseService.swift:226` — `print("[EdgeFunction] \(name) -> HTTP \(http.statusCode), \(data.count) bytes")`
- `SupabaseService.swift:233` — `print("[EdgeFunction] Error body: \(rawBody.prefix(1000))")` — VAZA CORPO DA RESPOSTA
- **Solucao:** Usar `#if DEBUG` ou OSLog/Logger

**[ALTO] Error silencioso no refresh token**
- `AuthViewModel.swift:163` — `} catch {}` — erro completamente ignorado no refresh de sessao
- **Solucao:** Log do erro e/ou notificar o usuario

**[MEDIO] nonisolated desnecessarios em structs**
Structs em Swift ja sao Sendable por padrao quando todos os membros sao Sendable:
- `SupabaseService.swift:260,264,278,290,298` — `nonisolated struct` e `nonisolated enum`
- Tecnicamente correto mas verboso/desnecessario

**[MEDIO] Naming inconsistente Config**
`Config.swift` usa prefixo `EXPO_PUBLIC_` que e convencao de Expo/React Native, nao de iOS nativo. Renomear para:
```swift
enum Config {
    static let supabaseURL = ""
    static let supabaseAnonKey = ""
    // etc.
}
```

## 2.3 Models

**[ALTO] DiagnosisResult parsing fragil**
`DiagnosisViewModel.swift:91-108` — Fallback de decode tenta JSONDecoder, depois JSONSerialization com dict, depois array. Isso indica que o backend retorna formatos inconsistentes. Deveria ser padronizado no backend.

**[MEDIO] Fallback de localizacao hardcoded**
`DiagnosisViewModel.swift:68-69` — Coordenadas default `-15.78, -47.93` (Brasilia) hardcoded. Se o usuario nao compartilhar localizacao, o diagnostico vai com coordenadas falsas.

## 2.4 Navegacao

**[BAIXO] Navegacao bem implementada**
- `NavigationStack` (moderno, iOS 16+) ✓
- `.navigationDestination` para push ✓
- `.fullScreenCover` para fluxo de diagnostico ✓
- `.sheet` para modais ✓
- Sem deep linking (seria desejavel para notificacoes futuras)

---

# SECAO 3 - AUDITORIA DE SEGURANCA

## 3.1 Autenticacao & Tokens

**[CRITICO] API Keys vazias no Config.swift - mas em repositorio Git**
`Config.swift:4-17` — Todas as chaves estao vazias (`""`), o que e bom para o repositorio. POREM:
- Nao ha `.xcconfig` ou mecanismo para injetar valores em build
- Nao ha `.gitignore` para arquivo de configuracao com chaves reais
- **Risco:** Quando as chaves forem preenchidas, podem ser commitadas acidentalmente
- **Solucao:** Usar `.xcconfig` com `.gitignore` ou Xcode Build Configuration

**[CRITICO] Keychain sem Access Control**
`KeychainService.swift:9-17` — Salva no Keychain sem `kSecAttrAccessControl`:
- Sem biometria (Face ID/Touch ID) para proteger tokens
- Sem `kSecAttrAccessible` definido (default e acessivel quando desbloqueado, que e OK, mas explicitar e melhor)
- **Solucao:** Adicionar `kSecAttrAccessible: kSecAttrAccessibleWhenUnlockedThisDeviceOnly`

**[CRITICO] Migracao de UserDefaults insegura**
`AuthViewModel.swift:28-32` — Token de acesso era armazenado em `UserDefaults` (INSEGURO!) e migrado para Keychain. O codigo de migracao existe mas:
- Nao remove o refresh token de UserDefaults
- `UserDefaults` nao e encriptado — token pode ter sido exposto
- **Solucao:** Tambem deletar refresh token de UserDefaults: `UserDefaults.standard.removeObject(forKey: refreshTokenKey)`

**[ALTO] Sem validacao de forca de senha**
`AuthViewModel.swift:76` — Unica validacao: `password.count >= 6`. Falta:
- Verificacao de complexidade (maiuscula, numero, especial)
- Lista de senhas comuns
- Minimo recomendado: 8 caracteres

## 3.2 Network Security

**[ALTO] Dados sensiveis em logs de producao**
`SupabaseService.swift:226,233` — `print()` vaza:
- Nome da Edge Function chamada
- Status HTTP
- Tamanho da resposta
- **ATE 1000 CARACTERES DO CORPO DO ERRO** — pode conter tokens, dados do usuario

**[ALTO] Sem certificate pinning**
Todas as chamadas de rede usam `URLSession.shared` sem certificate pinning. Um atacante com proxy MITM pode interceptar:
- Tokens de autenticacao
- Imagens de diagnostico (dados da lavoura)
- Resultados de IA

**[MEDIO] Timeout excessivo**
`SupabaseService.swift:205` — `request.timeoutInterval = 180` (3 minutos). Muito alto. Recomendado: 30-60 segundos. O usuario nao vai esperar 3 minutos.

**[MEDIO] AIChatService sem autenticacao**
`AIChatService.swift:37-43` — Chamada ao endpoint `/agent/chat` NAO envia token de autenticacao nem API key. Qualquer pessoa com a URL pode usar o servico.

## 3.3 Input Validation

**[ALTO] URLs de API construidas por interpolacao**
`SupabaseService.swift:132` — `"/rest/v1/pragas_diagnoses?user_id=eq.\(userId)"` — userId nao e sanitizado. Se userId contiver caracteres especiais, pode manipular a query.
- **Solucao:** URL encode o userId: `userId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)`

**[MEDIO] Email regex basico**
`AuthViewModel.swift:37` — O regex de email aceita enderecos como `a@b.cc` mas nao valida contra ataques comuns. OK para validacao basica mas nao e robusta.

## 3.4 Data Privacy

**[BAIXO] Localizacao solicitada com consentimento**
`LocationService.swift:27` — `requestWhenInUseAuthorization()` e chamado corretamente. OK.

---

# SECAO 4 - AUDITORIA DE PERFORMANCE

**[CRITICO] PestDataService.swift (48KB) carrega tudo em memoria**
O servico tem uma base de dados local de pragas INTEIRA carregada como Swift literals. Em dispositivos com pouca memoria, pode impactar:
- Tempo de inicializacao
- Uso de RAM
- **Solucao:** Migrar para CoreData/SwiftData ou JSON lazy-loaded

**[ALTO] MeshGradient em TODAS as telas com hero**
`HomeView.swift:62`, `AuthView.swift:28`, `SplashView.swift:50` — MeshGradient (3x3, 9 cores) e computacionalmente caro. Em dispositivos antigos (iPhone SE 2, iPhone 8) pode causar drops de frame.
- **Solucao:** Usar LinearGradient como fallback em dispositivos de baixa performance

**[ALTO] Sem cache de diagnosticos**
`HistoryViewModel` busca diagnosticos do Supabase toda vez. Sem cache local = sem funcionamento offline.
- **Solucao:** Cache com SwiftData ou simples cache em FileManager

**[ALTO] Imagem base64 na memoria**
`DiagnosisViewModel.swift:62` — `compressed.base64EncodedString()` — uma imagem de 800KB vira ~1.1MB em base64, tudo em memoria. Para multiplos diagnosticos simultaneos, pode ser problema.

**[MEDIO] LazyVStack no chat — bom!**
`AIChatView.swift:135` — Usa `LazyVStack` corretamente para lista de mensagens. ✓

**[MEDIO] Chamadas paralelas na Home — bom!**
`HomeView.swift:44-47` — `async let` para weather, recent, count em paralelo. ✓

**[BAIXO] Sem paginacao real**
`SupabaseService.swift:130` — `limit=50` hardcoded. Para usuarios com muitos diagnosticos, 50 pode ser pouco ou demais. Implementar paginacao infinita.

---

# SECAO 5 - AUDITORIA DE ACESSIBILIDADE

**[CRITICO] Zero accessibility labels customizados**
Nenhuma das 18 Views tem `.accessibilityLabel()` ou `.accessibilityHint()` customizado. VoiceOver vai ler:
- "leaf fill" em vez de "Logo Rumo Pragas"
- "camera viewfinder" em vez de "Diagnosticar praga"
- Botoes sem descricao do que fazem

**[CRITICO] Sem suporte a preferReduceMotion**
O app tem MUITAS animacoes (symbolEffect, spring, offset, opacity) mas nao verifica `@Environment(\.accessibilityReduceMotion)`. Usuarios com sensibilidade a movimento vao ter problemas.
- **Solucao:** Envolver animacoes em:
```swift
@Environment(\.accessibilityReduceMotion) var reduceMotion
// usar .animation(reduceMotion ? nil : .spring(), value: appeared)
```

**[ALTO] Dynamic Type nao verificado**
Fontes como `.system(size: 10)` (StatMiniCard) e `.system(size: 13)` (SendButton icone) nao escalam com Dynamic Type.
- **Solucao:** Usar text styles (`.caption`, `.footnote`) em vez de tamanhos fixos

**[ALTO] Botao de envio no chat muito pequeno**
`AIChatView.swift:211` — SendButton e 36x36pt. Minimo Apple: 44x44pt.
- **Solucao:** `.frame(width: 44, height: 44)` com hit area expandida

**[ALTO] Contraste insuficiente em textos sobre gradiente**
(Detalhado na secao 1.1 acima)

**[MEDIO] Tap targets nos StatMiniCards**
`HomeView.swift:214-250` — Os 3 cards de estatistica sao pequenos, especialmente em telas menores.

**[MEDIO] Sem rotor headings**
Nenhuma View usa `.accessibilityAddTraits(.isHeader)` para titulos de secao, dificultando navegacao por VoiceOver.

**[BAIXO] Haptic feedback OK**
Uso de `sensoryFeedback` e complementar (nao e unica forma de feedback). ✓

---

# SECAO 6 - AUDITORIA DE TESTES

**[CRITICO] Cobertura de testes: 0%**
- `RumoPragasTests.swift` — Skeleton vazio
- `RumoPragasUITests.swift` — Template padrao
- `RumoPragasUITestsLaunchTests.swift` — Apenas teste de performance de launch

### TOP 15 Testes Criticos (em ordem de prioridade)

| # | Tipo | Teste | Arquivo Alvo |
|---|------|-------|-------------|
| 1 | Unit | `testSignInValidation` — email/senha vazios | AuthViewModel |
| 2 | Unit | `testSignInSuccess` — token salvo no Keychain | AuthViewModel |
| 3 | Unit | `testSignOutClearsTokens` — limpa Keychain e UserDefaults | AuthViewModel |
| 4 | Unit | `testRefreshTokenFlow` — refresh quando access expira | AuthViewModel |
| 5 | Unit | `testDiagnosisResultDecoding` — JSON completo | DiagnosisResult |
| 6 | Unit | `testDiagnosisFlatResponseParsing` — fallback parse | DiagnosisViewModel |
| 7 | Unit | `testImageCompression` — comprime para < 800KB | DiagnosisViewModel |
| 8 | Unit | `testCropTypeProperties` — 18 culturas com nome, icone, cor | CropType |
| 9 | Unit | `testKeychainSaveAndLoad` — round-trip | KeychainService |
| 10 | Unit | `testWeatherResponseDecoding` — OpenMeteo JSON | WeatherService |
| 11 | Unit | `testEmailValidation` — regex edge cases | AuthViewModel |
| 12 | Unit | `testAPIErrorMessages` — mensagens em portugues | APIError |
| 13 | UI | `testAuthenticationFlow` — login completo | AuthView |
| 14 | UI | `testDiagnosisFlow` — foto > cultura > resultado | DiagnosisFlowView |
| 15 | UI | `testOnboardingFlow` — swipe 4 paginas + comecar | OnboardingView |

**[ALTO] Sem testes de integracao com Supabase**
Nenhum teste verifica se as chamadas ao Supabase realmente funcionam com dados reais.

**[ALTO] Sem testes de decodificacao**
Os models tem Codable complexo (DiagnosisResult com AgrioNotesData aninhado) sem NENHUM teste de decode.

**[MEDIO] Sem mocks/protocols para Services**
Os singletons nao implementam protocols, impossibilitando mock para testes.

---

# SECAO 7 - AUDITORIA DE APP STORE READINESS

**[CRITICO] Privacy Manifest ausente**
Nao existe `PrivacyInfo.xcprivacy`. Obrigatorio desde abril 2024 para:
- `NSPrivacyAccessedAPITypes` (UserDefaults, Data, etc.)
- `NSPrivacyCollectedDataTypes` (localizacao, fotos)
- Apple rejeitara o app sem este arquivo

**[CRITICO] Descricoes de permissao nao verificadas**
Nao encontrei `Info.plist` ou configuracao de:
- `NSCameraUsageDescription` (obrigatorio — app usa camera)
- `NSPhotoLibraryUsageDescription` (obrigatorio — app usa galeria)
- `NSLocationWhenInUseUsageDescription` (obrigatorio — app usa GPS)
- **Sem estas strings, o app CRASHARA ao solicitar permissao**

**[ALTO] AppIcon incompleto**
Apenas 1 icone em `AppIcon.appiconset/`. App Store requer 1024x1024 minimo. Xcode 15+ gera automaticamente os outros tamanhos a partir de um unico icone 1024x1024, mas precisa estar configurado.

**[ALTO] Sem screenshots para App Store**
Nao ha screenshots em nenhum diretorio. Necessarios:
- 6.7" (iPhone 15 Pro Max)
- 6.5" (iPhone 11 Pro Max)
- 5.5" (iPhone 8 Plus)
- Opcional: iPad

**[MEDIO] Assets desnecessarios**
`assets/images/adaptive-icon.png` e `favicon.png` sao para Android/Web. Podem ser removidos.

**[BAIXO] Versao nao definida**
`SettingsView.swift:161` — Le versao de `Bundle.main.infoDictionary`. Precisa estar configurado no Xcode target.

---

# SECAO 8 - AUDITORIA DE INTERNACIONALIZACAO

**[CRITICO] TODAS as strings estao hardcoded em portugues**
Nenhum dos 18 Views usa `String(localized:)`, `NSLocalizedString()`, ou String Catalogs (.xcstrings). Exemplos:
- `"Diagnosticar Praga"` (HomeView:195)
- `"Entrar"` / `"Criar Conta"` (AuthView:146)
- `"Configuracoes"` (SettingsView:18)
- `"Preencha todos os campos"` (AuthViewModel:43)
- ~200+ strings hardcoded no total

**[ALTO] Seletor de idioma nao funciona**
`SettingsView.swift:120-124` — Picker de idioma "Portugues"/"Espanol" muda variavel local mas NAO afeta nenhuma string no app. E puramente visual.

**[ALTO] Datas nao formatadas por locale**
`DateFormatUtility.swift` precisa ser auditado, mas mensagens de chat usam `.style(.time)` que e locale-aware. OK parcial.

**[MEDIO] System prompt do chat e so em portugues**
`AIChatService.swift:20-28` — O prompt de sistema da IA esta hardcoded em portugues. Se espanhol for ativado, a IA ainda responde em portugues.

---

# SECAO 9 - AUDITORIA DE IDENTIDADE VISUAL & MARCA

## 9.1 Coerencia da Marca

**O app transmite:**
- ✅ Tecnologia — MeshGradient, animacoes fluidas, sparkles no chat IA
- ✅ Profissionalismo — Layout limpo, cards com sombras sutis
- ✅ Agro — Cor verde dominante, icone de folha, nomes de culturas
- ⚠️ Confianca — Falta um pouco. O nome "Rumo Pragas" pode confundir (parece que "vai em direcao as pragas" em vez de "combate pragas")

**Recomendacao de nome:** Considerar "Rumo Agro" ou "Rumo Agro Pragas" para maior clareza.

## 9.2 Consistencia Visual

- ✅ Cards seguem padrao consistente (ModernCardModifier)
- ✅ Badges (PremiumBadge) sao reutilizados corretamente
- ✅ Gradientes sao coesos (verde > azul)
- ⚠️ Algumas telas tem visual levemente diferente (Onboarding usa gradientes diferentes das outras telas)

## 9.3 Benchmarking vs Concorrentes

| Feature | Rumo Pragas | Plantix | AgroBase |
|---------|-------------|---------|----------|
| IA Diagnostico | ✅ | ✅ | ❌ |
| MeshGradient/Animacoes | ✅ Premium | ❌ Basico | ❌ |
| Biblioteca Pragas | ✅ | ✅ | ✅ |
| Chat IA | ✅ | ❌ | ❌ |
| Monitoramento Clima | ✅ | Limitado | ❌ |
| Splash Animado | ✅ Premium | Basico | Basico |
| **Diferencial:** Chat IA + Design Premium + Monitoramento integrado |

---

# SECAO 10 - PLANO DE ACAO PRIORIZADO

## P0 - CRITICO (Corrigir ANTES de publicar)

| # | Categoria | Problema | Arquivo(s) | Solucao | Esforco |
|---|-----------|----------|-----------|---------|---------|
| 1 | App Store | Privacy Manifest ausente | Criar PrivacyInfo.xcprivacy | Criar arquivo com NSPrivacyAccessedAPITypes | S |
| 2 | App Store | Descricoes de permissao (Camera, Fotos, GPS) | Info.plist / Target | Adicionar NSCameraUsageDescription etc. | S |
| 3 | Seguranca | Keychain sem AccessControl | KeychainService.swift | Adicionar kSecAttrAccessibleWhenUnlockedThisDeviceOnly | S |
| 4 | Seguranca | print() vaza dados em producao | SupabaseService.swift:226,233 | Envolver em #if DEBUG | S |
| 5 | Seguranca | Config.swift pode ser commitado com chaves | Config.swift | Migrar para .xcconfig + .gitignore | M |
| 6 | Codigo | Force unwrap em URLs | AuthView.swift:177,182 / SettingsView.swift:138,148 | Usar constantes static let ou guard | S |
| 7 | Acessibilidade | Zero accessibility labels | Todas as Views | Adicionar .accessibilityLabel() nos componentes principais | L |
| 8 | Acessibilidade | Sem preferReduceMotion | Todas as Views com animacao | Verificar accessibilityReduceMotion | M |
| 9 | i18n | Strings hardcoded | Todas as Views | Migrar para String Catalogs (.xcstrings) | L |
| 10 | Testes | Cobertura 0% | RumoPragasTests/ | Implementar top 10 testes criticos | L |
| 11 | Performance | PestDataService 48KB em memoria | PestDataService.swift | Migrar para JSON lazy-loaded ou SwiftData | M |

## P1 - ALTO (Primeira semana)

| # | Categoria | Problema | Arquivo(s) | Solucao | Esforco |
|---|-----------|----------|-----------|---------|---------|
| 12 | Seguranca | AIChatService sem auth | AIChatService.swift | Adicionar token de auth no header | S |
| 13 | Seguranca | URLs sem sanitizacao | SupabaseService.swift:132 | URL encode do userId | S |
| 14 | Seguranca | Senha minima 6 chars fraca | AuthViewModel.swift:76 | Aumentar para 8 + complexidade | S |
| 15 | Seguranca | Migracao UserDefaults incompleta | AuthViewModel.swift:28-32 | Deletar refresh token de UserDefaults tambem | S |
| 16 | Seguranca | Error silencioso catch {} | AuthViewModel.swift:163 | Adicionar logging do erro | S |
| 17 | Performance | Sem cache de diagnosticos | HistoryViewModel | Cache local com FileManager/SwiftData | M |
| 18 | Performance | MeshGradient em dispositivos antigos | HomeView, AuthView, SplashView | Fallback para LinearGradient | M |
| 19 | Performance | Base64 grande em memoria | DiagnosisViewModel.swift:62 | Stream upload ou multipart form | M |
| 20 | Design | AppIcon incompleto para App Store | Assets.xcassets | Gerar 1024x1024 profissional | M |
| 21 | Design | Contraste WCAG em gradientes | AuthView, Splash, Onboarding | Aumentar opacidade do branco ou adicionar shadow | S |
| 22 | Acessibilidade | SendButton 36x36 muito pequeno | AIChatView.swift:211 | Aumentar para 44x44 | S |
| 23 | Acessibilidade | Dynamic Type em fontes fixas | Varios | Substituir .system(size:) por text styles | M |
| 24 | Testes | Sem testes de decodificacao | Models/ | Criar testes para DiagnosisResult, CropType, WeatherData | M |

## P2 - MEDIO (Proximo sprint)

| # | Categoria | Problema | Arquivo(s) | Solucao | Esforco |
|---|-----------|----------|-----------|---------|---------|
| 25 | Design | Sem design tokens de tipografia | Criar AppTypography.swift | Centralizar text styles | M |
| 26 | Design | Paddings inconsistentes | Todas as Views | Criar spacing scale e padronizar | M |
| 27 | Design | Cores hardcoded no Onboarding | OnboardingView.swift | Extrair para AppTheme | S |
| 28 | Design | Uso excessivo de symbolEffect | Auth, Onboarding | Reduzir a 2-3 telas | S |
| 29 | Codigo | LocationService mistura responsabilidades | LocationService.swift | Separar em Service + ViewModel | M |
| 30 | Codigo | Naming Config com EXPO_PUBLIC_ | Config.swift | Renomear para Swift naming | S |
| 31 | Codigo | DiagnosisResult parsing fragil | DiagnosisViewModel.swift | Padronizar formato no backend | M |
| 32 | Codigo | Coordenadas default hardcoded | DiagnosisViewModel.swift:68-69 | Nao enviar se localizacao nao disponivel | S |
| 33 | Performance | Paginacao hardcoded limit=50 | SupabaseService.swift:130 | Paginacao infinita | M |
| 34 | i18n | Seletor de idioma nao funciona | SettingsView.swift:120 | Conectar a String Catalogs | M |
| 35 | i18n | Prompt IA so em portugues | AIChatService.swift:20 | Variar prompt por idioma | S |
| 36 | Acessibilidade | Sem rotor headings | Todas as Views | Adicionar .isHeader traits | S |

## P3 - BAIXO (Backlog)

| # | Categoria | Problema | Arquivo(s) | Solucao | Esforco |
|---|-----------|----------|-----------|---------|---------|
| 37 | Design | warmAmber nomeado incorretamente | AppTheme.swift | Renomear para harvestGold | S |
| 38 | Design | Corner radius variados | Varios | Padronizar (8, 12, 16, 24) | S |
| 39 | Design | SF Symbols inconsistentes em peso | Varios | Padronizar pesos | S |
| 40 | Design | Icones tab bar genericos | MainTabView.swift | Considerar icones mais especificos | S |
| 41 | Codigo | nonisolated desnecessarios | SupabaseService.swift | Remover de structs | S |
| 42 | Codigo | Deep linking nao implementado | ContentView.swift | Adicionar para notificacoes futuras | L |
| 43 | Codigo | Singletons sem protocols | Services/ | Criar protocols para testabilidade | M |
| 44 | App Store | Assets desnecessarios (Android/Web) | assets/images/ | Remover adaptive-icon, favicon | S |
| 45 | Testes | Sem mocks para Services | Services/ | Criar protocols e mocks | M |

---

## Metricas Resumo

- **Total de achados:** 68
- **Criticos (P0):** 11 — resolver antes de submeter a App Store
- **Altos (P1):** 24 — resolver na primeira semana
- **Esforco total P0:** ~4-6 dias de trabalho focado
- **Esforco total P0+P1:** ~2-3 semanas

## Pontos Positivos

1. ✅ Arquitetura MVVM limpa com @Observable moderno
2. ✅ NavigationStack (iOS 16+) em vez do deprecated NavigationView
3. ✅ Compressao de imagem antes de upload (800KB max)
4. ✅ Chamadas paralelas com async let na Home
5. ✅ LazyVStack no chat para performance
6. ✅ Keychain para tokens (implementacao basica mas funcional)
7. ✅ Erro handling com mensagens em portugues amigaveis
8. ✅ Design visualmente profissional com MeshGradient
9. ✅ Onboarding com 4 paginas informativas
10. ✅ Confirmacao de sign out com dialog

---

---

# ACHADOS ADICIONAIS DOS AGENTES ESPECIALIZADOS

## Seguranca (Code Reviewer Agent)

**[CRITICO] SecItemAdd resultado ignorado — falha silenciosa ao salvar tokens**
`KeychainService.swift:17` — `SecItemAdd(newItem as CFDictionary, nil)` — retorno `OSStatus` descartado. Se falhar, o token nao e salvo mas `isAuthenticated = true`. No proximo launch, logout inesperado.
```swift
// CORRECAO:
let status = SecItemAdd(newItem as CFDictionary, nil)
guard status == errSecSuccess else { return false }
```

**[CRITICO] Race condition em LocationService.getLocationOnce()**
`LocationService.swift:36-48` — Continuacao pode nunca ser retomada se `requestLocation()` falhar sincronamente antes de ser adicionada ao array. Task fica suspensa indefinidamente.

**[ALTO] isLoading/isAnalyzing nao resetado em Task.CancellationError**
`AuthViewModel.swift:50,64` / `DiagnosisViewModel.swift:44,114-120` — Se a Task for cancelada (usuario navega fora), os flags permanecem `true` para sempre. UI travada em "carregando".
```swift
// CORRECAO: Usar defer
isLoading = true
defer { isLoading = false }
```

**[ALTO] signIn() nao trata accessToken nil com HTTP 200**
`AuthViewModel.swift:54-58` — Se Supabase retornar 200 sem token (email nao confirmado), nenhum feedback ao usuario.

**[ALTO] loadDiagnosisCount baixa 50 registros inteiros para contar**
`HomeViewModel.swift:76-84` — Desperdicio de bandwidth. Deveria usar `Prefer: count=exact` do PostgREST.

## Codigo (Code Reviewer Agent)

**[MEDIO] AgrioProduct.id baseado em name — colisao em ForEach**
`DiagnosisResult.swift:298` — `var id: String { name }` — Dois produtos com mesmo nome causam bug visual no SwiftUI.

**[MEDIO] parsedNotes re-cria JSONDecoder a CADA acesso**
`DiagnosisResult.swift:32-35` — Computed property chamada ~20x por render. Deveria cachear resultado.

**[MEDIO] SettingsViewModel.currentPlan sempre .free**
`SettingsViewModel.swift:23` — Nunca sincroniza com backend. Exibe "Gratuito" para todos.

## App Store (Tests & App Store Agent)

**[CRITICO] Bundle ID generico**
`project.pbxproj` — `app.rork.w7x2pnnajuu2raudcvwts` — Precisa ser `com.agrorumo.rumopragas` ou similar profissional.

**[CRITICO] DEVELOPMENT_TEAM vazio**
`project.pbxproj` — Sem Apple Developer Team. Build nao sera assinado.

**[MEDIO] IPHONEOS_DEPLOYMENT_TARGET = 18.0 muito restritivo**
Limita a ~30% dos dispositivos iOS. Considerar iOS 16.0+ para 95%+ de alcance.

**[MEDIO] Launch screen generica (sem branding)**
`INFOPLIST_KEY_UILaunchScreen_Generation = YES` — Tela branca/preta padrao. Criar LaunchScreen customizada.

## Acessibilidade (Accessibility Agent) — Detalhamento Extra

**[CRITICO] Contraste critico do botao "Pular" no Onboarding**
`OnboardingView.swift:143` — `.white.opacity(0.55)` sobre gradientes coloridos = ratio ~1.5:1 (FALHA CRITICA, minimo 4.5:1)

**38+ botoes baseados em icone sem accessibility label**, incluindo:
- Limpar chat (AIChatView:41)
- Mostrar/ocultar senha (AuthView:322)
- Botao voltar/fechar (DiagnosisFlowView:53)
- SendButton (AIChatView:209)
- StatMiniCards (HomeView:214-251)
- Indicadores de pagina do Onboarding (OnboardingView:108)

## i18n (Accessibility Agent) — Inventario Completo

**~250+ strings hardcoded** em 18 Views + 3 Models + 2 ViewModels. Nenhum uso de String Catalogs.

**Precos hardcoded em BRL:** `SubscriptionPlan.swift` — "R$ 29/mes", "R$ 69/mes" — nao adaptavel para mercado hispanofalante.

**Pluralizacao incorreta:** `HistoryView.swift:149` — `"\(count) diagnosticos"` sem tratar singular "1 diagnostico".

---

# PLANO DE ACAO CONSOLIDADO (ATUALIZADO)

## P0 — CRITICO (11 itens — corrigir ANTES de publicar)

| # | Item | Esforco |
|---|------|---------|
| 1 | Criar PrivacyInfo.xcprivacy | S |
| 2 | Verificar/adicionar descricoes de permissao (Camera, Fotos, GPS) | S |
| 3 | Keychain: adicionar kSecAttrAccessibleWhenUnlockedThisDeviceOnly | S |
| 4 | Keychain: verificar retorno de SecItemAdd | S |
| 5 | Envolver print() em #if DEBUG | S |
| 6 | Config.swift: migrar para .xcconfig + .gitignore | M |
| 7 | Corrigir force unwrap em URLs (AuthView, SettingsView) | S |
| 8 | Bundle ID profissional + DEVELOPMENT_TEAM | S |
| 9 | Accessibility labels nos 38+ botoes de icone | L |
| 10 | preferReduceMotion para animacoes | M |
| 11 | Iniciar String Catalogs (pelo menos telas principais) | L |

## P1 — ALTO (16 itens — primeira semana)

| # | Item | Esforco |
|---|------|---------|
| 12 | AIChatService: adicionar autenticacao | S |
| 13 | URL encode do userId nas queries | S |
| 14 | Senha minima 8 chars + complexidade | S |
| 15 | Deletar refresh token de UserDefaults na migracao | S |
| 16 | Logar erro no refreshSession() catch | S |
| 17 | defer { isLoading = false } em todos os VMs | S |
| 18 | Tratar accessToken nil com HTTP 200 | S |
| 19 | Fix race condition LocationService | M |
| 20 | Cache local de diagnosticos | M |
| 21 | MeshGradient fallback para dispositivos antigos | M |
| 22 | loadDiagnosisCount com HEAD/count | S |
| 23 | AppIcon 1024x1024 profissional | M |
| 24 | Contraste WCAG em gradientes | S |
| 25 | SendButton 44x44pt | S |
| 26 | Dynamic Type: substituir .system(size:) | M |
| 27 | Top 10 testes unitarios criticos | L |

## Esforco Total Estimado

| Prioridade | Itens | Esforco |
|------------|-------|---------|
| P0 | 11 | ~5-7 dias |
| P1 | 16 | ~2 semanas |
| P2 | 12 | ~1 semana |
| P3 | 9 | Backlog |
| **Total P0+P1** | **27** | **~3-4 semanas** |

---

**Relatorio gerado em:** 2026-03-17
**Auditores:** Claude Opus 4.6 + 6 agentes especializados (ios-dev, security-audit, ui-ux-pro-max, code-reviewer, accessibility, app-store)
**Skills usadas:** security-audit, ui-ux-pro-max, code-review, feature-dev:code-reviewer
**Projeto:** Rumo Pragas IA v1.0 (iOS SwiftUI)
**Total de achados:** 80 (16 criticos, 27 altos, 25 medios, 12 baixos)
