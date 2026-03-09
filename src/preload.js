const { contextBridge, ipcRenderer } = require("electron");
const isProduction = process.env.NODE_ENV === "production" || !process.defaultApp;
const logLevel = (process.env.LOG_LEVEL || (isProduction ? "warn" : "debug")).toLowerCase();

contextBridge.exposeInMainWorld("electronAPI", {
  reportVideoView: (data) => ipcRenderer.send("report-video-view", data),
  minimizeWindow: () => ipcRenderer.send("minimize-window"),
  onWindowCloseRequest: (handler) => ipcRenderer.on("window-close-request", handler),
  getRuntimeInfo: () => ({ isProduction, logLevel }),
});
