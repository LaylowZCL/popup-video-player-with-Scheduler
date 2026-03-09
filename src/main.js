const { app, BrowserWindow, ipcMain, nativeImage, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { createLogger } = require("./logger");
const logger = createLogger("main");

const APP_DISPLAY_NAME = "Banco Moc Popup Video";
app.setName(APP_DISPLAY_NAME);
app.name = APP_DISPLAY_NAME;

const APP_ICON_PNG = path.join(__dirname, "../assets/icons/icon.png");
const APP_ICON_ICO = path.join(__dirname, "../assets/icons/icon.ico");
const APP_ICON_ICNS = path.join(__dirname, "../assets/icons/icon.icns");

function setDockIconSafely() {
  if (process.platform !== "darwin" || !app.dock) {
    return;
  }

  // In dev mode, prefer PNG because some local .icns files are rejected by Electron.
  const iconCandidates = [APP_ICON_PNG, APP_ICON_ICNS];
  for (const iconPath of iconCandidates) {
    try {
      if (!fs.existsSync(iconPath)) {
        continue;
      }
      const iconImage = nativeImage.createFromPath(iconPath);
      if (!iconImage.isEmpty()) {
        app.dock.setIcon(iconImage);
        return;
      }
    } catch (error) {
      logger.warn(`Falha ao carregar icon: ${iconPath}`, error.message);
    }
  }
}

function setApplicationMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: APP_DISPLAY_NAME,
            submenu: [
              { role: "about", label: `Sobre ${APP_DISPLAY_NAME}` },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", label: `Sair de ${APP_DISPLAY_NAME}` },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front" }] : [{ role: "close" }]),
      ],
    },
    {
      role: "help",
      submenu: [{ label: APP_DISPLAY_NAME, enabled: false }],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.bancomoc.popupvideo");
}
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
  app.setName(APP_DISPLAY_NAME);
  app.name = APP_DISPLAY_NAME;
  app.setAboutPanelOptions({ applicationName: APP_DISPLAY_NAME });
  setDockIconSafely();
  setApplicationMenu();

  logger.info("🚀 Aplicação inicializando...");
  
  apiClient = new ApiClient();

  // Testar autenticação
  const authResult = await apiClient.testAuthentication();
  logger.info("🔑 Autenticação:", authResult ? "✅ Sucesso" : "❌ Falha");

  // Inicializar tray manager
  trayManager = new TrayManager(app);
  trayManager.on("open-video", () => toggleVideoWindow());
  trayManager.on("minimize-window", minimizeVideoWindow);
  trayManager.on("reload-video", () => showVideoPopup("manual-reload"));
  trayManager.on("check-videos", () => {
    logger.info("🔍 Verificando novos vídeos...");
    apiClient.checkVideoUpdates();
  });
  trayManager.on("check-schedule", () => {
    logger.info("⏰ Verificando horários...");
    apiClient.checkScheduleUpdates();
  });
  trayManager.on("quit-app", () => {
    logger.info("🛑 Saindo da aplicação...");
    isQuitting = true;
    cleanup();
    app.quit();
  });

  // Inicializar scheduler
  scheduler = new Scheduler({
    onTrigger: () => {
      logger.info("⏰ Trigger do scheduler executado");
      showVideoPopup("scheduled");
    },
    apiClient: apiClient
  });

  // Handlers IPC
  ipcMain.on("minimize-window", () => {
    logger.info("📥 IPC: minimize-window recebido");
    minimizeVideoWindow();
  });

  ipcMain.on("report-video-view", async (event, videoData) => {
    logger.info("📊 IPC: report-video-view recebido:", {
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
          logger.info("✅ Report enviado com sucesso");
        } else {
          logger.warn("⚠️ Falha ao enviar report");
        }
      } catch (error) {
        logger.error("❌ Erro ao processar report:", error.message);
      }
    } else {
      logger.warn("⚠️ API não autenticada, ignorando report");
    }
  });

  // Intervalos para verificações periódicas
  const pingInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        await apiClient.ping("heartbeat");
      }
    } catch (error) {
      logger.error("❌ Erro no ping:", error.message);
    }
  }, 5 * 60 * 1000); // 5 minutos

  intervals.push(pingInterval);

  const scheduleCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        logger.info("⏰ Verificando atualizações de horário...");
        const hasUpdates = await apiClient.checkScheduleUpdates();
        if (hasUpdates && scheduler) {
          logger.info("🔄 Atualizando horários do scheduler...");
          const newSchedule = await apiClient.getScheduleTimes();
          scheduler.updateScheduleTimes(newSchedule);
        }
      }
    } catch (error) {
      logger.error("❌ Erro na verificação de horários:", error.message);
    }
  }, 60 * 60 * 1000); // 1 hora

  intervals.push(scheduleCheckInterval);

  const videoCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        logger.info("🔍 Verificando novos vídeos...");
        const videoUpdates = await apiClient.checkVideoUpdates();
        if (videoUpdates.hasUpdates) {
          logger.info(`🎬 ${videoUpdates.newVideos} novos vídeos disponíveis`);
        }
      }
    } catch (error) {
      logger.error("❌ Erro na verificação de vídeos:", error.message);
    }
  }, 2 * 60 * 60 * 1000); // 2 horas

  intervals.push(videoCheckInterval);

  logger.info("✅ Aplicação inicializada com sucesso");

  if (apiClient.isAuthenticated) {
    apiClient.ping("startup").catch(() => {});
  }
});

