# 📋 Endpoints da Aplicação - Banco Moc Popup Video

## 🔗 API Principal

### Base URL
```
Desenvolvimento: http://127.0.0.1:8000/api
Produção: http://127.0.0.1:8000/api
```

### Headers de Autenticação
```
X-API-Key: VIDEO_POPUP_SECRET_2025
X-Client-ID: ELECTRON_VIDEO_PLAYER
Content-Type: application/json
Accept: application/json
```

---

## 📺 **1. GET /api/scheduled/videos**

**Finalidade**: Obter lista de vídeos agendados

**Método**: `GET`

**Headers**: Headers de autenticação

**Respostas Esperadas**:

### Formato 1 (Padrão)
```json
{
  "videos": [
    {
      "id": 4,
      "title": "Primeiro Agendamento",
      "video_id": 11,
      "video_url": "http://127.0.0.1:8000/storage/videos/1773466193_intro-ginastica-laboral.mp4",
      "time": "10:31:00",
      "days": ["ter", "qua", "qui", "sex", "sab", "seg"],
      "monitor": "Todos",
      "active": true,
      "duration": "1:27",
      "created_at": "2026-03-10T08:22:22.000000Z",
      "updated_at": "2026-03-14T05:32:32.000000Z",
      "window_config": {
        "position": {"x": 100, "y": 200},
        "size": {"width": 854, "height": 480},
        "gravity": "south-east"
      }
    }
  ]
}
```

### Formato 2 (Array Direto)
```json
[
  {
    "id": 4,
    "title": "Primeiro Agendamento",
    "video_id": 11,
    "video_url": "http://127.0.0.1:8000/storage/videos/video.mp4"
  }
]
```

### Formato 3 (Data Wrapper)
```json
{
  "data": [
    {
      "id": 4,
      "title": "Primeiro Agendamento"
    }
  ]
}
```

**Campos Suportados**:
- `id`: ID do agendamento
- `video_id`: ID do vídeo
- `title`: Título do vídeo
- `video_url`, `url`, `file_url`, `url_arquivo`: URL do vídeo
- `window_config`, `display_config`, `ui_config`: Configurações da janela

---

## ⏰ **2. GET /api/schedules/clients**

**Finalidade**: Obter horários de agendamento

**Método**: `GET`

**Headers**: Headers de autenticação

**Respostas Esperadas**:

### Formato 1 (Array Direto)
```json
["10:31", "14:00", "18:00"]
```

### Formato 2 (Schedule Times)
```json
{
  "schedule_times": ["10:31", "14:00", "18:00"]
}
```

### Formato 3 (Times)
```json
{
  "times": ["10:31", "14:00", "18:00"]
}
```

### Formato 4 (Data Wrapper)
```json
{
  "data": ["10:31", "14:00", "18:00"]
}
```

---

## 📊 **3. POST /api/videos/report**

**Finalidade**: Enviar relatórios de eventos do player

**Método**: `POST`

**Headers**: Headers de autenticação

**Corpo da Requisição**:
```json
{
  "video_id": 11,
  "video_title": "Primeiro Agendamento",
  "timestamp": "2026-03-14T09:56:00.000Z",
  "event_type": "popup_opened",
  "playback_position": 45.67,
  "playback_duration": 120000,
  "video_duration": 87.45,
  "device_info": {
    "user_agent": "BM Video Player",
    "platform": "darwin",
    "app_version": "1.0.0"
  },
  "trigger_type": "scheduled",
  "session_id": "session_1647268567_abc123",
  "completion_status": "unknown",
  "interruption_reason": null,
  "completed_loop": false
}
```

**Tipos de Evento**:
- `popup_opened`
- `window_loaded`
- `video_loaded`
- `playback_started`
- `playback_resumed`
- `playback_paused`
- `playback_25_percent`
- `playback_50_percent`
- `playback_75_percent`
- `video_completed`
- `video_interrupted`
- `user_closed`
- `autoplay_blocked`

---

## 💓 **4. POST /api/ping**

**Finalidade**: Heartbeat e verificação de conectividade

**Método**: `POST`

**Headers**: Headers de autenticação

**Corpo da Requisição**:
```json
{
  "client_id": "ELECTRON_VIDEO_PLAYER",
  "app_version": "1.0.0",
  "platform": "darwin",
  "event_type": "heartbeat"
}
```

---

## 📝 **5. GET * (Legendas)**

**Finalidade**: Download de arquivos de legenda SRT

**Método**: `GET`

**Headers**:
```
User-Agent: BancoMoc-VideoPlayer/1.0
```

**URL**: Dinâmica (fornecida pelo usuário)

**Resposta**: Conteúdo do arquivo SRT

**Exemplo de URL**: `https://example.com/legendas/video1.srt`

---

## 📁 **6. GET file://* (Legendas Locais)**

**Finalidade**: Carregar legendas do sistema de arquivos

**Método**: `GET`

**URL**: `file://caminho/completo/do/arquivo.srt`

**Resposta**: Conteúdo do arquivo SRT

---

## 🔄 **Fallbacks**

### Vídeo Fallback
```
URL: https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4
ID: fallback_bunny_001
Título: Big Buck Bunny (Fallback)
```

### Horários Fallback
```json
["09:00", "12:00", "15:00", "18:00"]
```

---

## 🔧 **Configurações da Aplicação**

### API
```javascript
API: {
  BASE_URL: 'http://127.0.0.1:8000/api',
  TIMEOUT: 10000,
  RETRY_ATTEMPTS: 2
}
```

### Autenticação
```javascript
AUTH: {
  API_KEY: 'VIDEO_POPUP_SECRET_2025',
  CLIENT_ID: 'ELECTRON_VIDEO_PLAYER',
  VERSION: '1.0.0'
}
```

### Aplicação
```javascript
APP: {
  NAME: 'Banco Moc Popup Video',
  VERSION: '1.0.0',
  AUTO_START: true,
  VIDEO_LOOP: false,
  DEFAULT_SCHEDULE: ['09:00', '12:00', '15:00', '18:00']
}
```

### Janela
```javascript
WINDOW: {
  WIDTH: 854,
  HEIGHT: 480,
  ALWAYS_ON_TOP: true,
  FRAME: false,
  SKIP_TASKBAR: true
}
```

---

## 📈 **Fluxo de Uso**

1. **Inicialização**: 
   - `testAuthentication()` → `/api/scheduled/videos`
   - `getScheduleTimes()` → `/api/schedules/clients`

2. **Reprodução de Vídeo**:
   - `getNextVideo()` → `/api/scheduled/videos`
   - `reportVideoView()` → `/api/videos/report` (múltiplos eventos)

3. **Verificações**:
   - `checkVideoUpdates()` → `/api/scheduled/videos`
   - `checkScheduleUpdates()` → `/api/schedules/clients`

4. **Heartbeat**:
   - `ping()` → `/api/ping`

5. **Legendas**:
   - Download via URL ou carregamento local

---

## 🎯 **Observações Importantes**

- **Timeout**: 10 segundos para requisições
- **Retry**: 2 tentativas em caso de falha
- **Autenticação**: Todas as requisições exigem headers
- **Flexibilidade**: Múltiplos formatos de resposta suportados
- **Fallback**: Vídeos e horários padrão se API falhar
- **Sessão**: Cada execução gera um session_id único
- **Eventos**: Todos os eventos do player são reportados
