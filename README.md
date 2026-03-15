# Rumo Pragas - Identificação de Pragas Agrícolas com IA

Aplicativo iOS nativo para identificação e manejo de pragas agrícolas utilizando inteligência artificial. Desenvolvido para produtores rurais, agrônomos e técnicos agrícolas brasileiros.

## Tecnologias

- **Plataforma**: iOS nativo
- **Linguagem**: Swift 5 + SwiftUI
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **IA**: Agrio Visual ID + enriquecimento com Claude
- **Clima**: Open-Meteo API (gratuita, sem chave)
- **Localização**: CoreLocation + Geocoding nativo

## Funcionalidades

- **Diagnóstico por IA**: Tire uma foto da planta e receba identificação da praga/doença com recomendações de manejo
- **Biblioteca de Pragas**: Base com 100+ pragas e doenças para 18 culturas brasileiras
- **Chat com IA**: Assistente especializado em pragas agrícolas e MIP
- **Histórico**: Salve e consulte diagnósticos anteriores
- **Clima**: Dados meteorológicos da sua região para correlação com pragas
- **Perfil e Assinatura**: Planos Free, Básico e Pro

## Culturas Suportadas

Soja, Milho, Café, Algodão, Cana-de-açúcar, Trigo, Arroz, Feijão, Batata, Tomate, Mandioca, Citros, Uva, Banana, Sorgo, Amendoim, Girassol, Cebola.

## Arquitetura

O projeto segue o padrão **MVVM** (Model-View-ViewModel):

```
RumoPragas/
├── Models/          # Modelos de dados (DiagnosisResult, Pest, UserProfile, etc.)
├── Views/           # Telas em SwiftUI (18 views)
├── ViewModels/      # Lógica de apresentação (7 view models)
├── Services/        # Camada de serviços (Supabase, Location, Weather, AI Chat)
├── Utilities/       # Tema e formatação
├── Config.swift     # Configuração de chaves de API
├── ContentView.swift # View raiz com roteamento de autenticação
└── RumoPragasApp.swift # Entry point
```

## Configuração

1. Clone o repositório
2. Abra `RumoPragas.xcodeproj` no Xcode
3. Configure as chaves no `Config.swift`:
   - `supabaseURL`: URL do seu projeto Supabase
   - `supabaseAnonKey`: Chave anônima do Supabase
   - `toolkitURL`: URL do serviço de chat com IA
4. Build e execute no simulador ou dispositivo iOS

## Segurança

- Tokens de autenticação armazenados no **Keychain** (não em UserDefaults)
- Chaves de API não commitadas no repositório (valores vazios no Config.swift)
- Imagens comprimidas antes do envio (máx. 1280px, JPEG ~800KB)
- Comunicação via HTTPS com Supabase
