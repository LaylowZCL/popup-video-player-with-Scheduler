const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const EventEmitter = require('events');

class TrayManager extends EventEmitter {
  constructor(app) {
    super();
    this.app = app;
    this.tray = null;
    this.isAppQuitting = false;
    this.createTray();
  }

  createTray() {
    try {
      console.log('🔄 Criando tray icon...');
      
      // Tentar carregar ícone personalizado
      let trayIcon;
      const iconPath = path.join(__dirname, '../assets/icons/icon.png');
      
      try {
        if (require('fs').existsSync(iconPath)) {
          trayIcon = nativeImage.createFromPath(iconPath);
          console.log('✅ Ícone personalizado carregado:', iconPath);
        } else {
          throw new Error('Ícone não encontrado');
        }
      } catch (error) {
        console.log('⚠️  Ícone personalizado não encontrado, criando ícone padrão...');
        // Criar ícone padrão (círculo vermelho com "V")
        const size = 16;
        const image = nativeImage.createEmpty();
        const canvas = image.getCanvas();
        
        if (canvas && canvas.getContext) {
          const ctx = canvas.getContext('2d');
          canvas.width = size;
          canvas.height = size;
          
          // Fundo vermelho
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
          ctx.fill();
          
          // Letra "V" branca
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('V', size/2, size/2);
        }
        
        trayIcon = image;
      }
      
      // Redimensionar para tamanho adequado
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      
      // Criar tray
      this.tray = new Tray(trayIcon);
      
      // Configurar tooltip
      this.tray.setToolTip('Video Popup Scheduler\nClique para mostrar/ocultar vídeo');
      
      // Criar menu de contexto
      this.updateContextMenu();
      
      // Clique simples alterna mostrar/ocultar vídeo
      this.tray.on('click', (event, bounds) => {
        console.log('🖱️  Clique no tray icon');
        this.emit('open-video');
      });
      
      // Clique com botão direito já mostra o menu (comportamento padrão)
      
      console.log('✅ Tray criado com sucesso');
      
    } catch (error) {
      console.error('❌ Erro ao criar tray:', error);
      // Mesmo com erro, o app pode continuar sem tray
    }
  }
  
