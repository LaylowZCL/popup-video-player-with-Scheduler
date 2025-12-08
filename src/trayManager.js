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
      let trayIcon;
      const iconPath = path.join(__dirname, '../assets/icons/icon.png');
      
      try {
        if (require('fs').existsSync(iconPath)) {
          trayIcon = nativeImage.createFromPath(iconPath);
        } else {
          throw new Error('Ícone não encontrado');
        }
      } catch (error) {
        const size = 16;
        const image = nativeImage.createEmpty();
        const canvas = image.getCanvas();
        
        if (canvas && canvas.getContext) {
          const ctx = canvas.getContext('2d');
          canvas.width = size;
          canvas.height = size;
          
          ctx.fillStyle = '#FF0000';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('V', size/2, size/2);
        }
        
        trayIcon = image;
      }
      
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      
      this.tray = new Tray(trayIcon);
      
      this.tray.setToolTip('Video Popup Scheduler\nClique para mostrar/ocultar vídeo');
      
      this.updateContextMenu();
      
      this.tray.on('click', (event, bounds) => {
        this.emit('open-video');
      });
      
    } catch (error) {
    }
  }
  
  updateContextMenu() {
    if (!this.tray || this.tray.isDestroyed()) return;
    
    try {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '🎬 Mostrar/Ocultar Vídeo',
          click: () => {
            this.emit('open-video');
          }
        },
        {
          label: '🔄 Recarregar Vídeo Agora',
          click: () => {
            this.emit('reload-video');
          }
        },
        {
          type: 'separator'
        },
        {
          label: '📊 Verificar Agora',
          submenu: [
            {
              label: 'Verificar Novos Vídeos',
              click: () => {
                this.emit('check-videos');
              }
            },
            {
              label: 'Verificar Horários',
              click: () => {
                this.emit('check-schedule');
              }
            }
          ]
        },
        {
          type: 'separator'
        },
        {
          label: '❌ Sair',
          click: () => {
            this.quitApp();
          }
        }
      ]);
      
      this.tray.setContextMenu(contextMenu);
      
    } catch (error) {
    }
  }
  
  showInTray() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.setToolTip('Video Popup Scheduler (Em background)\nClique para mostrar vídeo');
      } catch (error) {
      }
    }
  }
  
  hideFromTray() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.setToolTip('Video Popup Scheduler (Vídeo aberto)\nClique para minimizar vídeo');
      } catch (error) {
      }
    }
  }
  
  showNotification(title, message) {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        if (this.tray.isSupported('balloon')) {
          this.tray.displayBalloon({
            icon: undefined,
            title: title || 'Video Scheduler',
            content: message || '',
            respectQuietTime: true,
            noSound: false
          });
        }
      } catch (error) {
      }
    }
  }
  
  quitApp() {
    this.isAppQuitting = true;
    
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.destroy();
      } catch (error) {
      }
      this.tray = null;
    }
    
    this.emit('quit-app');
    
    setTimeout(() => {
      this.app.quit();
    }, 1000);
  }
  
  destroy() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.destroy();
      } catch (error) {
      }
      this.tray = null;
    }
    
    this.removeAllListeners();
  }
}

module.exports = TrayManager;