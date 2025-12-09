const { app, BrowserWindow, ipcMain } = require("electron");
app.setName("Popup Video Player");
const path = require("path");
const TrayManager = require("./trayManager");
const Scheduler = require("./scheduler");
const ApiClient = require("./apiClient");
const config = require("./config");

let videoWindow = null;
let trayManager = null;
let scheduler = null;
let isQuitting = false;
let apiClient = null;
let intervals = [];
let isVideoPlaying = false;

app.whenReady().then(async () => {
  console.log("🚀 Aplicação inicializando...");
  
  apiClient = new ApiClient();

  // Testar autenticação
  const authResult = await apiClient.testAuthentication();
  console.log("🔑 Autenticação:", authResult ? "✅ Sucesso" : "❌ Falha");

  // Inicializar tray manager
  trayManager = new TrayManager(app);
  trayManager.on("open-video", () => toggleVideoWindow());
  trayManager.on("minimize-window", minimizeVideoWindow);
  trayManager.on("reload-video", () => showVideoPopup("manual-reload"));
  trayManager.on("check-videos", () => {
    console.log("🔍 Verificando novos vídeos...");
    apiClient.checkVideoUpdates();
  });
  trayManager.on("check-schedule", () => {
    console.log("⏰ Verificando horários...");
    apiClient.checkScheduleUpdates();
  });
  trayManager.on("quit-app", () => {
    console.log("🛑 Saindo da aplicação...");
    isQuitting = true;
    cleanup();
    app.quit();
  });

  // Inicializar scheduler
  scheduler = new Scheduler({
    onTrigger: () => {
      console.log("⏰ Trigger do scheduler executado");
      showVideoPopup("scheduled");
    },
    apiClient: apiClient
  });

  // Handlers IPC
  ipcMain.on("minimize-window", () => {
    console.log("📥 IPC: minimize-window recebido");
    minimizeVideoWindow();
  });

  ipcMain.on("report-video-view", async (event, videoData) => {
    console.log("📊 IPC: report-video-view recebido:", {
      event_type: videoData.event_type,
      video_id: videoData.video_id,
      video_title: videoData.video_title
    });
    
    if (apiClient.isAuthenticated) {
      try {
        // Garantir que os campos estejam no formato correto
        const formattedData = {
          ...videoData,
          video_id: videoData.video_id || videoData.videoId,
          video_title: videoData.video_title || videoData.videoTitle
        };
        
        const result = await apiClient.reportVideoView(formattedData);
        if (result) {
          console.log("✅ Report enviado com sucesso");
        } else {
          console.warn("⚠️ Falha ao enviar report");
        }
      } catch (error) {
        console.error("❌ Erro ao processar report:", error.message);
      }
    } else {
      console.warn("⚠️ API não autenticada, ignorando report");
    }
  });

  // Intervalos para verificações periódicas
  const scheduleCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        console.log("⏰ Verificando atualizações de horário...");
        const hasUpdates = await apiClient.checkScheduleUpdates();
        if (hasUpdates && scheduler) {
          console.log("🔄 Atualizando horários do scheduler...");
          const newSchedule = await apiClient.getScheduleTimes();
          scheduler.updateScheduleTimes(newSchedule);
        }
      }
    } catch (error) {
      console.error("❌ Erro na verificação de horários:", error.message);
    }
  }, 60 * 60 * 1000); // 1 hora

  intervals.push(scheduleCheckInterval);

  const videoCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        console.log("🔍 Verificando novos vídeos...");
        const videoUpdates = await apiClient.checkVideoUpdates();
        if (videoUpdates.hasUpdates) {
          console.log(`🎬 ${videoUpdates.newVideos} novos vídeos disponíveis`);
        }
      }
    } catch (error) {
      console.error("❌ Erro na verificação de vídeos:", error.message);
    }
  }, 2 * 60 * 60 * 1000); // 2 horas

  intervals.push(videoCheckInterval);

  console.log("✅ Aplicação inicializada com sucesso");
});

function toggleVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    console.log("📥 Alternando: minimizando janela");
    minimizeVideoWindow();
  } else if (
    videoWindow &&
    !videoWindow.isDestroyed() &&
    !videoWindow.isVisible()
  ) {
    console.log("📤 Alternando: mostrando janela");
    videoWindow.show();
    videoWindow.focus();
    videoWindow.setAlwaysOnTop(true, "screen-saver");
    trayManager.hideFromTray();
    isVideoPlaying = true;

    // Reiniciar vídeo
    if (videoWindow.webContents) {
      videoWindow.webContents
        .executeJavaScript(`
          try {
            const video = document.getElementById('videoPlayer');
            if (video) {
              video.currentTime = 0;
              video.play().catch(e => console.log('Erro ao dar play:', e));
            }
          } catch(e) {
            console.log('Erro no JS:', e);
          }
        `)
        .catch((err) => console.error("Erro ao executar JS:", err));
    }
  } else {
    console.log("🎬 Criando nova janela de vídeo");
    showVideoPopup("manual");
  }
}

