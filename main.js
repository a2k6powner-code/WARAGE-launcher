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

// ================== 🔥 5. 核心：带删除功能的自动更新 🔥 ==================

ipcMain.handle('get-local-version', async () => {
    try {
        if (fs.existsSync(localVersionPath)) {
            const data = fs.readFileSync(localVersionPath, 'utf-8');
            return JSON.parse(data).version;
        }
        return "0.0.0"; 
    } catch (e) { return "0.0.0"; }
});

// 接收 deleteList 参数
ipcMain.handle('update-modpack', async (event, { url, version, deleteList }) => {
    const win = BrowserWindow.getFocusedWindow();
    try {
        console.log(`📥 开始更新: ${version}`);
        const tempPath = path.join(app.getPath('temp'), 'update.zip');
        const writer = fs.createWriteStream(tempPath);

        // 1. 下载
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

        // 2. 🔥 执行暗杀 (删除旧文件) 🔥
        if (deleteList && Array.isArray(deleteList) && deleteList.length > 0) {
            console.log("🗑️ 正在清理旧文件...");
            win.webContents.send('update-progress', { status: 'cleaning', percent: 100 });
            
            deleteList.forEach(relativePath => {
                // 安全检查：禁止路径穿越 (不允许包含 ..)
                const safePath = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
                const fullPath = path.join(gameRoot, safePath);
                
                if (fs.existsSync(fullPath)) {
                    try {
                        fs.unlinkSync(fullPath); // 物理删除
                        console.log(`✅ 已删除: ${safePath}`);
                    } catch (err) {
                        console.error(`❌ 删除失败: ${safePath}`, err);
                    }
                }
            });
        }

        // 3. 解压覆盖
        win.webContents.send('update-progress', { status: 'extracting', percent: 100 });
        const zip = new AdmZip(tempPath);
        zip.extractAllTo(gameRoot, true); 

        // 4. 写入新版本号
        fs.writeFileSync(localVersionPath, JSON.stringify({ version: version }));
        
        return { success: true };

    } catch (error) {
        console.error("更新失败:", error);
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
            window: { width: 854, height: 480 }
        };

        event.sender.send('log-update', `🚀 锁定版本: ${versionToLaunch}，准备启动...`);
        launcher.launch(opts);

        launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
        launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
        launcher.on('progress', (e) => event.sender.send('progress-update', e));
        launcher.on('close', (code) => event.sender.send('log-update', `🛑 游戏退出: ${code}`));
    } catch (err) {
        event.sender.send('log-update', `❌ 启动失败: ${err.message}`);
    }
});