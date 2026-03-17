# PROMPT DE AUDITORIA TOTAL - Rumo Pragas IA

> **Objetivo:** Auditar 100% do aplicativo iOS SwiftUI "Rumo Pragas IA" — código, design, cores, ícones, UX, segurança, performance, acessibilidade e arquitetura — gerando um relatório completo com problemas encontrados e melhorias acionáveis.

---

## CONTEXTO DO PROJETO

- **App:** Rumo Pragas IA — identificação de pragas agrícolas via IA
- **Plataforma:** iOS nativo (SwiftUI, Xcode 16+)
- **Backend:** Supabase (Auth, Database, Edge Functions)
- **Arquitetura:** MVVM com @Observable
- **Idiomas:** Português / Espanhol
- **Estrutura:** 18 Views, 7 ViewModels, 9 Models, 6 Services, 2 Utilities

---

## PROMPT COMPLETO (copie e cole para iniciar a auditoria)

```
Você é um time de especialistas auditando o app iOS "Rumo Pragas IA". Execute TODAS as auditorias abaixo de forma sistemática. Para cada seção, liste:
- [CRÍTICO] Problemas que quebram funcionalidade ou segurança
- [ALTO] Problemas sérios de UX, performance ou qualidade
- [MÉDIO] Melhorias importantes
- [BAIXO] Refinamentos e polimento

Ao final, gere um PLANO DE AÇÃO priorizado.

---

## 1. AUDITORIA DE DESIGN & UI/UX

### 1.1 Sistema de Cores
Auditar o arquivo `RumoPragas/Utilities/AppTheme.swift`:
- A paleta de cores (Emerald #1A966B, Tech Blue #3882F2, Coral #F0664F, Warm Amber, Indigo) é harmônica?
- Contraste WCAG AA/AAA para texto sobre backgrounds (especialmente branco sobre gradientes)
- Consistência de uso das cores em todas as 18 telas
- As cores refletem o domínio agro/natureza? São profissionais?
- Dark mode: as cores se adaptam bem? Há problemas de legibilidade?
- Sugestão de paleta otimizada se necessário (com hex codes)

### 1.2 Tipografia
- Uso do SF Pro é adequado? Pesos e tamanhos são consistentes?
- Hierarquia visual está clara (título > subtítulo > body > caption)?
- Tamanhos de fonte são acessíveis (mínimo 11pt)?
- Espaçamento entre linhas (lineSpacing) é confortável?

### 1.3 Iconografia & Ícones SF Symbols
- Os SF Symbols escolhidos representam bem cada função?
  - leaf.fill (Home), clock.arrow.circlepath (Histórico), books.vertical.fill (Biblioteca)
  - sparkles (Agro IA), gearshape.fill (Ajustes)
  - camera.viewfinder (Diagnóstico), etc.
- Há ícones que poderiam ser melhores/mais intuitivos?
- Consistência de tamanho e peso dos ícones
- Os ícones das 18 culturas (CropType) fazem sentido semântico?

### 1.4 App Icon & Assets
Auditar os assets em `assets/images/` e `Assets.xcassets/`:
- icon.png (178KB) — qualidade, resolução, clareza em tamanho pequeno
- adaptive-icon.png (191KB) — necessário para iOS?
- splash-icon.png (54KB) — coerente com a marca?
- favicon.png (451B) — necessário para iOS?
- O ícone do app é profissional, memorável e transmite "agro + IA"?
- Sugestão de melhorias para o ícone se necessário
- AppIcon.appiconset tem todos os tamanhos necessários para App Store?

### 1.5 Splash Screen & Onboarding
Auditar `ContentView.swift` (SplashView) e `OnboardingView.swift`:
- Animação de splash (leaf pulsante + MeshGradient) é profissional?
- Tempo de 1.5s é adequado?
- Transição splash → app é suave?
- Onboarding comunica valor do app rapidamente?

### 1.6 Layout & Espaçamento
- Paddings são consistentes? (16pt, 20pt, 24pt — há padrão?)
- Corner radius consistente (16pt padrão)?
- Sombras (shadow) são sutis e consistentes?
- Espaçamento entre seções é confortável?
- Comportamento em diferentes tamanhos de tela (SE, 15, 15 Pro Max, iPad)?

### 1.7 Micro-interações & Animações
- Uso de haptic feedback (sensoryFeedback) é adequado?
- symbolEffect (.breathe, .bounce, .pulse) — overuse ou adequado?
- Animações de entrada (opacity + offset) são suaves?
- Performance das animações no MeshGradient

### 1.8 Componentes Reutilizáveis
Auditar: ModernCardModifier, StatMiniCard, PremiumBadge, CollapsibleSection, ConfidenceBar, DiagnosisCardView:
- São realmente reutilizáveis e flexíveis?
- Consistência visual entre componentes
- Naming é claro?

---

## 2. AUDITORIA DE CÓDIGO & ARQUITETURA

### 2.1 Arquitetura MVVM
- Separação de responsabilidades View ↔ ViewModel ↔ Service está correta?
- Algum ViewModel faz trabalho que deveria ser do Service?
- Alguma View tem lógica de negócio que deveria estar no ViewModel?
- @Observable está sendo usado corretamente?

### 2.2 Qualidade do Código Swift
Para CADA arquivo .swift:
- Naming conventions (Swift style guide)
- Force unwraps desnecessários
- Uso correto de async/await
- Memory leaks (retain cycles com closures)
- Concurrency safety (@Sendable, nonisolated, actor isolation)
- Dead code / código não utilizado
- Magic numbers / strings hardcoded
- Duplicação de código entre arquivos

### 2.3 Estrutura de Dados / Models
Auditar os 9 Models:
- DiagnosisResult.swift — modelo complexo, está bem estruturado?
- CropType.swift — 18 culturas com cores e ícones, completo?
- Codable conformance é correto?
- Propriedades opcionais vs required fazem sentido?
- Computed properties são eficientes?

### 2.4 Navegação
Auditar fluxo de navegação em ContentView + MainTabView:
- NavigationStack, .navigationDestination, .fullScreenCover, .sheet — uso correto?
- Há deep linking implementado?
- Back navigation funciona corretamente?
- Estado de navegação está no lugar certo?

---

## 3. AUDITORIA DE SEGURANÇA

### 3.1 Autenticação & Tokens
Auditar `SupabaseService.swift`, `KeychainService.swift`, `AuthViewModel.swift`:
- Tokens são armazenados no Keychain corretamente?
- Refresh token flow está robusto?
- Há fallback para quando Keychain falha?
- API keys estão expostas no Config.swift? (deve estar em .xcconfig ou Keychain)
- Dados sensíveis são passados como plain text em algum lugar?

### 3.2 Network Security
- Todas as chamadas usam HTTPS?
- Há certificate pinning?
- Request timeout de 180s (Edge Function) é muito alto?
- Dados do usuário são logados via print() em produção?
- Headers de segurança estão adequados?

### 3.3 Input Validation
- Validação de email/senha na AuthView é robusta?
- Dados de input do usuário são sanitizados antes de enviar à API?
- URLs são construídas de forma segura (sem SQL injection via URL params)?

### 3.4 Data Privacy
- Dados de localização são tratados com consentimento?
- Fotos do diagnóstico são armazenadas/transmitidas de forma segura?
- LGPD compliance: há coleta de dados informada?

---

## 4. AUDITORIA DE PERFORMANCE

### 4.1 Views & Rendering
- MeshGradient no background — impacto na performance?
- ScrollView com muitos items — há LazyVStack?
- Imagens são carregadas de forma otimizada (lazy loading)?
- Rendering desnecessário (body computations)?

### 4.2 Network
- Chamadas paralelas (async let) estão corretas em HomeView.task?
- Há cache de dados (diagnósticos, clima, biblioteca)?
- Retry logic para falhas de rede?
- Paginação no fetchDiagnoses (limit 50)?

### 4.3 Memory
- PestDataService.swift (48KB) carrega tudo em memória?
- Imagens da câmera são comprimidas antes de upload?
- Há memory warnings handling?

---

## 5. AUDITORIA DE ACESSIBILIDADE

- VoiceOver labels em todos os componentes interativos
- Dynamic Type support (fontes escaláveis)
- Contraste mínimo WCAG 2.0 AA (4.5:1 para texto, 3:1 para ícones grandes)
- Tappable area mínima 44x44pt
- Redução de movimento (preferReduceMotion) para animações
- Haptic feedback não é a única forma de feedback
- Labels em português correto para VoiceOver

---

## 6. AUDITORIA DE TESTES

Auditar `RumoPragasTests/` e `RumoPragasUITests/`:
- Cobertura atual (0% — skeleton only)
- Quais testes são CRÍTICOS e devem ser implementados primeiro?
- Testes unitários: ViewModels, Services, Models
- Testes de UI: fluxo de diagnóstico, autenticação
- Testes de snapshot para componentes visuais

---

## 7. AUDITORIA DE APP STORE READINESS

- Info.plist: permissões de câmera, localização, fotos com descriptions?
- Privacy manifest (PrivacyInfo.xcprivacy)?
- App Transport Security settings?
- Todos os tamanhos de ícone para App Store?
- Launch screen / splash está como Storyboard ou SwiftUI?
- Bundle ID, versão, build number configurados?
- Assinatura e provisioning profile?
- Screenshots para App Store (6.7", 6.5", 5.5")?

---

## 8. AUDITORIA DE INTERNACIONALIZAÇÃO

- Strings hardcoded em português em Views (não localizadas)?
- Suporte a espanhol está funcional?
- Datas e números formatados por locale?
- Pluralização correta?
- Layout suporta textos maiores (espanhol geralmente é mais longo)?

---

## 9. AUDITORIA DE IDENTIDADE VISUAL & MARCA

### 9.1 Coerência da Marca
- O app transmite: profissionalismo + agro + tecnologia + confiança?
- Cores verdes (agro) + azuis (tech) + gradientes mesh — funciona?
- O nome "Rumo Pragas" é claro no propósito?
- Logo/ícone é reconhecível em 29x29pt (App Store search)?

### 9.2 Consistência Visual
- Todas as telas seguem o mesmo visual language?
- Cards, badges, botões — design system coeso?
- Transições entre telas são suaves e coerentes?

### 9.3 Benchmarking
- Compare com apps similares: Plantix, Agrobase, AgroIA
- O que este app faz melhor? O que pode melhorar?
- Features visuais que diferenciam (MeshGradient, animações, etc.)

---

## 10. PLANO DE AÇÃO FINAL

Gere um plano priorizado:

### P0 — Crítico (corrigir ANTES de publicar)
### P1 — Alto (corrigir na primeira semana)
### P2 — Médio (próximo sprint)
### P3 — Baixo (backlog)

Para cada item:
- [Categoria] Descrição do problema
- Arquivo(s) afetado(s)
- Solução proposta (com código se necessário)
- Esforço estimado (S/M/L)

---

EXECUTE TODAS AS 10 SEÇÕES. Seja específico, cite linhas de código e arquivos.
Não generalize — dê exemplos concretos e soluções acionáveis.
```

