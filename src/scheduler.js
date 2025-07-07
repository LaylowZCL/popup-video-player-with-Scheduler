class Scheduler {
    constructor({ onTrigger }) {
      this.onTrigger = onTrigger;
      this.scheduleTimes = ['09:00', '12:00', '15:00', '18:00', '22:10'];
      this.start();
    }
  
    start() {
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
  
      setTimeout(() => {
        this.onTrigger();
        this.scheduleDaily(hours, minutes);
      }, timeout);
    }
  }
  
  module.exports = Scheduler;