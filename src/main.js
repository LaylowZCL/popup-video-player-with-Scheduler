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
  console.log('🚀 Iniciando', config.APP.NAME);
  console.log('🌐 Conectando a:', config.API.BASE_URL);

  apiClient = new ApiClient();

  // Testar autenticação
  await apiClient.testAuthentication().then(success => {
    if (!success) console.log('⚠️  Modo offline');
  });

  // Teste rápido de vídeo
  console.log('🧪 Teste rápido - obtendo vídeo...');
  try {
    const testVideo = await apiClient.getNextVideo();
    console.log('🧪 Teste OK - Vídeo disponível:', {
      title: testVideo.title,
      url: testVideo.url.substring(0, 100) + '...'
    });
  } catch (err) {
    console.error('🧪 Teste FALHOU:', err.message);
  }

  trayManager = new TrayManager(app);
  trayManager.on('open-video', () => toggleVideoWindow());
  trayManager.on('debug-system', () => debugSystem());
  trayManager.on('minimize-window', minimizeVideoWindow);
  trayManager.on('reload-video', () => showVideoPopup('manual-reload'));
  trayManager.on('check-videos', () => {
    // Forçar verificação de vídeos
    apiClient.checkVideoUpdates().then(console.log);
  });
  trayManager.on('check-schedule', () => {
    // Forçar verificação de horários
    apiClient.checkScheduleUpdates().then(console.log);
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

  // Verificar horários a cada 30 segundos
  const scheduleCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        const hasUpdates = await apiClient.checkScheduleUpdates();
        if (hasUpdates && scheduler) {
          console.log('📅 Novos horários detectados');
          const newSchedule = await apiClient.getScheduleTimes();
          scheduler.updateScheduleTimes(newSchedule);
          // Não mostrar notificação para evitar spam
        }
      }
    } catch (error) {
      console.error('❌ Erro ao verificar horários:', error.message);
    }
  }, 30 * 1000);

  intervals.push(scheduleCheckInterval);

  // Verificar vídeos a cada 10 minutos
  const videoCheckInterval = setInterval(async () => {
    try {
      if (apiClient.isAuthenticated) {
        console.log('🔄 Verificando novos vídeos...');
        const videoUpdates = await apiClient.checkVideoUpdates();

        if (videoUpdates.hasUpdates && videoUpdates.newVideos > 0) {
          console.log(`🎬 ${videoUpdates.newVideos} novo(s) vídeo(s)!`);
          trayManager.showNotification(
            'Novos Vídeos',
            `${videoUpdates.newVideos} novo(s) vídeo(s) disponível(is)`
          );
        }
      }
    } catch (error) {
      console.error('❌ Erro ao verificar vídeos:', error.message);
    }
  }, 10 * 60 * 1000);

  intervals.push(videoCheckInterval);

  // TESTE AUTOMÁTICO - mostrar vídeo após 3 segundos
  console.log('⏱️  Teste automático iniciará em 3 segundos...');
  setTimeout(() => {
    console.log('🧪 TESTE AUTOMÁTICO: Abrindo vídeo...');
    showVideoPopup('auto-test');
  }, 3000);
});

// ========== FUNÇÕES AUXILIARES ==========

// DEBUG DO SISTEMA
function debugSystem() {
  console.log('🔍 === DEBUG DO SISTEMA ===');
  console.log('API Client:', {
    isAuthenticated: apiClient.isAuthenticated,
    currentVideoId: apiClient.currentVideoId,
    sessionId: apiClient.sessionId
  });
  
  console.log('Video Window:', {
    exists: !!videoWindow,
    isDestroyed: videoWindow ? videoWindow.isDestroyed() : 'N/A',
    isVisible: videoWindow ? videoWindow.isVisible() : 'N/A',
    isFocused: videoWindow ? videoWindow.isFocused() : 'N/A'
  });
  
  console.log('Estado:', {
    isVideoPlaying: isVideoPlaying,
    isQuitting: isQuitting,
    intervalsCount: intervals.length
  });
  
  console.log('Config:', {
    apiBaseUrl: config.API.BASE_URL,
    windowSize: `${config.WINDOW.WIDTH}x${config.WINDOW.HEIGHT}`
  });
  
  console.log('=== FIM DEBUG ===');
}

