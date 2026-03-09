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
        // baseUrl: "https://dev.fernandozucula.com/api", // produção
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
    };
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        const configData = fs.readFileSync(this.configPath, 'utf8');
        const userConfig = JSON.parse(configData);
        
        return this.deepMerge(this.defaultConfig, userConfig);
      } else {
        this.saveConfig(this.defaultConfig);
        return this.defaultConfig;
      }
    } catch (error) {
      return this.defaultConfig;
    }
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
    } catch (error) {
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
}

module.exports = ConfigManager;
