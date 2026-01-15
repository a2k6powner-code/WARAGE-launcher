const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // 暴露登录接口
    login: (data) => ipcRenderer.invoke('login-request', data),
    
    // 暴露启动接口
    startGame: (config) => ipcRenderer.send('start-game', config),
    
    // 暴露日志监听 (让前端能接收日志)
    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, value) => callback(value))
});