// TOGGLE VIDEO WINDOW - Alternar entre mostrar/minimizar
function toggleVideoWindow() {
  console.log('🔄 Toggle Video Window chamado');
  
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    // Janela está visível, então minimizar
    console.log('📥 Janela visível - minimizando...');
    minimizeVideoWindow();
  } else if (videoWindow && !videoWindow.isDestroyed() && !videoWindow.isVisible()) {
    // Janela existe mas está escondida, mostrar
    console.log('👁️  Janela existe - mostrando...');
    videoWindow.show();
    videoWindow.focus();
    videoWindow.setAlwaysOnTop(true, 'screen-saver');
    trayManager.hideFromTray();
    isVideoPlaying = true;
    
    // Recarregar vídeo do início
    if (videoWindow.webContents) {
      videoWindow.webContents.executeJavaScript(`
        try {
          const video = document.getElementById('videoPlayer');
          if (video) {
            video.currentTime = 0;
            video.play().catch(e => console.log('Auto-play prevenido:', e));
          }
        } catch(e) {}
      `).catch(console.error);
    }
  } else {
    // Janela não existe, criar nova
    console.log('🆕 Criando nova janela...');
    showVideoPopup('manual');
  }
}

// SHOW VIDEO POPUP - Criar/recriar janela de vídeo
async function showVideoPopup(triggerType = 'scheduled') {
  console.log(`🎬 === SHOWVIDEOPOPUP INICIADO (${triggerType}) ===`);

  // Se já existe janela visível, apenas focar nela
  if (videoWindow && !videoWindow.isDestroyed() && videoWindow.isVisible()) {
    console.log('ℹ️  Janela já visível - apenas focando');
    videoWindow.focus();
    return;
  }

  try {
    // 1. Obter dados do vídeo
    console.log('📥 Obtendo vídeo da API...');
    const videoData = await apiClient.getNextVideo();
    
    if (!videoData || !videoData.url) {
      console.error('❌ ERRO: Dados do vídeo inválidos!', videoData);
      trayManager.showNotification('Erro', 'Não foi possível obter o vídeo');
      return;
    }
    
    console.log('🔗 URL do vídeo obtida:', videoData.url);
    console.log('✅ Dados do vídeo:', {
      title: videoData.title,
      url: videoData.url.substring(0, 80) + '...',
      id: videoData.id
    });

    // TESTE: Usar vídeo de fallback se necessário
    const useFallbackTest = false;
    if (useFallbackTest) {
      console.log('🧪 TESTE: Usando vídeo de fallback...');
      videoData.url = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      videoData.title = 'Vídeo Teste (Fallback)';
    }

    // 2. Se janela existe mas está destruída ou não existe, criar nova
    if (videoWindow && !videoWindow.isDestroyed()) {
      console.log('🔄 Reutilizando janela existente...');
      
      // Recarregar com novo vídeo
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
      // 3. CRIAR NOVA JANELA
      console.log('🆕 Criando nova janela...');
      
      // Configurações da janela
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
      
      console.log('⚙️  Opções da janela:', windowOptions);
      
      videoWindow = new BrowserWindow(windowOptions);
      
      // ABRIR DEVTOOLS PARA DEBUG (comente esta linha em produção)
      // videoWindow.webContents.openDevTools({ mode: 'detach' });
      
      // Desabilitar menu
      videoWindow.setMenu(null);
      
      // Configurar URL com query parameters
      const queryParams = new URLSearchParams({
        videoUrl: videoData.url,
        videoId: videoData.id,
        videoTitle: videoData.title || 'Vídeo',
        triggerType: triggerType
      }).toString();

      const htmlPath = path.join(__dirname, 'video-popup.html');
      console.log('📄 Caminho HTML:', htmlPath);
      
      const videoUrlWithParams = `file://${htmlPath}?${queryParams}`;
      console.log('🌐 URL completa (truncada):', videoUrlWithParams.substring(0, 150) + '...');

      // 4. CARREGAR O HTML
      console.log('📥 Carregando HTML...');
      await videoWindow.loadURL(videoUrlWithParams);
      
      console.log('✅ HTML carregado');

      // 5. CONFIGURAR EVENTOS DA JANELA
      
      // Quando a janela está pronta para mostrar
      videoWindow.on('ready-to-show', () => {
        console.log('✅ ready-to-show disparado');
        videoWindow.show();
        videoWindow.focus();
        videoWindow.setAlwaysOnTop(true, 'screen-saver');
        
        trayManager.hideFromTray();
        isVideoPlaying = true;
        
        console.log('🎉 Janela visível e focada!');
        
        // Reportar abertura
        if (apiClient.isAuthenticated) {
          apiClient.reportVideoView({
            videoId: videoData.id,
            videoTitle: videoData.title,
            event_type: 'popup_opened',
            trigger_type: triggerType
          }).catch(e => console.error('⚠️  Erro ao reportar:', e.message));
        }
      });

      // Prevenir fechamento real - apenas minimizar
      videoWindow.on('close', (event) => {
        console.log('🚫 Tentativa de fechar janela - prevenindo...');
        
        if (!isQuitting) {
          event.preventDefault();
          minimizeVideoWindow();
        } else {
          console.log('🔄 Fechando app completamente...');
        }
      });

      // Quando a janela perde foco (opcional)
      videoWindow.on('blur', () => {
        console.log('🔍 Janela perdeu foco');
      });

      // Quando a janela ganha foco
      videoWindow.on('focus', () => {
        console.log('🎯 Janela ganhou foco');
      });

      // Eventos de carregamento
      videoWindow.webContents.on('did-finish-load', () => {
        console.log('✅ Conteúdo HTML carregado com sucesso');
      });

      videoWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        console.error('❌ Falha ao carregar:', {
          errorCode,
          errorDescription,
          validatedURL: validatedURL.substring(0, 100) + '...'
        });
        
        trayManager.showNotification('Erro', 'Falha ao carregar vídeo');
        minimizeVideoWindow();
      });

      // Desabilitar throttling
      videoWindow.webContents.setBackgroundThrottling(false);
    }

    console.log('🎬 ShowVideoPopup concluído com sucesso!');

  } catch (error) {
    console.error('❌ ERRO CRÍTICO em showVideoPopup:', error);
    console.error('Stack:', error.stack);
    
    // Limpar estado em caso de erro
    if (videoWindow && !videoWindow.isDestroyed()) {
      videoWindow.destroy();
    }
    videoWindow = null;
    isVideoPlaying = false;
    
    trayManager.showNotification('Erro', 'Falha ao abrir vídeo');
  }
  
  console.log(`=== SHOWVIDEOPOPUP FINALIZADO (${triggerType}) ===`);
}

