# Análise Completa - Popup Video Player with Scheduler

## 📋 Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura da Aplicação](#arquitetura-da-aplicação)
3. [Componentes Principais](#componentes-principais)
4. [Fluxo de Dados](#fluxo-de-dados)
5. [Stack Tecnológico](#stack-tecnológico)
6. [Funcionalidades](#funcionalidades)
7. [APIs e Endpoints](#apis-e-endpoints)
8. [Estrutura de Ficheiros](#estrutura-de-ficheiros)
9. [Processos de Inicialização](#processos-de-inicialização)
10. [Sistema de Logging](#sistema-de-logging)
11. [Análise de Código Crítico](#análise-de-código-crítico)
12. [Fluxo de Eventos](#fluxo-de-eventos)

---

## Visão Geral

**Banco Moc Popup Video** é uma aplicação desktop multiplataforma construída com Electron que executa vídeos em janelas popup em horários agendados. A aplicação foi desenvolvida especificamente para o Banco Moc e integra-se com uma API backend para obter vídeos, horários de agendamento e reportar statísticas de visualização.

### Informações Básicas
- **Nome:** Banco Moc Popup Video
- **Versão:** 1.0.0
- **Autor:** Fernando Zucula
- **Licença:** MIT
- **Plataformas:** Windows, macOS, Linux
- **Framework:** Electron 27.x
- **Linguagem Principal:** JavaScript (Node.js)
- **Client HTTP:** Axios

---

## Arquitetura da Aplicação

A aplicação segue uma arquitetura cliente-servidor com a seguinte estrutura:

```
┌─────────────────────────────────────────────────────────┐
│                   ELECTRON APPLICATION                  │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────────────────┐      ┌──────────────────┐        │
│  │   MAIN PROCESS   │      │  RENDERER PROCESS│        │
│  │  (main.js)       │◄────►│  (script.js)     │        │
│  └──────────────────┘      └──────────────────┘        │
│         │                           │                   │
│         │                           │                   │
│    ┌────▼────────┐         ┌────────▼────┐             │
│    │  Scheduler  │         │Video Player │             │
│    │(scheduler.js)         │   (HTML5)   │             │
│    └─────────────┘         └─────────────┘             │
│         │                                               │
│    ┌────▼──────────────┐                                │
│    │  TrayManager      │                                │
│    │ (trayManager.js)  │                                │
│    └───────────────────┘                                │
│         │                                               │
│    ┌────▼──────────────┐                                │
│    │  ApiClient        │                                │
│    │ (apiClient.js)    │                                │
│    └────────┬──────────┘                                │
└─────────────┼──────────────────────────────────────────┘
              │ HTTP(S) REQUEST
              │
        ┌─────▼──────────────┐
        │   BACKEND API      │
        │ (ginastica.        │
        │  bancomoc.mz/api)  │
        └────────────────────┘
```

### Componentes Principais

1. **Main Process (main.js)** - Processa principal do Electron
2. **Renderer Process (script.js)** - Processo de renderização
3. **Scheduler (scheduler.js)** - Motor de agendamento de vídeos
4. **Api Client (apiClient.js)** - Cliente HTTP para comunicação
5. **Tray Manager (trayManager.js)** - Gerenciamento de ícone na bandeja
6. **Logger (logger.js)** - Sistema de logging estruturado
7. **Config Manager (configManager.js)** - Gerenciamento de configurações
8. **Video Player (video-popup.html + style.css)** - Interface UI

---

## Componentes Principais

### 1. main.js - Processo Principal do Electron

**Responsabilidades:**
- Inicializar a aplicação Electron
- Criar e gerenciar a janela de vídeo
- Gerenciar o ícone da bandeja do sistema
- Configurar o menu da aplicação
- Implementar handlers IPC (Inter-Process Communication)
- Gerenciar ciclo de vida da aplicação
- Controlar verificações periódicas de atualizações

**Variáveis Globais Importantes:**
```javascript
- videoWindow: BrowserWindow - Janela popup do vídeo (criada dinamicamente)
- trayManager: TrayManager - Gerenciador da bandeja
- scheduler: Scheduler - Motor de agendamento
- isQuitting: boolean - Flag de saída da aplicação
- apiClient: ApiClient - Cliente de API
- intervals: Array - Armazena IDs de setInterval para limpeza
- isVideoPlaying: boolean - Status de reprodução
```

**Fluxo de Inicialização:**
1. Electron ready event
2. Carregar ícone da aplicação
3. Criar menu da aplicação
4. Instanciar ApiClient
5. Testar autenticação na API
6. Inicializar TrayManager
7. Inicializar Scheduler
8. Configurar handlers IPC
9. Iniciar intervalos de verificação periódica

**Handlers IPC Principais:**
- `report-video-view`: Recebe eventos de visualização de vídeo do renderer
- `minimize-window`: Minimiza janela de vídeo

### 2. scheduler.js - Motor de Agendamento

**Funcionalidade:**
Implementa um sistema de agendamento baseado em horários diários.

**Classe: Scheduler**
```javascript
constructor(options) {
  - onTrigger: Callback executado quando horário é atingido
  - apiClient: Referência ao cliente de API
}
```

**Métodos Principais:**
- `init()`: Busca horários da API, fallback para horários padrão
- `scheduleAll()`: Agenda todos os horários (limpa agendamentos anteriores)
- `scheduleDaily(hours, minutes)`: Agenda trigger diário para horário específico
- `updateScheduleTimes(newTimes)`: Atualiza horários de agendamento
- `clearAllSchedules()`: Limpa todos os timeouts
- `destroy()`: Destruição correta do scheduler

**Formato de Horários:**
- Formato: "HH:MM" (ex: "09:00", "12:00", "15:00", "18:00")
- Validação: Regex `/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/`
- Padrão: 4 agendamentos diários (9h, 12h, 15h, 18h)

**Algoritmo de Agendamento:**
1. Calcular tempo até próximo horário
2. Se horário já passou hoje → agendar para amanhã
3. Usar setTimeout com diferença de tempo
4. Ao triggerar → executar callback e reagendar para o dia seguinte

### 3. apiClient.js - Cliente de API HTTP

**Funcionalidade:**
Gerencia toda comunicação com servidor backend via HTTP.

**Propriedades da Classe:**
```javascript
- lastVideoUpdate: Date - Timestamp da última atualização
- lastScheduleUpdate: Date - Timestamp do último update de horários
- currentVideoId: string - ID do vídeo atual
- currentScheduleId: string - ID do agendamento atual
- currentVideoTitle: string - Título do vídeo atual
- currentVideoUrl: string - URL do vídeo atual
- sessionId: string - ID único da sessão
- isAuthenticated: boolean - Status de autenticação
- videosCount: number - Contagem de vídeos (para detectar atualizações)
```

**Métodos Críticos:**

#### testAuthentication()
- Testa se as credenciais são válidas
- Requisição GET para `/scheduled/videos`
- Define `isAuthenticated` baseado no resultado
- Retorna boolean

#### getNextVideo()
- Busca próximo vídeo da API
- Pode lidar com 3 formatos de resposta diferentes:
  1. `response.data.videos[]` (Array aninhado)
  2. `response.data[]` (Array direto)
  3. `response.data.data[]` (Formato alternativo)
- Seleciona vídeo aleatoriamente
- Extrai campos: `title`, `video_url`, `id`, `video_id`
- Armazena em propriedades da classe
- Retorna objeto com: `url`, `title`, `id`, `videoId`, `scheduleId`, `videoData`
- Fallback: Vídeo de exemplo do Google (BigBuckBunny)

#### checkVideoUpdates()
- Verifica se novos vídeos foram adicionados
- Compara contagem atual com anterior
- Retorna objeto: `{ hasUpdates, count, newVideos }`

#### getScheduleTimes()
- Busca horários de agendamento da API
- Endpoint: `/schedules/clients`
- Valida e formata horários para "HH:MM"
- Fallback para horários padrão se falhar

#### checkScheduleUpdates()
- Verifica atualização nos horários
- Similar a checkVideoUpdates()

#### reportVideoView(videoData)
- Envia relatório de visualização para API
- Dados reportados:
  - `video_id`, `video_title`, `schedule_id`
  - `event_type`, `trigger_type`
  - `timestamp`, `session_id`
  - `playback_position`, `video_duration`

**Headers de Autenticação:**
```javascript
{
  'X-API-Key': 'VIDEO_POPUP_SECRET_2025',
  'X-Client-ID': 'ELECTRON_VIDEO_PLAYER',
  'X-Client-Version': '1.0.0',
  'Content-Type': 'application/json'
}
```

**Endpoints Base:**
```
API.BASE_URL = 'http://ginastica.bancomoc.mz/api'
```

**Endpoints Disponíveis:**
- `/scheduled/videos` - GET: Buscar vídeos agendados
- `/schedules/clients` - GET: Buscar horários de agendamento
- `/videos/report` - POST: Reportar visualização
- `/ping` - GET: Health check

**Timeout:** 10 segundos
**Retry Attempts:** 2 tentativas

### 4. trayManager.js - Gerenciador de Bandeja do Sistema

**Funcionalidade:**
Cria e gerencia ícone na bandeja de sistema com menu contextual.

**Eventos Emitidos (EventEmitter):**
- `open-video`: Mostrar/ocultar vídeo
- `minimize-window`: Minimizar janela
- `reload-video`: Recarregar vídeo
- `check-videos`: Verificar novos vídeos
- `check-schedule`: Verificar horários
- `quit-app`: Sair da aplicação

**Menu Contextual:**
```
┌────────────────────────────────┐
│ 🎬 Mostrar/Ocultar Vídeo       │
│ 🔄 Recarregar Vídeo Agora      │
├────────────────────────────────┤
│ 📊 Verificar Agora              │
│   → Verificar Novos Vídeos      │
│   → Verificar Horários          │
├────────────────────────────────┤
│ ❌ Sair                         │
└────────────────────────────────┘
```

**Tooltip da Bandeja:**
- Muda dinamicamente baseado no estado
- Formato: "Banco Moc Popup Video\n[Estado]"

### 5. logger.js - Sistema de Logging

**Níveis de Log:**
```
debug: 10 (mais verboso)
info: 20
warn: 30
error: 40 (menos verboso)
none: 100
```

**Configuração:**
- Modo Produção: Padrão "warn"
- Modo Desenvolvimento: Padrão "debug"
- Configurável via `LOG_LEVEL` environment variable

**Uso:**
```javascript
const logger = createLogger('module-name');
logger.debug('Mensagem debug', { data });
logger.info('Mensagem info');
logger.warn('Mensagem aviso');
logger.error('Mensagem erro');
```

### 6. configManager.js - Gerenciador de Configuração

**Armazenamento:**
- Arquivo: `~/.config/[app-name]/config.json` (userData)
- Formato: JSON

**Configuração Padrão:**
```javascript
{
  api: {
    baseUrl: "http://127.0.0.1:8000/api",
    endpoints: {
      videos: "/scheduled/videos",
      schedule: "/schedules/clients",
      report: "/videos/report"
    }
  },
  auth: {
    apiKey: "VIDEO_POPUP_SECRET_2025",
    clientId: "ELECTRON_VIDEO_PLAYER",
    version: "1.0.0"
  },
  app: {
    name: "Video Popup Scheduler",
    version: "1.0.0",
    autoStart: true,
    checkUpdatesInterval: 10,
    videoLoop: true,
    defaultSchedule: ["09:00", "12:00", "15:00", "18:00"]
  }
}
```

**Métodos:**
- `loadConfig()`: Carrega de arquivo ou usa padrão
- `get(key, defaultValue)`: Obtém valor (suporta dot notation)
- `set(key, value)`: Define valor (suporta dot notation)
- `deepMerge()`: Mescla configs

### 7. preload.js - Bridge Seguro Renderer-Main

**Expõe ao window.electronAPI:**
```javascript
{
  reportVideoView(data): void
  minimizeWindow(): void
  onWindowCloseRequest(handler): void
  getRuntimeInfo(): { isProduction, logLevel }
}
```

**Segurança:**
- Usa contextBridge para exposição segura
- IPC para comunicação
- Sem acesso direto ao contexto do Node.js

### 8. video-popup.html + script.js - Interface de Reprodução

**Estrutura HTML:**
```html
<div class="video-container">
  <video id="videoPlayer" autoplay muted playsinline>
  <button class="close-btn" id="closeButton">×</button>
  <div class="progress-container">
    <span id="currentTime">0:00</span> / <span id="duration">0:00</span>
  </div>
</div>
```

**Propriedades de Vídeo:**
- autoplay: true
- muted: true (sem som por padrão)
- playsinline: true (mobilidade)
- loop: true (repetição contínua)

**Parâmetros de Inicialização (URL):**
- `videoUrl`: URL do vídeo
- `videoId`: ID do vídeo
- `scheduleId`: ID do agendamento
- `videoTitle`: Título do vídeo
- `triggerType`: Tipo de gatilho ("scheduled", "manual-reload", etc)

**Estados Globais:**
```javascript
window.hasVideoCompleted: boolean
window.videoDuration: number
window.playbackStartTime: number
window.videoPlayer: HTMLVideoElement
window.sessionId: string
window.reported25, reported50, reported75: boolean (flags de marcos)
```

---

## Fluxo de Dados

### Fluxo de Inicialização da Aplicação

```
1. Electron Ready Event
        ↓
2. Carregar Ícone e Menu
        ↓
3. Instanciar ApiClient
        ↓
4. Testar Autenticação
        ↓
5. Instanciar TrayManager
        ↓
6. Instanciar Scheduler
        ├→ Chamar getScheduleTimes()
        ├→ scheduleAll() para todos os horários
        └→ Configurar timeouts para próximos gatilhos
        ↓
7. Setup IPC Handlers
        ↓
8. Iniciar Intervalos Periódicos
        ├→ Ping (verificação de conexão)
        ├→ Check Video Updates
        └→ Check Schedule Updates
```

### Fluxo de Reprodução de Vídeo (Trigger)

```
1. Scheduler Trigger ou Manual Action
        ↓
2. showVideoPopup(triggerType)
        ├→ apiClient.getNextVideo()
        │   ├→ Buscar lista de vídeos
        │   ├→ Selecionar aleatoriamente
        │   └→ Retornar dados do vídeo
        │
        ├→ Criar BrowserWindow
        │   ├→ Dimensões: 854x480
        │   ├→ Always on Top: true
        │   ├→ Frame: false
        │   └→ Skip Taskbar: true
        │
        └→ Carregar URL video-popup.html?parameters
                ↓
3. Renderer Process Inicializa
        ├→ Parsear parâmetros da URL
        ├→ Configurar video element
        ├→ Setup event listeners
        └→ Iniciar autoplay
                ↓
4. Eventos de Vídeo Disparados
        ├→ loadedmetadata: Obter duração
        ├→ play: Reportar início
        ├→ timeupdate: Atualizar display, verificar marcos
        ├→ pause: Reportar pausa
        ├→ ended: Reportar conclusão
        └→ error: Reportar erro
                ↓
5. Reportar para API
        └→ reportVideoEvent(eventType, data)
            └→ ipcRenderer.send('report-video-view', data)
                └→ Main process IPC handler
                    └→ apiClient.reportVideoView()
                        └→ POST /videos/report
```

### Fluxo de Reporte de Eventos

**Eventos Rastreados:**
1. `popup_opened` - Janela aberta
2. `video_loaded` - Metadados carregados
3. `autoplay_started` - Reprodução automática iniciada
4. `autoplay_blocked` - Autoplay bloqueado pelo navegador
5. `playback_started` - Primeira reprodução
6. `playback_resumed` - Retomada após pausa
7. `playback_paused` - Pausado
8. `playback_25_percent` - 25% assistido
9. `playback_50_percent` - 50% assistido
10. `playback_75_percent` - 75% assistido
11. `video_completed` - Vídeo concluído
12. `video_interrupted` - Interrompido antes do final
13. `window_closed_after_completion` - Fechado após conclusão
14. `user_closed` - Fechado por usuário
15. `playback_error` - Erro de reprodução

**Dados Enviados com Cada Evento:**
```javascript
{
  video_id: string,
  video_title: string,
  schedule_id: string,
  timestamp: ISO8601,
  event_type: string,
  trigger_type: string,
  playback_position: number (em segundos),
  video_duration: number,
  session_id: string,
  ...additionalData
}
```

---

## Stack Tecnológico

### Frontend
- **Framework:** Electron 27.0.0
- **Linguagem:** JavaScript (ES6+)
- **HTML5:** Video element nativo
- **CSS3:** Styling responsivo
- **IPC:** Electron IPC para comunicação inter-processo

### Backend
- **HTTP Client:** Axios 1.6.0
- **Autenticação:** Header-based (API Key)

### Build & Deploy
- **Electron Builder:** 24.13.3
- **Package Manager:** npm
- **Targets de Build:** macOS (dmg, zip), Windows, Linux

### Desenvolvimento
- **Debug Modes:**
  - `--inspect=5858`: Node.js inspector
  - `--remote-debugging-port=9222`: Chrome DevTools
  
### Ambiente
- **Node.js:** 14+ (recomendado 16+)
- **npm:** 6+

---

## Funcionalidades

### 1. Agendamento Automático de Vídeos
- Sistema de agendamento baseado em horários
- Busca horários da API (com fallback para padrão)
- Triggers diários em múltiplos horários (padrão: 9h, 12h, 15h, 18h)

### 2. Reprodução em Popup
- Janela sempre no topo
- Sem menu/frame
- Dimensões fixas: 854x480px
- Autoplay mutado
- Loop contínuo

### 3. Integração com API
- Autenticação por API Key
- Busca dinâmica de vídeos
- Fallback para vídeo de exemplo
- Reporte de estatísticas

### 4. Bandeja do Sistema
- Ícone na bandeja com menu
- Controle rápido de vídeo
- Verificação manual de atualizações
- Saída fácil da aplicação

### 5. Monitoramento Contínuo
- Verificação periódica de novos vídeos
- Verificação periódica de atualização de horários
- Health checks (ping) para API
- Logging estruturado

### 6. Rastreamento de Visualização
- Eventos de play/pause
- Marcos de progresso (25%, 50%, 75%)
- Detecção de conclusão
- Identificação de interrupções

### 7. Compatibilidade Multiplataforma
- Windows, macOS, Linux
- Ícones específicos por plataforma
- Menu adaptado (macOS vs outros)
- Dock integration (macOS)

---

## APIs e Endpoints

### Base URL
```
http://ginastica.bancomoc.mz/api
(Nota: Este pode ser alterado em config.js)
```

### Autenticação
```javascript
Headers obrigatórios:
{
  'X-API-Key': 'VIDEO_POPUP_SECRET_2025',
  'X-Client-ID': 'ELECTRON_VIDEO_PLAYER',
  'X-Client-Version': '1.0.0'
}
```

### Endpoints

#### 1. GET /scheduled/videos
**Descrição:** Obter lista de vídeos agendados

**Resposta Esperada (Formato 1):**
```json
{
  "videos": [
    {
      "id": "string",
      "video_id": "string",
      "title": "string",
      "video_url": "string/url",
      ...campos extras
    }
  ]
}
```

**Resposta Esperada (Formato 2):**
```json
[
  {
    "id": "string",
    "video_id": "string",
    "title": "string",
    "video_url": "string/url"
  }
]
```

**Resposta Esperada (Formato 3):**
```json
{
  "data": [
    {
      "id": "string",
      "video_id": "string",
      "title": "string",
      "video_url": "string/url"
    }
  ]
}
```

#### 2. GET /schedules/clients
**Descrição:** Obter horários de agendamento para este cliente

**Resposta Esperada:**
```json
{
  "schedules": ["09:00", "12:00", "15:00", "18:00"]
}
ou
["09:00", "12:00", "15:00", "18:00"]
ou
{
  "times": ["09:00", "12:00", "15:00", "18:00"]
}
```

#### 3. POST /videos/report
**Descrição:** Reportar evento de visualização de vídeo

**Corpo da Requisição:**
```json
{
  "video_id": "string",
  "video_title": "string",
  "schedule_id": "string",
  "timestamp": "ISO8601",
  "event_type": "string",
  "trigger_type": "string",
  "playback_position": "number",
  "video_duration": "number",
  "session_id": "string"
}
```

#### 4. GET /ping
**Descrição:** Health check da API

**Resposta:** Status 200 OK

---

## Estrutura de Ficheiros

```
/
├── package.json              # Dependências e scripts npm
├── README.md                # Documentação principal
├── LICENSE                  # MIT License
├── LNX_package.json         # Config específica Linux
├── WIN_package.json         # Config específica Windows
│
├── assets/                  # Recursos estáticos
│   ├── icons/              # Ícones da aplicação
│   │   ├── icon.png        # Ícone geral (PNG)
│   │   ├── icon.ico        # Ícone Windows
│   │   └── icon.icns       # Ícone macOS
│   ├── images/             # Imagens
│   └── styles/             # Estilos globais
│       └── video-popup.css # Estilos alternativos
│
├── docs/                    # Documentação
│   └── documentacao-bancmoc/
│       ├── index.html
│       ├── manuais/         # Manuais detalhados
│       │   ├── ficha-tecnica.html
│       │   ├── manual-api.html
│       │   ├── manual-app-electron.html
│       │   ├── manual-dashboard-web.html
│       │   └── manual-solucao-mista.html
│       └── assets/
│
└── src/                     # Código-fonte
    ├── main.js             # Processo principal Electron
    ├── renderer.js         # Processo renderizador (vazio - usar script.js)
    ├── script.js           # Lógica do player de vídeo
    ├── scheduler.js        # Motor de agendamento
    ├── apiClient.js        # Cliente HTTP
    ├── config.js           # Configuração centralizada
    ├── configManager.js    # Gerenciador de config persistente
    ├── logger.js           # Sistema de logging
    ├── trayManager.js      # Gerenciador de bandeja
    ├── preload.js          # Bridge Electron seguro
    ├── video-popup.html    # UI do player de vídeo
    └── style.css           # Estilos do player
```

---

## Processos de Inicialização

### Inicialização Electron

**Sequência (em main.js):**

1. **Require dos módulos:**
   - Carrega Electron components
   - Carrega módulos customizados
   - Configura logger

2. **Pre-initialization (app.whenReady()):**
   ```javascript
   - Definir APP_DISPLAY_NAME
   - Carregar ícones PNG, ICO, ICNS
   - Chamar setDockIconSafely() (macOS)
   - Chamar setApplicationMenu()
   - Definir app user model ID (Windows)
   ```

3. **Inicialização:**
   ```javascript
   - Instanciar ApiClient
   - Testar autenticação (testAuthentication())
   - Instanciar TrayManager
   - Instanciar Scheduler
   - Configurar handlers IPC
   - Iniciar intervalos periódicos
   ```

4. **Intervalos Periódicos:**
   - Ping à API: 30 segundos
   - Check video updates: 2 minutos
   - Check schedule updates: 2 minutos

### Inicialização Scheduler

1. **Constructor:**
   - Armazena callback onTrigger
   - Armazena referência apiClient
   - Chama init()

2. **init():**
   ```javascript
   - Chamar apiClient.getScheduleTimes()
   - Se sucesso: usar horários retornados
   - Se falha: usar horários padrão
   - Chamar scheduleAll()
   ```

3. **scheduleAll():**
   ```javascript
   - clearAllSchedules() (limpar anteriores)
   - Para cada horário:
     - Validar formato "HH:MM"
     - Chamar scheduleDaily(hours, minutes)
   ```

4. **scheduleDaily(hours, minutes):**
   ```javascript
   - Calcular próxima ocorrência do horário
   - Se já passou hoje → próximo dia
   - Calcular timeout em ms
   - setTimeout(() => { onTrigger(); rescheduleDaily(); })
   - Armazenar timeoutId para cleanup
   ```

---

## Sistema de Logging

### Níveis de Log

| Nível | Valor | Uso |
|-------|-------|-----|
| debug | 10 | Informações detalhadas para desenvolvimento |
| info | 20 | Informações gerais de operação |
| warn | 30 | Avisos sobre situações anormais |
| error | 40 | Erros que afetam funcionalidade |
| none | 100 | Desabilita logging |

### Configuração

**Variáveis de Ambiente:**
```bash
LOG_LEVEL=debug    # ou info, warn, error, none
NODE_ENV=development  # ou production
```

**Padrões:**
- Desenvolvimento: debug
- Produção: warn

### Uso em Código

Cada módulo cria seu próprio logger com escopo:
```javascript
const { createLogger } = require('./logger');
const logger = createLogger('module-name');

logger.debug('Mensagem:', { dados });
logger.info('✅ Sucesso');
logger.warn('⚠️ Aviso');
logger.error('❌ Erro');

// Saída: [module-name] ✅ Sucesso
```

---

## Análise de Código Crítico

### Tratamento de Erros

**getNextVideo() - Fallback em Cascata:**
```javascript
1. Tentar GET /scheduled/videos
2. Se falha → retornar getFallbackVideo()
3. Offline ou erro de rede → usar vídeo local do Google
4. Dados inválidos → skip para fallback
```

**Validação de Horários:**
```javascript
regex: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/
- Hora: 0-23
- Minuto: 0-59
- Tipo: string
```

### Comunicação Inter-processo (IPC)

**Main → Renderer:**
- Via preload.js (seguro)
- Métodos expostos:
  - reportVideoView(data)
  - minimizeWindow()
  - onWindowCloseRequest(handler)
  - getRuntimeInfo()

**Renderer → Main:**
- ipcRenderer.send('report-video-view', data)
- ipcRenderer.send('minimize-window')

**Handler IPC:**
```javascript
ipcMain.on('report-video-view', async (event, videoData) => {
  // Normalizar campos (snake_case vs camelCase)
  // Autenticar
  // Chamar apiClient.reportVideoView()
})
```

### Extração de Dados Flexível

O apiClient é resiliente a variações de API:

```javascript
// Varia entre: video_id, videoId
const videoId = video.video_id || null;

// Varia entre: video_url, url, file_url, url_arquivo
const videoUrl = video.video_url || video.url || video.file_url;

// Varia entre: title, name, filename
const videoTitle = video.title || video.name || video.filename;
```

### Detecção de Progresso de Vídeo

```javascript
// Marcos percentuais individuais
- 25%: window.reported25
- 50%: window.reported50
- 75%: window.reported75

// Resetados após conclusão se em loop
setTimeout(() => { window.reported25 = false; }, 100);
```

### Lifecycle de Janela

```javascript
- showVideoPopup(triggerType)
  - Cria BrowserWindow
  - window.on('ready-to-show') → mostrar
  - window.on('closed') → limpar referência

- toggleVideoWindow()
  - Se existe → minimizar/focar
  - Se não existe → criar

- minimizeVideoWindow()
  - Se mininizada → restaurar
  - Se visível → minimizar
  - window.webContents.send('window-close-request')
```

---

## Fluxo de Eventos

### Timeline de um Vídeo Agendado

```
09:00 (Horário Programado)
  ↓
scheduler.scheduleDaily() trigger
  ↓
showVideoPopup('scheduled')
  ↓
apiClient.getNextVideo()
  ├→ GET /scheduled/videos
  ├→ Selecionar aleatório
  └→ Retornar metadados
  ↓
BrowserWindow criada
  ├→ 854x480
  ├→ Sem frame/taskbar
  └→ Always on top
  ↓
Carregar video-popup.html?parameters
  ↓
script.js: Parsear parâmetros
  ↓
Configurar <video> element
  ├→ src = videoUrl
  ├→ autoplay = true
  ├→ muted = true
  └→ loop = true
  ↓
Evento: loadedmetadata
  ├→ Obter videoDuration
  └→ reportVideoEvent('video_loaded')
  ↓
Evento: play
  └→ reportVideoEvent('playback_started')
  ↓
Eventos: timeupdate
  ├→ Atualizar display (00:15 / 03:45)
  ├→ Verificar marcos (25%, 50%, 75%)
  └→ Reportar eventos de marco
  ↓
Evento: ended (se não loop) ou evento: ended + loop reinicia
  └→ reportVideoEvent('video_completed')
  ↓
Usuário clica fechar (×)
  ├→ reportVideoEvent(tipo específico)
  ├→ window.destroy()
  └→ Próximo trigger em 03:00 (15:00)
```

### Events de API

```
ApiClient.constructor()
  ↓ (periodicamente)
checkVideoUpdates()
  ├→ GET /scheduled/videos
  ├→ Comparar contagem
  └→ Retornar { hasUpdates, count, newVideos }
  ↓
checkScheduleUpdates()
  ├→ GET /schedules/clients
  ├→ Comparar horários
  └→ Se mudou → scheduler.updateScheduleTimes()
  ↓
apiClient.ping()
  └→ GET /ping (health check)
```

---

## Considerações de Segurança

### Autenticação
- API Key em header (não ideal para produção)
- Considerar OAuth 2.0 ou tokens JWT
- Cliente ID para identificação

### IPC Security
- Uso de contextBridge (seguro)
- Sem acesso direto ao Node.js
- Validação de dados recebidos

### CORS
- Requisições podem ser bloqueadas se API não permitir origin de ficheiro://
- Considerar Electron's webSecurity ou proxy

### Vídeos
- Validação de URLs (HTTPS recomendado)
- Tratamento de erros de carregamento
- Fallback para vídeo local

---

## Pontos de Extensão / Melhorias Potenciais

1. **Autenticação Avançada**
   - Implementar OAuth 2.0
   - Refresh tokens
   - Multi-factor authentication

2. **Análise Avançada**
   - Heatmaps de tempo de parada
   - Análise de queda de viewers
   - Relatórios customizados

3. **Funcionalidades de UI**
   - Controles de volume
   - Fullscreen
   - Legendas
   - Qualidade adaptativa

4. **Offline Mode**
   - Cache de vídeos
   - Agendamento offline
   - Sincronização ao conectar

5. **Notificações**
   - Push notifications
   - Notificações de novo conteúdo
   - Alertas de erro

6. **Integração**
   - Analytics (Google Analytics, Mixpanel)
   - CRM integration
   - Dashboard remoto

---

## Resumo Técnico para Implementação

### Quando Iniciar a Aplicação
```bash
npm install
npm start          # Modo desenvolvimento
npm run dev        # Com debugging
npm run debug      # Com remote debugging
```

### Build para Distribuição
```bash
npm run dist       # macOS padrão
npm run dist:mac   # macOS explícito
npm run dist:win   # Windows (se configurado)
```

### Verificar Logs
- Console: DevTools (Ctrl+Shift+I)
- Main process: Terminal onde npm start foi executado
- Arquivo: Potencialmente em userData/logs/

### Configuração de Produção
1. Alterar API.BASE_URL em src/config.js
2. Ajustar LOG_LEVEL para "warn"
3. Verificar credenciais API e endpoints
4. Testar fallback de vídeos
5. Copiar ícones para assets/icons/

---

## Conclusão

O **Banco Moc Popup Video** é uma aplicação desktop robusta e bem-estruturada que implementa um sistema de distribuição de vídeo agendado. Sua arquitetura modular permite fácil manutenção, extensão e debugging. A forte integração com uma API backend fornece flexibilidade na gestão de conteúdo e recolha de analytics.

A aplicação utiliza práticas modernas de desenvolvimento Electron, inclui tratamento robusto de erros, logging estruturado e comunicação segura entre processos.
