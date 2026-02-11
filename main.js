const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const { autoUpdater } = require('electron-updater');
const axios = require('axios');
const fs = require('fs');
const crypto = require('crypto'); // 用于计算文件哈希
const os = require('os');

// ================== 0. 全局配置区 ==================

// ⚠️ 请替换为你的阿里云 OSS 地址 (最后必须带斜杠 /)
const UPDATE_HOST = "https://warage-update.oss-cn-hangzhou.aliyuncs.com/";
// 游戏资源清单地址
const GAME_MANIFEST_URL = UPDATE_HOST + "game-v1/manifest.json";

let mainWindow;
const isPackaged = app.isPackaged;

// 路径定义
const resourcesPath = isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const gameRoot = isPackaged 
    ? path.join(path.dirname(process.execPath), 'minecraft_data') 
    : path.join(__dirname, 'minecraft_data');
const localVersionPath = path.join(gameRoot, 'version.json');
const DEFAULT_JAVA_PATH = path.join(resourcesPath, 'jdk17', 'bin', 'java.exe');
const authlibPath = path.join(resourcesPath, 'authlib', 'authlib-injector.jar');

// ================== 1. 启动器自身自动更新 (Electron-Updater) ==================
function initAutoUpdater() {
    autoUpdater.autoDownload = false; // 手动触发下载
    autoUpdater.logger = require("electron-log");
    autoUpdater.logger.transports.file.level = "info";
    
    // 🔥 强制指定 OSS 更新源 (Generic 模式)
    if(isPackaged) {
        autoUpdater.setFeedURL({
            provider: 'generic',
            url: UPDATE_HOST
        });
    }

    autoUpdater.on('update-available', (info) => {
        mainWindow.webContents.send('app-update-msg', { 
            type: 'available', 
            version: info.version,
            text: `检测到启动器新版本 v${info.version}`
        });
    });

    autoUpdater.on('download-progress', (progressObj) => {
        mainWindow.webContents.send('app-update-msg', {
            type: 'progress',
            percent: progressObj.percent
        });
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow.webContents.send('app-update-msg', {
            type: 'downloaded',
            text: '下载完成，即将重启...'
        });
        setTimeout(() => autoUpdater.quitAndInstall(), 3000);
    });

    autoUpdater.on('error', (err) => {
        // 开发环境忽略错误
        if (isPackaged) {
            mainWindow.webContents.send('app-update-msg', { type: 'error', text: err.message });
        }
    });
}

ipcMain.handle('check-app-update', () => {
    if (isPackaged) autoUpdater.checkForUpdates();
});
ipcMain.handle('start-app-download', () => autoUpdater.downloadUpdate());

// ================== 2. 游戏资源增量更新 (Manifest) ==================

// 辅助：计算文件 MD5
function getFileHash(filePath) {
    if (!fs.existsSync(filePath)) return null;
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
}

// 辅助：下载文件
async function downloadFile(url, dest) {
    const writer = fs.createWriteStream(dest);
    const response = await axios({ url, method: 'GET', responseType: 'stream' });
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

ipcMain.handle('update-game-content', async (event) => {
    const win = BrowserWindow.getFocusedWindow();
    try {
        // 1. 获取远程清单
        win.webContents.send('update-progress', { status: 'checking', text: '正在校验游戏资源...' });
        const { data: remoteManifest } = await axios.get(`${GAME_MANIFEST_URL}?t=${Date.now()}`);

        // 2. 对比差异
        const tasks = [];
        for (const file of remoteManifest.files) {
            const localPath = path.join(gameRoot, file.path);
            const localDir = path.dirname(localPath);
            if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

            const localHash = getFileHash(localPath);
            if (localHash !== file.hash) {
                tasks.push(file);
            }
        }

        // 3. 执行下载
        if (tasks.length === 0) {
            fs.writeFileSync(localVersionPath, JSON.stringify({ version: remoteManifest.version }));
            return { success: true, msg: "无需更新" };
        }

        for (let i = 0; i < tasks.length; i++) {
            const file = tasks[i];
            const percent = ((i + 1) / tasks.length) * 100;
            
            win.webContents.send('update-progress', { 
                status: 'downloading', 
                percent: percent,
                text: `同步资源: ${path.basename(file.path)}`
            });

            const localPath = path.join(gameRoot, file.path);
            await downloadFile(file.url, localPath);
        }

        // 写入版本号
        fs.writeFileSync(localVersionPath, JSON.stringify({ version: remoteManifest.version }));
        return { success: true };

    } catch (error) {
        console.error(error);
        return { success: false, error: "更新服务不可用 (可能是网络问题)" }; // 不阻断启动
    }
});

// ================== 3. 基础功能 ==================

function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    return { max: `${Math.floor(Math.min(8192, Math.max(1024, totalMemMB - 2048)))}M`, min: "1024M" };
}

