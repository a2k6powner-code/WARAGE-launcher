// ================== 1. 基础交互 ==================
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

const LINKS = {
    register: "https://littleskin.cn/auth/register",
    about: "https://www.baidu.com", 
    eula: "https://account.mojang.com/documents/minecraft_eula"
};

document.getElementById('btn-register').addEventListener('click', () => window.api.openExternal(LINKS.register));
document.getElementById('btn-about').addEventListener('click', () => window.api.openExternal(LINKS.about));
document.getElementById('link-eula').addEventListener('click', () => window.api.openExternal(LINKS.eula));

const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').addEventListener('click', () => settingsModal.style.display = 'flex');
document.getElementById('close-settings').addEventListener('click', () => settingsModal.style.display = 'none');
document.getElementById('save-settings').addEventListener('click', () => settingsModal.style.display = 'none');

const ramSlider = document.getElementById('ram-slider');
const ramInput = document.getElementById('ram-input');
const ramDisplay = document.getElementById('ram-value-display');
function updateRamDisplay(val) { ramDisplay.innerText = val ? val + " MB" : "自动"; }
ramSlider.addEventListener('input', (e) => { ramInput.value = e.target.value; updateRamDisplay(e.target.value); });
ramInput.addEventListener('input', (e) => { if (e.target.value) ramSlider.value = e.target.value; updateRamDisplay(e.target.value); });

const javaPathInput = document.getElementById('java-path-display');
document.getElementById('btn-select-java').addEventListener('click', async () => {
    const path = await window.api.selectJava();
    if (path) javaPathInput.value = path;
});

// ================== 🔥 2. 动态数据与独立IP控制 🔥 ==================
const newsTitleDom = document.querySelector('.news-title');
const newsCardDom = document.querySelector('.news-card'); 
const serverStatusDom = document.querySelector('.server-status');

// 🔴 全局变量：存储独立的直连 IP
let autoConnectIP = null;

async function initLauncherData() {
    const config = await window.api.getNews();
    if (config) {
        // 1. 公告
        if (config.news) {
            newsTitleDom.innerHTML = `<i class="fas fa-bullhorn"></i> ${config.news.title}`;
            document.querySelectorAll('.news-item').forEach(el => el.remove());
            config.news.items.forEach(item => {
                const div = document.createElement('div');
                div.className = 'news-item';
                let txt = typeof item === 'string' ? item : item.text;
                let url = typeof item === 'string' ? "" : item.url;
                div.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #4CAF50; margin-right: 8px;"></i> ${txt}`;
                if (url) {
                    div.style.cursor = "pointer"; div.style.textDecoration = "underline";
                    div.addEventListener('click', () => window.api.openExternal(url));
                }
                newsCardDom.appendChild(div);
            });
        }
        
        // 2. 状态显示 (使用 server_status_ip)
        if (config.server_status_ip) {
            updateServerStatus(config.server_status_ip);
        } else if (config.server_ip) {
            // 兼容旧配置
            updateServerStatus(config.server_ip);
        }

        // 3. 🔥 读取独立的直连配置 🔥
        if (config.game_connect && config.game_connect.enable) {
            autoConnectIP = config.game_connect.ip;
            console.log("✅ 已获取独立直连 IP:", autoConnectIP);
        } else {
            console.log("🚫 自动直连功能未开启或未配置");
            autoConnectIP = null;
        }

        // 4. 更新检查
        if (config.modpack) checkModpackUpdate(config.modpack);
    }
}

async function updateServerStatus(ip) {
    const status = await window.api.getServerStatus(ip);
    if (status && status.online) {
        serverStatusDom.innerHTML = `<span><span class="status-dot" style="background:#4CAF50"></span> 运行正常</span> <span><i class="fas fa-users"></i> ${status.players.online}/${status.players.max}</span>`;
    } else {
        serverStatusDom.innerHTML = `<span><span class="status-dot" style="background:#e81123"></span> 离线</span>`;
    }
}

async function checkModpackUpdate(cloudModpack) {
    const localVersion = await window.api.getLocalVersion();
    if (cloudModpack.version !== localVersion) showUpdateModal(cloudModpack);
}

