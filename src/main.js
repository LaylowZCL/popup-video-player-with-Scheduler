/*

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const TrayManager = require('./trayManager');
const Scheduler = require('./scheduler');
const ApiClient = require('./apiClient');

let videoWindow = null;
const apiClient = new ApiClient('https://sua-api.com/videos');

app.whenReady().then(() => {
  // Initialize Tray Manager
  const trayManager = new TrayManager(app);
  
  // Set up event listeners
  trayManager.on('open-video', () => {
    showVideoPopup(trayManager).catch(console.error);
  });
  
  trayManager.on('show-settings', () => {
    // Implement settings window if needed
    console.log('Settings requested');
  });

  // Initialize Scheduler
  const scheduler = new Scheduler({
    onTrigger: () => showVideoPopup(trayManager)
  });

  // Check for video updates every hour
  const updateInterval = setInterval(() => {
    checkForNewVideos(trayManager).catch(console.error);
  }, 3600000);

  // Cleanup on app exit
  app.on('will-quit', () => {
    clearInterval(updateInterval);
    if (videoWindow) videoWindow.destroy();
  });
});

/**
 * Shows the video popup window
 * @param {TrayManager} trayManager 
 */


/*
async function showVideoPopup(trayManager) {
  if (videoWindow) {
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    
    videoWindow = new BrowserWindow({
      width: 800,
      height: 600,
      alwaysOnTop: true,
      fullscreenable: false,
      resizable: false,
      frame: false,
      show: false, // Don't show until ready
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        sandbox: false
      }
    });

    // Load the video popup HTML
    await videoWindow.loadFile(path.join(__dirname, 'video-popup.html'), {
      query: { videoUrl: videoData.url }
    });

    // Window management
    videoWindow.on('ready-to-show', () => {
      videoWindow.show();
      trayManager.hideFromTray();
    });

    videoWindow.on('closed', () => {
      videoWindow = null;
      trayManager.showInTray();
    });

    // DevTools (remove for production)
    videoWindow.webContents.openDevTools({ mode: 'detach' });

  } catch (error) {
    console.error('Error showing video popup:', error);
    trayManager.showNotification('Erro ao carregar vídeo');
    if (videoWindow) videoWindow.destroy();
  }
}

/**
 * Checks for new videos from API
 * @param {TrayManager} trayManager 
 */

/*
async function checkForNewVideos(trayManager) {
  try {
    const hasUpdates = await apiClient.checkUpdates();
    if (hasUpdates) {
      trayManager.showNotification('Novos vídeos disponíveis!');
    }
  } catch (error) {
    console.error('Error checking for video updates:', error);
    trayManager.showNotification('Erro ao verificar atualizações');
  }
}

// Handle app lifecycle
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Promise Rejection:', error);
});


*/



/*

const { app, BrowserWindow } = require('electron');
const path = require('path');
const TrayManager = require('./trayManager');
const Scheduler = require('./scheduler');

// Configuração
const youtubeVideos = [
  'N6WrnUOX0ac',
  'mKh7hQYG1_c', 
  'SPzXwem9d3k'
];
//https://mozambiquetourismsummit.co.mz/wp-content/uploads/2025/10/Video-WhatsApp-2025-10-16-as-23.38.39_4274bc3f.mp4
// Variáveis globais
let videoWindow = null;
let trayManager = null;
let isQuitting = false;

app.whenReady().then(() => {
  trayManager = new TrayManager(app);
  
  // Configura listeners de eventos
  trayManager.on('open-video', showVideoPopup);

  // Inicia agendador
  new Scheduler({
    onTrigger: showVideoPopup
  });

  // Fechamento seguro
  app.on('will-quit', (event) => {
    if (!videoWindow) return;
    
    isQuitting = true;
    event.preventDefault();
    
    videoWindow.destroy();
    if (trayManager.tray && !trayManager.tray.isDestroyed()) {
      trayManager.tray.destroy();
    }
    app.quit();
  });
});

async function showVideoPopup() {
  if (videoWindow) {
    videoWindow.focus();
    return;
  }

  try {
    const videoId = youtubeVideos[Math.floor(Math.random() * youtubeVideos.length)];
    // const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&controls=0&rel=0`;
    const embedUrl = 'http://127.0.0.1:8000/videos/1762897094_ISSO E SER HOMEM.mp4';
    
    videoWindow = new BrowserWindow({
      width: 854,
      height: 480,
      alwaysOnTop: true,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    videoWindow.setMenu(null);
    
    await videoWindow.loadFile(path.join(__dirname, 'video-popup.html'), {
      query: { videoUrl: embedUrl }
    });

    videoWindow.webContents.on('did-finish-load', () => {
      videoWindow.webContents.insertCSS(`
        .ytp-chrome-top { display: none !important; }
      `);
    });

    videoWindow.on('ready-to-show', () => {
      videoWindow.show();
      trayManager.hideFromTray();
    });

    videoWindow.on('closed', () => {
      videoWindow = null;
      if (!isQuitting) trayManager.showInTray();
    });

  } catch (error) {
    console.error('Error:', error);
    if (videoWindow) videoWindow.destroy();
  }
}

// macOS window management
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

*/

