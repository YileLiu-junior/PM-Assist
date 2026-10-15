# 行业分析工作台 · 功能 Spec

- 版本：v1.1（2026-10-15）
- 状态：**P0 + P1 已实现**（Mock 通道全流程验证通过；DeepSeek / 智谱真实通道待用户填 Key 后各跑一次）。实现落点：`orchestrator/industry-prompts.js`、`orchestrator/providers.js`（`streamChat`）、`server.js`（`/api/industry/stream`）、`app.js`、`styles.css`；P2（知识库注入、报告存为项目交付物版本）未实现。
- 定位：AI 产品经理工作台的第 6 条任务路径「行业分析」。输入一个行业名称，经「边界切分 → 结构层 → 三条流转链 → 议价能力 → 约束/节奏/异常」五步提示词链，生成一份**带证据分级（A/B/C）的行业分析报告**，并可选进入「从业者拷问」聊天模式检验报告。
- 来源：外部搜集的「行业分析工作台 vibe coding prompt」。该 prompt 为浏览器直连 Claude API 的单文件应用设计；本 spec 是它**嫁接到本平台架构（本地编排服务 + DeepSeek/智谱双通道 + Soft Studio 视觉）**的改编版。

---

## 1. 来源 prompt 的取舍结论

> 判定标准：① 是不是这个功能的"内容资产"（提示词方法论）——是则保留；② 是否与本平台架构（模型走编排服务、OpenAI 兼容协议、Key 不进第三方）冲突——冲突则丢弃；③ 是否与已选定的视觉方向（Soft Studio，见 `redesign/direction-approved.md`）冲突——冲突则丢弃。

### 1.1 保留（核心资产，逐字沿用）

| 来源内容 | 为什么可取 |
| --- | --- |
| 五步提示词全文（Step 0 边界切分 / 1 结构层 / 2 三条流转链 / 3 议价五问 / 4 约束节奏异常 / 5 从业者拷问） | 这是整个功能的真正 IP，与模型和厂商无关，原文质量很高，禁止改写 |
| 证据分级体系（A 公开可查 / B 推断 / C 推测）与「C 档只进待验证清单」规则 | 与本平台既有「证据与假设」抽屉的理念同源，直接强化平台的可信交付定位 |
| system prompt 的禁止事项（禁"较强/较弱"、禁"总体看来"、不问不给建议）与态度条款 | 对 DeepSeek/智谱同样有效 |
| 交互骨架：候选边界卡片 + 自定义边界 → 四步自动串行 → 每步一张卡片 → 可选拷问 → 导出 .md | 天然匹配本平台"路径 → 输入 → 运行 → 交付物"的心智模型 |
| 「重试本步并继续」断点续跑 | 长链路必需；本平台已有 resumeTaskId 先例 |
| 流式渲染 + requestAnimationFrame/定时节流、"有序列表保留原始序号（`<li value>`）"、"表格包 overflow-x 容器" | 实现层经验，直接复用 |
| token 用量实时累计 | 用户对多步长任务的成本有真实焦虑 |

### 1.2 丢弃（与平台架构/视觉冲突）

| 来源内容 | 为什么不要 |
| --- | --- |
| 第三节「API 对接」全部：Anthropic `/v1/messages`、`x-api-key`、`anthropic-version`、`anthropic-dangerous-direct-browser-access`、beta 头、`cache_control`、`fallbacks`、`web_search_20260209` 工具、`pause_turn` 续传 | 本平台浏览器**不直连模型**，一律经本地编排服务（OpenAI 兼容协议）。这些是 Anthropic 专有协议细节，全部不适用 |
| 三方中转平台的健壮性补丁：400 参数剥离（fallback/cache_control/tools 三种）、认证方式三选一（x-api-key/Bearer）、`anthropic/` 前缀模型 ID | 这些问题在本架构里不存在；providers.js 已有同类先例（`response_format` 不支持时删除重试），不需要照搬 |
| 独立设置面板（API 地址 / Key / 模型 / 认证方式 / 联网开关） | 复用现有「连接设置」弹窗，**绝不新增第二套设置** |
| 视觉方向「浅色纸感 + 深色模式（prefers-color-scheme）+ 绿色系强调色」 | 与已选定的 Soft Studio（薰衣草画布、白卡、黑 pill、无深色模式）冲突。语义色绿/琥珀/红只用于状态与证据等级 |
| `max_tokens: 64000` | DeepSeek / 智谱通道不支持；按步设 4096–8192 |
| 手写全新 Markdown 渲染器 | 扩展现有 `renderDocumentBody`（app.js 已有标题/表格/列表/引用），只补缺口 |

