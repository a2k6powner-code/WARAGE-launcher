// ================== 1. 窗口与通用链接 ==================
document.getElementById('btn-min').addEventListener('click', () => window.api.minimize());
document.getElementById('btn-close').addEventListener('click', () => window.api.close());

const LINKS = {
    register: "https://littleskin.cn/auth/register",
    about: "https://docs.qq.com/doc/DSEhUeVFwTFJDTU5F", 
    eula: "https://docs.qq.com/doc/DSEVQQ0h3cEZhWkdX"
};

document.getElementById('btn-register').addEventListener('click', () => window.api.openExternal(LINKS.register));
document.getElementById('btn-about').addEventListener('click', () => window.api.openExternal(LINKS.about));
document.getElementById('link-eula').addEventListener('click', () => window.api.openExternal(LINKS.eula));

// ================== 2. 设置弹窗 ==================
const modal = document.getElementById('settings-modal');
document.getElementById('open-settings').addEventListener('click', () => modal.style.display = 'flex');
document.getElementById('close-settings').addEventListener('click', () => modal.style.display = 'none');
document.getElementById('save-settings').addEventListener('click', () => modal.style.display = 'none');

// 内存联动
const ramSlider = document.getElementById('ram-slider');
const ramInput = document.getElementById('ram-input');
const ramDisplay = document.getElementById('ram-value-display');

function updateRamDisplay(val) { ramDisplay.innerText = val ? val + " MB" : "自动"; }
ramSlider.addEventListener('input', (e) => { ramInput.value = e.target.value; updateRamDisplay(e.target.value); });
ramInput.addEventListener('input', (e) => { if (e.target.value) ramSlider.value = e.target.value; updateRamDisplay(e.target.value); });

// Java 选择
const javaPathInput = document.getElementById('java-path-display');
document.getElementById('btn-select-java').addEventListener('click', async () => {
    const path = await window.api.selectJava();
    if (path) javaPathInput.value = path;
});

// ================== 🔥 3. 动态数据 (公告带链接) 🔥 ==================
const newsTitleDom = document.querySelector('.news-title');
const newsCardDom = document.querySelector('.news-card'); 
const serverStatusDom = document.querySelector('.server-status');

async function initLauncherData() {
    const config = await window.api.getNews();
    
    if (config && config.news) {
        // 1. 设置标题
        newsTitleDom.innerHTML = `<i class="fas fa-bullhorn"></i> ${config.news.title}`;
        
        // 2. 清空旧列表
        document.querySelectorAll('.news-item').forEach(el => el.remove());

        // 3. 遍历并渲染新列表
        config.news.items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'news-item';
            
            // 判断数据格式：是纯字符串？还是 {text, url} 对象？
            // 这样做兼容性最好，防止你 Gitee 改错了导致启动器白屏
            let displayText = "";
            let linkUrl = "";

            if (typeof item === 'string') {
                displayText = item; // 旧格式
            } else {
                displayText = item.text; // 新格式
                linkUrl = item.url;
            }

            div.innerHTML = `<i class="fas fa-circle" style="font-size: 8px; color: #4CAF50; margin-right: 8px;"></i> ${displayText}`;

            // 如果有链接，加上点击事件和样式
            if (linkUrl && linkUrl.length > 0) {
                div.style.cursor = "pointer";
                div.style.textDecoration = "underline"; // 加下划线提示可点击
                div.style.textDecorationColor = "rgba(255,255,255,0.3)";
                div.title = "点击跳转: " + linkUrl; // 鼠标悬停显示网址
                
                // 鼠标移入变色效果
                div.addEventListener('mouseenter', () => div.style.color = "#fff");
                div.addEventListener('mouseleave', () => div.style.color = "#ddd");
                
                // 点击跳转
                div.addEventListener('click', () => window.api.openExternal(linkUrl));
            }

            newsCardDom.appendChild(div);
        });

        // 4. 更新服务器状态
        if (config.server_ip) updateServerStatus(config.server_ip);
    }
}

async function updateServerStatus(ip) {
    serverStatusDom.innerHTML = `<span><i class="fas fa-spinner fa-spin"></i> 连接中...</span>`;
    const status = await window.api.getServerStatus(ip);

    if (status && status.online) {
        serverStatusDom.innerHTML = `
            <span><span class="status-dot" style="background:#4CAF50"></span> 运行正常</span>
            <span><i class="fas fa-users"></i> ${status.players.online}/${status.players.max}</span>
            <span><i class="fas fa-signal"></i> Ping: 35ms</span> 
        `;
    } else {
        serverStatusDom.innerHTML = `
            <span><span class="status-dot" style="background:#e81123"></span> 离线</span>
            <span style="color:#666">服务器维护中</span>
        `;
    }
}

initLauncherData();

// ================== 4. 登录与启动 ==================
const loginBtn = document.getElementById('loginBtn');
const launchBtn = document.getElementById('launchBtn');
const eulaCheck = document.getElementById('eula-check');
const statusText = document.getElementById('loginStatus');
let storedAuthData = null;

function checkLaunchState() {
    if (storedAuthData && eulaCheck.checked) {
        launchBtn.disabled = false;
        launchBtn.innerText = "启动游戏";
        launchBtn.style.opacity = "1";
    } else {
        launchBtn.disabled = true;
        if (!storedAuthData) launchBtn.innerText = "请先登录";
        else if (!eulaCheck.checked) launchBtn.innerText = "需同意 EULA";
        launchBtn.style.opacity = "0.7";
    }
}

eulaCheck.addEventListener('change', checkLaunchState);

loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authServer = document.getElementById('authServer').value;

    if(!username || !password) return;
    statusText.innerText = "验证中...";
    statusText.style.color = "yellow";
    loginBtn.disabled = true;

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
    launchBtn.disabled = true;
    launchBtn.innerText = "启动中...";
    
    let memConfig = document.getElementById('ram-input').value ? { max: document.getElementById('ram-input').value + "M", min: "1024M" } : null;
    let javaPath = document.getElementById('java-path-display').value || null;

    window.api.startGame({
        authData: storedAuthData,
        authServer: document.getElementById('authServer').value,
        memory: memConfig,
        javaPath: javaPath
    });
});

// ================== 5. 日志反馈 ==================
const progressText = document.getElementById('progress-text');
const progressLine = document.getElementById('progress-line');

window.api.onLog((msg) => {
    console.log(msg);
    if(msg.includes('Downloading')) progressText.innerText = "☁️ 资源下载中: " + msg;
    else if (msg.includes('Launching')) progressText.innerText = "🚀 正在启动 Java...";
    else progressText.innerText = msg.length > 60 ? msg.substring(0, 60) + "..." : msg;
});

window.api.onProgress((e) => {
    const percent = (e.task / e.total) * 100;
    progressLine.style.width = `${percent}%`;
    document.getElementById('progress-percent').innerText = `${Math.round(percent)}%`;
});