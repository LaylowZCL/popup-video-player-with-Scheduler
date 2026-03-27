const { app, BrowserWindow, ipcMain, nativeImage, Menu, screen } = require("electron");
const path = require("path");
const fs = require("fs");
const { createLogger } = require("./logger");
const config = require("./config");
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
      label: "Arquivo",
      submenu: [
        { role: "quit", label: "Sair" }
      ],
    },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" },
        { role: "redo", label: "Refazer" },
        { type: "separator" },
        { role: "cut", label: "Recortar" },
        { role: "copy", label: "Copiar" },
        { role: "paste", label: "Colar" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" },
        { role: "forceReload", label: "Recarregar Forçadamente" },
        { role: "toggleDevTools", label: "Ferramentas de Desenvolvedor" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Tela Cheia" },
      ],
    },
    {
      label: "Janela",
      submenu: [
        { role: "minimize", label: "Minimizar" },
        { role: "zoom", label: "Zoom" },
        ...(isMac ? [{ type: "separator" }, { role: "front", label: "Trazer para Frente" }] : [{ role: "close", label: "Fechar" }]),
      ],
    },
    {
      label: "Vídeo",
      submenu: [
        {
          label: "Assistir Agora",
          accelerator: "CmdOrCtrl+V",
          click: () => showVideoPopup("manual")
        },
        {
          label: "Recarregar Vídeos e Horários",
          accelerator: "CmdOrCtrl+R",
          click: async () => {
            logger.info("🔄 Recarregando vídeos e horários...");
            await refreshVideosAndSchedules();
          }
        },
        { type: "separator" },
        {
          label: "Legendas",
          submenu: [
            {
              label: "Carregar Arquivo SRT",
              click: () => {
                // TODO: Implementar carregamento de legendas
                logger.info("📝 Carregar legendas SRT");
              }
            },
            {
              label: "Baixar Legendas da URL",
              click: () => {
                // TODO: Implementar download de legendas
                logger.info("📥 Baixar legendas da URL");
              }
            }
          ]
        }
      ],
    },
    {
      role: "help",
      submenu: [
        { 
          label: "Sobre",
          click: () => {
            require('electron').dialog.showMessageBox({
              type: 'info',
              title: 'Sobre',
              message: 'Banco Moc Popup Video',
              detail: `Versão: ${config.APP.VERSION}\nPlayer de vídeo popup com agendamento automático.\n\nDesenvolvido para Banco Moc.`,
              buttons: ['OK']
            });
          }
        }
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function resolveWindowSettings(windowSettings = {}) {
  const resolved = {
    ...(activePopupWindowSettings || {}),
    ...(windowSettings || {}),
  };

  return {
    ...resolved,
    width: Number.isFinite(Number(resolved.width)) ? Number(resolved.width) : null,
    height: Number.isFinite(Number(resolved.height)) ? Number(resolved.height) : null,
    x: Number.isFinite(Number(resolved.x)) ? Number(resolved.x) : null,
    y: Number.isFinite(Number(resolved.y)) ? Number(resolved.y) : null,
    position: resolved.position || resolved.gravity || null,
  };
}

function applyPopupWindowSettings(windowSettings = {}) {
  const resolvedSettings = resolveWindowSettings(windowSettings);
  activePopupWindowSettings = resolvedSettings;

  if (!videoWindow || videoWindow.isDestroyed()) {
    logger.info("🪟 Definições da janela guardadas para o próximo popup:", resolvedSettings);
    return resolvedSettings;
  }

  const calculated = calculateWindowPosition(resolvedSettings);
  videoWindow.setBounds({
    x: calculated.x,
    y: calculated.y,
    width: calculated.width,
    height: calculated.height,
  });
  videoWindow.setAlwaysOnTop(true, "screen-saver");
  logger.info("🪟 Configuração da janela reaplicada:", calculated);
  return calculated;
}

function calculateWindowPosition(windowSettings) {
  const { width: screenWidth, height: screenHeight } = screen.getPrimaryDisplay().workAreaSize;
  
  // Valores padrão da config
  const defaultWidth = config.WINDOW.WIDTH;
  const defaultHeight = config.WINDOW.HEIGHT;
  
  // Usar valores da API ou padrão
  const windowWidth = windowSettings.width || defaultWidth;
  const windowHeight = windowSettings.height || defaultHeight;
  
  let x, y;
  
  const hasExplicitCoordinates = Number.isFinite(windowSettings.x) && Number.isFinite(windowSettings.y);

  // Se a API forneceu coordenadas específicas válidas
  if (hasExplicitCoordinates) {
    x = Number(windowSettings.x);
    y = Number(windowSettings.y);
    logger.info(`📍 Usando coordenadas da API: x=${x}, y=${y}`);
  } else {
    // Calcular posição baseada no anchor/gravity
    const position = windowSettings.position || windowSettings.gravity || 'bottom-right';
    
    const normalizedPosition = String(position || 'inferior-direito')
      .toLowerCase()
      .trim()
      .replace(/_/g, '-')
      .replace(/\s+/g, '-')
      .replace('centre', 'center');

    switch (normalizedPosition) {
      case 'superior-esquerdo':
      case 'top-left':
      case 'left-top':
      case 'north-west':
        x = 50;
        y = 50;
        break;

      case 'superior-direito':
      case 'top-right':
      case 'right-top':
      case 'north-east':
        x = screenWidth - windowWidth - 50;
        y = 50;
        break;

      case 'inferior-esquerdo':
      case 'bottom-left':
      case 'left-bottom':
      case 'south-west':
        x = 50;
        y = screenHeight - windowHeight - 50;
        break;

      case 'inferior-direito':
      case 'bottom-right':
      case 'right-bottom':
      case 'south-east':
        x = screenWidth - windowWidth - 50;
        y = screenHeight - windowHeight - 50;
        break;

      case 'centro':
      case 'center':
      case 'middle':
        x = Math.floor((screenWidth - windowWidth) / 2);
        y = Math.floor((screenHeight - windowHeight) / 2);
        break;

      case 'top-center':
      case 'center-top':
      case 'north':
      case 'top':
        x = Math.floor((screenWidth - windowWidth) / 2);
        y = 50;
        break;

      case 'bottom-center':
      case 'center-bottom':
      case 'south':
      case 'bottom':
        x = Math.floor((screenWidth - windowWidth) / 2);
        y = screenHeight - windowHeight - 50;
        break;

      case 'left':
      case 'center-left':
      case 'west':
        x = 50;
        y = Math.floor((screenHeight - windowHeight) / 2);
        break;

      case 'right':
      case 'center-right':
      case 'east':
      default:
        x = screenWidth - windowWidth - 50;
        y = Math.floor((screenHeight - windowHeight) / 2);
        if (![ 'bottom-right', 'right-bottom', 'south-east' ].includes(normalizedPosition)) {
          logger.info(`📍 Posição não reconhecida (${position}), usando fallback lateral direito.`);
        }
        break;
    }
    
    logger.info(`📍 Posição calculada (${normalizedPosition}): x=${x}, y=${y}`);
  }
  
  // Garantir que a janela não saia da tela
  x = Math.max(0, Math.min(x, screenWidth - windowWidth));
  y = Math.max(0, Math.min(y, screenHeight - windowHeight));
  
  return { x, y, width: windowWidth, height: windowHeight };
}

if (process.platform === "win32") {
  app.setAppUserModelId("com.bancomoc.popupvideo");
}
const TrayManager = require("./trayManager");
const Scheduler = require("./scheduler");
const ApiClient = require("./apiClient");

let videoWindow = null;
let trayManager = null;
let scheduler = null;
let isQuitting = false;
let apiClient = null;
let intervals = [];
let isVideoPlaying = false;
let isOpeningPopup = false;
let activePopupWindowSettings = null;
let lastScheduleSnapshot = [];

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
  await apiClient.checkApiHealth();

  // Inicializar tray manager
  trayManager = new TrayManager(app);
  trayManager.on("open-video", () => showVideoPopup("manual"));
  trayManager.on("minimize-window", minimizeVideoWindow);
  trayManager.on("refresh-content", async () => {
    await refreshVideosAndSchedules();
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

  const initialSchedule = apiClient.isAuthenticated ? await apiClient.getScheduleTimes().catch(() => null) : null;
  if (Array.isArray(initialSchedule)) {
    updateScheduleSnapshot(initialSchedule);
  }

  const scheduleCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        logger.info("⏰ Verificando atualizações de horário...");
        const hasUpdates = await apiClient.checkScheduleUpdates();
        if (hasUpdates && scheduler) {
          logger.info("🔄 Atualizando horários do scheduler...");
          const newSchedule = await apiClient.getScheduleTimes();
          const changed = updateScheduleSnapshot(newSchedule);
          await scheduler.updateScheduleTimes(newSchedule);
          if (changed) {
            logger.info(`🧭 Horários atualizados: ${formatScheduleList(newSchedule)}`);
          }
        }
      }
    } catch (error) {
      logger.error("❌ Erro na verificação de horários:", error.message);
    }
  }, 60 * 60 * 1000); // 1 hora

  intervals.push(scheduleCheckInterval);

  const scheduleForceRefreshInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated && scheduler) {
        logger.info("🧭 Recarregamento forçado de horários (8h)...");
        const newSchedule = await apiClient.getScheduleTimes();
        const changed = updateScheduleSnapshot(newSchedule);
        await scheduler.updateScheduleTimes(newSchedule);
        if (changed) {
          logger.info(`🧭 Horários atualizados: ${formatScheduleList(newSchedule)}`);
        }
      }
    } catch (error) {
      logger.error("❌ Erro no recarregamento forçado de horários:", error.message);
    }
  }, 8 * 60 * 60 * 1000); // 8 horas

  intervals.push(scheduleForceRefreshInterval);

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

