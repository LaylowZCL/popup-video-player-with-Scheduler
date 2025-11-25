class Scheduler {
  constructor({ onTrigger, apiClient }) {
    this.onTrigger = onTrigger;
    this.apiClient = apiClient;
    this.scheduleTimes = ['12:00', '15:00', '18:00']; // Horários padrão
    this.timeouts = []; // Array para guardar os timeouts
    this.start();
  }

  async start() {
    try {
      // Busca horários da API
      if (this.apiClient) {
        this.scheduleTimes = await this.apiClient.getScheduleTimes();
        console.log('Horários carregados:', this.scheduleTimes);
      }
      
      this.scheduleAll();
    } catch (error) {
      console.error('Erro ao carregar horários, usando padrão:', error);
      this.scheduleAll();
    }
  }

  scheduleAll() {
    // Limpa timeouts existentes
    this.clearAllSchedules();
    
    // Agenda cada horário
    this.scheduleTimes.forEach(time => {
      const [hours, minutes] = time.split(':').map(Number);
      this.scheduleDaily(hours, minutes);
    });
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

    const timeoutId = setTimeout(() => {
      this.onTrigger();
      this.scheduleDaily(hours, minutes); // Reagenda para o próximo dia
    }, timeout);

    this.timeouts.push(timeoutId);
  }

  // Método para atualizar horários em tempo de execução
  async updateScheduleTimes(newTimes) {
    if (Array.isArray(newTimes)) {
      this.scheduleTimes = newTimes;
      this.scheduleAll(); // Reagenda tudo com os novos horários
    }
  }

  // Limpa todos os agendamentos
  clearAllSchedules() {
    this.timeouts.forEach(timeoutId => clearTimeout(timeoutId));
    this.timeouts = [];
  }

  // Destructor
  destroy() {
    this.clearAllSchedules();
  }
}

module.exports = Scheduler;