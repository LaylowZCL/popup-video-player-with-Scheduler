module.exports = {
  API: {
    BASE_URL: 'http://127.0.0.1:8000/api',
    ENDPOINTS: {
      VIDEOS: '/scheduled/videos',       // Obtém vídeos agendados
      SCHEDULE: '/schedules/clients',      // Obtém horários
      REPORT: '/videos/report'            // Envia relatórios
    },
    AUTH: {
      API_KEY: 'VIDEO_POPUP_SECRET_2025',
      CLIENT_ID: 'ELECTRON_VIDEO_PLAYER',
      VERSION: '1.0.0'
    },
    TIMEOUT: 10000,
    RETRY_ATTEMPTS: 2
  },
  
  APP: {
    NAME: 'Video Popup Scheduler',
    VERSION: '1.0.0',
    AUTO_START: true,
    VIDEO_LOOP: true,
    DEFAULT_SCHEDULE: ['09:00', '12:00', '15:00', '18:00'],
    
    // INTERVALOS DE VERIFICAÇÃO (em milissegundos)
    CHECK_INTERVALS: {
      SCHEDULE: 600 * 1000,    // 10 segundos
      VIDEOS: 600 * 1000   // 5 minutos
    }
  },
  
  WINDOW: {
    WIDTH: 854,
    HEIGHT: 480,
    ALWAYS_ON_TOP: true,
    FRAME: false,
    SKIP_TASKBAR: true
  }
};