const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // ================== 1. 窗口控制 ==================
    minimize: () => ipcRenderer.send('window-min'),
    close: () => ipcRenderer.send('window-close'),
    
    // ================== 2. 系统交互 ==================
    openExternal: (url) => ipcRenderer.invoke('open-external', url),
    selectJava: () => ipcRenderer.invoke('select-java-file'),
    
    // ================== 3. 数据获取 ==================
    getNews: () => ipcRenderer.invoke('get-news'),
    getServerStatus: (ip) => ipcRenderer.invoke('get-server-status', ip),
    getLocalVersion: () => ipcRenderer.invoke('get-local-version'),

    // ================== 4. 账号登录 ==================
    login: (data) => ipcRenderer.invoke('login-request', data),

    // ================== 5. 启动器自身更新 (Electron-Updater) ==================
    // 检查是否有新版本的 .exe
    checkAppUpdate: () => ipcRenderer.invoke('check-app-update'),
    // 开始下载 .exe
    startAppDownload: () => ipcRenderer.invoke('start-app-download'),
    // 监听下载进度和弹窗消息
    onAppUpdateMsg: (callback) => ipcRenderer.on('app-update-msg', (event, val) => callback(val)),

    // ================== 6. 游戏资源增量更新 (OSS Manifest) ==================
    // 🔥 核心：触发对比 manifest.json 并下载缺失文件的逻辑
    updateGameContent: () => ipcRenderer.invoke('update-game-content'),
    
    // 监听资源下载进度 (比如: "正在下载 mods/jei.jar 50%")
    onUpdateProgress: (callback) => ipcRenderer.on('update-progress', (event, val) => callback(val)),

    // ================== 7. 游戏启动与日志 ==================
    startGame: (config) => ipcRenderer.send('start-game', config),
    
    // 监听游戏启动日志 (控制台输出)
    onLog: (callback) => ipcRenderer.on('log-update', (event, value) => callback(value)),
    
    // 监听游戏启动阶段进度 (MCL 自带的 assets 校验进度)
    onProgress: (callback) => ipcRenderer.on('progress-update', (event, value) => callback(value))
});