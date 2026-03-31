module.exports = {
  API: {
    // BASE_URL: 'https://ginastica.bancomoc.mz/api', // produção
    BASE_URL: 'https://client.fernandozucula.com/api', // teste produção
    // BASE_URL: 'http://127.0.0.1:8000/api',
    ENDPOINTS: {
      VIDEOS: '/scheduled/videos',
      NEXT_VIDEO: '/scheduled/videos/next',
      SCHEDULE: '/schedules/clients',
      REPORT: '/videos/report',
      PING: '/ping',
      DASHBOARD: '/dashboard'
    },
    AUTH: {
      API_KEY: 'VIDEO_POPUP_SECRET_2025',
      CLIENT_ID: 'AUTO',
      VERSION: '1.0.0'
    },
    TIMEOUT: 10000,
    RETRY_ATTEMPTS: 2
  },
  
  APP: {
    NAME: 'Banco Moc Popup Video',
    VERSION: '1.0.0',
    AUTO_START: true,
    VIDEO_LOOP: false, // Desabilitado por padrão - controlado pelo player
    DEFAULT_SCHEDULE: ['09:00', '12:00', '15:00']
  },
  
  WINDOW: {
    WIDTH: 420,
    HEIGHT: 380,
    ALWAYS_ON_TOP: true,
    FRAME: false,
    SKIP_TASKBAR: true
  }
};