const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip'); 

let mainWindow;

// ================== 1. 路径定义 ==================
const isPackaged = app.isPackaged;
const resourcesPath = isPackaged ? process.resourcesPath : path.join(__dirname, 'resources');
const defaultJavaPath = path.join(resourcesPath, 'java8', 'bin', 'java.exe');
const authlibPath = path.join(resourcesPath, 'authlib', 'authlib-injector.jar'); 

const gameRoot = isPackaged 
    ? path.join(path.dirname(process.execPath), 'minecraft_data') 
    : path.join(__dirname, 'minecraft_data');

const localVersionPath = path.join(gameRoot, 'version.json');

// ================== 2. 辅助工具 ==================
function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    const freeMemForOS = 2048; 
    let gameMem = totalMemMB - freeMemForOS;
    if (gameMem < 1024) gameMem = 1024;
    if (gameMem > 8192) gameMem = 8192;
    return { max: `${Math.floor(gameMem)}M`, min: "1024M" };
}

function findLocalVersion() {
    const versionsDir = path.join(gameRoot, 'versions');
    if (!fs.existsSync(versionsDir)) throw new Error("找不到 versions 文件夹！");
    const dirs = fs.readdirSync(versionsDir).filter(f => fs.statSync(path.join(versionsDir, f)).isDirectory());
    if (dirs.length === 0) throw new Error("versions 文件夹为空！");
    const forgeVersion = dirs.find(v => v.toLowerCase().includes('forge'));
    return forgeVersion || dirs[0];
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

// ================== 4. 系统与网络接口 ==================
ipcMain.handle('open-external', async (event, url) => { if(url) await shell.openExternal(url); });
ipcMain.handle('select-java-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '选择 Java', filters: [{ name: 'Executable', extensions: ['exe'] }], properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('get-news', async () => {
    try {
        // ⚠️ 请换成你的 Gitee Raw 链接
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

// ================== 5. 更新逻辑 ==================
ipcMain.handle('get-local-version', async () => {
    try {
        if (fs.existsSync(localVersionPath)) {
            const data = fs.readFileSync(localVersionPath, 'utf-8');
            return JSON.parse(data).version;
        }
        return "0.0.0"; 
    } catch (e) { return "0.0.0"; }
});

ipcMain.handle('update-modpack', async (event, { url, version, deleteList }) => {
    const win = BrowserWindow.getFocusedWindow();
    try {
        console.log(`📥 开始更新: ${version}`);
        const tempPath = path.join(app.getPath('temp'), 'update.zip');
        const writer = fs.createWriteStream(tempPath);

        const response = await axios({ url, method: 'GET', responseType: 'stream' });
        const totalLength = response.headers['content-length'];
        let receivedBytes = 0;

        response.data.on('data', (chunk) => {
            receivedBytes += chunk.length;
            if (totalLength) {
                const percent = (receivedBytes / totalLength) * 100;
                win.webContents.send('update-progress', { status: 'downloading', percent });
            }
        });
        response.data.pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });

        if (deleteList && Array.isArray(deleteList) && deleteList.length > 0) {
            win.webContents.send('update-progress', { status: 'cleaning', percent: 100 });
            deleteList.forEach(relativePath => {
                const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
                const fullPath = path.join(gameRoot, safePath);
                if (fs.existsSync(fullPath)) {
                    try { fs.unlinkSync(fullPath); } catch (err) { console.error(err); }
                }
            });
        }

        win.webContents.send('update-progress', { status: 'extracting', percent: 100 });
        const zip = new AdmZip(tempPath);
        zip.extractAllTo(gameRoot, true); 
        fs.writeFileSync(localVersionPath, JSON.stringify({ version: version }));
        
        return { success: true };

    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ================== 6. 登录与启动 ==================
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
        const versionToLaunch = findLocalVersion();
        const finalJavaPath = config.javaPath || defaultJavaPath;

        if (!fs.existsSync(finalJavaPath)) {
            event.sender.send('log-update', `❌ 找不到 Java: ${finalJavaPath}`);
            return;
        }

        let customArgs = [];
        if (fs.existsSync(authlibPath)) {
            customArgs.push(`-javaagent:${authlibPath}=${config.authServer}`);
        } else {
            event.sender.send('log-update', `⚠️ 找不到 authlib-injector.jar`);
        }

        // 🔥🔥🔥 核心修改：解析独立连接 IP 🔥🔥🔥
        let serverOpts = {};
        if (config.connectIP) {
            // 处理 IP:Port 格式
            const parts = config.connectIP.split(':');
            serverOpts = {
                server: parts[0],
                port: parts[1] ? parseInt(parts[1]) : 25565
            };
            console.log(`🔗 将自动连接至: ${serverOpts.server}:${serverOpts.port}`);
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
            javaPath: finalJavaPath,
            memory: config.memory || getSmartMemory(),
            customArgs: customArgs,
            window: { width: 854, height: 480 },
            
            // 🔥 注入连接参数
            server: serverOpts.server,
            port: serverOpts.port
        };

        event.sender.send('log-update', `🚀 准备启动 (AutoConnect: ${!!config.connectIP})...`);
        launcher.launch(opts);

        launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
        launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
        launcher.on('progress', (e) => event.sender.send('progress-update', e));
        launcher.on('close', (code) => event.sender.send('log-update', `🛑 游戏退出: ${code}`));
    } catch (err) {
        event.sender.send('log-update', `❌ 启动失败: ${err.message}`);
    }
});