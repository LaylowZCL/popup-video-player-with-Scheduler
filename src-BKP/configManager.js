const fs = require('fs');
const path = require('path');
const { app } = require('electron');

class ConfigManager {
  constructor() {
    this.configPath = path.join(app.getPath('userData'), 'config.json');
    this.defaultConfig = this.getDefaultConfig();
    this.config = this.loadConfig();
  }

  getDefaultConfig() {
    return {
      api: {
        baseUrl: "https://dev.fernandozucula.com/api",
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
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        
        // Merge com configuração padrão
        return this.deepMerge(this.defaultConfig, userConfig);
      } else {
        // Criar ficheiro com configuração padrão
        this.saveConfig(this.defaultConfig);
        return this.defaultConfig;
      }
    } catch (error) {
      console.error('❌ Erro ao carregar configuração:', error);
      return this.defaultConfig;
    }
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
      console.log('✅ Configuração salva em:', this.configPath);
    } catch (error) {
      console.error('❌ Erro ao salvar configuração:', error);
    }
  }

  get(key, defaultValue = null) {
    const keys = key.split('.');
    let value = this.config;
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return defaultValue;
      }
    }
    
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let configRef = this.config;
    
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!configRef[k] || typeof configRef[k] !== 'object') {
        configRef[k] = {};
      }
      configRef = configRef[k];
    }
    
    configRef[keys[keys.length - 1]] = value;
    this.saveConfig(this.config);
  }

  deepMerge(target, source) {
    const output = { ...target };
    
    if (this.isObject(target) && this.isObject(source)) {
      Object.keys(source).forEach(key => {
        if (this.isObject(source[key])) {
          if (!(key in target)) {
            output[key] = source[key];
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          output[key] = source[key];
        }
      });
    }
    
    return output;
  }

  isObject(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  }

  getApiUrl(endpoint) {
    const baseUrl = this.get('api.baseUrl');
    const endpointPath = this.get(`api.endpoints.${endpoint}`);
    
    if (!endpointPath) {
      throw new Error(`Endpoint não configurado: ${endpoint}`);
    }
    
    return `${baseUrl}${endpointPath}`;
  }

  getAuthHeaders() {
    return {
      'X-API-Key': this.get('auth.apiKey'),
      'X-Client-ID': this.get('auth.clientId'),
      'X-App-Version': this.get('app.version'),
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };
  }

  // Método para atualizar configurações remotamente (opcional)
  async updateFromRemote() {
    try {
      const axios = require('axios');
      const updateUrl = `${this.get('api.baseUrl')}/config/electron`;
      
      const response = await axios.get(updateUrl, {
        headers: this.getAuthHeaders(),
        timeout: 5000
      });
      
      if (response.data && response.data.success) {
        this.deepMerge(this.config, response.data.config);
        this.saveConfig(this.config);
        console.log('✅ Configuração atualizada remotamente');
        return true;
      }
    } catch (error) {
      console.log('⚠️  Não foi possível atualizar configuração remotamente');
    }
    return false;
  }
}

module.exports = ConfigManager;