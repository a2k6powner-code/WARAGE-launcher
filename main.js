const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

let mainWindow;

// ================== 1. 路径定义 ==================
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const defaultJavaPath = path.join(resourcesPath, 'java8', 'bin', 'java.exe');
const authlibPath = path.join(resourcesPath, 'authlib', 'authlib-injector.jar'); 

// 游戏根目录
// ⚠️ 注意：为了方便你复制文件，打包后游戏目录设为 exe 同级目录下的 minecraft_data
const gameRoot = isPackaged 
    ? path.join(path.dirname(process.execPath), 'minecraft_data') 
    : path.join(__dirname, 'minecraft_data');

// ================== 2. 辅助工具函数 ==================
function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    const freeMemForOS = 2048; 
    let gameMem = totalMemMB - freeMemForOS;
    if (gameMem < 1024) gameMem = 1024;
    if (gameMem > 8192) gameMem = 8192;
    return { max: `${Math.floor(gameMem)}M`, min: "1024M" };
}

// 🔥 核心函数：自动寻找本地安装的 Forge 版本
function findLocalVersion() {
    const versionsDir = path.join(gameRoot, 'versions');
    
    if (!fs.existsSync(versionsDir)) {
        throw new Error("找不到 versions 文件夹！请确保你已把整合包复制进来。");
    }

    // 扫描 versions 文件夹下的所有子文件夹
    const dirs = fs.readdirSync(versionsDir).filter(f => fs.statSync(path.join(versionsDir, f)).isDirectory());
    
    if (dirs.length === 0) {
        throw new Error("versions 文件夹是空的！");
    }

    // 优先寻找包含 'forge' 的版本
    const forgeVersion = dirs.find(v => v.toLowerCase().includes('forge'));
    
    // 如果找到了 Forge 版就用它，否则用找到的第一个
    const targetVersion = forgeVersion || dirs[0];
    console.log(`🎯 锁定本地版本: ${targetVersion}`);
    return targetVersion;
}

// ================== 3. 窗口管理 ==================
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

// ================== 4. 系统接口 (Gitee/Ping/外链) ==================
ipcMain.handle('open-external', async (event, url) => { if(url) await shell.openExternal(url); });
ipcMain.handle('select-java-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择 Java (java.exe)',
        filters: [{ name: 'Executable', extensions: ['exe'] }],
        properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-news', async () => {
    try {
        const NEWS_URL = "https://gitee.com/norinco77/787878/raw/master/launcher_config.json"; 
        const response = await axios.get(`${NEWS_URL}?t=${Date.now()}`);
        return response.data;
    } catch (error) { return null; }
});

ipcMain.handle('get-server-status', async (event, serverIp) => {
    try {
        const response = await axios.get(`https://api.mcsrvstat.us/3/${serverIp}`);
        return response.data;
    } catch (error) { return null; }
});

// ================== 5. 登录与启动逻辑 ==================
ipcMain.handle('login-request', async (event, { username, password, authServer }) => {
    try {
        const payload = {
            agent: { name: "Minecraft", version: 1 },
            username, password, clientToken: "launcher-token", requestUser: true
        };
        const response = await axios.post(`${authServer}/authserver/authenticate`, payload);
        return { success: true, data: response.data };
    } catch (error) {
        return { success: false, error: error.response?.data?.errorMessage || error.message };
    }
});

ipcMain.on('start-game', (event, config) => {
    const launcher = new Client();
    
    try {
        // 1. 寻找版本 (找不到直接报错，不下载)
        const versionToLaunch = findLocalVersion();

        // 2. 检查 Java
        const finalJavaPath = config.javaPath || defaultJavaPath;
        if (!fs.existsSync(finalJavaPath)) {
            event.sender.send('log-update', `❌ 错误: 找不到 Java 文件\n路径: ${finalJavaPath}`);
            return;
        }

        // 3. Authlib
        let customArgs = [];
        if (fs.existsSync(authlibPath)) {
            customArgs.push(`-javaagent:${authlibPath}=${config.authServer}`);
        } else {
            event.sender.send('log-update', `⚠️ 警告: 找不到外置登录组件 authlib-injector.jar`);
        }

        // 4. 启动配置
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
            
            // 🔥 这里不再写死 "1.12.2"，而是用扫描到的文件夹名
            version: {
                number: versionToLaunch, 
                type: "release" 
            },
            
            // 🔥 删除了 overrides (BMCLAPI)，防止它去下载/修复文件
            // MCLC 发现本地有 JSON 和 Jar，且没给下载源，就会直接尝试启动
            
            javaPath: finalJavaPath,
            memory: config.memory || getSmartMemory(),
            customArgs: customArgs,
            window: { width: 854, height: 480 }
        };

        event.sender.send('log-update', `🚀 锁定版本: ${versionToLaunch}，准备启动...`);
        launcher.launch(opts);

        // 事件监听
        launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
        launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
        launcher.on('progress', (e) => event.sender.send('progress-update', e));
        launcher.on('close', (code) => event.sender.send('log-update', `🛑 游戏退出: ${code}`));

    } catch (err) {
        // 捕获所有启动前的错误（如找不到版本）
        console.error(err);
        event.sender.send('log-update', `❌ 启动失败: ${err.message}`);
    }
});