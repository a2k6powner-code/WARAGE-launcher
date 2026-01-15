const { Client, Authenticator } = require('minecraft-launcher-core');
const path = require('path');
const fs = require('fs');
const os = require('os'); // 引入操作系统模块读取内存

const launcher = new Client();

// ================= 用户配置区域 =================

// 你的版本文件夹名
const VERSION_ID = "1.12.2"; 

// 离线测试用户名
const PLAYER_NAME = "NORINCO_787878"; 

// 验证服务器
const AUTH_SERVER = "https://skin.example.com/api/yggdrasil";

// ================= 智能内存计算 =================

function getSmartMemory() {
    const totalMemMB = os.totalmem() / 1024 / 1024; // 系统总内存 (MB)
    const freeMemForOS = 2048; // 为系统保留 2GB
    const maxCap = 8192; //最大不超过 8GB，否则 GC 会卡

    let availableForGame = totalMemMB - freeMemForOS;

    // 兜底策略
    if (availableForGame < 1024) {
        availableForGame = totalMemMB - 1024;
    }

    // 再次兜底
    if (availableForGame < 1024) availableForGame = 1024;

    // 封顶策略
    if (availableForGame > maxCap) availableForGame = maxCap;

    const finalMem = Math.floor(availableForGame);
    
    console.log(` [内存策略] 系统总内存: ${Math.floor(totalMemMB)}MB`);
    console.log(` [内存策略] 分配给游戏: ${finalMem}MB`);
    
    return {
        max: `${finalMem}M`,
        min: "1024M" // 最小启动内存
    };
}

// ================= 路径配置 =================

// 1. 基础仓库 (Libraries/Assets)
const REPO_ROOT = path.join(__dirname, 'minecraft_data');

// 2. 隔离工作区 (Mods/Config/Saves)
const GAME_WORK_DIR = path.join(REPO_ROOT, 'versions', VERSION_ID);

// 3. 运行环境
const JAVA_PATH = path.join(__dirname, 'resources', 'java8', 'bin', 'java.exe');
const AUTHLIB_PATH = path.join(__dirname, 'resources', 'authlib', 'authlib-injector.jar');

// ================= 环境自检 =================
console.log('🔍 === 正在进行环境自检 ===');

// 检查 Java
if (!fs.existsSync(JAVA_PATH)) {
    console.error(`❌ [致命错误] 找不到 Java！\n   路径: ${JAVA_PATH}`);
    process.exit(1);
}

// 检查版本 JSON
const jsonPath = path.join(GAME_WORK_DIR, `${VERSION_ID}.json`);
if (!fs.existsSync(jsonPath)) {
    console.error(`❌ [致命错误] 找不到版本 JSON！`);
    console.error(`   路径: ${jsonPath}`);
    console.error(`   请确保 versions/文件夹名/文件夹名.json 三者名称完全一致！`);
    process.exit(1);
}

// 准备启动参数
let customArgs = [];
if (fs.existsSync(AUTHLIB_PATH)) {
    console.log(`✅ 外置登录注入: 已启用`);
    customArgs.push(`-javaagent:${AUTHLIB_PATH}=${AUTH_SERVER}`);
}

// 计算内存
const smartMemory = getSmartMemory();

console.log('🚀 === 准备启动 (隔离模式) ===');
console.log(`   📂 游戏根目录: ${REPO_ROOT}`);
console.log(`   📂 工作隔离区: ${GAME_WORK_DIR}`);

// ================= 启动逻辑 =================

let opts = {
    // 仓库根目录
    root: REPO_ROOT,
    
    version: {
        number: VERSION_ID,
        type: "release"
    },

    // 强制隔离目录
    overrides: {
        gameDirectory: GAME_WORK_DIR
    },

    authorization: Authenticator.getAuth(PLAYER_NAME),
    
    memory: smartMemory, // 使用计算好的内存
    
    javaPath: JAVA_PATH,
    customArgs: customArgs
};

launcher.launch(opts);

// ================= 日志监听 =================

launcher.on('debug', (e) => {
    if(e.includes('Error') || e.includes('Exception')) console.log(`[DEBUG] ${e}`);
});

launcher.on('data', (e) => {
    // 过滤掉太烦人的日志
    process.stdout.write(`[GAME] ${e}`);
});

launcher.on('progress', (e) => {
    const percent = Math.round((e.task / e.total) * 100);
    // 只在百分比变化时打印，防止刷屏
    process.stdout.write(`[下载中] ${percent}% \r`);
});

launcher.on('close', (code) => {
    console.log(`\n[系统] 游戏已退出，代码: ${code}`);
});