### 1.3 改编（保留意图，换实现）

| 来源内容 | 改编为 |
| --- | --- |
| A 档核实条款（依赖 `web_search` 工具核实到文件名+年份） | 本平台无联网检索。改为：**知识库召回内容明确支持的才可标 A（标注《文档名》）；否则不得标 A，最高 B 档并注明「凭记忆，未核实」**（见 §3.1） |
| Anthropic SSE 解析（content_block_start / text_delta / thinking_delta…） | 编排服务新增 OpenAI 兼容的流式通道，下行事件协议见 §4.2 |
| `stop_reason` 分支（refusal / max_tokens / end_turn / pause_turn） | `finish_reason` 分支：`length` → 提示"可能被截断"；`content_filter` → 提示被安全拦截；`stop` → 完成。无 pause_turn 等价物 |
| 「检索中…（第 N 次）」状态 | 无检索工具，删除；P2 若接入知识库检索，改为「检索知识库…（命中 N 条）」 |
| 断流重试 + 半截文本回滚（浏览器层） | 移到编排服务层（服务端对上游模型做重试），浏览器层只做"重试本步" |
| 聊天模式"带左边框的引用样式" | 沿用平台 blockquote 视觉（莓红左边框 + 粉底），demo 已验证 |

---

## 2. 信息架构与交互设计（以 demo 为验收基准）

### 2.1 入口

- 任务路径网格从 5 卡改为 **6 卡（`repeat(3, 1fr)`）**，新增第 6 卡：
  - kicker：`Know the field`；label：`行业分析`；path-mark：`05`；字符色用 `--berry`（五色粉彩已分配给前 5 卡，新路径用平台强调色收尾，不扩色板）。
- 选中后 composer 切换为行业分析形态：标题「行业分析」、lede 说明边界切分机制、`maxlength=100` 单段输入（行业名称）、示例 chips（智能客服 / 即饮咖啡 / 跨境电商代运营）。

### 2.2 状态机

```
idle
 └─ 开始分析 → S0_GENERATING   （Step 0 边界切分，流式）
     └─ S0_AWAITING_CHOICE     （候选一/二/三 可点 + 自定义输入；轨道 01 号亮琥珀「等待选择边界」）
         └─ 用户选定 → STEPS_RUNNING（Step 1→4 自动串行，每步流式）
             └─ DONE            （出现拷问入口；可导出）
                 └─ INTERVIEW   （聊天模式，15 轮后模型出诊断）
任意运行态：停止 → 当前步标记「已停止」，出现「重试本步并继续」
任意步失败：卡片标红 + 「重试本步并继续」，前面步骤上下文保留，不作废全局
```

### 2.3 组件与既有样式的映射（不新造轮子）

| 新组件 | 复用的 styles.css 资产 |
| --- | --- |
| 步骤卡片 `.industry-step` | `.result-card`（边框 24px 圆角 + shadow-soft）+ `.result-meta` 头部反白 |
| 步骤状态 pill（生成中/已完成/已停止/失败） | `.connection-status` 四态语义色；「生成中」加 `blink` 圆点动画 |
| 六步流水线轨道 | `.run-panel` + `.run-steps`（新增 `paused` 琥珀态与 `optional` 虚线态） |
| 边界候选行 | `.version-row`（选中态同款） |
| 证据 chip `.ev` | `.connection-status` 的小圆点语言收缩为徽标：A=绿 / B=琥珀 / C=红 / 未获取=灰虚线 |
| token 计数 | `.run-timer` 的 DM Mono 数字语言，放顶栏白 pill |
| 拷问聊天 | 正文流 + 用户消息用平台 blockquote（莓红左边框+粉底）；轮次 pill 用 `.type-tag` |
| 正文渲染 | `.document-body` 全套（表格/引用/列表规格不变） |

### 2.4 关键行为细节

