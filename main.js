const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { Client } = require('minecraft-launcher-core');
const axios = require('axios');
const fs = require('fs');
const os = require('os');

let mainWindow;

// ================== 0. 工具函数：智能内存计算 ==================
function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024;
    const freeMemForOS = 2048; // 给系统预留 2GB
    let gameMem = totalMemMB - freeMemForOS;

    // 1.12.2 原版需求很低，但为了防止 Mod 需求，设置合理区间
    if (gameMem < 1024) gameMem = 1024; // 至少 1G
    if (gameMem > 8192) gameMem = 8192; // 封顶 8G

    return {
        max: `${Math.floor(gameMem)}M`,
        min: "1024M"
    };
}

// ================== 1. Electron 窗口逻辑 ==================
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

// ================== 2. 账号登录逻辑 (已修复 LittleSkin 报错) ==================
ipcMain.handle('login-request', async (event, { username, password, authServer }) => {
    try {
        console.log(`🔐 正在请求登录: ${authServer}`);
        
        // 标准 Yggdrasil 协议包
        const payload = {
            agent: { name: "Minecraft", version: 1 }, // 关键修复
            username: username,
            password: password,
            clientToken: "launcher-client-token-gen-001", 
            requestUser: true
        };

        const response = await axios.post(`${authServer}/authserver/authenticate`, payload);
        
        console.log(`✅ 登录成功: ${response.data.selectedProfile.name}`);
        return { success: true, data: response.data };

    } catch (error) {
        console.error("❌ 登录失败:", error.message);
        const errorMsg = error.response?.data?.errorMessage || error.response?.data?.error || error.message;
        return { success: false, error: errorMsg };
    }
});

// ================== 3. 游戏启动/下载逻辑 (核心) ==================
ipcMain.on('start-game', (event, config) => {
    const launcher = new Client();
    
    // --- 路径定义 ---
    // 确保你的 resources 目录下有 java8 和 authlib 文件夹
    const javaPath = path.join(__dirname, 'resources', 'java8', 'bin', 'java.exe');
    const authlibPath = path.join(__dirname, 'resources', 'authlib', 'authlib-injector.jar');
    const gameRoot = path.join(__dirname, 'minecraft_data');

    // --- 1. 检查 Java 环境 ---
    if (!fs.existsSync(javaPath)) {
        event.sender.send('log-update', `❌ [致命错误] 找不到内置 Java，请检查路径:\n${javaPath}`);
        return;
    }

    // --- 2. 准备外置登录参数 ---
    let customArgs = [];
    if (fs.existsSync(authlibPath)) {
        console.log("注入 Authlib-Injector...");
        customArgs.push(`-javaagent:${authlibPath}=${config.authServer}`);
    } else {
        event.sender.send('log-update', `[警告] 找不到 authlib-injector.jar，将无法进入服务器！`);
    }

    const memorySettings = getSmartMemory();
    console.log(`内存策略: ${memorySettings.max}`);

    // --- 3. 启动配置 (下载原版专用) ---
    // 这里指定了 1.12.2，如果本地没有，会自动开始下载
    let opts = {
        // 授权信息
        authorization: {
            access_token: config.authData.accessToken,
            client_token: config.authData.clientToken,
            uuid: config.authData.selectedProfile.id,
            name: config.authData.selectedProfile.name,
            user_properties: config.authData.user ? config.authData.user.properties : {},
            meta: { type: "mojang" } 
        },

        root: gameRoot,
        
        // 🟢 指定要下载/启动的版本
        version: {
            number: "1.12.2", 
            type: "release"
        },
        
        // 🟢 国内加速配置 (BMCLAPI)
        // 如果没有这部分，在国内下载资源文件会极慢甚至失败
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

    // --- 4. 发射与事件监听 ---
    console.log("准备启动 (自动补全模式)...");
    event.sender.send('log-update', "正在检查/下载游戏文件，请耐心等待...");
    
    launcher.launch(opts);

    // 日志
    launcher.on('debug', (e) => event.sender.send('log-update', `[DEBUG] ${e}`));
    launcher.on('data', (e) => event.sender.send('log-update', `[GAME] ${e}`));
    
    // 进度条
    launcher.on('progress', (e) => {
        event.sender.send('progress-update', e);
        // 在日志里也稍微输出一点，防止用户以为卡死了
        if(e.type === 'assets' || e.type === 'classes') {
            // 只显示部分进度，避免刷屏
            // event.sender.send('log-update', `[下载中] ${e.type}: ${e.task} / ${e.total}`);
        }
    });

    launcher.on('close', (code) => {
        event.sender.send('log-update', `🛑 游戏已退出，代码: ${code}`);
    });
});