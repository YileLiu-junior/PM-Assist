# 部署手册：如何得到国内可长久访问的公开链接

先说结论：**GitHub Pages / Vercel / Render / Railway 这类海外托管在国内时通时断，不算"长久访问"，不要选。**
国内要稳定访问，选云服务器。按投入从低到高两条路线，都可以长期使用。

| 路线 | 备案 | 见效速度 | 参考成本* | 适合 |
| --- | --- | --- | --- | --- |
| **A. 香港轻量服务器** | 不需要 | 当天 | 约 ¥24—40/月 | 个人/小团队自用，最快见效 |
| **B. 国内轻量服务器 + 域名 + ICP 备案** | 需要（1—3 周，免费） | 1—3 周 | 服务器新用户促销约 ¥50—200/年（续费贵不少）+ 域名约 ¥60/年 | 正式对外、要求最快访问 |

\* 云厂商价格经常调整，以官网实时报价为准。本项目流量极小，最低配（2 核 2G）绰绰有余。

---

## 路线 A：香港轻量服务器（推荐先走这条）

香港节点在国内直连访问稳定，且**不需要 ICP 备案**。

1. **购买**：腾讯云或阿里云 → 轻量应用服务器 → 地域选「中国香港」→ 镜像选 Ubuntu 24.04 →
   2 核 2G 最低配即可。购买时设置 root 密码或密钥。
2. **放行端口**：控制台 → 防火墙 → 添加规则，放行 TCP `8787`（编排服务端口）。
3. **SSH 登录服务器**，安装 Node（Ubuntu 24.04 自带的 nodejs 版本较新，可直接用；或装 Node 20 LTS）：
   ```bash
   apt update && apt install -y nodejs npm git
   node -v   # 需要 ≥ 18
   ```
4. **取代码并配置**：
   ```bash
   git clone https://github.com/YileLiu-junior/PM-Assist.git
   cd PM-Assist
   cp orchestrator/config.example.json orchestrator/config.local.json
   nano orchestrator/config.local.json
   # 填入 deepseek 或 zhipu 的 apiKey，并务必设置一个 authToken（随便一串长随机字符）
   ```
5. **用 pm2 常驻运行**（退出 SSH 也不停、开机自启）：
   ```bash
   npm install -g pm2
   AUTH_TOKEN=你的authToken pm2 start server.js --name pm-assist
   pm2 save && pm2 startup   # 按提示执行输出的那条命令，实现开机自启
   ```
6. **访问**：浏览器打开 `http://服务器IP:8787`。前端页面和接口是同一个地址（同源），
   打开「连接设置」确认通道配置即可使用。
7. **可选加固**：买一个域名（约 ¥60/年，无需备案指向香港），用 Caddy 反代 8787 自动上 HTTPS：
   ```bash
   apt install -y caddy
   nano /etc/caddy/Caddyfile   # 写入两行：你的域名 { reverse_proxy 127.0.0.1:8787 }
   systemctl reload caddy
   ```
   之后用 `https://你的域名` 访问。

## 路线 B：国内服务器 + ICP 备案（最正规）

国内节点服务器用域名对外提供 Web 服务**依法必须 ICP 备案**，流程免费但需要等待：

1. 购买国内地域轻量服务器（新用户促销价很便宜，**注意续费价**，长期用建议一次买一年以上）。
   域名购买后需实名认证。备案要求服务器套餐时长 ≥ 3 个月。
2. 在云厂商备案控制台提交 ICP 备案：填网站信息、身份证、人脸核验，管局审核约 1—3 周。
3. 备案通过后，域名解析到服务器，按路线 A 的第 3—5 步部署，之后可正常使用 80/443 端口。

未备案期间，国内服务器用 `http://IP:8787` 这种「纯 IP + 非标端口」的方式一般也能访问，
可作为备案等待期的过渡；但对外正式服务请走完备案。

## 公开部署安全清单（必做）

- **设置 authToken**：`config.local.json` 里填 `authToken` 并用 `AUTH_TOKEN=... pm2 start ...` 启动。
  否则任何拿到网址的人都能消耗你的模型额度。页面「连接设置 → 访问令牌」里填同一串字符即可通过校验。
- **知识库文档**：`orchestrator/knowledge/` 里的业务资料只存在于你服务器上（.gitignore 已排除，不会进仓库）。
- **HTTPS**：对外使用建议按路线 A 第 7 步配 Caddy。
- **服务器本身**：SSH 用密钥登录、及时 `apt upgrade`、云控制台设置自动续费，避免「长久访问」因欠费/过期中断。

## 日常运维

```bash
pm2 list                 # 看运行状态
pm2 logs pm-assist       # 看日志
git pull && pm2 restart pm-assist   # 更新代码
```

前端更新推送 GitHub 后，在服务器上 `git pull && pm2 restart pm-assist` 即同步。

## 与 GitHub Pages 的关系

部署服务器后，GitHub Pages 版就不是必需的了。如果你仍想保留 Pages 前端（比如想用 https 域名入口），
在 Pages 页面的「连接设置 → 编排服务地址」里填服务器地址（如 `https://你的域名`）即可。
两者共用同一套接口，不冲突。