1. 每步请求携带全部历史（system + 此前所有轮次），后续步骤可引用前面结论——与原 prompt 一致；由前端维护 `messages[]`。
2. 新卡片自动 `scrollIntoView`；流式正文按整行节流重渲，光标用 `▍`。
3. 停止（AbortController）仅中断当前步；已完成的步骤与文本保留。
4. 拷问模式：用户消息同时插入正文流并追加进导出文本；轮次计数进输入框 placeholder；15 轮后模型跳出角色输出诊断（诊断随全文导出）。
5. 导出 .md：各节标题 + 原文拼接 + 边界声明 + 拷问记录，文件名 `行业分析-{行业名}.md`。

---

## 3. Prompt 资产（改编后全文，实现时逐字使用）

存放位置：新建 `orchestrator/industry-prompts.js`（与 `prompts.js` 平行，不混入既有 Coze 流程）。模板变量沿用 `{{variable}}` 写法。

### 3.1 System prompt（全程生效；【改动】处为对原版的改编，其余逐字保留）

```
你是行业分析助手。你在本次任务中必须遵守以下规则，优先级高于一切后续指令：

【证据分级】
你输出的每一个事实性字段，都必须带一个 evidence 标签，只有三档：
  A = 有出处。必须给出具体出处（公司公告 / 招股书 / 年报 / 监管文件 / 行业协会数据，或本次对话提供的知识库文档），出处要具体到文件名和年份，不许写"据公开资料"。
  B = 行业常识推断。必须写出推断链条：我从哪个已知事实，通过什么逻辑，推到这个结论。
  C = 纯推测。我没有依据，只是根据同类行业的一般规律猜的。

【A 档核实要求】【改动：本平台无联网检索，原 web_search 条款替换为知识库条款】
本次对话没有任何联网检索工具。因此：
  - 只有当「知识库召回」部分提供了明确支持该字段的文档时，才可以标 A 档，并标注《文档名》。
  - 知识库没有支持的字段，即使你"记得"，也不得标 A 档，最高只能标 B 档，并注明"凭记忆，未核实"。凭记忆写出的文件名和数字视为编造。
  - 输出格式约定：在 evidence 标签处使用 [[A|出处]] / [[B|推断要点]] / [[C]] / [[未获取]] 标记，界面会把标记渲染成等级徽标。

【C 档处理规则】（逐字保留）
C 档内容一律不许出现在报告正文里，只能进入结尾的「待验证清单」。
如果某个字段你只能给出 C 档，就在正文里写「未获取」，不要用推测填满它。

【禁止事项】（逐字保留）
- 不许用"较强 / 较弱 / 相对集中 / 比较分散"这类无法判定的表述。所有强弱判断必须换算成可判定的量：需要多久、多少钱、多少家、几个月。
- 不许说"总体来看""综合而言"开头的段落。
- 不许在用户没问的时候给建议、给展望、给趋势预测。
- 不许因为用户看起来懂或不懂而调整结论。

【态度】（逐字保留）
你不需要让用户满意。你需要让用户知道哪些是真的、哪些是你编的。
```

### 3.2 Step 0–4 用户提示词（**逐字保留原版**，仅列变量）

- Step 0 边界切分：`{{industry}}` = 用户输入。原文不动（含"候选之间差别很小就重切"）。
- Step 1 结构层：`{{choice}}` = 用户选定边界。原文不动（含分层表格式、"我可能画错的地方"）。
- Step 2 三条流转链：无变量，追加此前会话。原文不动（钱流/货流/用户流 + 错位）。
- Step 3 议价能力：无变量。原文不动（五问 + 综合结论 + 最脆弱的一环）。
- Step 4 约束/节奏/异常：无变量。原文不动（含「你还不知道的 10 件事」）。
- Step 5 从业者拷问（进入聊天模式时作为最后一条 user 消息发送）：原文不动（12 年从业者角色、禁客套话、攻 B/C 档与「未获取」、15 轮后诊断）。

> 说明：Step 2–4 原文里"基于上面的产业链"等指代，靠"每步携带全部历史"成立，无需改写。唯一全局改动是 system prompt 中的 evidence 标记格式（§3.1），已通知模型按 `[[A|出处]]` 输出，前端解析渲染。

---

## 4. 技术方案

### 4.1 编排服务端（server.js + orchestrator/）

