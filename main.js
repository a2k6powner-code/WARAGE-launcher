const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

let mainWindow;

// ================== 0. 智能路径处理 (打包核心) ==================

// 判断当前是否是打包后的环境
const isPackaged = app.isPackaged;

// 定义资源根目录
const resourcesPath = isPackaged 
    ? process.resourcesPath // 生产环境：安装目录/resources
    : path.join(__dirname, 'resources'); // 开发环境：项目目录/resources

// 定义 Java 和 Authlib 路径 (基于上面的根目录)
const javaPath = path.join(resourcesPath, 'java8', 'bin', 'java.exe');
// 注意：如果你改了文件名，这里记得对应修改
const authlibPath = path.join(resourcesPath, 'authlib', 'authlib-injector.jar'); 

// 定义游戏数据目录
// 生产环境建议放在 exe 同级目录下，方便用户管理
const gameRoot = isPackaged 
    ? path.join(path.dirname(process.execPath), 'minecraft_data') 
    : path.join(__dirname, 'minecraft_data');

console.log(`[系统模式] ${isPackaged ? "生产环境 (Packaged)" : "开发环境 (Dev)"}`);
console.log(`[Java路径] ${javaPath}`);
console.log(`[游戏路径] ${gameRoot}`);


// ================== 1. 内存计算工具 ==================
function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    const freeMemForOS = 2048; 
    let gameMem = totalMemMB - freeMemForOS;

    if (gameMem < 1024) gameMem = 1024;
    if (gameMem > 8192) gameMem = 8192;

    return {
        max: `${Math.floor(gameMem)}M`,
        min: "1024M"
    };
}

// ================== 2. 窗口逻辑 ==================
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 900,
        height: 600,
        backgroundColor: '#222',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });
    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ================== 3. 登录逻辑 (含 Agent 修复) ==================
ipcMain.handle('login-request', async (event, { username, password, authServer }) => {
    try {
        console.log(`🔐 正在请求登录: ${authServer}`);
        const payload = {
            agent: { name: "Minecraft", version: 1 },
            username: username,
            password: password,
            clientToken: "launcher-client-token-gen-001", 
            requestUser: true
        };

        const response = await axios.post(`${authServer}/authserver/authenticate`, payload);
        return { success: true, data: response.data };

    } catch (error) {
        console.error("❌ 登录失败:", error.message);
        const errorMsg = error.response?.data?.errorMessage || error.response?.data?.error || error.message;
        return { success: false, error: errorMsg };
    }
});

// ================== 4. 游戏启动逻辑 ==================
ipcMain.on('start-game', (event, config) => {
    const launcher = new Client();

    // --- 环境检查 ---
    if (!fs.existsSync(javaPath)) {
        event.sender.send('log-update', `❌ [致命错误] 找不到内置 Java，请检查路径:\n${javaPath}`);
        // 在生产环境，通常这里应该弹窗提示用户重新安装
        return;
    }

    // --- 外置登录注入 ---
    let customArgs = [];
    if (fs.existsSync(authlibPath)) {
        console.log("💉 注入 Authlib-Injector...");
        customArgs.push(`-javaagent:${authlibPath}=${config.authServer}`);
    } else {
        event.sender.send('log-update', `⚠️ [警告] 找不到 authlib-injector.jar，外置登录将失效！`);
    }

    const memorySettings = getSmartMemory();
    console.log(`🧠 内存分配: ${memorySettings.max}`);

    // --- 启动配置 ---
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
        
        // 此处设置为下载原版 1.12.2
        // 如果你需要版本隔离，请自行添加 overrides.gameDirectory
        version: {
            number: "1.12.2", 
            type: "release"
        },
        
        // 国内源加速
        overrides: {
            url: {
                meta: "https://bmclapi2.bangbang93.com", 
                resource: "https://bmclapi2.bangbang93.com/assets", 
                maven: "https://bmclapi2.bangbang93.com/maven"
            }
        },

        javaPath: javaPath,
        memory: memorySettings,
        customArgs: customArgs,
        window: { width: 854, height: 480 }
    };

    console.log("🚀 准备启动...");
    event.sender.send('log-update', "🚀 正在校验/下载游戏资源，请稍候...");
    
    launcher.launch(opts);

    // --- 事件监听 ---
    launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
    launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
    
    launcher.on('progress', (e) => {
        event.sender.send('progress-update', e);
    });

    launcher.on('close', (code) => {
        event.sender.send('log-update', `🛑 游戏已退出，代码: ${code}`);
    });
});