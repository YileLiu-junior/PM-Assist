# AI 产品经理工作台

把一个业务问题推进成可用交付物的前端工作台：需求分析、AI 方案设计、PRD 草稿、竞品分析、行业分析五类任务路径，
由**本地编排服务**复现完整的 Agent 工作流（意图识别 → 路由 → 分支生成 → 风险审校），
支持 **DeepSeek** 和**智谱 BigModel** 两个模型通道，可插拔本地知识库。

行业分析路径是一条独立的五步提示词链（边界切分 → 结构层 → 三条流转链 → 议价能力 → 约束/节奏/异常），
流式生成**带 A/B/C 证据分级**的分析报告，可选「从业者拷问」聊天模式检验报告，详见 `industry-analysis-spec.md`。

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
   │  POST /api/run              （四类业务路径）
   │  POST /api/industry/stream  （行业分析路径，SSE 流式）
   ▼
server.js ── orchestrator/flow.js              流程编排（对应 Coze Chatflow 的节点图）
              ├─ prompts.js                    四类业务路径的全部提示词（想调提示词改这里）
              ├─ industry-prompts.js           行业分析五步链提示词 + Mock 文本
              ├─ knowledge.js                  本地知识库检索（topK=5）
              └─ providers.js                  DeepSeek / 智谱 / Mock 通道（OpenAI 兼容协议，含流式）
```

主要接口：

| 接口 | 说明 |
| --- | --- |
| `POST /api/run` | 执行完整流程，返回 `{kind, text, meta}` |
| `POST /api/industry/stream` | 行业分析流式步骤（SSE：`delta` / `rollback` / `usage` / `done` / `error`） |
| `POST /api/test` | 测试通道连通性 |
| `GET /api/knowledge` | 知识库索引状态 |
| `GET /api/health` | 服务与通道概览 |

## 部署

想得到**国内可长久访问的公开链接**（香港服务器 / 国内服务器 + 备案，含成本与步骤），看 [DEPLOY.md](DEPLOY.md)。

GitHub Pages 只能托管静态前端，编排服务（Node）需要另行运行；前端也可以留在 Pages、
在页面「连接设置 → 编排服务地址」里指向任何一台编排服务：

1. 前端在 Pages、编排服务跑在本机：服务地址填 `http://127.0.0.1:8787`。
2. 仓库设置 → Pages → 选择分支部署即可，入口是 `index.html`。
3. 注意：提示词集中在 `orchestrator/prompts.js`，公开仓库等于公开这套提示词设计。
4. 公开部署务必设置访问令牌（`AUTH_TOKEN` 环境变量或 `config.local.json` 的 `authToken`），
   并在页面「连接设置 → 访问令牌」填同一串字符。

## 流程说明

任务进入后依次经过：知识库检索 → 意图识别与完整性检查（输出 JSON 判定）→
条件路由（高风险安全回复 / 追问澄清 / 四类业务分支 / 未知任务引导）→ 分支生成 → 风险审校与最终整理。
每一步的判定依据会写进交付物的「证据与假设」区域。

## 测试

```bash
node orchestrator/e2e-test.js            # 四类业务路径七条分支的端到端测试（需先启动 server.js）
node orchestrator/industry-smoke-test.js # 行业分析五步链 + 拷问模式的流式冒烟（Mock 通道）
```
