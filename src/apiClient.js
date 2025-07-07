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