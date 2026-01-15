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

    //  新增：版本控制接口 
    getLocalVersion: () => ipcRenderer.invoke('get-local-version'),
    updateModpack: (data) => ipcRenderer.invoke('update-modpack', data),
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, val) => callback(val)),

    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, value) => callback(value))
});