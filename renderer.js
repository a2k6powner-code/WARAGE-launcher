const loginBtn = document.getElementById('loginBtn');
const launchBtn = document.getElementById('launchBtn');
const statusText = document.getElementById('loginStatus');
const logArea = document.getElementById('logArea');

let storedAuthData = null; // 暂存登录成功后的 Token

// 1. 点击登录按钮
loginBtn.addEventListener('click', async () => {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const authServer = document.getElementById('authServer').value;

    statusText.innerText = "正在连接验证服务器...";
    loginBtn.disabled = true;

    // 调用 preload.js 里的接口
    const result = await window.api.login({ username, password, authServer });

    if (result.success) {
        statusText.innerText = `登录成功！欢迎, ${result.data.selectedProfile.name}`;
        statusText.style.color = "#4CAF50";
        storedAuthData = result.data; // 保存 Token
        launchBtn.disabled = false; // 解锁启动按钮
    } else {
        statusText.innerText = `登录失败: ${result.error}`;
        statusText.style.color = "red";
    }
    loginBtn.disabled = false;
});

// 2. 点击启动按钮
launchBtn.addEventListener('click', () => {
    if (!storedAuthData) return;
    
    logArea.innerHTML += "<div>>>> 发送启动指令...</div>";
    launchBtn.disabled = true;
    
    // 调用启动接口，把刚才存的 Token 和验证服地址发给后端
    window.api.startGame({
        authData: storedAuthData,
        authServer: document.getElementById('authServer').value
    });
});

// 3. 接收后端发来的日志
window.api.onLog((msg) => {
    const div = document.createElement('div');
    div.innerText = msg;
    logArea.appendChild(div);
    logArea.scrollTop = logArea.scrollHeight; // 自动滚动到底部
});

// 4. 接收进度条
window.api.onProgress((e) => {
    const percent = (e.task / e.total) * 100;
    document.getElementById('progressBar').style.width = `${percent}%`;
});