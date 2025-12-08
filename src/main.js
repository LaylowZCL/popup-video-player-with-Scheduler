const { app, BrowserWindow, ipcMain } = require('electron');
app.setName('Popup Video Player');
const path = require('path');
const TrayManager = require('./trayManager');
const Scheduler = require('./scheduler');
const ApiClient = require('./apiClient');
const config = require('./config');

let videoWindow = null;
let trayManager = null;
let scheduler = null;
let isQuitting = false;
let apiClient = null;
let intervals = [];
let isVideoPlaying = false;

app.whenReady().then(async () => {
  apiClient = new ApiClient();

  await apiClient.testAuthentication();

  trayManager = new TrayManager(app);
  trayManager.on('open-video', () => toggleVideoWindow());
  trayManager.on('minimize-window', minimizeVideoWindow);
  trayManager.on('reload-video', () => showVideoPopup('manual-reload'));
  trayManager.on('check-videos', () => {
    apiClient.checkVideoUpdates();
  });
  trayManager.on('check-schedule', () => {
    apiClient.checkScheduleUpdates();
  });
  trayManager.on('quit-app', () => {
    isQuitting = true;
    cleanup();
    app.quit();
  });

  scheduler = new Scheduler({
    onTrigger: () => showVideoPopup('scheduled'),
    apiClient: apiClient
  });

  ipcMain.on('minimize-window', () => {
    minimizeVideoWindow();
  });

  ipcMain.on('report-video-view', async (event, videoData) => {
    if (apiClient.isAuthenticated) {
      await apiClient.reportVideoView(videoData);
    }
  });

  const scheduleCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        const hasUpdates = await apiClient.checkScheduleUpdates();
        if (hasUpdates && scheduler) {
          const newSchedule = await apiClient.getScheduleTimes();
          console.log(newSchedule)
          scheduler.updateScheduleTimes(newSchedule);
        }
      }
    } catch (error) {
    }
  }, 60 * 60 * 1000); // 1 hora

  intervals.push(scheduleCheckInterval);

  const videoCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        const videoUpdates = await apiClient.checkVideoUpdates();
        console.log(videoUpdates)
      }
    } catch (error) {
    }
  }, 2 * 60 * 60 * 1000); // 2 horas

  intervals.push(videoCheckInterval);
});

function toggleVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    minimizeVideoWindow();
  } else if (videoWindow && !videoWindow.isDestroyed() && !videoWindow.isVisible()) {
    videoWindow.show();
    videoWindow.focus();
    videoWindow.setAlwaysOnTop(true, 'screen-saver');
    trayManager.hideFromTray();
    isVideoPlaying = true;
    
    if (videoWindow.webContents) {
      videoWindow.webContents.executeJavaScript(`
        try {
          const video = document.getElementById('videoPlayer');
          if (video) {
            video.currentTime = 0;
            video.play().catch(e => {});
          }
        } catch(e) {}
      `).catch(() => {});
    }
  } else {
    showVideoPopup('manual');
  }
}

async function showVideoPopup(triggerType = 'scheduled') {
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    
    if (!videoData || !videoData.url) {
      trayManager.showNotification('Erro', 'Não foi possível obter o vídeo');
      return;
    }

    if (videoWindow && !videoWindow.isDestroyed()) {
      const queryParams = new URLSearchParams({
        videoUrl: videoData.url,
        videoId: videoData.id,
        videoTitle: videoData.title || 'Vídeo',
        triggerType: triggerType
      }).toString();

      const htmlPath = path.join(__dirname, 'video-popup.html');
      const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;
      
      await videoWindow.loadURL(videoUrlWithParams);
      videoWindow.show();
      videoWindow.focus();
      videoWindow.setAlwaysOnTop(true, 'screen-saver');
      trayManager.hideFromTray();
      isVideoPlaying = true;
      
    } else {
      const windowOptions = {
        width: config.WINDOW.WIDTH,
        height: config.WINDOW.HEIGHT,
        alwaysOnTop: config.WINDOW.ALWAYS_ON_TOP,
        frame: config.WINDOW.FRAME,
        skipTaskbar: config.WINDOW.SKIP_TASKBAR,
        show: true,
        backgroundColor: '#000000',
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false
        },
        focusable: true,
        modal: false,
        transparent: false,
        hasShadow: true
      };
      
      videoWindow = new BrowserWindow(windowOptions);
      
      videoWindow.setMenu(null);
      
      const queryParams = new URLSearchParams({
        videoUrl: videoData.url,
        videoId: videoData.id,
        videoTitle: videoData.title || 'Vídeo',
        triggerType: triggerType
      }).toString();

      const htmlPath = path.join(__dirname, 'video-popup.html');
      const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;

      await videoWindow.loadURL(videoUrlWithParams);

      videoWindow.on('ready-to-show', () => {
        videoWindow.show();
        videoWindow.focus();
        videoWindow.setAlwaysOnTop(true, 'screen-saver');
        
        trayManager.hideFromTray();
        isVideoPlaying = true;
        
        if (apiClient.isAuthenticated) {
          apiClient.reportVideoView({
            videoId: videoData.id,
            videoTitle: videoData.title,
            event_type: 'popup_opened',
            trigger_type: triggerType
          }).catch(() => {});
        }
      });

      videoWindow.on('close', (event) => {
        if (!isQuitting) {
          event.preventDefault();
          minimizeVideoWindow();
        }
      });

      videoWindow.webContents.setBackgroundThrottling(false);
    }

  } catch (error) {
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.destroy();
    }
    videoWindow = null;
    isVideoPlaying = false;
    
    trayManager.showNotification('Erro', 'Falha ao abrir vídeo');
  }
}

function minimizeVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) {
    try {
      videoWindow.hide();
      trayManager.showInTray();
      isVideoPlaying = false;
    } catch (error) {
    }
  }
}

function cleanup() {
  intervals.forEach(interval => clearInterval(interval));
  intervals = [];

  if (scheduler) {
    scheduler.destroy();
    scheduler = null;
  }

  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.destroy();
    videoWindow = null;
  }

  isVideoPlaying = false;
}

app.on('will-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true;
    cleanup();
  }
});

app.on('window-all-closed', () => {
});

app.on('activate', () => {
  if (videoWindow === null && !isQuitting) {
    showVideoPopup('activate');
  }
});