function findLocalVersion() {
    const versionsDir = path.join(gameRoot, 'versions');
    if (!fs.existsSync(versionsDir)) return null;
    const dirs = fs.readdirSync(versionsDir).filter(f => fs.statSync(path.join(versionsDir, f)).isDirectory());
    return dirs.find(v => v.toLowerCase().includes('forge')) || dirs[0];
}

// 窗口创建
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000, height: 650,
        frame: false, transparent: true, backgroundColor: '#00000000',
        resizable: false,
        webPreferences: {
            nodeIntegration: false, contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
    initAutoUpdater();
    
    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        // 启动3秒后检查启动器更新
        setTimeout(() => { if(isPackaged) autoUpdater.checkForUpdates(); }, 3000);
    });
}

app.whenReady().then(createWindow);
ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.close());

// IPC 接口
ipcMain.handle('get-local-version', async () => {
    try {
        if (fs.existsSync(localVersionPath)) return JSON.parse(fs.readFileSync(localVersionPath, 'utf-8')).version;
        return "0.0.0";
    } catch { return "0.0.0"; }
});

ipcMain.handle('login-request', async (event, { username, password, authServer }) => {
    try {
        const response = await axios.post(`${authServer}/authserver/authenticate`, {
            agent: { name: "Minecraft", version: 1 },
            username, password, clientToken: "launcher-token", requestUser: true
        });
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.response?.data?.errorMessage || error.message };
    }
});

// 启动游戏
ipcMain.on('start-game', (event, config) => {
    const launcher = new Client();
    const versionToLaunch = findLocalVersion();
    
    if (!versionToLaunch) {
        event.sender.send('log-update', `❌ 错误: 未检测到游戏版本，请等待资源更新完成`);
        return;
    }

    if (!fs.existsSync(DEFAULT_JAVA_PATH)) {
        event.sender.send('log-update', `❌ 致命错误: 内置 Java 环境缺失\n${DEFAULT_JAVA_PATH}`);
        return;
    }

    let customArgs = fs.existsSync(authlibPath) ? [`-javaagent:${authlibPath}=${config.authServer}`] : [];

    let serverOpts = {};
    if (config.connectIP) {
        const parts = config.connectIP.split(':');
        serverOpts = { server: parts[0], port: parts[1] ? parseInt(parts[1]) : 25565 };
    }

    let opts = {
        authorization: {
            access_token: config.authData.accessToken,
            client_token: config.authData.clientToken,
            uuid: config.authData.selectedProfile.id,
            name: config.authData.selectedProfile.name,
            user_properties: config.authData.user ? config.authData.user.properties : {},
            meta: { type: "mojang" } 
        },
        root: gameRoot,
        version: { number: versionToLaunch, type: "release" },
        javaPath: DEFAULT_JAVA_PATH, 
        memory: config.memory || getSmartMemory(),
        customArgs: customArgs,
        window: { width: 854, height: 480 },
        server: serverOpts.server,
        port: serverOpts.port
    };

    event.sender.send('log-update', `🚀 正在启动 (Java 17)...`);
    launcher.launch(opts);

    launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
    launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
    launcher.on('progress', (e) => event.sender.send('progress-update', e));
    launcher.on('close', (code) => event.sender.send('log-update', `🛑 游戏退出: ${code}`));
});