async function refreshVideosAndSchedules() {
  if (!apiClient || !apiClient.isAuthenticated) {
    trayManager?.showNotification("Erro", "Cliente não autenticado na API");
    return;
  }

  try {
    logger.info("🔄 A recarregar vídeos, horários e definições da janela...");

    const [videoUpdates, newSchedule, popupSettings] = await Promise.all([
      apiClient.checkVideoUpdates(),
      apiClient.getScheduleTimes(),
      apiClient.forceRefreshDashboardPopupSettings(),
    ]);

    if (scheduler) {
      const changed = updateScheduleSnapshot(newSchedule);
      await scheduler.updateScheduleTimes(newSchedule);
      if (changed) {
        logger.info(`🧭 Horários actualizados: ${formatScheduleList(newSchedule)}`);
      } else {
        logger.info(`🧭 Horários mantidos: ${formatScheduleList(newSchedule)}`);
      }
    }

    if (popupSettings) {
      logger.info("🪟 Definições da janela recarregadas:", popupSettings);
      activePopupWindowSettings = resolveWindowSettings(popupSettings);
      applyPopupWindowSettings(activePopupWindowSettings);
    } else {
      logger.info("🪟 Sem novas definições remotas da janela; mantidas as actuais.");
    }

    const videoMessage = videoUpdates?.hasUpdates
      ? `${videoUpdates.newVideos} novos vídeos detectados`
      : `${videoUpdates?.count ?? 0} vídeos confirmados`;
    const scheduleMessage = Array.isArray(newSchedule) && newSchedule.length
      ? `Horários: ${formatScheduleList(newSchedule)}`
      : "Sem horários remotos válidos";
    const popupMessage = popupSettings
      ? `Janela: ${popupSettings.width || 'auto'}x${popupSettings.height || 'auto'} · ${popupSettings.position || 'padrão'}`
      : "Janela: sem alterações remotas";

    trayManager?.showNotification(
      "Conteúdo recarregado",
      `${videoMessage}
${scheduleMessage}
${popupMessage}`
    );
  } catch (error) {
    logger.error("❌ Erro ao recarregar conteúdo:", error.message);
    trayManager?.showNotification("Erro", "Falha ao recarregar vídeos, horários e definições");
  }
}

