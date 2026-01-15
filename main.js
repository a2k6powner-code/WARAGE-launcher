const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

let mainWindow;

// 资源与路径定义
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const defaultJavaPath = path.join(resourcesPath, 'java8', 'bin', 'java.exe');
const authlibPath = path.join(resourcesPath, 'authlib', 'authlib-injector.jar'); 
const gameRoot = isPackaged ? path.join(path.dirname(process.execPath), 'minecraft_data') : path.join(__dirname, 'minecraft_data');

function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    const freeMemForOS = 2048; 
    let gameMem = totalMemMB - freeMemForOS;
    if (gameMem < 1024) gameMem = 1024;
    if (gameMem > 8192) gameMem = 8192;
    return { max: `${Math.floor(gameMem)}M`, min: "1024M" };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000, height: 650,
        frame: false, transparent: true, backgroundColor: '#00000000',
        resizable: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);
ipcMain.on('window-min', () => mainWindow.minimize());
ipcMain.on('window-close', () => mainWindow.close());

// ================== 系统操作接口 ==================
ipcMain.handle('open-external', async (event, url) => {
    if(url) await shell.openExternal(url);
});

ipcMain.handle('select-java-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择 Java (java.exe)',
        filters: [{ name: 'Executable', extensions: ['exe'] }],
        properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
});

// ================== 动态数据获取 ==================
ipcMain.handle('get-news', async () => {
    try {
        // ⚠️ 记得换成你的 Gitee Raw 链接
        const NEWS_URL = "https://gitee.com/norinco77/787878/raw/master/launcher_config.json"; 
        const response = await axios.get(`${NEWS_URL}?t=${Date.now()}`);
        return response.data;
    } catch (error) {
        return null;
    }
});

ipcMain.handle('get-server-status', async (event, serverIp) => {
    try {
        const response = await axios.get(`https://api.mcsrvstat.us/3/${serverIp}`);
        return response.data;
    } catch (error) {
        return null;
    }
});

// ================== 登录与启动 ==================
ipcMain.handle('login-request', async (event, { username, password, authServer }) => {
    try {
        const payload = {
            agent: { name: "Minecraft", version: 1 },
            username, password, clientToken: "launcher-token", requestUser: true
        };
        const response = await axios.post(`${authServer}/authserver/authenticate`, payload);
        return { success: true, data: response.data };
    } catch (error) {
        const errorMsg = error.response?.data?.errorMessage || error.message;
        return { success: false, error: errorMsg };
    }
});

ipcMain.on('start-game', (event, config) => {
    const launcher = new Client();
    const finalJavaPath = config.javaPath || defaultJavaPath;

    if (!fs.existsSync(finalJavaPath)) {
        event.sender.send('log-update', `❌ 找不到 Java: ${finalJavaPath}`);
        return;
    }

    let customArgs = [];
    if (fs.existsSync(authlibPath)) {
        customArgs.push(`-javaagent:${authlibPath}=${config.authServer}`);
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
        version: { number: "1.12.2", type: "release" },
        overrides: {
            url: {
                meta: "https://bmclapi2.bangbang93.com", 
                resource: "https://bmclapi2.bangbang93.com/assets", 
                maven: "https://bmclapi2.bangbang93.com/maven"
            }
        },
        javaPath: finalJavaPath,
        memory: config.memory || getSmartMemory(),
        customArgs: customArgs,
        window: { width: 854, height: 480 }
    };

    event.sender.send('log-update', "🚀 正在校验资源...");
    launcher.launch(opts);

    launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
    launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
    launcher.on('progress', (e) => event.sender.send('progress-update', e));
    launcher.on('close', (code) => event.sender.send('log-update', `🛑 游戏退出: ${code}`));
});