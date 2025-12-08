const config = require('./config');

class Scheduler {
  constructor({ onTrigger, apiClient }) {
    this.onTrigger = onTrigger;
    this.apiClient = apiClient;
    this.scheduleTimes = config.APP.DEFAULT_SCHEDULE;
    this.timeouts = [];

    this.init();
  }

  async init() {
    console.log('⏰ Inicializando scheduler...');

    try {
      const times = await this.apiClient.getScheduleTimes();

      if (Array.isArray(times) && times.length > 0) {
        this.scheduleTimes = times;
        console.log('✅ Horários carregados:', this.scheduleTimes);
      } else {
        console.log('⚠️  Usando horários padrão:', this.scheduleTimes);
      }

      this.scheduleAll();

    } catch (error) {
      console.error('❌ Erro ao inicializar scheduler:', error.message);
      this.scheduleAll();
    }
  }

  scheduleAll() {
    this.clearAllSchedules();

    console.log('📅 Agendando vídeos para:', this.scheduleTimes);

    this.scheduleTimes.forEach(time => {
      if (this.isValidTimeFormat(time)) {
        const [hours, minutes] = time.split(':').map(Number);
        this.scheduleDaily(hours, minutes);
      }
    });
  }

  isValidTimeFormat(time) {
    if (typeof time !== 'string') return false;
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time.trim());
  }

  scheduleDaily(hours, minutes) {
    const now = new Date();
    const scheduledTime = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hours,
      minutes,
      0,
      0
    );

    if (scheduledTime < now) {
      scheduledTime.setDate(scheduledTime.getDate() + 1);
    }

    const timeout = scheduledTime.getTime() - now.getTime();
    const minutesUntil = Math.round(timeout / 1000 / 60);

    console.log(`⏰ Agendado: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')} (em ${minutesUntil} minutos)`);

    const timeoutId = setTimeout(() => {
      console.log(`🎬 HORA DO VÍDEO! Executando às ${hours}:${minutes}`);
      this.onTrigger();
      console.log(`⏰ Reagendando para amanhã às ${hours}:${minutes}`);
      this.scheduleDaily(hours, minutes); // Reagenda
    }, timeout);

    this.timeouts.push(timeoutId);
  }

  async updateScheduleTimes(newTimes) {
    if (Array.isArray(newTimes) && newTimes.length > 0) {
      this.scheduleTimes = newTimes;
      this.scheduleAll();
      console.log('✅ Horários atualizados:', newTimes);
    }
  }

  clearAllSchedules() {
    this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeouts = [];
  }

  destroy() {
    this.clearAllSchedules();
  }
}

module.exports = Scheduler;