  updateContextMenu() {
    if (!this.tray || this.tray.isDestroyed()) return;
    
    try {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '🎬 Mostrar/Ocultar Vídeo',
          click: () => {
            console.log('📺 Menu: Mostrar/Ocultar Vídeo');
            this.emit('open-video');
          }
        },
        {
          label: '🔄 Recarregar Vídeo Agora',
          click: () => {
            console.log('🔁 Menu: Recarregar Vídeo');
            // Emitir evento especial para forçar novo vídeo
            this.emit('reload-video');
          }
        },
        {
          type: 'separator'
        },
        {
          label: '⚙️  Status do Sistema',
          click: () => {
            console.log('🔍 Menu: Status do Sistema');
            this.emit('debug-system');
          }
        },
        {
          label: '📊 Verificar Agora',
          submenu: [
            {
              label: 'Verificar Novos Vídeos',
              click: () => {
                console.log('🔍 Menu: Verificar Novos Vídeos');
                this.emit('check-videos');
              }
            },
            {
              label: 'Verificar Horários',
              click: () => {
                console.log('⏰ Menu: Verificar Horários');
                this.emit('check-schedule');
              }
            }
          ]
        },
        {
          type: 'separator'
        },
        {
          label: 'ℹ️  Sobre',
          click: () => {
            console.log('📋 Menu: Sobre');
            this.showAboutInfo();
          }
        },
        {
          type: 'separator'
        },
        {
          label: '❌ Sair',
          click: () => {
            console.log('🚪 Menu: Sair');
            this.quitApp();
          }
        }
      ]);
      
      this.tray.setContextMenu(contextMenu);
      
    } catch (error) {
      console.error('❌ Erro ao atualizar menu do tray:', error);
    }
  }
  
  showInTray() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        // Atualizar ícone para mostrar que app está em tray
        const iconPath = path.join(__dirname, '../assets/icons/icon.png');
        
        try {
          if (require('fs').existsSync(iconPath)) {
            const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
            this.tray.setImage(trayIcon);
          }
        } catch (error) {
          // Manter ícone atual se não conseguir carregar novo
        }
        
        // Atualizar tooltip
        this.tray.setToolTip('Video Popup Scheduler (Em background)\nClique para mostrar vídeo');
        
        console.log('📌 App visível no tray');
        
      } catch (error) {
        console.error('❌ Erro ao mostrar no tray:', error);
      }
    }
  }
  
  hideFromTray() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        // Opcional: mudar ícone para indicar que vídeo está aberto
        // Ou apenas manter o mesmo ícone
        
        // Atualizar tooltip
        this.tray.setToolTip('Video Popup Scheduler (Vídeo aberto)\nClique para minimizar vídeo');
        
        console.log('👁️  App oculto do tray (vídeo aberto)');
        
      } catch (error) {
        console.error('❌ Erro ao ocultar do tray:', error);
      }
    }
  }
  
  showNotification(title, message) {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        // Verificar se o sistema suporta notificações de balloon
        if (this.tray.isSupported('balloon')) {
          this.tray.displayBalloon({
            icon: undefined, // Usar ícone padrão
            title: title || 'Video Scheduler',
            content: message || '',
            respectQuietTime: true, // Respeitar modo não perturbe
            noSound: false // Emitir som
          });
          
          console.log('🔔 Notificação mostrada:', title);
        } else {
          console.log('⚠️  Sistema não suporta notificações de balloon');
        }
      } catch (error) {
        console.error('❌ Erro ao mostrar notificação:', error);
      }
    }
  }
  
  showAboutInfo() {
    // Criar janela simples com informações
    const { BrowserWindow } = require('electron');
    
    const aboutWindow = new BrowserWindow({
      width: 400,
      height: 300,
      title: 'Sobre Video Popup Scheduler',
      resizable: false,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    });
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 20px;
            background: #f0f0f0;
          }
          .container {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
          }
          h1 {
            color: #333;
            margin-top: 0;
          }
          .info {
            margin: 15px 0;
            padding: 10px;
            background: #e8f4f8;
            border-radius: 5px;
          }
          .status {
            color: green;
            font-weight: bold;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🎬 Video Popup Scheduler</h1>
          <div class="info">
            <p><strong>Versão:</strong> 1.0.0</p>
            <p><strong>Status:</strong> <span class="status">● Em execução</span></p>
            <p><strong>Modo:</strong> Tray/Background</p>
          </div>
          <p>Este aplicativo executa vídeos automaticamente conforme agendamento.</p>
          <p>Fica em execução em background e pode ser acessado pelo ícone na bandeja do sistema.</p>
          <hr>
          <p style="font-size: 12px; color: #666;">
            Clique fora desta janela para fechar.
          </p>
        </div>
      </body>
      </html>
    `;
    
    aboutWindow.loadURL(`data:text/html,${encodeURIComponent(html)}`);
    
    // Fechar quando clicar fora
    aboutWindow.on('blur', () => {
      if (aboutWindow && !aboutWindow.isDestroyed()) {
        aboutWindow.close();
      }
    });
  }
  
  quitApp() {
    console.log('🔄 Iniciando processo de saída...');
    this.isAppQuitting = true;
    
    // Limpar tray
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.destroy();
      } catch (error) {
        console.error('❌ Erro ao destruir tray:', error);
      }
      this.tray = null;
    }
    
    // Emitir evento para main process encerrar
    this.emit('quit-app');
    
    // Forçar saída após delay se necessário
    setTimeout(() => {
      console.log('🚪 Forçando saída do app...');
      this.app.quit();
    }, 1000);
  }
  
  // Método para destruir/limpar
  destroy() {
    console.log('🧹 Destruindo tray manager...');
    
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.destroy();
      } catch (error) {
        console.error('❌ Erro ao destruir tray:', error);
      }
      this.tray = null;
    }
    
    this.removeAllListeners();
  }
}

module.exports = TrayManager;