// builder.js - 用来生成更新清单
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 配置：你的游戏资源在哪里？
const SOURCE_DIR = path.join(__dirname, 'minecraft_data');
// 配置：你的 OSS 地址前缀 (注意最后要有斜杠)
const OSS_URL_PREFIX = "https://warage-update.oss-cn-hangzhou.aliyuncs.com/game-v1/";

const manifest = {
    version: "1.0.5", // 每次更新手动改这个版本号
    files: []
};

// 递归扫描文件
function scanDir(dir) {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            scanDir(fullPath); // 递归
        } else {
            // 忽略掉版本文件和不需要上传的垃圾
            if (file === 'version.json' || file === '.DS_Store') return;

            const relativePath = path.relative(SOURCE_DIR, fullPath).replace(/\\/g, '/'); // 统一转为 /
            const fileBuffer = fs.readFileSync(fullPath);
            const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');

            manifest.files.push({
                path: relativePath, // 比如 "mods/jei.jar"
                hash: hash,         // 文件的指纹
                size: stat.size,
                url: OSS_URL_PREFIX + relativePath // 下载链接
            });
        }
    });
}

console.log("正在扫描文件...");
scanDir(SOURCE_DIR);

// 输出清单文件
fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
console.log(`✅ 清单生成完毕！包含 ${manifest.files.length} 个文件。`);
console.log(`请将 manifest.json 和 minecraft_data 文件夹内的内容上传到 OSS 的 game-v1 目录。`);