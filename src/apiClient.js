const axios = require('axios');
const config = require('./config');

class ApiClient {
  constructor() {
    this.lastVideoUpdate = null;    // Última atualização de vídeos
    this.lastScheduleUpdate = null; // Última atualização de horários
    this.currentVideoId = null;
    this.sessionId = this.generateSessionId();
    this.isAuthenticated = false;
    this.videosCount = 0;           // Contador atual de vídeos

    console.log('🌐 API Base URL:', config.API.BASE_URL);
  }

  // ========== AUTENTICAÇÃO ==========
  async testAuthentication() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      if (response.data) {
        this.isAuthenticated = true;
        console.log('✅ Autenticação OK');
        return true;
      }
    } catch (error) {
      this.isAuthenticated = false;
      console.error('❌ Erro de autenticação:', error.message);
    }

    return false;
  }

  // ========== VÍDEOS ==========
  async getNextVideo() {
    try {
      console.log('📥 Buscando vídeo da API...');
      console.log('🔗 Endpoint:', config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS);

      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      console.log('📦 Status da resposta:', response.status);
      console.log('📦 Dados recebidos:', JSON.stringify(response.data).substring(0, 200) + '...');

      let videos = [];

      if (response.data && response.data.videos && Array.isArray(response.data.videos)) {
        videos = response.data.videos;
        console.log('✅ Formato: {videos: [...]}');
      } else if (Array.isArray(response.data)) {
        videos = response.data;
        console.log('✅ Formato: Array direto');
      } else {
        console.log('⚠️  Formato desconhecido:', typeof response.data);
      }

      console.log(`🎬 Total de vídeos: ${videos.length}`);

      if (videos.length === 0) {
        console.log('⚠️  Nenhum vídeo, usando fallback');
        return this.getFallbackVideo();
      }

      // Log de todos os vídeos disponíveis
      videos.forEach((video, index) => {
        console.log(`  ${index + 1}. ${video.title || 'Sem título'} - ${video.video_url || 'Sem URL'}`);
      });

      const randomIndex = Math.floor(Math.random() * videos.length);
      const video = videos[randomIndex];

      this.currentVideoId = video.id || video.video_id;

      console.log('✅ Vídeo selecionado:', {
        index: randomIndex + 1,
        title: video.title,
        id: this.currentVideoId,
        url: video.video_url,
        hasUrl: !!video.video_url
      });

      return {
        url: video.video_url,
        title: video.title || 'Vídeo',
        id: this.currentVideoId,
        scheduleId: video.id
      };

    } catch (error) {
      console.error('❌ ERRO ao buscar vídeo:', {
        message: error.message,
        code: error.code,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data
        } : 'No response'
      });

      return this.getFallbackVideo();
    }
  }
  // Verificar novos vídeos (simples - por contagem)
  async checkVideoUpdates() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.VIDEOS,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      const videos = this.extractVideosFromResponse(response.data);
      const currentCount = videos.length;

      // Primeira verificação
      if (this.videosCount === 0) {
        this.videosCount = currentCount;
        this.lastVideoUpdate = new Date();
        return {
          hasUpdates: false,
          count: currentCount,
          newVideos: 0
        };
      }

      // Verifica se há novos vídeos
      const hasNewVideos = currentCount > this.videosCount;
      const newVideosCount = hasNewVideos ? currentCount - this.videosCount : 0;

      if (hasNewVideos) {
        console.log(`🎉 ${newVideosCount} novo(s) vídeo(s) detectado(s)`);
        this.videosCount = currentCount;
        this.lastVideoUpdate = new Date();
      }

      return {
        hasUpdates: hasNewVideos,
        count: currentCount,
        newVideos: newVideosCount
      };

    } catch (error) {
      console.error('❌ Erro ao verificar vídeos:', error.message);
      return { hasUpdates: false, count: 0, newVideos: 0 };
    }
  }

  // ========== HORÁRIOS ==========
  async getScheduleTimes() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.SCHEDULE,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      // Extrai horários da resposta
      const scheduleTimes = this.extractScheduleTimesFromResponse(response.data);

      // Formata horários para HH:MM
      const formattedTimes = scheduleTimes
        .filter(time => typeof time === 'string')
        .map(time => this.formatTimeToHHMM(time))
        .filter(time => time !== null);

      if (formattedTimes.length > 0) {
        console.log('✅ Horários obtidos:', formattedTimes);
        return formattedTimes;
      }

      console.log('⚠️  Usando horários padrão');
      return config.APP.DEFAULT_SCHEDULE;

    } catch (error) {
      console.error('❌ Erro ao obter horários:', error.message);
      return config.APP.DEFAULT_SCHEDULE;
    }
  }

  // Verificar atualizações de horários
  async checkScheduleUpdates() {
    try {
      const response = await axios.get(
        config.API.BASE_URL + config.API.ENDPOINTS.SCHEDULE,
        {
          headers: this.getAuthHeaders(),
          timeout: config.API.TIMEOUT
        }
      );

      const scheduleTimes = this.extractScheduleTimesFromResponse(response.data);
      const formattedTimes = scheduleTimes
        .filter(time => typeof time === 'string')
        .map(time => this.formatTimeToHHMM(time))
        .filter(time => time !== null);

      // Compara com horários padrão
      const currentSchedule = JSON.stringify(config.APP.DEFAULT_SCHEDULE);
      const newSchedule = JSON.stringify(formattedTimes);

      return newSchedule !== currentSchedule && formattedTimes.length > 0;

    } catch (error) {
      console.error('❌ Erro ao verificar horários:', error.message);
      return false;
    }
  }

  // ========== REPORTS ==========
  async reportVideoView(videoData = {}) {
    try {
      const reportData = {
        video_id: videoData.videoId || this.currentVideoId,
        timestamp: new Date().toISOString(),
        event_type: videoData.event_type || 'video_viewed',
        playback_position: videoData.playback_position || 0,
        playback_duration: videoData.playback_duration || 0,
        device_info: {
          user_agent: 'Electron Video Player',
          platform: process.platform,
          app_version: config.APP.VERSION
        },
        video_title: videoData.videoTitle,
        trigger_type: videoData.trigger_type || 'scheduled',
        session_id: this.sessionId
      };

      console.log('📊 Enviando report:', reportData.event_type);

      await axios.post(
        config.API.BASE_URL + config.API.ENDPOINTS.REPORT,
        reportData,
        {
          headers: this.getAuthHeaders(),
          timeout: 3000
        }
      );

      console.log('✅ Report enviado');
      return true;

    } catch (error) {
      console.error('❌ Erro no report:', error.message);
      return false;
    }
  }

  // ========== HELPERS ==========
  getAuthHeaders() {
    return {
      'X-API-Key': config.API.AUTH.API_KEY,
      'X-Client-ID': config.API.AUTH.CLIENT_ID,
      'Content-Type': 'application/json'
    };
  }

  extractVideosFromResponse(data) {
    if (data && data.videos && Array.isArray(data.videos)) {
      return data.videos;
    } else if (Array.isArray(data)) {
      return data;
    }
    return [];
  }

  extractScheduleTimesFromResponse(data) {
    if (Array.isArray(data)) {
      return data;
    } else if (data && Array.isArray(data.schedule_times)) {
      return data.schedule_times;
    }
    return [];
  }

  formatTimeToHHMM(timeString) {
    if (typeof timeString !== 'string') return null;

    const cleanTime = timeString.trim();

    // Formato HH:MM ou HH:MM:SS
    if (cleanTime.includes(':')) {
      const parts = cleanTime.split(':');
      if (parts.length >= 2) {
        const hours = parts[0].padStart(2, '0');
        const minutes = parts[1].padStart(2, '0');
        return `${hours}:${minutes}`;
      }
    }

    return null;
  }

  getFallbackVideo() {
    const fallbackVideos = [
      {
        url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        title: 'Vídeo de Exemplo',
        id: 'fallback_001'
      }
    ];

    return fallbackVideos[0];
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 15);
  }
}

module.exports = ApiClient;