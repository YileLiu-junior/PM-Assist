// 部署配置：前端要连接的编排服务地址。
// - 用 node server.js 本地访问（http://127.0.0.1:8787）时保持为空字符串（同源）。
// - 前端部署在 GitHub Pages 等静态托管上时，改为本机或服务器的编排服务地址，例如：
//     window.ORCHESTRATOR_URL = "http://127.0.0.1:8787";
//   浏览器允许 https 页面请求 http://127.0.0.1（回环地址被视为安全上下文）。
window.ORCHESTRATOR_URL = "";