/*
const { app, BrowserWindow } = require('electron');
const path = require('path');
const TrayManager = require('./trayManager');
const Scheduler = require('./scheduler');
const ApiClient = require('./apiClient');

// Variáveis globais
let videoWindow = null;
let trayManager = null;
let isQuitting = false;
const apiClient = new ApiClient('http://127.0.0.1:8000/api');

app.whenReady().then(() => {
  trayManager = new TrayManager(app);
  
  // Configura listeners de eventos
  trayManager.on('open-video', showVideoPopup);

  // Inicia agendador
  new Scheduler({
    onTrigger: showVideoPopup
  });

  // Verifica atualizações a cada 30 minutos
  setInterval(() => {
    checkForNewVideos().catch(console.error);
  }, 30 * 60 * 1000);

  // Fechamento seguro
  app.on('will-quit', (event) => {
    if (!videoWindow) return;
    
    isQuitting = true;
    event.preventDefault();
    
    videoWindow.destroy();
    if (trayManager.tray && !trayManager.tray.isDestroyed()) {
      trayManager.tray.destroy();
    }
    app.quit();
  });
});

async function showVideoPopup() {
  if (videoWindow) {
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    
    videoWindow = new BrowserWindow({
      width: 854,
      height: 480,
      alwaysOnTop: true,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    videoWindow.setMenu(null);
    
    await videoWindow.loadFile(path.join(__dirname, 'video-popup.html'), {
      query: { videoUrl: videoData.url }
    });

    videoWindow.on('ready-to-show', () => {
      videoWindow.show();
      trayManager.hideFromTray();
    });

    videoWindow.on('closed', () => {
      videoWindow = null;
      if (!isQuitting) trayManager.showInTray();
    });

    // Adiciona handler para erros de carregamento
    videoWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load video:', errorDescription);
      trayManager.showNotification('Erro ao carregar vídeo');
      if (videoWindow) {
        videoWindow.close();
      }
    });

  } catch (error) {
    console.error('Error showing video popup:', error);
    trayManager.showNotification('Erro: Nenhum vídeo disponível');
    if (videoWindow) videoWindow.destroy();
  }
}

async function checkForNewVideos() {
  try {
    const hasUpdates = await apiClient.checkUpdates();
    if (hasUpdates) {
      trayManager.showNotification('Novos vídeos disponíveis!');
    }
  } catch (error) {
    console.error('Error checking for video updates:', error);
  }
}

// macOS window management
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

*/

const { app, BrowserWindow } = require('electron');
const path = require('path');
const TrayManager = require('./trayManager');
const Scheduler = require('./scheduler');
const ApiClient = require('./apiClient');

// Variáveis globais
let videoWindow = null;
let trayManager = null;
let scheduler = null;
let isQuitting = false;
const apiClient = new ApiClient('http://127.0.0.1:8000/api');

app.whenReady().then(async () => {
  trayManager = new TrayManager(app);
  
  // Configura listeners de eventos
  trayManager.on('open-video', showVideoPopup);

  // Inicia agendador com a API client
  scheduler = new Scheduler({
    onTrigger: showVideoPopup,
    apiClient: apiClient
  });

  // Verifica atualizações a cada 30 minutos (vídeos e horários)
  setInterval(async () => {
    try {
      const updates = await apiClient.checkUpdates();
      
      if (updates.hasUpdates) {
        trayManager.showNotification('Novos vídeos disponíveis!');
      }
      
      if (updates.hasScheduleUpdates && scheduler) {
        trayManager.showNotification('Horários de exibição atualizados!');
        // O scheduler já atualiza automaticamente via apiClient.getScheduleTimes()
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
    }
  }, 30 * 60 * 1000);

  // Fechamento seguro
  app.on('will-quit', (event) => {
    if (!videoWindow) return;
    
    isQuitting = true;
    event.preventDefault();
    
    if (scheduler) {
      scheduler.destroy();
    }
    
    videoWindow.destroy();
    if (trayManager.tray && !trayManager.tray.isDestroyed()) {
      trayManager.tray.destroy();
    }
    app.quit();
  });
});

async function showVideoPopup() {
  if (videoWindow) {
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    
    videoWindow = new BrowserWindow({
      width: 854,
      height: 480,
      alwaysOnTop: true,
      frame: false,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });

    videoWindow.setMenu(null);
    
    await videoWindow.loadFile(path.join(__dirname, 'video-popup.html'), {
      query: { videoUrl: videoData.url }
    });

    videoWindow.on('ready-to-show', () => {
      videoWindow.show();
      trayManager.hideFromTray();
    });

    videoWindow.on('closed', () => {
      videoWindow = null;
      if (!isQuitting) trayManager.showInTray();
    });

    videoWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load video:', errorDescription);
      trayManager.showNotification('Erro ao carregar vídeo');
      if (videoWindow) {
        videoWindow.close();
      }
    });

  } catch (error) {
    console.error('Error showing video popup:', error);
    trayManager.showNotification('Erro: Nenhum vídeo disponível');
    if (videoWindow) videoWindow.destroy();
  }
}

// macOS window management
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});