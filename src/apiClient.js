const axios = require("axios");
const os = require("os");
const fs = require("fs");
const path = require("path");
const { app } = require("electron");
const config = require("./config");
const { createLogger } = require("./logger");
const logger = createLogger("api-client");

class ApiClient {
  constructor() {
    this.lastVideoUpdate = null;
    this.lastScheduleUpdate = null;
    this.currentVideoId = null;
    this.currentScheduleId = null;
    this.currentVideoTitle = null;
    this.currentVideoUrl = null;
    this.sessionId = this.generateSessionId();
    this.isAuthenticated = false;
    this.videosCount = 0;
    this.popupSettingsCache = null;
    this.popupSettingsFetchedAt = 0;
    this.popupSettingsCachePath = path.join(app.getPath('userData'), 'popup-settings.json');
    this.clientTokenCachePath = path.join(app.getPath('userData'), 'client-token.json');
    this.clientToken = this.loadClientToken();

    axios.interceptors.response.use(
      (response) => {
        this.captureClientToken(response);
        return response;
      },
      (error) => {
        if (error && error.response) {
          this.captureClientToken(error.response);
        }
        return Promise.reject(error);
      }
    );
    
    logger.info("🔧 ApiClient inicializado");
  }

  async testAuthentication() {
    try {
      logger.info("🔑 Testando autenticação...");
      const nextEndpoint = config.API.ENDPOINTS.NEXT_VIDEO || config.API.ENDPOINTS.VIDEOS;
      const response = await axios.get(
        config.API.BASE_URL + nextEndpoint,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT,
        }
      );

      if (response.data) {
        this.isAuthenticated = true;
        logger.info("✅ Autenticação bem-sucedida");
        return true;
      }
    } catch (error) {
      this.isAuthenticated = false;
      logger.error("❌ Falha na autenticação:", error.message);
    }