function toggleVideoWindow() {
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    logger.info("📥 Alternando: minimizando janela");
    minimizeVideoWindow();
  } else if (
    videoWindow &&
    !videoWindow.isDestroyed() &&
    !videoWindow.isVisible()
  ) {
    logger.info("📤 Alternando: mostrando janela");
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
              video.play().catch(() => {});
            }
          } catch(e) {
            // noop
          }
        `)
        .catch((err) => logger.error("Erro ao executar JS:", err));
    }
  } else {
    logger.info("🎬 Criando nova janela de vídeo");
    showVideoPopup("manual");
  }
}

async function showVideoPopup(triggerType = "scheduled") {
  logger.info("🎬 Mostrando popup, trigger:", triggerType);

  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    logger.info("📝 Janela já visível, apenas focando");
    videoWindow.focus();
    return;
  }

  try {
    const videoData = await apiClient.getNextVideo();
    logger.info("📥 Dados do vídeo obtidos:", {
      id: videoData.id,
      title: videoData.title,
      hasUrl: !!videoData.url
    });

    if (!videoData || !videoData.url) {
      logger.error("❌ Não foi possível obter o vídeo");
      trayManager.showNotification("Erro", "Não foi possível obter o vídeo");
      return;
    }

    const queryParams = new URLSearchParams({
      videoUrl: videoData.url,
      videoId: videoData.videoId || "",
      scheduleId: videoData.scheduleId || "",
      videoTitle: videoData.title || "Vídeo",
      triggerType: triggerType,
    }).toString();

    const htmlPath = path.join(__dirname, "video-popup.html");
    const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;

    if (videoWindow && !videoWindow.isDestroyed()) {
      // Reutilizar janela existente
      logger.info("🔄 Reutilizando janela existente");
      await videoWindow.loadURL(videoUrlWithParams);
      videoWindow.show();
      videoWindow.focus();
      videoWindow.setAlwaysOnTop(true, "screen-saver");
      trayManager.hideFromTray();
      isVideoPlaying = true;
    } else {
      // Criar nova janela
      logger.info("🆕 Criando nova janela");
      const windowOptions = {
        icon: process.platform === "win32" ? APP_ICON_ICO : APP_ICON_PNG,
        width: config.WINDOW.WIDTH,
        height: config.WINDOW.HEIGHT,
        alwaysOnTop: config.WINDOW.ALWAYS_ON_TOP,
        frame: config.WINDOW.FRAME,
        skipTaskbar: config.WINDOW.SKIP_TASKBAR,
        show: true,
        backgroundColor: "#000000",
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          webSecurity: true,
          preload: path.join(__dirname, "preload.js"),
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
        logger.info("✅ Janela pronta para mostrar");
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
            .catch((err) => logger.error("Erro ao reportar abertura:", err));
        }
      });

      videoWindow.on("close", (event) => {
        if (!isQuitting) {
          logger.info("📥 Tentativa de fechar janela, minimizando em vez disso");
          event.preventDefault();
          minimizeVideoWindow();
        }
      });

      videoWindow.on("closed", () => {
        logger.info("🗑️ Janela fechada");
        videoWindow = null;
        isVideoPlaying = false;
      });

      videoWindow.webContents.on("did-finish-load", () => {
        logger.info("🌐 Conteúdo da janela carregado");
      });

      videoWindow.webContents.setBackgroundThrottling(false);
    }
  } catch (error) {
    logger.error("❌ Erro ao mostrar popup:", error);
    
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
      logger.info("📥 Minimizando janela...");
      
      // Chamar função no renderer para reportar antes de minimizar
      videoWindow.webContents.send("window-close-request");
      videoWindow.hide();
      trayManager.showInTray();
      isVideoPlaying = false;
      logger.info("✅ Janela minimizada");
    } catch (error) {
      logger.error("❌ Erro ao minimizar janela:", error);
    }
  }
}

function cleanup() {
  logger.info("🧹 Limpando recursos...");
  
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
  logger.info("✅ Limpeza concluída");
}

app.on("will-quit", (event) => {
  logger.info("🛑 Aplicação será encerrada");
  if (!isQuitting) {
    isQuitting = true;
    cleanup();
  }
});

app.on("window-all-closed", () => {
  logger.info("🚪 Todas as janelas fechadas");
  // Não sair da aplicação para manter no tray
});

app.on("activate", () => {
  logger.info("🔘 Aplicação ativada");
  if (videoWindow === null && !isQuitting) {
    showVideoPopup("activate");
  }
});