function showUpdateModal(modpackInfo) {
    const modal = document.getElementById('update-modal');
    const title = document.getElementById('update-title');
    const note = document.getElementById('update-note');
    const btn = document.getElementById('btn-start-update');
    
    modal.style.display = 'flex';
    title.innerText = `发现新版本: v${modpackInfo.version}`;
    note.innerText = modpackInfo.note || "请更新后进入游戏。";

    btn.onclick = async () => {
        btn.disabled = true; btn.innerText = "正在下载资源...";
        const result = await window.api.updateModpack({
            url: modpackInfo.url,
            version: modpackInfo.version,
            deleteList: modpackInfo.delete 
        });

        if (result.success) {
            alert("更新成功！启动器将重启刷新。");
            window.location.reload();
        } else {
            alert("更新失败: " + result.error);
            btn.disabled = false; btn.innerText = "重试更新";
        }
    };
}

window.api.onUpdateProgress((data) => {
    const bar = document.getElementById('update-progress-bar');
    const btn = document.getElementById('btn-start-update');
    if (data.status === 'downloading') {
        btn.innerText = `下载中 ${Math.round(data.percent)}%`;
        bar.style.width = `${data.percent}%`;
    } else if (data.status === 'cleaning') {
        btn.innerText = "正在清理旧文件...";
        bar.style.width = '100%';
    } else if (data.status === 'extracting') {
        btn.innerText = "正在解压覆盖...";
        bar.style.width = '100%';
    }
});

initLauncherData();

// ================== 3. 登录与启动 ==================
const loginBtn = document.getElementById('loginBtn');
const launchBtn = document.getElementById('launchBtn');
const eulaCheck = document.getElementById('eula-check');
const statusText = document.getElementById('loginStatus');
let storedAuthData = null;

function checkLaunchState() {
    if (storedAuthData && eulaCheck.checked) {
        launchBtn.disabled = false; launchBtn.innerText = "启动游戏"; launchBtn.style.opacity = "1";
    } else {
        launchBtn.disabled = true; launchBtn.style.opacity = "0.7";
        if (!storedAuthData) launchBtn.innerText = "请先登录";
        else if (!eulaCheck.checked) launchBtn.innerText = "需同意 EULA";
    }
}
eulaCheck.addEventListener('change', checkLaunchState);

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authServer = document.getElementById('authServer').value;
    if(!username || !password) return;
    
    statusText.innerText = "验证中..."; statusText.style.color = "yellow"; loginBtn.disabled = true;
    const result = await window.api.login({ username, password, authServer });

    if (result.success) {
        statusText.innerText = `欢迎, ${result.data.selectedProfile.name}`;
        statusText.style.color = "#4CAF50";
        storedAuthData = result.data;
        checkLaunchState();
    } else {
        statusText.innerText = result.error.substring(0, 20) + "...";
        statusText.style.color = "#e81123";
    }
    loginBtn.disabled = false;
});

launchBtn.addEventListener('click', () => {
    if (!storedAuthData || !eulaCheck.checked) return;
    launchBtn.disabled = true; launchBtn.innerText = "启动中...";
    let memConfig = document.getElementById('ram-input').value ? { max: document.getElementById('ram-input').value + "M", min: "1024M" } : null;
    let javaPath = document.getElementById('java-path-display').value || null;

    window.api.startGame({
        authData: storedAuthData,
        authServer: document.getElementById('authServer').value,
        memory: memConfig,
        javaPath: javaPath,
        
        // 🔥 传递独立的直连 IP (如果为 null 则不传递)
        connectIP: autoConnectIP
    });
});

const progressText = document.getElementById('progress-text');
const progressLine = document.getElementById('progress-line');

window.api.onLog((msg) => {
    if(msg.includes('Downloading')) progressText.innerText = "☁️ 下载中: " + msg;
    else if (msg.includes('Launching')) progressText.innerText = "🚀 启动 Java...";
    else progressText.innerText = msg.length > 60 ? msg.substring(0, 60) + "..." : msg;
});

window.api.onProgress((e) => {
    const percent = (e.task / e.total) * 100;
    progressLine.style.width = `${percent}%`;
    document.getElementById('progress-percent').innerText = `${Math.round(percent)}%`;
});