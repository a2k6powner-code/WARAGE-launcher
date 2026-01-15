const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    login: (data) => ipcRenderer.invoke('login-request', data),
    startGame: (config) => ipcRenderer.send('start-game', config),
    minimize: () => ipcRenderer.send('window-min'),
    close: () => ipcRenderer.send('window-close'),
    
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    selectJava: () => ipcRenderer.invoke('select-java-file'),
    
    getNews: () => ipcRenderer.invoke('get-news'),
    getServerStatus: (ip) => ipcRenderer.invoke('get-server-status', ip),

    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, value) => callback(value))
});