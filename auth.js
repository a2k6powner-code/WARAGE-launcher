const axios = require('axios');

// 你的验证服务器地址 (皮肤站地址)
const AUTH_HOST = 'https://skin.yoursite.com';

async function login(username, password) {
    try {
        console.log(`正在尝试登录: ${username}...`);

        // Yggdrasil 标准登录接口
        const response = await axios.post(`${AUTH_HOST}/api/yggdrasil/authserver/authenticate`, {
            username: username,
            password: password,
            clientToken: "launcher-client-token", // 可以随机生成一个UUID
            requestUser: true
        });

        const data = response.data;
        
        console.log("登录成功！");
        console.log(`玩家名称: ${data.selectedProfile.name}`);
        console.log(`UUID: ${data.selectedProfile.id}`);
        console.log(`Access Token: ${data.accessToken}`);

        // ⚠️ 返回这个对象，稍后传给 minecraft-launcher-core
        return {
            access_token: data.accessToken,
            client_token: data.clientToken,
            uuid: data.selectedProfile.id,
            name: data.selectedProfile.name,
            user_properties: data.user ? data.user.properties : {}
        };

    } catch (error) {
        if (error.response) {
            console.error("登录失败:", error.response.data.errorMessage);
            throw new Error(error.response.data.errorMessage); // 抛出错误给前端显示
        } else {
            console.error("网络错误:", error.message);
            throw error;
        }
    }
}