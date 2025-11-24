const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const EventEmitter = require('events');

class TrayManager extends EventEmitter {
  constructor(app) {
    super();
    this.app = app;
    this.tray = null;
    this.createTray();
  }
  
  createTray() {
    const iconPath = path.join(__dirname, '../assets/icons/icon.png');
    const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    
    this.tray = new Tray(trayIcon);
    
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Abrir Vídeo',
        click: () => this.emit('open-video')
      },
      {
        type: 'separator'
      },
      {
        label: 'Sair',
        click: () => this.app.quit()
      }
    ]);
    
    this.tray.setToolTip('Video Saude Popup BM');
    this.tray.setContextMenu(contextMenu);
  }

  showInTray() {
    if (this.tray) {
      if (process.platform === 'darwin' && this.tray.setHighlightMode) {
        this.tray.setHighlightMode('always');
      } else {
        this.tray.setImage(path.join(__dirname, '../assets/icons/icon.png'));
      }
    }
  }
  
  hideFromTray() {
    if (this.tray) {
      if (process.platform === 'darwin' && this.tray.setHighlightMode) {
        this.tray.setHighlightMode('never');
      } else {
        const emptyIcon = nativeImage.createEmpty();
        this.tray.setImage(emptyIcon);
      }
    }
  }
  
  /*showNotification(message) {
    if (this.tray && this.tray.isDestroyed() === false) {
      this.tray.displayBalloon({
        title: 'Video Scheduler',
        content: message
      });
    }
  }*/

  showNotification(title, message) {
  if (this.tray && !this.tray.isDestroyed()) {
    this.tray.displayBalloon({
      title: title || 'Video Scheduler',
      content: message
    });
  }
}
}

module.exports = TrayManager;