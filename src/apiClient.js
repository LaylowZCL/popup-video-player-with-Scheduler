const axios = require("axios");
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
    
    logger.info("🔧 ApiClient inicializado");
  }

  async testAuthentication() {
    try {
      logger.info("🔑 Testando autenticação...");
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
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
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT,
        }
      );

      let videos = [];

      // Tentar diferentes formatos de resposta
      if (response.data && response.data.videos && Array.isArray(response.data.videos)) {
        videos = response.data.videos;
        logger.info(`📊 Formato 1: ${videos.length} vídeos encontrados`);
      } else if (Array.isArray(response.data)) {
        videos = response.data;
        logger.info(`📊 Formato 2: ${videos.length} vídeos encontrados`);
      } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
        videos = response.data.data;
        logger.info(`📊 Formato 3: ${videos.length} vídeos encontrados`);
      }

      if (videos.length === 0) {
        logger.warn("⚠️ Nenhum vídeo disponível, usando fallback");
        return this.getFallbackVideo();
      }

      // Log da estrutura do primeiro vídeo para debug
      logger.info("🔍 Estrutura do primeiro vídeo:", JSON.stringify(videos[0], null, 2));

      // Selecionar vídeo aleatório
      const randomIndex = Math.floor(Math.random() * videos.length);
      const video = videos[randomIndex];

      // Extrair dados do vídeo com base na estrutura esperada
      // IMPORTANTE: Ajuste estas linhas conforme a estrutura real da sua API
      const scheduleId = video.id || `schedule_${Date.now()}`;
      const videoId = video.video_id || null;
      const videoTitle = video.title || video.name || video.filename || "Vídeo";
      const videoUrl = video.video_url || video.url || video.file_url || video.url_arquivo;

      // Armazenar dados atuais
      this.currentVideoId = videoId;
      this.currentScheduleId = scheduleId;
      this.currentVideoTitle = videoTitle;
      this.currentVideoUrl = videoUrl;

      logger.info("✅ Vídeo selecionado:", {
        id: this.currentVideoId,
        title: this.currentVideoTitle,
        url: this.currentVideoUrl ? this.currentVideoUrl.substring(0, 50) + "..." : "null"
      });

      return {
        url: videoUrl,
        title: videoTitle,
        id: scheduleId,
        videoId: videoId,
        scheduleId: scheduleId,
        videoData: video // Dados completos para referência
      };

    } catch (error) {
      logger.error("❌ Erro ao obter vídeo:", error.message);
      return this.getFallbackVideo();
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
    try {
      const payload = {
        client_id: config.API.AUTH.CLIENT_ID,
        app_version: config.APP.VERSION,
        platform: process.platform,
        event_type: eventType
      };

      const response = await axios.post(
        config.API.BASE_URL + config.API.ENDPOINTS.PING,
        payload,
        {
          headers: this.getAuthHeaders(),
          timeout: 5000,
        }
      );

      return response.status >= 200 && response.status < 300;
    } catch (error) {
      logger.error("❌ Erro no ping:", {
        message: error.message,
        status: error.response?.status
      });
      return false;
    }
  }

  getAuthHeaders() {
    return {
      "X-API-Key": config.API.AUTH.API_KEY,
      "X-Client-ID": config.API.AUTH.CLIENT_ID,
      "Content-Type": "application/json",
      "Accept": "application/json"
    };
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

  getFallbackVideo() {
    logger.info("🔄 Usando vídeo de fallback");
    
    this.currentVideoId = "fallback_bunny_001";
    this.currentVideoTitle = "Big Buck Bunny (Fallback)";
    this.currentVideoUrl = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

    return {
      url: this.currentVideoUrl,
      title: this.currentVideoTitle,
      id: this.currentVideoId,
      scheduleId: null,
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
}

module.exports = ApiClient;
