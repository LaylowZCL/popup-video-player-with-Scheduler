const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { createLogger } = require('./logger');
const logger = createLogger('subtitleManager');

class SubtitleManager {
  constructor() {
    this.currentSubtitles = [];
    this.currentSubtitleIndex = 0;
    this.subtitleElement = null;
    this.isEnabled = false;
  }

  // Parse arquivo SRT
  parseSRT(srtContent) {
    const lines = srtContent.split('\n');
    const subtitles = [];
    let currentSubtitle = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') {
        if (currentSubtitle) {
          subtitles.push(currentSubtitle);
          currentSubtitle = null;
        }
        continue;
      }
      
      // Número da legenda
      if (/^\d+$/.test(line)) {
        if (currentSubtitle) {
          subtitles.push(currentSubtitle);
        }
        currentSubtitle = {
          index: parseInt(line),
          start: null,
          end: null,
          text: []
        };
        continue;
      }
      
      // Timestamp
      if (line.includes('-->')) {
        if (currentSubtitle) {
          const [start, end] = line.split('-->').map(t => t.trim());
          currentSubtitle.start = this.parseTime(start);
          currentSubtitle.end = this.parseTime(end);
        }
        continue;
      }
      
      // Texto da legenda
      if (currentSubtitle && (currentSubtitle.start !== null)) {
        currentSubtitle.text.push(line);
      }
    }
    
    // Adicionar última legenda se existir
    if (currentSubtitle) {
      subtitles.push(currentSubtitle);
    }
    
    return subtitles;
  }

  // Converter timestamp para segundos
  parseTime(timeStr) {
    const [time, milliseconds] = timeStr.split(',');
    const [hours, minutes, seconds] = time.split(':').map(Number);
    return hours * 3600 + minutes * 60 + seconds + (parseInt(milliseconds) / 1000);
  }

  // Carregar legendas de arquivo local
  async loadFromFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      this.currentSubtitles = this.parseSRT(content);
      this.currentSubtitleIndex = 0;
      logger.info(`✅ Legendas carregadas do arquivo: ${filePath}`);
      logger.info(`📝 Total de legendas: ${this.currentSubtitles.length}`);
      return true;
    } catch (error) {
      logger.error(`❌ Erro ao carregar arquivo de legendas: ${error.message}`);
      return false;
    }
  }

  // Baixar legendas de URL
  async loadFromURL(url) {
    try {
      logger.info(`📥 Baixando legendas de: ${url}`);
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'BancoMoc-VideoPlayer/1.0'
        }
      });
      
      this.currentSubtitles = this.parseSRT(response.data);
      this.currentSubtitleIndex = 0;
      logger.info(`✅ Legendas baixadas e carregadas`);
      logger.info(`📝 Total de legendas: ${this.currentSubtitles.length}`);
      return true;
    } catch (error) {
      logger.error(`❌ Erro ao baixar legendas: ${error.message}`);
      return false;
    }
  }

  // Obter legenda para tempo atual
  getSubtitleForTime(currentTime) {
    if (!this.currentSubtitles.length) return null;
    
    // Buscar legenda ativa
    for (let i = 0; i < this.currentSubtitles.length; i++) {
      const subtitle = this.currentSubtitles[i];
      if (currentTime >= subtitle.start && currentTime <= subtitle.end) {
        if (i !== this.currentSubtitleIndex) {
          this.currentSubtitleIndex = i;
        }
        return {
          text: subtitle.text.join('<br>'),
          index: i
        };
      }
    }
    
    return null;
  }

  // Limpar legendas
  clear() {
    this.currentSubtitles = [];
    this.currentSubtitleIndex = 0;
    this.isEnabled = false;
    logger.info('🧹 Legendas limpas');
  }

  // Verificar se há legendas carregadas
  hasSubtitles() {
    return this.currentSubtitles.length > 0;
  }

  // Obter lista de legendas
  getSubtitleList() {
    return this.currentSubtitles.map((sub, index) => ({
      index: index,
      start: this.formatTime(sub.start),
      end: this.formatTime(sub.end),
      text: sub.text.slice(0, 50) + (sub.text.length > 50 ? '...' : '')
    }));
  }

  // Formatar tempo para exibição
  formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  // Habilitar/desabilitar legendas
  setEnabled(enabled) {
    this.isEnabled = enabled;
    logger.info(`📝 Legendas ${enabled ? 'habilitadas' : 'desabilitadas'}`);
  }

  // Obter estado atual
  getStatus() {
    return {
      hasSubtitles: this.hasSubtitles(),
      isEnabled: this.isEnabled,
      totalSubtitles: this.currentSubtitles.length,
      currentIndex: this.currentSubtitleIndex
    };
  }
}

module.exports = SubtitleManager;
