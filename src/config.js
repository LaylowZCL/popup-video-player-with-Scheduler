module.exports = {
  API: {
    // BASE_URL: "http://127.0.0.1:8000/api", // OBRIGATORIO: alterar para https://dominiodaapi.com/api antes de compilar para producao.
    BASE_URL: 'http://127.0.0.1:8000/api',
    ENDPOINTS: {
      VIDEOS: '/scheduled/videos',
      SCHEDULE: '/schedules/clients',
      REPORT: '/videos/report',
      PING: '/ping'
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
    NAME: 'Banco Moc Popup Video',
    VERSION: '1.0.0',
    AUTO_START: true,
    VIDEO_LOOP: true,
    DEFAULT_SCHEDULE: ['09:00', '12:00', '15:00', '18:00']
  },
  
  WINDOW: {
    WIDTH: 854,
    HEIGHT: 480,
    ALWAYS_ON_TOP: true,
    FRAME: false,
    SKIP_TASKBAR: true
  }
};