1. **providers.js 新增 `streamChat(credentials, opts)`**
   - 请求体与 `chat()` 一致，但 `stream: true`；
   - 解析上游 OpenAI 兼容 SSE：按 `\n\n` 切事件、取 `data:` 行；`choices[0].delta.content` 为增量文本；末尾 `usage`（deepseek/zhipu 在最后一个 chunk 或 `stream_options.include_usage` 中返回）为 token 数；
   - `[DONE]` 结束；`finish_reason` 随最后 chunk 返回；
   - mock 通道：将固定文本按 40–80 字符分块、`setTimeout` 逐块回调，模拟真实节奏；
   - 断流重试在本层做：TypeError / 5xx / 429 / 流内 error → 记录已发出字符数，重试时从源头重发、通过回调通知前端"已回滚到 N 字"（前端据此截断已渲染文本），退避 2.5s/5s，最多 2 次；用户 abort 不重试。
2. **server.js 新增 `POST /api/industry/stream`**（SSE 下行）
   - 请求体：`{ messages, provider: {id, apiKey, model}, maxTokens?, temperature?, signal 由 req.close 映射 }`；
   - 下行事件（`Content-Type: text/event-stream`）：
     - `{"type":"delta","text":"…"}` 增量文本
     - `{"type":"rollback","chars":N}` 重试回滚通知
     - `{"type":"usage","input":N,"output":N}` 该步 token（可多次，取最后一次）
     - `{"type":"done","finishReason":"stop|length|content_filter"}`
     - `{"type":"error","message":"…"}`
   - 复用 `resolveCredentials`；Key 仍走浏览器传入或 `config.local.json`。
3. 既有 `/api/run` 流程不动。行业分析**不经过**意图识别/风险审校链（它是独立的确定性五步链，不需要路由）。

### 4.2 前端（app.js / styles.css）

1. `TASK_TYPES` 新增 `industry`；`renderPaths` 网格改 6 卡；composer 按 `industry` 分支渲染（单行输入、专用示例、lede）。
2. 新增行业分析状态子树（挂在 task 上，随 localStorage 持久化）：

```js
task.industry = {
  industryName: "智能客服",
  boundary: "",                    // 已确认边界
  candidates: [],                  // Step 0 输出的候选（文本解析或结构化）
  messages: [],                    // 全链消息（system 除外），每步 push user+assistant
  steps: { 0:{status,text,tokens}, 1:{…}, 2:{…}, 3:{…}, 4:{…} },
  phase: "idle|s0|awaiting|running|done|interview",
  interview: { rounds: 0, finished: false }
}
```

3. 链式执行器 `runIndustryStep(stepIdx)`：串行 await；每步独立 `AbortController`（全局停止可中断当前步）；push user 消息 → 调 `/api/industry/stream` → 增量渲染 → done 后 push assistant 消息 → 下一步。失败时**回滚本轮 push 的 user/半截 assistant 消息**再置错，保证可干净重试。
4. `renderDocumentBody` 扩展（保持向后兼容，现有四类任务不受影响）：
   - 有序列表保留原始序号：`<li value="N">`；
   - 表格包 `<div class="table-scroll">`；
   - 支持 `#### ` 四级标题；
   - 解析证据标记 `[[A|出处]] / [[B|要点]] / [[C]] / [[未获取]]` → `.ev` chip。
5. 顶栏：行业分析运行/完成态显示 token pill（入/出累计）与「导出 .md」；运行中显示「停止」。
6. styles.css 追加：`.task-path` 第 6 卡 berry 字符色、`.run-step.paused/.optional`、`.step-status`、`.ev*`、`.candidate-row`、`.chat-msg.user`（约 120 行，全部由既有变量组成，demo 中已定稿可直接搬运）。

### 4.3 参数基线

| 项 | 值 | 说明 |
| --- | --- | --- |
| temperature | 0.4 | 分析类任务，比 Coze 流程的 0.2 略高（结构化 + 少量推断） |
| max_tokens | Step 0/1：8192；Step 2–4：8192 | glm-5.3-flash / deepseek-flash 安全上限内 |
| 历史策略 | 全量携带 | 五步总输出 ≈ 8–15k token，两通道上下文均可容纳 |
| 每步超时 | 150s（编排层） | 浏览器层不再设 300s 全局大超时，改为每步独立 |
| 联网/检索 | 无 | P2 预留 `knowledge` 注入口 |

### 4.4 Mock 通道