    return false;
  }

  async getNextVideo() {
    try {
      logger.info("🎬 Obtendo próximo vídeo...");
      let response = null;
      const nextEndpoint = config.API.ENDPOINTS.NEXT_VIDEO || config.API.ENDPOINTS.VIDEOS;
      try {
        response = await axios.get(
          config.API.BASE_URL + nextEndpoint,
          {
            headers: this.getAuthHeaders(),
            timeout: config.API.TIMEOUT,
          }
        );
      } catch (error) {
        logger.warn("⚠️ Falha ao obter next_video, tentando lista completa:", error.message);
        response = await axios.get(
          config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
          {
            headers: this.getAuthHeaders(),
            timeout: config.API.TIMEOUT,
          }
        );
      }

      let video = null;
      let videos = [];

      if (response.data && response.data.next_video) {
        video = response.data.next_video;
        logger.info("✅ Vídeo selecionado pelo backend (next_video)");
      } else if (response.data && response.data.videos && Array.isArray(response.data.videos)) {
        videos = response.data.videos;
        logger.info(`📊 Formato 1: ${videos.length} vídeos encontrados`);
      } else if (Array.isArray(response.data)) {
        videos = response.data;
        logger.info(`📊 Formato 2: ${videos.length} vídeos encontrados`);
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        videos = response.data.data;
        logger.info(`📊 Formato 3: ${videos.length} vídeos encontrados`);
      }

      if (!video) {
        if (videos.length === 0) {
          logger.warn("⚠️ Nenhum vídeo disponível, usando fallback");
          const popupSettings = await this.getDashboardPopupSettings();
          return this.getFallbackVideo(popupSettings);
        }
        video = videos[0];
        logger.info("✅ Vídeo selecionado pela ordem do backend (primeiro da lista)");
      }

      logger.info("🔍 Estrutura do vídeo:", JSON.stringify(video, null, 2));

      // Extrair dados do vídeo com base na estrutura esperada
      // IMPORTANTE: Ajuste estas linhas conforme a estrutura real da sua API
      const scheduleId = video.id || `schedule_${Date.now()}`;
      const videoId = video.video_id || null;
      const videoTitle = video.title || video.name || video.filename || "Vídeo";
      const videoUrl = video.video_url || video.url || video.file_url || video.url_arquivo;
      const subtitleUrl = video.subtitle_url || null;
      let subtitles = video.subtitles || video.subtitle_tracks || [];
      if (!Array.isArray(subtitles)) {
        subtitles = [];
      }
      if (subtitleUrl && subtitles.length === 0) {
        subtitles = [{ label: "Legenda", url: subtitleUrl }];
      }
      
      // Extrair configurações da janela (posição e tamanho)
      const windowConfig = video.window_config || video.display_config || video.ui_config || {};
      const position = windowConfig.position || windowConfig.pos || {};
      const size = windowConfig.size || windowConfig.dimensions || {};
      
      const windowSettings = {
        x: position.x !== undefined ? position.x : null,
        y: position.y !== undefined ? position.y : null,
        width: size.width !== undefined ? size.width : null,
        height: size.height !== undefined ? size.height : null,
        position: position.anchor || position.placement || null, // 'bottom-right', 'center', etc.
        gravity: position.gravity || null // 'south-east', 'center', etc.
      };

      const dashboardPopup = await this.getDashboardPopupSettings();
      if (dashboardPopup) {
        if (windowSettings.width === null && dashboardPopup.width) {
          windowSettings.width = dashboardPopup.width;
        }
        if (windowSettings.height === null && dashboardPopup.height) {
          windowSettings.height = dashboardPopup.height;
        }
        if (!windowSettings.position && dashboardPopup.position) {
          windowSettings.position = dashboardPopup.position;
        }
      }

      // Armazenar dados atuais
      this.currentVideoId = videoId;
      this.currentScheduleId = scheduleId;
      this.currentVideoTitle = videoTitle;
      this.currentVideoUrl = videoUrl;

      logger.info("✅ Vídeo selecionado:", {
        id: this.currentVideoId,
        title: this.currentVideoTitle,
        url: this.currentVideoUrl ? this.currentVideoUrl.substring(0, 50) + "..." : "null",
        windowSettings: windowSettings
      });

      return {
        url: videoUrl,
        title: videoTitle,
        id: scheduleId,
        videoId: videoId,
        scheduleId: scheduleId,
        windowSettings: windowSettings,
        subtitles: subtitles,
        videoData: video // Dados completos para referência
      };

    } catch (error) {
      logger.error("❌ Erro ao obter vídeo:", error.message);
      const popupSettings = await this.getDashboardPopupSettings();
      return this.getFallbackVideo(popupSettings);
    }
  }

  async checkVideoUpdates() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT,
        }
      );

      const videos = this.extractVideosFromResponse(response.data);
      const currentCount = videos.length;

      if (this.videosCount === 0) {
        this.videosCount = currentCount;
        this.lastVideoUpdate = new Date();
        return {
          hasUpdates: false,
          count: currentCount,
          newVideos: 0
        };
      }

      const hasNewVideos = currentCount > this.videosCount;
      const newVideosCount = hasNewVideos ? currentCount - this.videosCount : 0;

      if (hasNewVideos) {
        this.videosCount = currentCount;
        this.lastVideoUpdate = new Date();
      }

      return {
        hasUpdates: hasNewVideos,
        count: currentCount,
        newVideos: newVideosCount
      };

    } catch (error) {
      logger.error("❌ Erro ao verificar atualizações:", error.message);
      return { hasUpdates: false, count: 0, newVideos: 0 };
    }
  }

  async getScheduleTimes() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.SCHEDULE,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT,
        }
      );

      const scheduleTimes = this.extractScheduleTimesFromResponse(response.data);

      const formattedTimes = scheduleTimes
        .filter((time) => typeof time === "string")
        .map((time) => this.formatTimeToHHMM(time))
        .filter((time) => time !== null);

      if (formattedTimes.length > 0) {
        logger.info("⏰ Horários obtidos:", formattedTimes);
        return formattedTimes;
      }

      logger.info("⏰ Usando horários padrão");
      return config.APP.DEFAULT_SCHEDULE;

    } catch (error) {
      logger.error("❌ Erro ao obter horários:", error.message);
      return config.APP.DEFAULT_SCHEDULE;
    }
  }

  async checkScheduleUpdates() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.SCHEDULE,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT,
        }
      );

      const scheduleTimes = this.extractScheduleTimesFromResponse(response.data);
      const formattedTimes = scheduleTimes
        .filter((time) => typeof time === "string")
        .map((time) => this.formatTimeToHHMM(time))
        .filter((time) => time !== null);

      const currentSchedule = JSON.stringify(config.APP.DEFAULT_SCHEDULE);
      const newSchedule = JSON.stringify(formattedTimes);

      return newSchedule !== currentSchedule && formattedTimes.length > 0;

    } catch (error) {
      logger.error("❌ Erro ao verificar horários:", error.message);
      return false;
    }
  }

  async reportVideoView(videoData = {}) {
    try {
      // Usar dados do vídeo atual se não fornecidos
      const rawVideoId = videoData.video_id || videoData.videoId || this.currentVideoId || null;
      const videoId = this.normalizeVideoId(rawVideoId);
      const videoTitle = videoData.video_title || videoData.videoTitle || this.currentVideoTitle || 'Vídeo';

      const reportData = {
        video_id: videoId,
        video_title: videoTitle,
        timestamp: videoData.timestamp || new Date().toISOString(),
        event_type: videoData.event_type || "popup_opened",
        playback_position: videoData.playback_position || 0,
        playback_duration: videoData.playback_duration || 0,
        video_duration: videoData.video_duration || 0,
        device_info: {
          user_agent: "BM Video Player",
          platform: process.platform,
          app_version: config.APP.VERSION,
        },
        trigger_type: videoData.trigger_type || "scheduled",
        session_id: videoData.session_id || this.sessionId,
        completion_status: videoData.completion_status || "unknown",
        interruption_reason: videoData.interruption_reason || null,
        completed_loop: videoData.completed_loop || false,
      };

      logger.info("📤 Enviando report para API:", {
        endpoint: config.API.BASE_URL + config.API.ENDPOINTS.REPORT,
        event: reportData.event_type,
        video_id: reportData.video_id,
        video_title: reportData.video_title
      });

      const response = await axios.post(
        config.API.BASE_URL + config.API.ENDPOINTS.REPORT,
        reportData,
        {
          headers: this.getAuthHeaders(),
          timeout: 5000,
        }
      );

      logger.info("✅ Report enviado com sucesso:", {
        event: reportData.event_type,
        status: response.status
      });
      
      return true;

    } catch (error) {
      logger.error("❌ Erro ao enviar report:", {
        message: error.message,
        status: error.response?.status,
        code: error.code || null,
      });
      return false;
    }
  }

  async ping(eventType = "heartbeat") {
    const username = this.getOsUsername();
    const payload = {
      client_id: this.getClientId(),
      hostname: os.hostname(),
      app_version: config.APP.VERSION,
      platform: process.platform,
      event_type: eventType
    };
    if (username) {
      payload.username = username;
    }

    for (let attempt = 1; attempt <= config.API.RETRY_ATTEMPTS; attempt++) {
      try {
        const response = await axios.post(
          config.API.BASE_URL + config.API.ENDPOINTS.PING,
          payload,
          {
            headers: this.getAuthHeaders(),
            timeout: config.API.TIMEOUT,
          }
        );

        return response.status >= 200 && response.status < 300;
      } catch (error) {
        logger.error("❌ Erro no ping:", {
          message: error.message,
          status: error.response?.status,
          attempt
        });
      }
    }

    return false;
  }

  getAuthHeaders() {
    const username = this.getOsUsername();
    const headers = {
      "X-API-Key": config.API.AUTH.API_KEY,
      "X-Client-ID": this.getClientId(),
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
    if (this.clientToken) {
      headers["X-Client-Token"] = this.clientToken;
    }
    if (username) {
      headers["X-User"] = username;
    }
    return headers;
  }

  getClientId() {
    const configured = config.API.AUTH.CLIENT_ID;
    if (configured && configured !== "AUTO") {
      return configured;
    }
    return os.hostname();
  }

  getOsUsername() {
    try {
      return os.userInfo().username;
    } catch (error) {
      return null;
    }
  }

  loadClientToken() {
    try {
      if (fs.existsSync(this.clientTokenCachePath)) {
        const raw = fs.readFileSync(this.clientTokenCachePath, "utf-8");
        const data = JSON.parse(raw);
        if (data && data.token) {
          return data.token;
        }
      }
    } catch (error) {
      logger.warn("⚠️ Falha ao ler client token:", error.message);
    }
    return null;
  }

  saveClientToken(token) {
    try {
      fs.writeFileSync(this.clientTokenCachePath, JSON.stringify({ token }, null, 2));
    } catch (error) {
      logger.warn("⚠️ Falha ao salvar client token:", error.message);
    }
  }

  captureClientToken(response) {
    const headerToken = response?.headers?.["x-client-token"];
    if (headerToken && headerToken !== this.clientToken) {
      this.clientToken = headerToken;
      this.saveClientToken(headerToken);
      logger.info("🔐 Client token atualizado");
    }
  }

  extractVideosFromResponse(data) {
    if (data && data.videos && Array.isArray(data.videos)) {
      return data.videos;
    } else if (Array.isArray(data)) {
      return data;
    } else if (data && data.data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  }

  extractScheduleTimesFromResponse(data) {
    if (Array.isArray(data)) {
      return data;
    } else if (data && Array.isArray(data.schedule_times)) {
      return data.schedule_times;
    } else if (data && Array.isArray(data.times)) {
      return data.times;
    } else if (data && Array.isArray(data.data)) {
      return data.data;
    }
    return [];
  }

  formatTimeToHHMM(timeString) {
    if (typeof timeString !== "string") return null;

    const cleanTime = timeString.trim();

    if (cleanTime.includes(":")) {
      const parts = cleanTime.split(":");
      if (parts.length >= 2) {
        const hours = parts[0].padStart(2, "0");
        const minutes = parts[1].padStart(2, "0");
        return `${hours}:${minutes}`;
      }
    }

    // Tentar interpretar como "HHMM"
    if (/^\d{3,4}$/.test(cleanTime)) {
      const time = cleanTime.padStart(4, "0");
      const hours = time.substring(0, 2);
      const minutes = time.substring(2, 4);
      return `${hours}:${minutes}`;
    }

    return null;
  }

  normalizeVideoId(value) {
    if (value === null || value === undefined || value === '') return null;
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    return Number.isInteger(num) ? num : Math.floor(num);
  }

  getFallbackVideo(popupSettings = null) {
    logger.info("🔄 Usando vídeo de fallback");
    
    this.currentVideoId = "fallback_bunny_001";
    this.currentVideoTitle = "Big Buck Bunny (Fallback)";
    this.currentVideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

    // Configurações padrão para fallback (canto inferior direito)
    const defaultWindowSettings = {
      x: null, // Será calculado dinamicamente
      y: null, // Será calculado dinamicamente
      width: null, // Usará padrão da config
      height: null, // Usará padrão da config
      position: 'bottom-right',
      gravity: 'south-east'
    };

    if (popupSettings) {
      defaultWindowSettings.width = popupSettings.width || null;
      defaultWindowSettings.height = popupSettings.height || null;
      defaultWindowSettings.position = popupSettings.position || defaultWindowSettings.position;
    }

    return {
      url: this.currentVideoUrl,
      title: this.currentVideoTitle,
      id: this.currentVideoId,
      scheduleId: null,
      windowSettings: defaultWindowSettings,
      videoData: {
        video_id: this.currentVideoId,
        title: this.currentVideoTitle,
        video_url: this.currentVideoUrl
      }
    };
  }

  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  async getDashboardPopupSettings() {
    try {
      const now = Date.now();
      if (this.popupSettingsCache && (now - this.popupSettingsFetchedAt) < 300000) {
        return this.popupSettingsCache;
      }

      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.DASHBOARD,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      const popup = response.data?.popupSettings || response.data?.popup_settings || null;
      if (!popup) {
        return null;
      }

      const normalized = this.normalizePopupSettings(popup);
      this.popupSettingsCache = normalized;
      this.popupSettingsFetchedAt = now;
      this.savePopupSettingsCache(normalized);
      return normalized;
    } catch (error) {
      logger.warn("⚠️ Não foi possível obter popupSettings do dashboard:", error.message);
      const cached = this.loadPopupSettingsCache();
      if (cached) {
        logger.info("📦 Usando popupSettings em cache local");
        return cached;
      }
      return null;
    }
  }

  normalizePopupSettings(popup) {
    const width = popup.popup_width || popup.width || null;
    const height = popup.popup_height || popup.height || null;
    const rawPosition = popup.popup_position || popup.position || null;
    return {
      width: width ? Number(width) : null,
      height: height ? Number(height) : null,
      position: rawPosition ? String(rawPosition).toLowerCase().replace(/_/g, "-") : null
    };
  }

  savePopupSettingsCache(settings) {
    try {
      fs.writeFileSync(this.popupSettingsCachePath, JSON.stringify(settings, null, 2), "utf8");
    } catch (error) {
      logger.warn("⚠️ Falha ao gravar cache de popupSettings:", error.message);
    }
  }

  loadPopupSettingsCache() {
    try {
      if (!fs.existsSync(this.popupSettingsCachePath)) {
        return null;
      }
      const raw = fs.readFileSync(this.popupSettingsCachePath, "utf8");
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  }

  async checkApiHealth() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + "/health",
        { timeout: config.API.TIMEOUT }
      );
      logger.info("🩺 API Health:", response.data || {});
      return response.data;
    } catch (error) {
      logger.warn("⚠️ API Health indisponível:", error.message);
      return null;
    }
  }
}

module.exports = ApiClient;