function normalizeScheduleList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter((item) => item.length > 0)
    .sort();
}

function formatScheduleList(list) {
  const normalized = normalizeScheduleList(list);
  return normalized.length ? normalized.join(", ") : "nenhum horário";
}

function updateScheduleSnapshot(newSchedule) {
  const normalized = normalizeScheduleList(newSchedule);
  const previous = lastScheduleSnapshot.join("|");
  const current = normalized.join("|");
  if (current !== previous) {
    lastScheduleSnapshot = normalized;
    return true;
  }
  return false;
}

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
  } else {
    logger.info("🎬 Criando nova janela de vídeo");
    showVideoPopup("manual");
  }
}

async function showVideoPopup(triggerType = "scheduled") {
  if (isOpeningPopup) {
    logger.info("⏳ Popup já está a abrir, ignorando nova chamada");
    return;
  }
  isOpeningPopup = true;
  logger.info("🎬 Mostrando popup, trigger:", triggerType);

  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    logger.info("📝 Janela já visível, apenas focando");
    videoWindow.focus();
    isOpeningPopup = false;
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

    const subtitlesParam = videoData.subtitles && videoData.subtitles.length
      ? JSON.stringify(videoData.subtitles)
      : "";

    const queryParams = new URLSearchParams({
      videoUrl: videoData.url,
      videoId: videoData.videoId || "",
      scheduleId: videoData.scheduleId || "",
      videoTitle: videoData.title || "Vídeo",
      triggerType: triggerType,
      subtitles: subtitlesParam
    }).toString();

    const htmlPath = path.join(__dirname, "video-popup.html");
    const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;

    const mergedWindowSettings = resolveWindowSettings(videoData.windowSettings || {});
    activePopupWindowSettings = mergedWindowSettings;

    if (videoWindow && !videoWindow.isDestroyed()) {
      // Reutilizar janela existente
      logger.info("🔄 Reutilizando janela existente");
      applyPopupWindowSettings(mergedWindowSettings);
      await videoWindow.loadURL(videoUrlWithParams);
      videoWindow.show();
      videoWindow.focus();
      videoWindow.setAlwaysOnTop(true, "screen-saver");
      trayManager.hideFromTray();
      isVideoPlaying = true;
    } else {
      // Criar nova janela
      logger.info("🆕 Criando nova janela");
      
      // Calcular posição e tamanho dinâmicos
      const windowSettings = mergedWindowSettings;
      const calculatedPosition = calculateWindowPosition(windowSettings);
      
      logger.info("📐 Configurações da janela:", calculatedPosition);
      
      const windowOptions = {
        icon: process.platform === "win32" ? APP_ICON_ICO : APP_ICON_PNG,
        width: calculatedPosition.width,
        height: calculatedPosition.height,
        x: calculatedPosition.x,
        y: calculatedPosition.y,
        alwaysOnTop: config.WINDOW.ALWAYS_ON_TOP,
        frame: config.WINDOW.FRAME,
        skipTaskbar: config.WINDOW.SKIP_TASKBAR,
        show: true,
        backgroundColor: "#00000000", // Transparente
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
  } finally {
    isOpeningPopup = false;
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
