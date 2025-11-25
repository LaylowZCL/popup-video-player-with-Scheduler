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
const apiClient = new ApiClient('https://dev.fernandozucula.com/api');

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