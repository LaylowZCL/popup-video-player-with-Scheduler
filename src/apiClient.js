/*

const axios = require('axios');

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.lastUpdate = null;
  }
  
  async getNextVideo() {
    try {
      const response = await axios.get(`${this.baseUrl}/next`, {
        params: {
          lastUpdate: this.lastUpdate
        }
      });
      
      if (response.data && response.data.url) {
        this.lastUpdate = new Date();
        return response.data;
      }
      
      throw new Error('No video available');
    } catch (error) {
      console.error('Error fetching video:', error);
      throw error;
    }
  }
  
  async checkUpdates() {
    try {
      const response = await axios.get(`${this.baseUrl}/updates`, {
        params: {
          lastUpdate: this.lastUpdate
        }
      });
      
      return response.data.hasUpdates;
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }
}

module.exports = ApiClient;

*/

/*
const axios = require('axios');

class ApiClient {
  constructor(baseUrl = 'http://127.0.0.1:8000/api') {
    this.baseUrl = baseUrl;
    this.lastUpdate = null;
  }
  
  async getNextVideo() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      
      if (response.data && response.data.videos && response.data.videos.length > 0) {
        // Filtra apenas vídeos ativos e com status válido
        const activeVideos = response.data.videos.filter(video => 
          video.is_active && video.status !== 'error' && video.url
        );
        
        if (activeVideos.length === 0) {
          throw new Error('No active videos available');
        }
        
        // Seleciona um vídeo aleatório da lista
        const randomVideo = activeVideos[Math.floor(Math.random() * activeVideos.length)];
        this.lastUpdate = new Date();
        
        return {
          url: randomVideo.url,
          title: randomVideo.title,
          id: randomVideo.id
        };
      }
      
      throw new Error('No videos available from API');
    } catch (error) {
      console.error('Error fetching video from API:', error.message);
      throw error;
    }
  }
  
  async checkUpdates() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      
      if (!this.lastUpdate) {
        this.lastUpdate = new Date();
        return true; // Primeira execução
      }
      
      // Verifica se há novos vídeos desde a última atualização
      const hasNewVideos = response.data.videos.some(video => {
        const videoDate = new Date(video.lastSync);
        return videoDate > this.lastUpdate;
      });
      
      if (hasNewVideos) {
        this.lastUpdate = new Date();
      }
      
      return hasNewVideos;
    } catch (error) {
      console.error('Error checking for updates:', error);
      return false;
    }
  }

  // Novo método para obter estatísticas
  async getStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      return response.data.stats;
    } catch (error) {
      console.error('Error fetching stats:', error);
      return null;
    }
  }
}

module.exports = ApiClient;

*/


const axios = require('axios');

class ApiClient {
  constructor(baseUrl = 'http://127.0.0.1:8000/api') {
    this.baseUrl = baseUrl;
    this.lastUpdate = null;
    this.scheduleTimes = ['12:00', '15:00', '18:00']; // Horários padrão como fallback
  }
  
  async getNextVideo() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      
      if (response.data && response.data.videos && response.data.videos.length > 0) {
        // Filtra apenas vídeos ativos e com status válido
        const activeVideos = response.data.videos.filter(video => 
          video.is_active && video.status !== 'error' && video.url
        );
        
        if (activeVideos.length === 0) {
          throw new Error('No active videos available');
        }
        
        // Seleciona um vídeo aleatório da lista
        const randomVideo = activeVideos[Math.floor(Math.random() * activeVideos.length)];
        this.lastUpdate = new Date();
        
        return {
          url: randomVideo.url,
          title: randomVideo.title,
          id: randomVideo.id
        };
      }
      
      throw new Error('No videos available from API');
    } catch (error) {
      console.error('Error fetching video from API:', error.message);
      throw error;
    }
  }

  async getScheduleTimes() {
    try {
      const response = await axios.get(`${this.baseUrl}/schedules/clients`); // Nova endpoint
      
      if (response.data && response.data.schedule_times && Array.isArray(response.data.schedule_times)) {
        this.scheduleTimes = response.data.schedule_times;
        console.log('Horários atualizados da API:', this.scheduleTimes);
        return this.scheduleTimes;
      }
      
      console.log('Usando horários padrão');
      return this.scheduleTimes; // Retorna horários padrão se a API não responder
    } catch (error) {
      console.error('Error fetching schedule times:', error.message);
      console.log('Usando horários padrão devido a erro na API');
      return this.scheduleTimes; // Fallback para horários padrão
    }
  }

  // Método para buscar configurações completas (vídeos + horários)
  async getAppConfig() {
    try {
      const [videosResponse, scheduleResponse] = await Promise.all([
        axios.get(`${this.baseUrl}/videos`),
        axios.get(`${this.baseUrl}/schedule`).catch(() => ({ data: { schedule_times: this.scheduleTimes } })) // Fallback se schedule falhar
      ]);

      return {
        videos: videosResponse.data.videos || [],
        scheduleTimes: scheduleResponse.data.schedule_times || this.scheduleTimes,
        stats: videosResponse.data.stats
      };
    } catch (error) {
      console.error('Error fetching app config:', error);
      throw error;
    }
  }
  
  async checkUpdates() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      
      if (!this.lastUpdate) {
        this.lastUpdate = new Date();
        return { hasUpdates: true, hasScheduleUpdates: false };
      }
      
      // Verifica se há novos vídeos desde a última atualização
      const hasNewVideos = response.data.videos.some(video => {
        const videoDate = new Date(video.lastSync);
        return videoDate > this.lastUpdate;
      });
      
      if (hasNewVideos) {
        this.lastUpdate = new Date();
      }

      // Verifica também atualizações de horários
      const hasScheduleUpdates = await this.checkScheduleUpdates();
      
      return { 
        hasUpdates: hasNewVideos, 
        hasScheduleUpdates: hasScheduleUpdates 
      };
    } catch (error) {
      console.error('Error checking for updates:', error);
      return { hasUpdates: false, hasScheduleUpdates: false };
    }
  }

  async checkScheduleUpdates() {
    try {
      const response = await axios.get(`${this.baseUrl}/schedule`);
      if (response.data && response.data.schedule_times) {
        const newTimes = JSON.stringify(response.data.schedule_times);
        const currentTimes = JSON.stringify(this.scheduleTimes);
        
        if (newTimes !== currentTimes) {
          this.scheduleTimes = response.data.schedule_times;
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async getStats() {
    try {
      const response = await axios.get(`${this.baseUrl}/videos`);
      return response.data.stats;
    } catch (error) {
      console.error('Error fetching stats:', error);
      return null;
    }
  }
}

module.exports = ApiClient;