async function showVideoPopup(triggerType = "scheduled") {
  console.log("🎬 Mostrando popup, trigger:", triggerType);

  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    console.log("📝 Janela já visível, apenas focando");
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    console.log("📥 Dados do vídeo obtidos:", {
      id: videoData.id,
      title: videoData.title,
      hasUrl: !!videoData.url
    });

    if (!videoData || !videoData.url) {
      console.error("❌ Não foi possível obter o vídeo");
      trayManager.showNotification("Erro", "Não foi possível obter o vídeo");
      return;
    }

    const queryParams = new URLSearchParams({
      videoUrl: videoData.url,
      videoId: videoData.id,
      videoTitle: videoData.title || "Vídeo",
      triggerType: triggerType,
    }).toString();

    const htmlPath = path.join(__dirname, "video-popup.html");
    const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;

    if (videoWindow && !videoWindow.isDestroyed()) {
      // Reutilizar janela existente
      console.log("🔄 Reutilizando janela existente");
      await videoWindow.loadURL(videoUrlWithParams);
      videoWindow.show();
      videoWindow.focus();
      videoWindow.setAlwaysOnTop(true, "screen-saver");
      trayManager.hideFromTray();
      isVideoPlaying = true;
    } else {
      // Criar nova janela
      console.log("🆕 Criando nova janela");
      const windowOptions = {
        width: config.WINDOW.WIDTH,
        height: config.WINDOW.HEIGHT,
        alwaysOnTop: config.WINDOW.ALWAYS_ON_TOP,
        frame: config.WINDOW.FRAME,
        skipTaskbar: config.WINDOW.SKIP_TASKBAR,
        show: true,
        backgroundColor: "#000000",
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false,
          webSecurity: false,
        },
        focusable: true,
        modal: false,
        transparent: false,
        hasShadow: true,
      };

      videoWindow = new BrowserWindow(windowOptions);
      videoWindow.setMenu(null);

      await videoWindow.loadURL(videoUrlWithParams);

      videoWindow.on("ready-to-show", () => {
        console.log("✅ Janela pronta para mostrar");
        videoWindow.show();
        videoWindow.focus();
        videoWindow.setAlwaysOnTop(true, "screen-saver");
        
        trayManager.hideFromTray();
        isVideoPlaying = true;
        
        // Reportar abertura do popup
        if (apiClient.isAuthenticated) {
          apiClient
            .reportVideoView({
              video_id: videoData.id,
              video_title: videoData.title,
              event_type: "popup_opened",
              trigger_type: triggerType,
            })
            .catch((err) => console.error("Erro ao reportar abertura:", err));
        }
      });

      videoWindow.on("close", (event) => {
        if (!isQuitting) {
          console.log("📥 Tentativa de fechar janela, minimizando em vez disso");
          event.preventDefault();
          minimizeVideoWindow();
        }
      });

      videoWindow.on("closed", () => {
        console.log("🗑️ Janela fechada");
        videoWindow = null;
        isVideoPlaying = false;
      });

      videoWindow.webContents.on("did-finish-load", () => {
        console.log("🌐 Conteúdo da janela carregado");
      });

      videoWindow.webContents.setBackgroundThrottling(false);
    }
  } catch (error) {
    console.error("❌ Erro ao mostrar popup:", error);
    
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.destroy();
    }
    videoWindow = null;
    isVideoPlaying = false;
    
    trayManager.showNotification("Erro", "Falha ao abrir vídeo");
  }
}

function minimizeVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed()) {
    try {
      console.log("📥 Minimizando janela...");
      
      // Chamar função no renderer para reportar antes de minimizar
      videoWindow.webContents
        .executeJavaScript(`
          if (typeof window.reportWindowClose === 'function') {
            window.reportWindowClose();
          }
          return true;
        `)
        .then(() => {
          videoWindow.hide();
          trayManager.showInTray();
          isVideoPlaying = false;
          console.log("✅ Janela minimizada");
        })
        .catch((err) => {
          console.error("❌ Erro ao executar reportWindowClose:", err);
          videoWindow.hide();
          trayManager.showInTray();
          isVideoPlaying = false;
        });
    } catch (error) {
      console.error("❌ Erro ao minimizar janela:", error);
    }
  }
}

function cleanup() {
  console.log("🧹 Limpando recursos...");
  
  intervals.forEach((interval) => clearInterval(interval));
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
  console.log("✅ Limpeza concluída");
}

app.on("will-quit", (event) => {
  console.log("🛑 Aplicação será encerrada");
  if (!isQuitting) {
    isQuitting = true;
    cleanup();
  }
});

app.on("window-all-closed", () => {
  console.log("🚪 Todas as janelas fechadas");
  // Não sair da aplicação para manter no tray
});

app.on("activate", () => {
  console.log("🔘 Aplicação ativada");
  if (videoWindow === null && !isQuitting) {
    showVideoPopup("activate");
  }
});