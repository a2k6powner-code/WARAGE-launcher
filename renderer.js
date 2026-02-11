// ================== 1. 窗口与基础交互 ==================
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

// 模态框控制
const settingsModal = document.getElementById('settings-modal');
document.getElementById('open-settings').addEventListener('click', () => settingsModal.style.display = 'flex');
document.getElementById('close-settings').addEventListener('click', () => settingsModal.style.display = 'none');
document.getElementById('save-settings').addEventListener('click', () => settingsModal.style.display = 'none');

// 内存滑块
const ramSlider = document.getElementById('ram-slider');
const ramInput = document.getElementById('ram-input');
const ramDisplay = document.getElementById('ram-value-display');
function updateRamDisplay(val) { ramDisplay.innerText = val ? val + " MB" : "自动"; }
ramSlider.addEventListener('input', (e) => { ramInput.value = e.target.value; updateRamDisplay(e.target.value); });

// ================== 2. 启动器自我更新 (App Update) ==================
// 对应 HTML 中的 #update-modal
const appUpdateModal = document.getElementById('update-modal');
const appUpdateBtn = document.getElementById('btn-start-update');
const appUpdateBar = document.getElementById('update-progress-bar');
const appUpdateNote = document.getElementById('update-note');

window.api.onAppUpdateMsg((data) => {
    if (data.type === 'available') {
        // 发现新版本，弹出模态框
        appUpdateModal.style.display = 'flex';
        appUpdateNote.innerText = data.text;
        appUpdateBtn.onclick = () => {
            appUpdateBtn.disabled = true;
            appUpdateBtn.innerText = "UPDATING...";
            window.api.startAppDownload();
        };
    } else if (data.type === 'progress') {
        appUpdateBar.style.width = `${data.percent}%`;
    } else if (data.type === 'downloaded') {
        appUpdateBtn.innerText = "RESTARTING...";
        appUpdateNote.innerText = "下载完成，正在重启安装...";
    }
});

// 手动检查 (初始化时调用)
setTimeout(() => window.api.checkAppUpdate(), 2000);

// ================== 3. 登录与游戏启动 ==================
const loginBtn = document.getElementById('loginBtn');
const launchBtn = document.getElementById('launchBtn');
const eulaCheck = document.getElementById('eula-check');
const statusText = document.getElementById('loginStatus');
const newsCard = document.querySelector('.news-card');

let storedAuthData = null;

// 模拟获取新闻
setTimeout(() => {
    newsCard.innerHTML = `
        <div class="news-card-item">
            <span class="news-text">🔥 全新 OKX 风格界面上线</span>
            <i class="fas fa-bolt news-icon" style="color:var(--accent-blue)"></i>
        </div>
        <div class="news-card-item">
            <span class="news-text">服务端网络波动公告</span>
            <span style="font-size:12px; color:#666">Today</span>
        </div>
    `;
}, 1000);

// 登录逻辑
loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authServer = document.getElementById('authServer').value;
    
    if(!username || !password) return;
    
    loginBtn.disabled = true; loginBtn.innerText = "VERIFYING...";
    const result = await window.api.login({ username, password, authServer });

    if (result.success) {
        storedAuthData = result.data;
        loginBtn.innerText = "已连接";
        statusText.innerText = `OPERATOR: ${result.data.selectedProfile.name}`;
        statusText.style.color = "#4CAF50";
        checkLaunchState();
    } else {
        loginBtn.disabled = false; loginBtn.innerText = "登录";
        statusText.innerText = result.error.substring(0, 30);
        statusText.style.color = "#F6465D";
    }
});

function checkLaunchState() {
    if (storedAuthData && eulaCheck.checked) {
        launchBtn.disabled = false;
    } else {
        launchBtn.disabled = true;
    }
}
eulaCheck.addEventListener('change', checkLaunchState);

// ================== 4. 启动核心 (包含游戏资源更新) ==================
const progressLine = document.getElementById('progress-line');
const progressText = document.getElementById('progress-text');
const progressPercent = document.getElementById('progress-percent');

// 监听游戏资源更新进度 (复用底部进度条)
window.api.onUpdateProgress((data) => {
    if (data.status === 'checking') {
        progressText.innerText = "正在校验资源...";
    } else if (data.status === 'downloading') {
        progressText.innerText = data.text; // 显示正在下载的文件名
        progressLine.style.width = `${data.percent}%`;
        progressPercent.innerText = `${Math.round(data.percent)}%`;
    }
});

launchBtn.addEventListener('click', async () => {
    launchBtn.disabled = true;
    
    // 1. 先检查游戏资源更新 (增量)
    progressText.innerText = "正在同步游戏环境...";
    const updateResult = await window.api.updateGameContent(); // 调用 Main 进程的新接口
    
    if (!updateResult.success && updateResult.error) {
        // 如果更新失败但不是致命错误，询问是否继续
        if(!confirm(`资源同步失败: ${updateResult.error}\n是否尝试强行启动？`)) {
            launchBtn.disabled = false;
            progressText.innerText = "启动取消";
            return;
        }
    }

    // 2. 准备启动
    progressText.innerText = "初始化 Java 虚拟机...";
    progressLine.style.width = "100%";
    
    let memConfig = document.getElementById('ram-input').value 
        ? { max: document.getElementById('ram-input').value + "M", min: "1024M" } 
        : null;

    window.api.startGame({
        authData: storedAuthData,
        authServer: document.getElementById('authServer').value,
        memory: memConfig,
        connectIP: null // 如果有直连需求可在此填入
    });
});

// 监听游戏日志
window.api.onLog((msg) => {
    if (msg.includes('Setting user')) progressText.innerText = "加载用户配置...";
    else if (msg.includes('LWJGL')) progressText.innerText = "加载原生库...";
    else if (msg.includes('GL_VERSION')) progressText.innerText = "渲染引擎就绪";
    else if (msg.length < 50) progressText.innerText = msg; // 只显示短日志
});

window.api.onProgress((e) => {
    // 游戏启动过程中的资源校验 (MCL 自带)
    const p = (e.task / e.total) * 100;
    progressLine.style.width = `${p}%`;
});