---

## COMO USAR ESTE PROMPT

### Opção 1: Auditoria Completa (recomendado)
Cole o prompt acima inteiro em uma nova sessão do Claude Code e execute:
```
Audite o projeto completo seguindo o AUDIT_PROMPT.md
```

### Opção 2: Auditoria por Seção
Execute seções individuais conforme necessidade:
```
Execute apenas a seção 1 (Design & UI/UX) do AUDIT_PROMPT.md
Execute apenas a seção 3 (Segurança) do AUDIT_PROMPT.md
```

### Opção 3: Com Skills Especializadas
Para máxima profundidade, combine com skills:
```
# Design completo
/ui-ux-pro-max review o app Rumo Pragas IA seguindo a seção 1 do AUDIT_PROMPT.md

# Segurança
/security-audit audite o app seguindo a seção 3 do AUDIT_PROMPT.md

# Code review
/code-review:code-review revise todo o código seguindo a seção 2 do AUDIT_PROMPT.md

# App Store
/aso-skills audite App Store readiness seguindo a seção 7 do AUDIT_PROMPT.md

# Supabase
/supabase-postgres audite o backend seguindo a seção 3 e 4 do AUDIT_PROMPT.md

# Feature dev
/feature-dev:code-explorer analise a arquitetura seguindo a seção 2 do AUDIT_PROMPT.md

# Simplificação
/simplify simplifique o código seguindo os achados da seção 2 do AUDIT_PROMPT.md
```

---

## SKILLS DISPONÍVEIS PARA ESTA AUDITORIA

| Skill | Seção da Auditoria |
|-------|-------------------|
| `ui-ux-pro-max` | 1. Design & UI/UX, 9. Identidade Visual |
| `security-audit` | 3. Segurança completa |
| `code-review:code-review` | 2. Código & Arquitetura |
| `supabase-postgres` | 3.1/3.2 Backend, 4.2 Performance |
| `aso-skills` | 7. App Store Readiness |
| `feature-dev:code-explorer` | 2.1 Arquitetura MVVM |
| `feature-dev:code-reviewer` | 2.2 Qualidade do Código |
| `simplify` | 2.2 Simplificação pós-auditoria |
| `superpowers:systematic-debugging` | Bugs encontrados |
| `superpowers:test-driven-development` | 6. Testes |
| `expo-toolkit` | 7. Submissão App Store |

---

**Criado em:** 2026-03-17
**Projeto:** Rumo Pragas IA (iOS SwiftUI)
**Versão do prompt:** 1.0
