# AI 产品经理工作台

把一个业务问题推进成可用交付物的前端工作台：需求分析、AI 方案设计、PRD 草稿、竞品分析四类任务路径，
由**本地编排服务**复现完整的 Agent 工作流（意图识别 → 路由 → 分支生成 → 风险审校），
支持 **DeepSeek** 和**智谱 BigModel** 两个模型通道，可插拔本地知识库。

前端为零构建的原生 HTML/CSS/JS；编排服务为零依赖的 Node（≥18，内置 fetch）。

## 快速开始

```bash
node server.js
# 打开 http://127.0.0.1:8787
```

1. 打开「连接设置」，选择模型通道：
   - **DeepSeek**：模型 ID `deepseek-flash`，在 platform.deepseek.com 申请 Key
   - **智谱 BigModel**：模型 ID `glm-5.3-flash`（免费），在 open.bigmodel.cn 申请 Key
   - **Mock**：不需要 Key，返回固定内容用于体验流程
2. API Key 只保存在浏览器 localStorage；也可以改放在服务端
   （复制 `orchestrator/config.example.json` 为 `orchestrator/config.local.json` 并填入 Key）。
3. （可选）把知识库文档（.md/.txt/.csv）放入 `orchestrator/knowledge/`，服务自动索引参与检索。

## 架构

```
浏览器（index.html / app.js）
   │  POST /api/run
   ▼
server.js ── orchestrator/flow.js     流程编排（对应 Coze Chatflow 的节点图）
              ├─ prompts.js           全部系统提示词与参数（想调提示词改这里）
              ├─ knowledge.js         本地知识库检索（topK=5）
              └─ providers.js         DeepSeek / 智谱 / Mock 通道（OpenAI 兼容协议）
```

主要接口：

| 接口 | 说明 |
| --- | --- |
| `POST /api/run` | 执行完整流程，返回 `{kind, text, meta}` |
| `POST /api/test` | 测试通道连通性 |
| `GET /api/knowledge` | 知识库索引状态 |
| `GET /api/health` | 服务与通道概览 |

## 部署到 GitHub Pages

GitHub Pages 只能托管静态前端，编排服务（Node）需要另行运行：

1. 把 `config.js` 里的 `window.ORCHESTRATOR_URL` 改成编排服务的公网地址
   （例如部署在 Render/Railway/自己的 VPS 上）；如果只是自己用，也可以保持前端
   在 Pages、编排服务跑在本机，然后填 `http://127.0.0.1:8787`。
2. 仓库设置 → Pages → 选择分支部署即可，入口是 `index.html`。
3. 注意：提示词集中在 `orchestrator/prompts.js`，公开仓库等于公开这套提示词设计。

## 流程说明

任务进入后依次经过：知识库检索 → 意图识别与完整性检查（输出 JSON 判定）→
条件路由（高风险安全回复 / 追问澄清 / 四类业务分支 / 未知任务引导）→ 分支生成 → 风险审校与最终整理。
每一步的判定依据会写进交付物的「证据与假设」区域。

## 测试

```bash
node orchestrator/e2e-test.js   # 覆盖七条流程分支的端到端测试（需先启动 server.js）
```