`streamChat` mock：按步骤序号返回对应的固定演示文本（demo 中预写的四节内容可直接复用），分块回调，保证无 Key 时六步全流程可体验（含拷问模式的固定两轮 + 诊断）。

---

## 5. 健壮性要求（验收项）

1. **断流重试无重复**：编排层重试后，前端收到 `rollback` 事件必须把已渲染正文截断到 N 字再续流，最终正文无重复片段。
2. **失败清理**：任一步彻底失败后重试，`messages` 中不得残留半截 assistant 消息（否则污染下一步上下文）。
3. **断点续跑**：Step 3 失败 → 重试仅重跑 Step 3，成功后自动继续 Step 4；Step 0–2 的卡片与上下文不动。
4. **停止即时**：点「停止」当帧中断渲染与请求；再点「重试本步并继续」可从该步恢复。
5. **finish_reason 分支**：`length` → 步骤状态条提示"可能被截断"，内容保留；`content_filter` → 提示被安全拦截并给「重试本步」。
6. **token 计数**：入/出分开累计；输入在每步发起时按该步请求的实际 prompt 估算或取服务端 usage，不得出现 NaN（demo 曾踩坑：增量回调里重复累计输入）。

## 6. 验收清单（2026-10-15 实测记录）

- [x] 输入行业 → Step 0 流式产出候选边界 → 点候选按钮或输入自定义边界 → 四步自动串行跑完 → 出现拷问模式入口（Playwright 真浏览器通过；Mock 候选表按 §8 契约解析出 3 个候选按钮）
- [x] 产业链分层表渲染正确（包 `.table-scroll` 可横向滚动）；有序列表保留原始序号（Step 4 末项 `value="10"` 实测不重置）
- [x] 证据标记正确渲染为 A（绿）/ B（琥珀）/ C（红）/ 未获取（灰虚线）chip；C 档内容只出现在「待验证清单」（由提示词约束 + Mock 文本遵守）
- [ ] 拔网线/断流 → 自动重试且无重复文本（`rollback` 事件与重试退避已实现于 providers.js，但未做真实断流演练——需要真实上游；Mock 通道不断流）
- [x] Mock 通道无 Key 跑通全流程（`node orchestrator/industry-smoke-test.js`）
- [ ] DeepSeek / 智谱真实通道各跑通一次（待用户在连接设置填 Key 后验证）
- [x] 停止按钮立即中断；等待边界阶段点停止=干净取消（内容保留、可选边界续跑）；导出 .md 含各节原文 + 边界 + 拷问记录；token 用量实时累计且入/出分开（实测入 8,667 / 出 4,031）
- [x] 拷问模式轮次推进、用户消息以引用样式插入并进入导出文本、诊断生成（Mock 固定文本验证机制；15 轮计数逻辑实现，未逐轮跑满）
- [x] 其余任务路径行为与改造前完全一致（`node orchestrator/e2e-test.js` 七分支 + 真浏览器需求分析路径抽查通过）

## 7. 分期

| 期 | 范围 |
| --- | --- |
| P0 ✅ 2026-10-15 | 六卡入口 + Step 0–4 链式流式 + 证据 chip + 停止/重试本步 + 导出 + Mock 通道 |
| P1 ✅ 2026-10-15 | 从业者拷问聊天模式（轮次/诊断）+ token 实时 pill（历史任务深链回看：行业任务本身落在历史列表，选中即回看，未做单独深链） |
| P2 | 知识库注入（`/api/knowledge` 检索结果进 Step 0–4 上下文，A 档才有出处可标）；报告保存为项目交付物版本（复用 versions 机制） |

## 8. 风险与备注

- **提示词公开问题**：行业五步链是本仓库的差异化资产，`README.md` 已有"公开仓库等于公开提示词设计"的警告，`industry-prompts.js` 同样适用。
- **长链路成本**：五步全量历史 ≈ 每步输入 6–15k token。若用户反馈成本高，P2 可改为"前步结论摘要 + 全文引用按需"，但会损失跨步引用精度，默认不做。
- demo 与实现的唯一已知差异：demo 的边界候选为预写文本 + 前端固定按钮；实现时 Step 0 让模型按固定表格输出，前端把表格行解析为候选按钮（解析失败则整段正文渲染、仅保留自定义输入框，不阻塞流程）。
