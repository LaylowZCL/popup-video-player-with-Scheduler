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
          
          ctx.fillStyle = '#FFFFFF';
          ctx.beginPath();
          ctx.arc(size/2, size/2, size/2 - 1, 0, Math.PI * 2);
          ctx.fill();
          
          ctx.fillStyle = '#000000';
          ctx.font = 'bold 10px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('V', size/2, size/2);
        }
        
        trayIcon = image;
      }
      
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
      
      this.tray = new Tray(trayIcon);
      
      this.tray.setToolTip('Banco Moc Popup Video\nClique para abrir o menu');
      
      this.updateContextMenu();
      
      this.tray.on('click', () => {
        this.tray.popUpContextMenu();
      });
      
    } catch (error) {
    }
  }
  
  updateContextMenu() {
    if (!this.tray || this.tray.isDestroyed()) return;
    
    try {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: '🎬 Assistir Agora',
          click: () => {
            this.emit('open-video');
          }
        },
        {
          label: '🔄 Recarregar Vídeos e Horários',
          click: () => {
            this.emit('refresh-content');
          }
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
        this.tray.setToolTip('Banco Moc Popup Video (Em background)\nClique para abrir o menu');
      } catch (error) {
      }
    }
  }
  
  hideFromTray() {
    if (this.tray && !this.tray.isDestroyed()) {
      try {
        this.tray.setToolTip('Banco Moc Popup Video (Vídeo aberto)\nClique para abrir o menu');
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
            title: title || 'Banco Moc Popup Video',
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