// MINIMIZAR JANELA
function minimizeVideoWindow() {
  console.log('📥 Minimizando janela de vídeo...');
  
  if (videoWindow && !videoWindow.isDestroyed()) {
    try {
      // Apenas esconder a janela, NÃO destruir
      videoWindow.hide();
      trayManager.showInTray();
      isVideoPlaying = false;
      
      console.log('✅ Janela minimizada, app continua em background');
    } catch (error) {
      console.error('❌ Erro ao minimizar janela:', error);
    }
  } else {
    console.log('ℹ️  Nenhuma janela de vídeo para minimizar');
  }
}

// LIMPAR RECURSOS
function cleanup() {
  console.log('🧹 Limpando recursos...');

  intervals.forEach(interval => clearInterval(interval));
  intervals = [];

  if (scheduler) {
    scheduler.destroy();
    scheduler = null;
  }

  // Fecha janela de vídeo se existir
  if (videoWindow && !videoWindow.isDestroyed()) {
    videoWindow.destroy();
    videoWindow = null;
  }

  isVideoPlaying = false;
}

// FECHAR APP
app.on('will-quit', (event) => {
  if (!isQuitting) {
    isQuitting = true;
    cleanup();
  }
});

// IMPORTANTE: Não fechar app quando todas as janelas fecharem
// Mantém o app rodando em background com tray icon
app.on('window-all-closed', () => {
  console.log('📭 Todas as janelas fechadas, app continua em background com tray icon');
  // Não chamar app.quit() - isso mantém o app rodando
});

// No macOS, recriar janela quando dock icon é clicado
app.on('activate', () => {
  console.log('🔵 Activate event (macOS)');
  if (videoWindow === null && !isQuitting) {
    showVideoPopup('activate');
  }
});