const STORAGE_KEY = "ai-pm-workbench-v1";
// 编排服务地址：优先用连接设置里填的地址；其次 config.js 的部署级默认值；
// 都没有时同源（部署到服务器直接访问）；file:// 打开则回退本机默认端口。
function apiBase() {
  const custom = normalizeText(state.settings?.serverUrl).replace(/\/+$/, "");
  if (custom) return custom;
  if (window.ORCHESTRATOR_URL) return String(window.ORCHESTRATOR_URL).replace(/\/+$/, "");
  if (location.protocol.startsWith("http")) return "";
  return "http://127.0.0.1:8787";
}
// 公开部署时服务端可设访问令牌（orchestrator/config.local.json 的 authToken 或环境变量 AUTH_TOKEN）
function apiHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  if (normalizeText(state.settings?.authToken)) headers["x-auth-token"] = normalizeText(state.settings.authToken);
  return headers;
}
const RUN_TIMEOUT_MS = 300000;

const TASK_TYPES = {
  smart: { label: "智能识别", kicker: "Describe first", description: "直接描述当前问题，工作流会判断更适合生成哪类交付物。", placeholder: "例如：我们想减少客服在订单查询上的重复操作，请先帮我拆解问题并给出适合的交付物。" },
  requirements: { label: "需求分析", kicker: "Understand the need", description: "把业务目标、用户问题和范围整理成可评审的需求依据。", placeholder: "例如：请分析售后流程中用户找不到进度、客服重复查询的问题，梳理目标与需求范围。" },
  solution: { label: "AI 方案设计", kicker: "Design the approach", description: "围绕目标用户和约束，形成可讨论的 AI 产品方案与 MVP 边界。", placeholder: "例如：请为 AI 客服 MVP 设计方案，说明能力边界、关键流程和人工接管机制。" },
  prd: { label: "PRD 草稿", kicker: "Make it buildable", description: "把已经明确的想法整理成产品、流程和验收都能继续使用的 PRD 草稿。", placeholder: "例如：请为订单查询功能输出 PRD 草稿，包含用户流程、异常处理和验收标准。" },
  competitor: { label: "竞品分析", kicker: "See the landscape", description: "整理竞品观察维度与对比框架，区分已知资料和待验证判断。", placeholder: "例如：请分析 AI 客服竞品在订单查询、售后转人工和知识库方面的差异。" },
  industry: { label: "行业分析", kicker: "Know the field", description: "输入一个行业名称。同一名称可能指向几条完全不同的产业链，工作流会先请你确认分析边界，再依次生成结构层、三条流转链、议价能力和约束节奏，字段带 A / B / C 证据分级。", placeholder: "例如：智能客服 / 即饮咖啡 / 跨境电商代运营" }
};

const SAMPLE_TASKS = [
  { label: "售后流程需求分析", type: "requirements", text: "请分析零售电商售后流程中用户找不到处理进度、客服重复查询的问题，梳理目标、用户需求、范围和待确认事项。" },
  { label: "AI 客服 MVP 方案", type: "solution", text: "请为零售电商设计一个 AI 客服 MVP 方案，聚焦商品问答与订单状态查询，说明核心流程、能力边界和人工接管机制。" },
  { label: "订单查询 PRD", type: "prd", text: "请为订单状态查询功能输出 PRD 草稿，包含用户流程、状态展示、异常处理、权限要求和验收标准。" },
  { label: "AI 客服竞品分析", type: "competitor", text: "请搭建 AI 客服竞品分析框架，重点比较商品问答、订单查询、售后服务、知识库和人工协同能力。" },
  { label: "智能客服", type: "industry", text: "智能客服" },
  { label: "即饮咖啡", type: "industry", text: "即饮咖啡" },
  { label: "跨境电商代运营", type: "industry", text: "跨境电商代运营" }
];

const DEMO_BODY = `# 零售 AI 客服 MVP：需求分析

## 1. 背景与目标

本项目面向零售电商售前、订单与售后服务场景，拟先验证“商品问答与订单状态查询”是否能够减少用户等待与客服重复查询。当前内容为演示数据，用于体验页面能力，并非工作流真实运行结果。

本次分析的目标是明确 MVP 的服务边界、核心用户任务和后续需要补充的业务资料，不对效率提升、准确率或商业结果作未经验证的承诺。

## 2. 用户与核心问题

| 用户 | 主要任务 | 当前可能遇到的问题 |
| --- | --- | --- |
| 线上消费者 | 了解商品、查询订单状态 | 不确定应该问什么，无法判断订单当前处于哪个阶段 |
| 客服坐席 | 回答重复问题、处理异常 | 需要在多个系统或资料中重复查找，异常时需要人工判断 |
| 运营人员 | 维护服务规则与资料 | 需要知道哪些问题可以自动处理，哪些必须转人工 |

## 3. MVP 范围

### 已确认纳入

- 商品基础信息问答：仅使用已维护且可追溯的商品资料。
- 订单状态查询：用户完成必要的身份与权限确认后，返回当前状态和下一步说明。
- 人工接管：无法确认、处理失败或用户明确要求人工时，转交客服坐席。

### 暂不纳入

- 自动修改订单、取消订单或发起退款。
- 没有资料支持的个性化推荐和承诺性回答。
- 跨系统批量操作。

## 4. 关键流程建议

1. 用户描述问题，系统先识别是商品咨询、订单查询还是售后问题。
2. 订单查询前完成身份和权限确认；未通过时不返回订单细节。
3. 系统引用已维护的资料生成回答，并明确当前信息的适用范围。
4. 命中异常、资料不足或用户要求人工时，保留上下文并转交客服。

## 5. 待确认事项

- 高峰期咨询量与可接受等待时间。
- 商品资料、物流状态资料的覆盖范围与更新频率。
- 人工接管的入口、工作时间和坐席可见字段。
- 不同订单状态下的权限规则与异常码。

## 6. 验收关注点

- 未完成身份与权限确认时，不展示订单敏感信息。
- 资料不足时明确说明并转人工，不自行补齐事实。
- 失败后用户可以继续与人工沟通，不需要重复描述完整问题。
- 每条可执行规则都能对应到一份可维护的业务资料。`;

const ICONS = {
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.7"/><path d="m16 16 4.3 4.3"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="m19.4 15 .1.1a2 2 0 0 1-2.8 2.8l-.1-.1a2 2 0 0 0-3.4 1.4v.2a2 2 0 0 1-4 0v-.2a2 2 0 0 0-3.4-1.4l-.1.1A2 2 0 0 1 3 15.1l.1-.1A2 2 0 0 0 1.7 11.6h-.2a2 2 0 0 1 0-4h.2A2 2 0 0 0 3.1 4.2L3 4.1a2 2 0 0 1 2.8-2.8l.1.1a2 2 0 0 0 3.4-1.4v-.2a2 2 0 0 1 4 0V0a2 2 0 0 0 3.4 1.4l.1-.1A2 2 0 0 1 19.6 4l-.1.1A2 2 0 0 0 20.8 7.5h.2a2 2 0 0 1 0 4h-.2a2 2 0 0 0-1.4 3.5Z" transform="translate(1 1) scale(.92)"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.7 9a2.4 2.4 0 1 1 4.1 1.7c-1 .9-1.8 1.4-1.8 2.8"/><path d="M12 17h.01"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m4 16.5-.7 3.8 3.8-.7L18.7 8a2.6 2.6 0 0 0-3.7-3.7L4 16.5Z"/><path d="m13.5 6.5 4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11l3 3v13H5z"/><path d="M8 4v6h8V4M8 20v-6h8v6"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M20 11a8.1 8.1 0 0 0-14-4.9L4 8"/><path d="M4 4v4h4M4 13a8.1 8.1 0 0 0 14 4.9l2-1.9"/><path d="M20 20v-4h-4"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 20 6v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m12 4 8 15H4L12 4Z"/><path d="M12 9v4M12 16h.01"/></svg>',
  trend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M5 20V9"/><path d="M12 20V4"/><path d="M19 20v-7"/></svg>'
};

let state = loadState();
let runController = null;
let runTimer = null;
let toastTimer = null;

function uid(prefix = "id") { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`; }
function now() { return new Date().toISOString(); }
function formatDate(value, withTime = true) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat("zh-CN", withTime ? { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" } : { year: "numeric", month: "numeric", day: "numeric" }).format(date);
}
function escapeHTML(value = "") { return String(value).replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char])); }
function normalizeText(value) { return typeof value === "string" ? value.trim() : ""; }
function currentProject() { return state.projects.find(project => project.id === state.currentProjectId) || state.projects[0]; }
function currentTask(project = currentProject()) { return project?.tasks?.find(task => task.id === project.selectedTaskId) || project?.tasks?.[0]; }
function currentVersion(task = currentTask()) { return task?.versions?.find(version => version.id === task.selectedVersionId) || task?.versions?.at(-1); }
function selectedType() { return state.currentTaskType || "smart"; }
function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function createDemoState() {
  const demoProjectId = "project-demo";
  const demoTaskId = "task-demo";
  const demoVersion = {
    id: "version-demo-1", number: 1, createdAt: "2026-08-20T09:30:00+08:00", generatedAt: "2026-08-20T09:30:00+08:00",
    title: "零售 AI 客服 MVP：需求分析", type: "requirements", status: "completed", demo: true, saved: true, body: DEMO_BODY,
    evidence: {
      facts: ["项目背景中的业务对象、目标用户和范围由演示项目预置。", "订单变更需要完成身份与权限确认，失败后转人工。"],
      sources: ["来源：演示项目背景字段。", "来源：演示任务输入。"],
      suggestions: ["建议先补齐高峰期咨询量和资料覆盖情况，再评估 MVP 的服务边界。"],
      assumptions: ["目前没有提供真实订单系统、知识库或客服工单数据。", "具体状态码和权限规则仍需业务方确认。"],
      risks: ["演示内容不代表真实企业情况，也不是工作流真实返回结果。", "涉及订单信息的任何自动化处理都需要人工确认权限。"]
    }
  };
  const task = {
    id: demoTaskId, type: "requirements", title: demoVersion.title, input: "请分析零售电商售后流程中用户找不到处理进度、客服重复查询的问题，梳理目标、用户需求、范围和待确认事项。",
    status: "completed", createdAt: demoVersion.createdAt, updatedAt: demoVersion.createdAt, selectedVersionId: demoVersion.id, versions: [demoVersion]
  };
  return {
    projects: [{ id: demoProjectId, name: "零售 AI 客服 MVP", object: "零售电商售前、订单与售后服务", audience: "线上消费者、客服坐席、运营人员", stage: "需求分析", scope: "商品问答与订单状态查询", constraints: "订单变更必须确认身份和权限，处理失败后转人工", openQuestions: "高峰期咨询量、知识资料覆盖情况、人工接管时间", createdAt: demoVersion.createdAt, updatedAt: demoVersion.createdAt, selectedTaskId: demoTaskId, tasks: [task] }],
    currentProjectId: demoProjectId, currentTaskType: "requirements", draftInput: "", resumeTaskId: null, search: "", modal: null, evidenceOpen: false, editing: null, connectionStatus: "idle", connectionMessage: "尚未配置模型通道", settings: { provider: "", apiKey: "", model: "", serverUrl: "", authToken: "" }
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      // 旧版本存的是 Coze workflowId + PAT，直接作废
      if (saved.settings && !saved.settings.provider) saved.settings = { provider: "", apiKey: "", model: "" };
      saved.settings = { serverUrl: "", authToken: "", ...(saved.settings || {}) };
      if (saved.projects?.length) return normalizeLoadedState({ ...createDemoState(), ...saved, modal: null, evidenceOpen: false, editing: null });
    }
  } catch (error) { console.warn("Unable to load saved workspace", error); }
  const initial = createDemoState();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

// 刷新/关闭页面会打断进行中的流式运行：把行业分析任务恢复到可重试的干净状态
function normalizeLoadedState(state) {
  for (const project of state.projects || []) {
    for (const task of project.tasks || []) {
      const ind = task.industry;
      if (!ind) continue;
      if (ind.phase === "s0" || ind.phase === "running") {
        const step = ind.steps?.[ind.activeStep ?? 0];
        if (step && step.status === "running") step.status = "stopped";
        ind.phase = "paused";
        ind.railMessage = "页面刷新中断了本次运行。可重试中断的那一步并继续，已完成的内容都在。";
      }
      if (ind.interview?.streaming) {
        ind.interview.streaming = false;
        const last = ind.interview.messages?.at(-1);
        if (last?.role === "assistant" && !last.content.trim()) ind.interview.messages.pop();
        if (task.status === "running") task.status = "completed";
      }
    }
  }
  if (state.run?.type === "industry") state.run = null;
  return state;
}

function renderIcon(name) { return ICONS[name] || ""; }

// 与 orchestrator/providers.js 保持一致的前端通道元数据
const PROVIDER_META = {
  deepseek: { label: "DeepSeek", defaultModel: "deepseek-flash", hint: "platform.deepseek.com 申请 Key，模型 ID：deepseek-flash（V4.1 Flash）" },
  zhipu: { label: "智谱 BigModel", defaultModel: "glm-5.3-flash", hint: "open.bigmodel.cn 申请 Key，模型 ID：glm-5.3-flash（免费）" },
  mock: { label: "离线测试（Mock）", defaultModel: "mock", hint: "不需要 API Key，返回固定演示内容，用于验证流程" }
};
function hasConnection() {
  if (!state.settings?.provider) return false;
  return state.settings.provider === "mock" || Boolean(state.settings.apiKey);
}
function connectionLabel() {
  const idle = hasConnection() ? (state.settings.provider === "mock" ? "Mock 可用" : "待测试") : "未配置";
  return { connected: "已连接", pending: "正在连接", error: "连接失败", idle }[state.connectionStatus] || "未配置";
}
function connectionClass() { return state.connectionStatus === "connected" ? "connected" : state.connectionStatus === "pending" ? "pending" : state.connectionStatus === "error" ? "error" : "idle"; }
function taskStatusLabel(status) {
  return { completed: "已完成", running: "进行中", needs_input: "待补充", guidance: "请选择方向", risk: "需确认", failed: "失败", cancelled: "已取消", no_result: "无有效结果" }[status] || "未开始";
}
function taskIcon(type) { return type === "smart" ? "spark" : type === "industry" ? "trend" : "file"; }
function projectMatches(project) {
  const query = state.search.trim().toLowerCase();
  if (!query) return true;
  return [project.name, project.object, ...(project.tasks || []).map(task => `${task.title} ${task.input}`)].some(text => text.toLowerCase().includes(query));
}

function renderSidebar(project) {
  const projects = state.projects.filter(projectMatches);
  const history = (project?.tasks || []).filter(task => !state.search || `${task.title} ${task.input}`.toLowerCase().includes(state.search.trim().toLowerCase())).slice().reverse();
  return `<aside class="sidebar" id="sidebar">
    <div class="brand"><div class="brand-mark">${renderIcon("spark")}</div><div><div class="brand-name">AI 产品经理工作台</div><div class="brand-sub">Product desk</div></div></div>
    <div class="search-box">${renderIcon("search")}<input id="searchInput" value="${escapeHTML(state.search)}" placeholder="搜索项目或任务" aria-label="搜索项目或任务" /></div>
    <div class="side-heading">我的项目</div>
    <div class="project-list">
      ${projects.length ? projects.map(item => `<button class="project-item ${item.id === project?.id ? "active" : ""}" data-action="select-project" data-project-id="${item.id}"><span class="project-dot"></span><span class="project-copy"><span class="project-name">${escapeHTML(item.name)}</span><span class="project-meta">${item.tasks.length} 个交付物 · ${escapeHTML(item.stage || "未设置阶段")}</span></span></button>`).join("") : `<div class="empty-side">没有找到匹配的项目或任务。</div>`}
    </div>
    <button class="side-action" data-action="new-project" style="margin-top: 8px">${renderIcon("plus")}<span>新建项目</span></button>
    <div class="history-block"><div class="side-heading">当前项目 · 历史任务</div><div class="history-list">
      ${history.length ? history.map(task => `<button class="history-item" data-action="select-task" data-task-id="${task.id}"><span class="history-icon">${renderIcon(taskIcon(task.type))}</span><span class="history-copy"><span class="history-title">${escapeHTML(task.title)}</span><span class="history-meta">${escapeHTML(TASK_TYPES[task.type]?.label || "任务")} · ${taskStatusLabel(task.status)}</span></span></button>`).join("") : `<div class="empty-side">还没有历史任务。</div>`}
    </div></div>
    <div class="sidebar-bottom"><button class="side-action" data-action="settings">${renderIcon("settings")}<span>连接设置 <small>· ${connectionLabel()}</small></span></button><button class="side-action" data-action="help">${renderIcon("help")}<span>帮助中心</span></button></div>
  </aside>`;
}

function renderTopbar(project) {
  const industry = industryTask();
  const showIndustry = industry && industry.industry.steps.some(step => step);
  const fmt = value => (value || 0).toLocaleString("zh-CN");
  const industryControls = showIndustry ? `<span class="token-pill">tokens <b id="industryTokenTotal">${fmt(industry.industry.tokens.in + industry.industry.tokens.out)}</b>（入 <b id="industryTokenIn">${fmt(industry.industry.tokens.in)}</b> / 出 <b id="industryTokenOut">${fmt(industry.industry.tokens.out)}</b>）</span>${state.run?.type === "industry" ? `<button class="button danger" data-action="cancel-run">${renderIcon("x")}停止</button>` : ""}<button class="button" data-action="export-industry">${renderIcon("save")}导出 .md</button>` : "";
  return `<header class="topbar"><button class="mobile-menu" data-action="toggle-sidebar" aria-label="打开项目区">${renderIcon("menu")}</button><div class="topbar-project"><div class="eyebrow">当前项目</div><div class="topbar-title"><h1>${escapeHTML(project?.name || "还没有项目")}</h1><span class="connection-status ${connectionClass()}">${connectionLabel()}</span></div></div><div class="top-actions">${industryControls}<button class="button" data-action="settings">${renderIcon("settings")}连接设置</button><button class="button" data-action="help">${renderIcon("help")}帮助</button><button class="button primary" data-action="new-project">${renderIcon("plus")}新建项目</button></div></header>`;
}

function renderContext(project) {
  return `<section class="context-panel"><div class="panel-heading"><div><h2>当前项目背景</h2><div class="panel-note">这些信息会随任务一起提供给工作流</div></div><button class="button small" data-action="edit-project">${renderIcon("edit")}编辑背景</button></div><dl class="context-grid"><div class="context-field"><dt>业务对象</dt><dd>${escapeHTML(project.object || "未填写")}</dd></div><div class="context-field"><dt>目标用户</dt><dd>${escapeHTML(project.audience || "未填写")}</dd></div><div class="context-field"><dt>当前阶段</dt><dd>${escapeHTML(project.stage || "未填写")}</dd></div><div class="context-field"><dt>项目交付物</dt><dd>${project.tasks.length} 个版本</dd></div><div class="context-field wide"><dt>已确认范围</dt><dd>${escapeHTML(project.scope || "未填写")}</dd></div><div class="context-field wide"><dt>关键约束</dt><dd>${escapeHTML(project.constraints || "未填写")}</dd></div><div class="context-field full"><dt>待确认事项</dt><dd class="${project.openQuestions ? "" : "muted"}">${escapeHTML(project.openQuestions || "还没有填写待确认事项")}</dd></div></dl></section>`;
}

function renderPaths() {
  const order = ["requirements", "solution", "prd", "competitor", "industry"];
  const paths = order.map(type => `<button class="task-path ${selectedType() === type ? "active" : ""}" data-action="select-type" data-type="${type}"><small>${escapeHTML(TASK_TYPES[type].kicker)}</small><strong>${TASK_TYPES[type].label}</strong><span class="path-mark">0${order.indexOf(type) + 1}</span></button>`).join("");
  return `<section><div class="section-kicker">Work paths</div><div class="section-title" style="display:none">任务路径</div><div class="task-paths"><button class="task-path smart ${selectedType() === "smart" ? "active" : ""}" data-action="select-type" data-type="smart"><small>${TASK_TYPES.smart.kicker}</small><strong>${TASK_TYPES.smart.label}</strong><span class="path-mark">✦</span></button>${paths}</div></section>`;
}

function renderComposer(project) {
  const type = selectedType();
  const meta = TASK_TYPES[type];
  const isRunning = Boolean(state.run);
  const input = state.run?.input ?? state.draftInput ?? "";
  const maxLen = type === "industry" ? INDUSTRY_INPUT_MAX : 5000;
  // 智能识别展示四类业务示例；具体路径只展示与自己同类的示例
  const samples = SAMPLE_TASKS.filter(sample => type === "smart" ? sample.type !== "industry" : sample.type === type);
  return `<section class="composer" id="composer"><div class="composer-top"><div><div class="section-kicker">${escapeHTML(meta.kicker)}</div><h2>${escapeHTML(meta.label)}</h2><p class="composer-lede">${escapeHTML(meta.description)}</p></div><div class="type-tag">当前任务 · ${escapeHTML(meta.label)}</div></div><div class="input-wrap"><textarea id="taskInput" maxlength="${maxLen}" ${isRunning ? "disabled" : ""} placeholder="${escapeHTML(meta.placeholder)}">${escapeHTML(input)}</textarea><span class="char-count" id="charCount">${input.length.toLocaleString("zh-CN")} / ${maxLen.toLocaleString("zh-CN")}</span></div><div class="privacy-note">${renderIcon("shield")}请勿输入未经授权的个人信息、商业秘密或生产凭证。</div><div class="composer-footer"><div class="examples"><span class="examples-label">试试：</span>${samples.map(sample => `<button class="example-button" data-action="use-example" data-example="${SAMPLE_TASKS.indexOf(sample)}">${escapeHTML(sample.label)}</button>`).join("")}</div><div class="composer-actions"><button class="button" data-action="clear-input" ${isRunning ? "disabled" : ""}>清空</button>${isRunning ? `<button class="button danger" data-action="cancel-run">${renderIcon("x")}取消运行</button>` : `<button class="button primary" data-action="start-analysis">${renderIcon("spark")}开始分析</button>`}</div></div></section>`;
}

function renderRunPanel() {
  if (!state.run || state.run.type === "industry") return "";
  const steps = ["理解任务", "整理资料", "生成交付物", "风险与事实检查"];
  const currentStep = state.run.step;
  return `<section class="run-panel"><div class="run-heading"><h2>${state.run.status === "running" ? "任务正在进行" : escapeHTML(state.run.statusLabel || "任务状态")}</h2><span class="run-timer">${state.run.startedAt ? formatDate(state.run.startedAt) : "刚刚"}</span></div><div class="run-steps">${steps.map((step, index) => `<div class="run-step ${index < currentStep ? "done" : index === currentStep ? "active" : ""}"><div class="run-step-index">0${index + 1}</div><div class="run-step-name">${step}</div></div>`).join("")}</div><div class="run-message">${escapeHTML(state.run.message || "正在准备任务…")}</div></section>`;
}

function renderDocumentBody(body) {
  const lines = String(body || "").replace(/\r/g, "").split("\n");
  let html = "", inUl = false, inOl = false, inTable = false;
  const closeLists = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  const closeTable = () => { if (inTable) { html += "</tbody></table></div>"; inTable = false; } };
  // 证据分级 chip：[[A|出处]] / [[B|推断要点]] / [[C]] / [[未获取]]
  const evidenceChip = (_, grade, label) => {
    if (grade === "未获取") return `<span class="ev ev-n" title="没有可靠依据，需人工补充"><i>?</i>未获取</span>`;
    const cls = { A: "ev-a", B: "ev-b", C: "ev-c" }[grade] || "ev-n";
    const fallback = { A: "公开可查", B: "推断", C: "推测" }[grade];
    return `<span class="ev ${cls}"${label ? ` title="${escapeHTML(label)}"` : ""}><i>${grade}</i>${escapeHTML(label || fallback)}</span>`;
  };
  const inline = text => escapeHTML(text)
    .replace(/\\\|/g, "|")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/\[\[(A|B|C|未获取)(?:\|([^\]]*))?\]\]/g, evidenceChip);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) { closeLists(); closeTable(); continue; }
    if (line.startsWith("|") && line.endsWith("|")) {
      // 单元格内的转义竖线（\|）先占位再还原，避免切断内容
      const cells = line.slice(1, -1).replace(/\\\|/g, "\u0001").split("|").map(cell => cell.trim().replace(/\u0001/g, "|"));
      if (/^\s*:?-+:?\s*$/.test(cells[0] || "")) continue;
      closeLists();
      if (!inTable) { html += '<div class="table-scroll"><table><thead><tr>' + cells.map(cell => `<th>${inline(cell)}</th>`).join("") + "</tr></thead><tbody>"; inTable = true; }
      else html += "<tr>" + cells.map(cell => `<td>${inline(cell)}</td>`).join("") + "</tr>";
      continue;
    }
    closeTable();
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) { closeLists(); const level = heading[1].length; html += `<h${level}>${inline(heading[2])}</h${level}>`; continue; }
    if (line.startsWith(">")) { closeLists(); html += `<blockquote>${inline(line.slice(1).trim())}</blockquote>`; continue; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { if (!inUl) { closeLists(); html += "<ul>"; inUl = true; } html += `<li>${inline(bullet[1])}</li>`; continue; }
    const numbered = line.match(/^(\d+)[.)]\s+(.+)$/);
    // 有序列表保留模型输出的原始序号：列表项之间常隔空行导致列表被切开，靠 value 防止每项都显示成 1.
    if (numbered) { if (!inOl) { closeLists(); html += "<ol>"; inOl = true; } html += `<li value="${numbered[1]}">${inline(numbered[2])}</li>`; continue; }
    closeLists(); html += `<p>${inline(line)}</p>`;
  }
  closeLists(); closeTable();
  return html || `<p class="muted">没有可展示的正文。</p>`;
}

function renderStatePanel(task) {
  if (!task || ["completed", "running"].includes(task.status)) return "";
  const config = {
    needs_input: ["followup-panel", "还需要你确认", "任务返回了追问。请补充下面的信息后继续当前任务，原有输入会保留。"],
    guidance: ["followup-panel", "请选择一个任务方向", task.guidance || "当前请求没有匹配到支持的任务类型。请按引导选择四类任务之一，或改写输入。"],
    risk: ["risk-panel", "需要人工确认", "任务返回了风险提醒。原文已保留，请在确认业务规则后再保存为正式交付物。"],
    failed: ["error-panel", "本次任务没有完成", state.connectionMessage || "连接失败或编排服务暂时无法使用。"],
    no_result: ["error-panel", "没有得到有效结果", "本次任务已经结束，但没有得到可展示的内容，请检查模型通道后重试。"],
    cancelled: ["error-panel", "任务已取消", "你主动取消了本次运行，已经输入的内容仍然保留。"]
  }[task.status];
  if (!config) return "";
  return `<section class="${config[0]}"><div class="state-title">${renderIcon(task.status === "failed" || task.status === "no_result" || task.status === "cancelled" ? "alert" : "info")}${config[1]}</div><div class="state-copy">${escapeHTML(config[2])}</div>${["failed", "no_result"].includes(task.status) ? `<div class="run-actions"><button class="button small primary" data-action="retry-task">${renderIcon("refresh")}重新尝试</button><button class="button small" data-action="settings">${renderIcon("settings")}检查连接</button></div>` : ["needs_input", "guidance"].includes(task.status) ? `<div class="run-actions"><button class="button small primary" data-action="continue-followup">继续补充</button></div>` : ""}</section>`;
}

function renderResult(task, project) {
  if (task.type === "industry") return renderIndustry(task);
  const version = currentVersion(task);
  if (!version || !["completed", "risk"].includes(task.status)) return renderStatePanel(task);
  const editing = state.editing && state.editing.taskId === task.id && state.editing.versionId === version.id;
  const body = version.body || "";
  return `<section class="result-section" id="resultSection"><div class="result-toolbar"><div><div class="section-kicker">Delivery document</div><h2>${escapeHTML(version.title || `${TASK_TYPES[version.type]?.label || "交付物"} · ${project.name}`)}</h2></div><div class="result-toolbar-actions"><button class="button small" data-action="copy-result">${renderIcon("copy")}复制全文</button><button class="button small ${version.saved ? "" : "primary"}" data-action="save-result">${renderIcon("save")}${version.saved ? "已保存" : "保存到项目"}</button><button class="button small" data-action="edit-result">${renderIcon("edit")}继续编辑</button></div></div><article class="result-card"><div class="result-meta"><div class="result-meta-item"><span>交付物类型</span><strong>${escapeHTML(TASK_TYPES[version.type]?.label || "业务文档")}</strong></div><div class="result-meta-item"><span>项目名称</span><strong>${escapeHTML(project.name)}</strong></div><div class="result-meta-item"><span>生成时间</span><strong>${formatDate(version.generatedAt)}</strong></div><div class="result-meta-item"><span>当前状态</span><strong class="result-status">${task.status === "risk" ? "需人工确认" : "已完成"}</strong></div></div><div class="document-body">${version.demo ? `<div class="demo-banner" style="margin-bottom:22px">${renderIcon("info")}<span>当前内容为演示数据，用于体验页面能力，并非工作流真实运行结果。</span></div>` : ""}${editing ? `<textarea class="document-editor" id="documentEditor">${escapeHTML(body)}</textarea><div class="editor-actions"><button class="button small" data-action="cancel-edit">取消</button><button class="button small primary" data-action="save-edit">${renderIcon("save")}保存修改</button></div>` : renderDocumentBody(body)}</div><div class="result-footer"><span>${version.saved ? "已保存到当前项目 · 可在历史任务中重新查看" : "尚未保存到项目"}</span><div class="result-footer-actions"><button class="button small ghost" data-action="view-evidence">查看证据与假设 ${renderIcon("arrow")}</button><button class="button small ghost" data-action="regenerate">${renderIcon("refresh")}重新生成</button><button class="button small ghost" data-action="continue-next">继续下一项 ${renderIcon("arrow")}</button></div></div></article>${task.status === "risk" ? renderStatePanel(task) : ""}</section>${renderVersions(task)}`;
}

function renderVersions(task) {
  if (!task?.versions?.length) return "";
  return `<section class="versions-section"><div class="versions-heading"><div><div class="section-kicker">Version history</div><h2>这个任务的版本</h2></div><span class="panel-note">${task.versions.length} 个版本，均独立保留</span></div><div class="version-list">${task.versions.slice().reverse().map(version => `<div class="version-row ${version.id === task.selectedVersionId ? "selected" : ""}"><div class="version-number">v${version.number}</div><div class="version-info"><strong>${escapeHTML(version.title || "未命名交付物")}</strong><span>${formatDate(version.createdAt)} · ${version.saved ? "已保存" : "未保存"} · ${version.demo ? "演示数据" : "工作流返回"}</span></div><div class="version-actions"><button class="button small" data-action="select-version" data-version-id="${version.id}">查看</button><button class="button small danger" data-action="delete-version" data-version-id="${version.id}">${renderIcon("trash")}</button></div></div>`).join("")}</div></section>`;
}

function renderEvidence(task) {
  const version = currentVersion(task);
  const groups = ["facts", "sources", "suggestions", "assumptions", "risks"];
  const labels = { facts: "已确认事实", sources: "资料支持", suggestions: "分析建议", assumptions: "待验证假设", risks: "风险与人工确认点" };
  return `<div class="evidence-drawer ${state.evidenceOpen ? "open" : ""}"><div class="evidence-backdrop" data-action="close-evidence"></div><aside class="evidence-panel" aria-label="证据与假设"><div class="drawer-header"><div><div class="section-kicker">Evidence desk</div><h2>证据与假设</h2><p>${version ? `${escapeHTML(TASK_TYPES[version.type]?.label || "交付物")} · ${formatDate(version.generatedAt)}` : "当前没有可查看的交付物"}</p></div><button class="icon-button" data-action="close-evidence" aria-label="关闭证据区域">${renderIcon("x")}</button></div>${groups.map(group => `<section class="evidence-group"><h3>${labels[group]}</h3>${version?.evidence?.[group]?.length ? `<ul>${version.evidence[group].map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>` : `<div class="evidence-empty">工作流没有返回这一类内容，请人工补充或验证。</div>`}</section>`).join("")}</aside></div>`;
}

/* ============================================================
   行业分析工作台（第 6 条任务路径）
   提示词保存在编排服务端（orchestrator/industry-prompts.js）；
   前端只保存进度状态（边界、各步正文、拷问记录），每步请求由
   服务端重建完整消息序列。见 industry-analysis-spec.md。
   ============================================================ */
const INDUSTRY_INPUT_MAX = 100;
const INDUSTRY_INTERVIEW_SENTINEL = "[[INDUSTRY_INTERVIEW_START]]";
const INDUSTRY_INTERVIEW_DIAGNOSTIC_SENTINEL = "[[INDUSTRY_INTERVIEW_DIAGNOSTIC]]";
const INDUSTRY_INTERVIEW_MAX_ROUNDS = 15;
const INDUSTRY_RAIL_STEPS = ["边界切分", "结构层", "三条流转链", "议价能力", "约束与节奏", "从业者拷问"];
const INDUSTRY_CARDS = [
  { kicker: "STEP 0 · 边界切分", title: null },
  { kicker: "STEP 1 · 结构层", title: "产业链分层" },
  { kicker: "STEP 2 · 三条流转链", title: "钱流 / 货流 / 用户流 与错位" },
  { kicker: "STEP 3 · 议价能力", title: "五个可以被验证的问题" },
  { kicker: "STEP 4 · 约束 / 节奏 / 异常", title: "外行看不见的线，与你还不知道的 10 件事" }
];
const INDUSTRY_STATUS_LABELS = { pending: "排队中", running: "生成中", done: "已完成", awaiting: "等待选择边界", stopped: "已停止", failed: "失败" };

let industryController = null;
let industryRenderQueued = false;
let industryTimerHandle = null;

function freshIndustry(name) {
  return {
    industryName: name, boundary: "", candidates: [],
    steps: [null, null, null, null, null],
    phase: "s0", activeStep: 0, tokens: { in: 0, out: 0 },
    startedAt: now(),
    railMessage: "Step 0 · 边界切分：正在识别同名行业…",
    interview: { open: false, rounds: 0, finished: false, streaming: false, messages: [] }
  };
}

function industryTask() { const task = currentTask(); return task && task.type === "industry" && task.industry ? task : null; }

function industryRailState(ind, index) {
  if (index === 5) {
    if (ind.interview.finished) return "done";
    return ind.phase === "interview" ? "active" : "";
  }
  const step = ind.steps[index];
  if (!step) return "";
  if (step.status === "running") return "active";
  if (step.status === "done") return "done";
  if (step.status === "awaiting" || step.status === "stopped") return "paused";
  if (step.status === "failed") return "failed";
  return "";
}

function industryTimerText(ind) {
  if (!ind.startedAt) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(ind.startedAt).getTime()) / 1000));
  const text = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  return ["done", "paused"].includes(ind.phase) ? `用时 ${text}` : `已用时 ${text}`;
}

function startIndustryTimer() {
  stopIndustryTimer();
  industryTimerHandle = setInterval(() => {
    const task = industryTask();
    const el = document.getElementById("industryTimer");
    if (task && el) el.textContent = industryTimerText(task.industry);
    else stopIndustryTimer();
  }, 1000);
}
function stopIndustryTimer() { clearInterval(industryTimerHandle); industryTimerHandle = null; }

function parseIndustryCandidates(text) {
  const rows = String(text || "").split("\n")
    .filter(line => line.trim().startsWith("|") && line.trim().endsWith("|"))
    .map(line => line.trim().slice(1, -1).replace(/\\\|/g, "\u0001").split("|").map(cell => cell.trim().replace(/\u0001/g, "|")));
  const headerIndex = rows.findIndex(cells => cells[0] === "候选");
  if (headerIndex < 0) return [];
  const candidates = [];
  for (const cells of rows.slice(headerIndex + 1)) {
    if (!cells[0] || /^:?-{3,}:?$/.test(cells[0]) || cells.length < 2) continue;
    const title = /^候选/.test(cells[0]) ? cells[0] : `候选${cells[0]}`;
    const include = cells[1] || "（见表）";
    const exclude = cells[2] || "（见表）";
    candidates.push({
      title,
      detail: `包含：${include}。不包含：${exclude}。典型玩家：${cells[3] || "—"}`,
      choice: `${title}：包含${include}；不包含${exclude}`
    });
  }
  return candidates;
}

function renderIndustryRail(ind) {
  return `<section class="run-panel on" id="industryRail"><div class="run-heading"><h2>行业分析 · ${escapeHTML(ind.industryName)}</h2><span class="run-timer" id="industryTimer">${industryTimerText(ind)}</span></div><div class="run-steps">${INDUSTRY_RAIL_STEPS.map((name, index) => `<div class="run-step ${index === 5 ? "optional" : ""} ${industryRailState(ind, index)}" id="industryRailStep${index}"><div class="run-step-index">0${index + 1}</div><div class="run-step-name">${name}</div></div>`).join("")}</div><div class="run-message" id="industryRailMessage">${escapeHTML(ind.railMessage || "")}</div></section>`;
}

function renderBoundaryChooser(ind) {
  if (ind.phase !== "awaiting") return "";
  const customRow = `<div class="boundary-custom"><input id="industryCustomBoundary" maxlength="200" placeholder="自定义边界或交叉组合，如「一 + 二」" /><button class="button small primary" data-action="industry-confirm-custom">确认边界</button></div>`;
  if (!ind.candidates.length) {
    return `<div style="padding:0 34px 26px"><div class="followup-panel" style="margin:0 0 12px">候选边界解析失败，请参考上方正文，直接输入自定义边界。</div>${customRow}</div>`;
  }
  return `<div style="padding:0 34px 26px"><div class="candidate-list">${ind.candidates.map((candidate, index) => `<button class="candidate-row" data-action="industry-choose-candidate" data-candidate="${index}"><span class="candidate-mark">${["一", "二", "三", "四"][index] || index + 1}</span><span class="candidate-info"><strong>${escapeHTML(candidate.title)}</strong><span>${escapeHTML(candidate.detail)}</span></span></button>`).join("")}</div>${customRow}</div>`;
}

function renderIndustryStepCard(ind, index) {
  const card = INDUSTRY_CARDS[index];
  const step = ind.steps[index];
  const status = step?.status || "pending";
  const title = index === 0 ? `「${escapeHTML(ind.industryName)}」可能指这几个行业` : card.title;
  const retryable = status === "failed" || status === "stopped";
  const notes = { 0: "边界决定后面四步的分析对象，选定后自动继续。", 4: "本步内容默认为推测档，逐条给出验证方法，不许当结论使用。" };
  const body = step ? renderDocumentBody(step.text) + (status === "running" ? '<p style="color:var(--faint)">▍</p>' : "") : "";
  return `<article class="industry-step ${step ? "on" : ""}" id="industryCard${index}"><div class="step-head"><div><div class="section-kicker">${card.kicker}</div><h2>${title}</h2></div><div class="step-side"><span class="step-status ${status}" id="industryStatus${index}">${INDUSTRY_STATUS_LABELS[status] || ""}</span><span class="step-tokens" id="industryStepTokens${index}">${step?.tokens ? `${step.tokens.toLocaleString("zh-CN")} tok` : ""}</span></div></div><div class="step-body document-body" id="industryBody${index}">${body}</div>${index === 0 ? renderBoundaryChooser(ind) : ""}<div class="step-footer"><span>${notes[index] || ""}</span><div class="step-footer-actions">${retryable ? `<button class="button small" data-action="retry-industry-step" data-step="${index}">${renderIcon("refresh")}重试本步并继续</button>` : ""}</div></div></article>`;
}

function renderChatMessages(chat) {
  return chat.messages
    .filter(message => !message.hidden && message.content !== INDUSTRY_INTERVIEW_SENTINEL)
    .map(message => message.role === "user"
      ? `<div class="chat-msg user"><span class="who"><b>你</b></span>${escapeHTML(message.content).replace(/\n/g, "<br>")}</div>`
      : `<div class="chat-msg"><span class="who"><b>模型 · 内行</b></span>${renderDocumentBody(message.content)}</div>`)
    .join("");
}

function renderInterviewCard(ind) {
  const chat = ind.interview;
  if (!(chat.open || ind.phase === "done" || ind.phase === "interview")) return "";
  const canChat = chat.open && !chat.streaming && !chat.finished;
  const statusLabel = chat.finished ? "已完成" : chat.open ? "进行中" : "待进入";
  const round = Math.min(chat.rounds, INDUSTRY_INTERVIEW_MAX_ROUNDS);
  return `<article class="industry-step on" id="industryCard5"><div class="step-head"><div><div class="section-kicker">STEP 5 · 从业者拷问（可选）</div><h2>让内行检验这份报告</h2></div><div class="step-side"><span class="step-status ${chat.finished ? "done" : chat.open ? "running" : "awaiting"}">${statusLabel}</span></div></div><div class="chat-body">${chat.open ? "" : `<div class="chat-intro"><span>模型扮演从业 12 年的内行，专挑报告里 <strong>B / C 档</strong> 和「未获取」的字段反问你，一次最多说三句话。${INDUSTRY_INTERVIEW_MAX_ROUNDS} 轮后跳出角色，给出报告哪里是空的一张诊断。</span><button class="button primary" data-action="industry-start-interview">${renderIcon("spark")}进入拷问模式</button></div>`}<div class="chat-stream" id="industryChatStream">${chat.open ? renderChatMessages(chat) : ""}</div>${chat.open ? `<div class="chat-input-row"><input id="industryChatInput" ${canChat ? "" : "disabled"} placeholder="${chat.finished ? "拷问已结束，诊断会随全文一起导出" : `回答内行的问题（第 ${round + 1} 轮），回车发送…`}" /><span class="round-pill" id="industryRoundPill">第 ${round} / ${INDUSTRY_INTERVIEW_MAX_ROUNDS} 轮</span><button class="button small primary" data-action="industry-send-chat" ${canChat ? "" : "disabled"}>发送</button></div>` : ""}</div></article>`;
}

function renderIndustry(task) {
  const ind = task.industry;
  if (!ind) return renderStatePanel(task);
  return `${renderIndustryRail(ind)}${INDUSTRY_CARDS.map((card, index) => renderIndustryStepCard(ind, index)).join("")}${renderInterviewCard(ind)}`;
}

// 流式期间按帧补丁更新已渲染的 DOM，不做整页重渲染（避免输入框失焦与抖动）
function queueIndustryPatch() {
  if (industryRenderQueued) return;
  industryRenderQueued = true;
  requestAnimationFrame(() => { industryRenderQueued = false; patchIndustryView(); });
}

function patchIndustryView() {
  const task = industryTask();
  if (!task) return;
  const ind = task.industry;
  for (let index = 0; index < 5; index += 1) {
    const step = ind.steps[index];
    if (!step) continue;
    const card = document.getElementById(`industryCard${index}`);
    if (card && !card.classList.contains("on")) card.classList.add("on");
    const body = document.getElementById(`industryBody${index}`);
    if (body) {
      const signature = `${step.text.length}:${step.status}`;
      if (body.dataset.rendered !== signature) {
        body.innerHTML = renderDocumentBody(step.text) + (step.status === "running" ? '<p style="color:var(--faint)">▍</p>' : "");
        body.dataset.rendered = signature;
      }
    }
    const statusEl = document.getElementById(`industryStatus${index}`);
    if (statusEl) { statusEl.className = `step-status ${step.status}`; statusEl.textContent = INDUSTRY_STATUS_LABELS[step.status] || ""; }
    const tokensEl = document.getElementById(`industryStepTokens${index}`);
    if (tokensEl) tokensEl.textContent = step.tokens ? `${step.tokens.toLocaleString("zh-CN")} tok` : "";
  }
  for (let index = 0; index < 6; index += 1) {
    const railEl = document.getElementById(`industryRailStep${index}`);
    if (railEl) railEl.className = `run-step ${index === 5 ? "optional" : ""} ${industryRailState(ind, index)}`;
  }
  const message = document.getElementById("industryRailMessage");
  if (message) message.textContent = ind.railMessage || "";
  const timer = document.getElementById("industryTimer");
  if (timer) timer.textContent = industryTimerText(ind);
  const fmt = value => (value || 0).toLocaleString("zh-CN");
  const total = document.getElementById("industryTokenTotal");
  if (total) total.textContent = fmt(ind.tokens.in + ind.tokens.out);
  const input = document.getElementById("industryTokenIn");
  if (input) input.textContent = fmt(ind.tokens.in);
  const output = document.getElementById("industryTokenOut");
  if (output) output.textContent = fmt(ind.tokens.out);
  if (ind.interview.open) {
    const stream = document.getElementById("industryChatStream");
    if (stream) stream.innerHTML = renderChatMessages(ind.interview);
    const pill = document.getElementById("industryRoundPill");
    if (pill) pill.textContent = `第 ${Math.min(ind.interview.rounds, INDUSTRY_INTERVIEW_MAX_ROUNDS)} / ${INDUSTRY_INTERVIEW_MAX_ROUNDS} 轮`;
  }
}

async function streamIndustryRequest({ mode, step, interview, signal, onDelta, onRollback, onUsage }) {
  const task = industryTask();
  if (!task) throw new Error("行业分析任务不存在。");
  const ind = task.industry;
  const body = { mode, provider: { id: state.settings.provider, apiKey: state.settings.apiKey || "", model: state.settings.model || "" }, maxTokens: 8192 };
  if (mode === "interview") {
    body.steps = ind.steps.filter(Boolean).map(item => item.text);
    body.interview = interview;
  } else {
    body.step = step;
    body.industry = ind.industryName;
    body.boundary = ind.boundary || "";
    body.steps = ind.steps.slice(0, step).filter(item => item && item.status === "done").map(item => item.text);
  }
  const response = await fetch(`${apiBase()}/api/industry/stream`, { method: "POST", signal, headers: apiHeaders(), body: JSON.stringify(body) });
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    const error = new Error(data?.error?.message || `HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", finishReason = "stop";
  const handleEvent = rawEvent => {
    for (const line of rawEvent.split("\n")) {
      if (!line.startsWith("data:")) continue;
      let event = null;
      try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (event.type === "delta") onDelta(event.text || "");
      else if (event.type === "rollback") onRollback(event.chars || 0);
      else if (event.type === "usage") onUsage(event);
      else if (event.type === "done") finishReason = event.finishReason || "stop";
      else if (event.type === "error") throw new Error(event.message || "行业分析步骤执行失败。");
    }
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let separator;
      while ((separator = buffer.indexOf("\n\n")) >= 0) {
        handleEvent(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
      }
    }
    if (buffer.trim()) handleEvent(buffer);
  } finally { reader.cancel().catch(() => {}); }
  return finishReason;
}

function beginIndustryRun(task) {
  task.status = "running";
  state.run = { taskId: task.id, input: task.industry.industryName, type: "industry" };
  state.connectionStatus = hasConnection() ? "pending" : state.connectionStatus;
  persist(); renderApp();
  startIndustryTimer();
}

function startIndustry(input) {
  if (state.run) return;
  if (!hasConnection()) {
    state.connectionStatus = "error";
    state.connectionMessage = "连接信息不完整。请先在连接设置中选择模型通道并填写 API Key。";
    renderApp(); toast(state.connectionMessage, "error"); return;
  }
  const project = currentProject();
  const task = { id: uid("task"), type: "industry", title: `行业分析 · ${input}`, input, status: "running", createdAt: now(), updatedAt: now(), industry: freshIndustry(input), versions: [] };
  project.tasks.push(task);
  project.selectedTaskId = task.id;
  state.draftInput = input;
  updateProject(project, {});
  beginIndustryRun(task);
  toast(`开始分析「${input}」：先切分边界。`, "success");
  runIndustryStep(0);
}

async function runIndustryStep(index) {
  const task = industryTask();
  if (!task || !state.run) return;
  const ind = task.industry;
  ind.steps[index] = { status: "running", text: "", tokens: 0 };
  ind.activeStep = index;
  ind.phase = index === 0 ? "s0" : "running";
  ind.railMessage = index === 0
    ? "Step 0 · 边界切分：正在识别同名行业…"
    : `Step ${index} · ${INDUSTRY_RAIL_STEPS[index]} 生成中…（每步携带全部历史，后面的步骤会引用前面的结论）`;
  persist(); renderApp();
  document.getElementById(`industryCard${index}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  industryController = new AbortController();
  try {
    const finishReason = await streamIndustryRequest({
      mode: "step",
      step: index,
      signal: industryController.signal,
      onDelta: chunk => { ind.steps[index].text += chunk; queueIndustryPatch(); },
      onRollback: chars => { ind.steps[index].text = ind.steps[index].text.slice(0, chars); queueIndustryPatch(); },
      onUsage: usage => { ind.tokens.in += usage.input || 0; ind.tokens.out += usage.output || 0; ind.steps[index].tokens = usage.output || 0; queueIndustryPatch(); }
    });
    ind.steps[index].status = "done";
    task.updatedAt = now();
    if (index === 0) {
      ind.candidates = parseIndustryCandidates(ind.steps[0].text);
      ind.steps[0].status = "awaiting";
      ind.phase = "awaiting";
      ind.railMessage = ind.candidates.length
        ? "请选择一个候选边界，或输入自定义边界。选定后自动继续四步。"
        : "候选解析失败，请直接输入自定义边界。";
      state.connectionStatus = "connected";
      state.connectionMessage = "边界切分完成，等待选择边界";
      persist(); renderApp();
    } else if (index < 4) {
      if (finishReason === "length") ind.railMessage = `Step ${index} 输出可能被截断（达到 max_tokens），已保留内容并继续。`;
      persist();
      runIndustryStep(index + 1);
    } else {
      ind.phase = "done";
      ind.railMessage = finishReason === "length"
        ? "四步已完成（末步可能被截断）。可进入「从业者拷问」或导出 .md。"
        : "四步已完成。可进入「从业者拷问」，专攻报告里的 B / C 档字段；或导出 .md。";
      finishIndustryRun("completed");
    }
  } catch (error) {
    const aborted = error.name === "AbortError" || error.cancelled;
    ind.steps[index].status = aborted ? "stopped" : "failed";
    ind.phase = "paused";
    ind.railMessage = aborted
      ? "已手动停止。可重试本步并继续，前面步骤的上下文仍在。"
      : `Step ${index + 1} 执行失败：${error.message || "未知错误"}`;
    state.connectionStatus = aborted ? state.connectionStatus : "error";
    state.connectionMessage = aborted ? "已停止" : (error.message || "行业分析步骤失败。");
    state.run = null;
    task.updatedAt = now();
    stopIndustryTimer();
    persist(); renderApp();
    toast(aborted ? "行业分析已停止，可重试本步并继续。" : `行业分析失败：${error.message || "请检查连接后重试。"}`, aborted ? "" : "error");
  } finally { industryController = null; }
}

function finishIndustryRun(kind) {
  const task = industryTask();
  if (!task) return;
  task.status = kind;
  task.updatedAt = now();
  state.run = null;
  state.connectionStatus = "connected";
  state.connectionMessage = "行业分析已完成";
  stopIndustryTimer();
  persist(); renderApp();
  document.getElementById("industryCard5")?.scrollIntoView({ behavior: "smooth", block: "start" });
  toast("行业分析完成，可导出 .md 或进入拷问模式。", "success");
}

function chooseIndustryCandidate(index) {
  const task = industryTask();
  if (!task || task.industry.phase !== "awaiting") return;
  const candidate = task.industry.candidates[index];
  if (candidate) confirmIndustryBoundary(candidate.choice);
}

function confirmIndustryCustom() {
  const text = (document.getElementById("industryCustomBoundary")?.value || "").trim();
  if (!text) { toast("请选择候选边界，或填写自定义边界。", "error"); return; }
  confirmIndustryBoundary(text);
}

function confirmIndustryBoundary(boundary) {
  const task = industryTask();
  if (!task || task.industry.phase !== "awaiting") return;
  const ind = task.industry;
  ind.boundary = boundary;
  ind.steps[0].status = "done";
  ind.phase = "running";
  ind.railMessage = `边界已确认：${boundary.length > 60 ? `${boundary.slice(0, 60)}…` : boundary} · 开始四步分析`;
  state.connectionMessage = "已确认边界，继续四步分析";
  if (!state.run) beginIndustryRun(task); else { persist(); renderApp(); }
  runIndustryStep(1);
}

function retryIndustryStep(index) {
  if (state.run) return;
  const task = industryTask();
  if (!task) return;
  task.industry.steps[index] = null;
  beginIndustryRun(task);
  runIndustryStep(index);
}

function startIndustryInterview() {
  const task = industryTask();
  if (!task || task.industry.phase !== "done" || state.run) return;
  const ind = task.industry;
  ind.interview = { open: true, rounds: 0, finished: false, streaming: true, messages: [{ role: "user", content: INDUSTRY_INTERVIEW_SENTINEL }, { role: "assistant", content: "" }] };
  ind.phase = "interview";
  ind.railMessage = "拷问模式：模型只攻击报告里心虚的地方，一次最多三句话。";
  beginIndustryRun(task);
  document.getElementById("industryCard5")?.scrollIntoView({ behavior: "smooth", block: "start" });
  streamIndustryTurn();
}

function sendIndustryChat() {
  const input = document.getElementById("industryChatInput");
  const text = (input?.value || "").trim();
  const task = industryTask();
  if (!task || !text || state.run || task.industry.interview.streaming || task.industry.interview.finished) return;
  input.value = "";
  const ind = task.industry;
  ind.interview.messages.push({ role: "user", content: text });
  ind.interview.rounds += 1;
  if (ind.interview.rounds >= INDUSTRY_INTERVIEW_MAX_ROUNDS) ind.interview.messages.push({ role: "user", content: INDUSTRY_INTERVIEW_DIAGNOSTIC_SENTINEL, hidden: true });
  ind.interview.messages.push({ role: "assistant", content: "" });
  ind.interview.streaming = true;
  ind.railMessage = ind.interview.rounds >= INDUSTRY_INTERVIEW_MAX_ROUNDS
    ? `已满 ${INDUSTRY_INTERVIEW_MAX_ROUNDS} 轮，模型正在跳出角色输出诊断…`
    : `第 ${ind.interview.rounds} 轮 · 内行思考中…`;
  beginIndustryRun(task);
  streamIndustryTurn();
}

async function streamIndustryTurn() {
  const task = industryTask();
  if (!task) return;
  const ind = task.industry;
  industryController = new AbortController();
  try {
    await streamIndustryRequest({
      mode: "interview",
      signal: industryController.signal,
      interview: ind.interview.messages.map(message => ({ role: message.role, content: message.content })),
      onDelta: chunk => { ind.interview.messages.at(-1).content += chunk; queueIndustryPatch(); },
      onRollback: chars => { const last = ind.interview.messages.at(-1); last.content = last.content.slice(0, chars); queueIndustryPatch(); },
      onUsage: usage => { ind.tokens.in += usage.input || 0; ind.tokens.out += usage.output || 0; queueIndustryPatch(); }
    });
    ind.interview.streaming = false;
    task.status = "completed";
    state.run = null;
    stopIndustryTimer();
    if (ind.interview.rounds >= INDUSTRY_INTERVIEW_MAX_ROUNDS) {
      ind.interview.finished = true;
      ind.railMessage = "拷问结束，模型已给出诊断。诊断会随全文一起导出。";
      persist(); renderApp();
      toast("拷问完成，诊断已生成，可随全文导出。", "success");
    } else {
      ind.railMessage = `第 ${ind.interview.rounds} 轮结束，继续回答或导出。`;
      persist(); renderApp();
      document.getElementById("industryChatInput")?.focus();
    }
  } catch (error) {
    ind.interview.streaming = false;
    const last = ind.interview.messages.at(-1);
    if (last?.role === "assistant" && !last.content.trim()) ind.interview.messages.pop();
    state.run = null;
    stopIndustryTimer();
    persist(); renderApp();
    toast(error.name === "AbortError" || error.cancelled ? "拷问已停止，可继续提问或导出。" : `拷问中断：${error.message || "请重试。"}`, "error");
  } finally { industryController = null; }
}

async function exportIndustryMarkdown() {
  const task = industryTask();
  if (!task) return;
  const ind = task.industry;
  const labels = ["Step 0 · 边界切分", "Step 1 · 结构层", "Step 2 · 三条流转链", "Step 3 · 议价能力", "Step 4 · 约束 / 节奏 / 异常"];
  if (!ind.steps.some(step => step?.text)) { toast("还没有可导出的内容，先运行一次分析。", "error"); return; }
  const parts = [`# 行业分析：${ind.industryName}`, "", `> 边界：${ind.boundary || "（未选择）"}`, ""];
  ind.steps.forEach((step, index) => { if (step?.text) parts.push(`## ${labels[index]}`, "", step.text, ""); });
  const chat = ind.interview.messages.filter(message => !message.hidden && message.content !== INDUSTRY_INTERVIEW_SENTINEL);
  if (chat.length) {
    parts.push("## Step 5 · 从业者拷问记录", "");
    for (const message of chat) parts.push(`- **${message.role === "user" ? "你" : "内行"}**：${message.content.replace(/\n/g, " ")}`);
  }
  const blob = new Blob([parts.join("\n")], { type: "text/markdown;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `行业分析-${ind.industryName}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
  toast("已导出 .md（各节标题 + 原文 + 拷问记录）。", "success");
}

function renderMain(project) {
  if (!project) return `<main class="workspace"><div class="empty-workspace"><div class="empty-icon">${renderIcon("plus")}</div><h2>先建立一个项目</h2><p>项目会保存你的背景、任务输入和交付物版本。</p><button class="button primary" data-action="new-project">${renderIcon("plus")}新建项目</button></div></main>`;
  const task = currentTask(project);
  return `<main class="workspace"><div class="workspace-column">${project.tasks.some(taskItem => taskItem.versions?.some(version => version.demo)) ? `<div class="demo-banner">${renderIcon("info")}<span>当前项目包含演示内容，仅用于体验页面能力，并非工作流真实运行结果。接入工作流后，新任务会显示真实返回内容。</span></div>` : ""}<div class="workspace-header"><div><div class="section-kicker">Project workspace</div><h2 class="section-title">把一个业务问题，推进成可用的交付物。</h2><p class="section-description">选择工作路径，补充任务描述。工作流完成后，结果、证据和版本会留在当前项目里。</p></div><button class="button edit-project-button" data-action="edit-project">${renderIcon("edit")}编辑项目背景</button></div>${renderPaths()}${renderContext(project)}${renderComposer(project)}${renderRunPanel()}${task ? renderResult(task, project) : `<div class="empty-workspace"><div class="empty-icon">${renderIcon("file")}</div><h2>准备好开始第一个任务</h2><p>选择一种工作路径，在上方输入你要解决的业务问题。</p></div>`}</div>${renderEvidence(task)}</main>`;
}

function renderApp() {
  const project = currentProject();
  document.getElementById("app").innerHTML = `${renderSidebar(project)}<div class="main-shell">${renderTopbar(project)}${renderMain(project)}</div>`;
  document.getElementById("modal-root").innerHTML = state.modal ? renderModal() : "";
  bindAfterRender();
}

function renderModal() {
  if (state.modal === "project-new" || state.modal === "project-edit") return renderProjectModal(state.modal === "project-edit" ? currentProject() : null);
  if (state.modal === "settings") return renderSettingsModal();
  if (state.modal === "help") return renderHelpModal();
  return "";
}

function renderProjectModal(project) {
  const editing = Boolean(project);
  const title = editing ? "编辑项目背景" : "新建项目";
  const values = project || {};
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="projectModalTitle" data-modal-content><div class="modal-header"><div><div class="section-kicker">${editing ? "Project settings" : "New project"}</div><h2 id="projectModalTitle">${title}</h2><p>${editing ? "更新后的背景会用于后续新任务；历史交付物仍然保留。" : "先建立一个清晰的上下文，后续任务会自动归档到这个项目。"}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${renderIcon("x")}</button></div><form id="projectForm"><div class="modal-body"><div class="form-grid"><div class="form-field full"><label for="projectName">项目名称 *</label><input id="projectName" name="name" required maxlength="80" value="${escapeHTML(values.name || "")}" placeholder="例如：会员增长体验优化" /></div><div class="form-field"><label for="projectObject">业务对象</label><input id="projectObject" name="object" maxlength="160" value="${escapeHTML(values.object || "")}" placeholder="服务什么业务" /></div><div class="form-field"><label for="projectAudience">目标用户</label><input id="projectAudience" name="audience" maxlength="160" value="${escapeHTML(values.audience || "")}" placeholder="谁会使用或受影响" /></div><div class="form-field"><label for="projectStage">当前阶段</label><input id="projectStage" name="stage" maxlength="80" value="${escapeHTML(values.stage || "")}" placeholder="例如：需求分析" /></div><div class="form-field"><label for="projectScope">已确认范围</label><input id="projectScope" name="scope" maxlength="240" value="${escapeHTML(values.scope || "")}" placeholder="已经确定要做什么" /></div><div class="form-field full"><label for="projectConstraints">关键约束</label><textarea id="projectConstraints" name="constraints" maxlength="500" placeholder="权限、合规、资源、时间等限制">${escapeHTML(values.constraints || "")}</textarea></div><div class="form-field full"><label for="projectQuestions">待确认事项</label><textarea id="projectQuestions" name="openQuestions" maxlength="500" placeholder="还没有确认的事实或问题">${escapeHTML(values.openQuestions || "")}</textarea></div></div></div><div class="modal-footer">${editing ? `<button class="button danger ghost" type="button" data-action="delete-project">${renderIcon("trash")}删除项目</button>` : `<span class="form-hint">创建后会自动切换到新项目。</span>`}<div class="modal-footer-actions"><button class="button" type="button" data-action="close-modal">取消</button><button class="button primary" type="submit">${editing ? "保存背景" : "创建项目"}</button></div></div></form></section></div>`;
}

function renderSettingsModal() {
  // 未配置时表单默认选中第一个通道，渲染按同一通道计算，避免显示与逻辑不一致
  const effectiveProvider = state.settings?.provider || Object.keys(PROVIDER_META)[0];
  const meta = PROVIDER_META[effectiveProvider];
  const hasSettings = hasConnection();
  const providerOptions = Object.entries(PROVIDER_META).map(([id, item]) => `<option value="${id}" ${effectiveProvider === id ? "selected" : ""}>${item.label}</option>`).join("");
  const needsKey = effectiveProvider !== "mock";
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal compact" role="dialog" aria-modal="true" aria-labelledby="settingsModalTitle" data-modal-content><div class="modal-header"><div><div class="section-kicker">Connection</div><h2 id="settingsModalTitle">连接设置</h2><p>选择模型通道并填写 API Key，测试后即可运行真实任务。任务由本地编排服务（node server.js）执行。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${renderIcon("x")}</button></div><form id="settingsForm"><div class="modal-body"><div class="form-field"><label for="provider">模型通道</label><select id="provider" name="provider">${providerOptions}</select><div class="form-hint" id="provider-hint" style="margin-top:7px">${escapeHTML(meta?.hint || "请选择一个模型通道。")}</div></div><div class="form-field" style="margin-top:14px"><label for="providerModel">模型 ID</label><input id="providerModel" name="model" autocomplete="off" value="${escapeHTML(state.settings?.model || meta?.defaultModel || "")}" placeholder="${escapeHTML(meta?.defaultModel || "")}" list="model-suggestions" /><datalist id="model-suggestions">${meta ? `<option value="${escapeHTML(meta.defaultModel)}"></option>` : ""}</datalist></div><div class="form-field" style="margin-top:14px"><label for="providerKey">API Key${needsKey ? "" : "（Mock 通道不需要）"}</label><input id="providerKey" name="apiKey" type="password" autocomplete="new-password" value="${escapeHTML(state.settings?.apiKey || "")}" placeholder="${needsKey ? "粘贴 API Key" : "无需填写"}" ${needsKey ? "" : "disabled"} /></div><div class="form-field" style="margin-top:14px"><label for="serverUrl">编排服务地址（可选）</label><input id="serverUrl" name="serverUrl" autocomplete="off" value="${escapeHTML(state.settings?.serverUrl || "")}" placeholder="留空 = 与页面同源；前端在 GitHub Pages 时填 http://127.0.0.1:8787" /></div><div class="form-field" style="margin-top:14px"><label for="authToken">访问令牌（可选）</label><input id="authToken" name="authToken" type="password" autocomplete="new-password" value="${escapeHTML(state.settings?.authToken || "")}" placeholder="仅当编排服务设置了 authToken 时需要填写" /></div><div class="connection-box" style="margin-top:14px">API Key 只保存在当前浏览器（localStorage），不会写入仓库；服务端 Key 和访问令牌在 orchestrator/config.local.json 中配置（不参与 git 提交）。${hasSettings ? " 当前设备已保存连接信息。" : ""}</div><div class="connection-result">${state.connectionMessage ? `<span class="connection-status ${connectionClass()}">${connectionLabel()}</span><div class="form-hint" style="margin-top:7px">${escapeHTML(state.connectionMessage)}</div>` : ""}</div></div><div class="modal-footer"><button class="button" type="button" data-action="test-connection">${renderIcon("settings")}测试连接</button><div class="modal-footer-actions"><button class="button" type="button" data-action="close-modal">关闭</button><button class="button primary" type="submit">保存设置</button></div></div></form></section></div>`;
}

function renderHelpModal() {
  const items = [
    ["新建项目", "点击左侧或顶部的“新建项目”，填写业务对象、目标用户和约束。创建后会自动切换到新项目。"],
    ["选择任务类型", "四类工作路径可以随时切换；如果还不确定要做什么，选择“智能识别”并直接描述问题。"],
    ["连接模型通道", "先在项目目录运行 node server.js 启动本地编排服务，再打开“连接设置”选择 DeepSeek 或智谱通道并填写 API Key。没有 Key 时可用 Mock 通道体验流程。"],
    ["查看结果", "结果会以业务文档的形式留在当前页面。状态、生成时间和演示标记会显示在文档顶部。"],
    ["保存交付物", "点击“保存到项目”后，交付物会进入当前项目的历史任务；同一种任务的多次生成会保留为不同版本。"],
    ["演示数据与真实结果", "第一次打开看到的内容是演示数据，只用于体验页面。真实结果必须来自已连接的工作流，不会用演示内容替代。"],
    ["为什么不能输入未经授权的信息", "任务内容可能会被发送给工作流处理。请只提供你有权使用的资料，不要输入个人信息、商业秘密或生产凭证。"]
  ];
  return `<div class="modal-backdrop" data-action="close-modal"><section class="modal compact" role="dialog" aria-modal="true" aria-labelledby="helpModalTitle" data-modal-content><div class="modal-header"><div><div class="section-kicker">Guide</div><h2 id="helpModalTitle">帮助中心</h2><p>用普通语言了解工作台的主要操作。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${renderIcon("x")}</button></div><div class="modal-body"><div class="help-list">${items.map((item, index) => `<div class="help-item"><div class="help-num">0${index + 1}</div><div><strong>${item[0]}</strong><p>${item[1]}</p></div></div>`).join("")}</div></div><div class="modal-footer"><span class="form-hint">遇到问题时，先检查连接状态和工作流输出。</span><div class="modal-footer-actions"><button class="button primary" data-action="close-modal">知道了</button></div></div></section></div>`;
}

function bindAfterRender() {
  const input = document.getElementById("taskInput");
  if (input) input.addEventListener("input", event => {
    state.draftInput = event.target.value;
    const count = document.getElementById("charCount");
    const maxLen = selectedType() === "industry" ? INDUSTRY_INPUT_MAX : 5000;
    if (count) count.textContent = `${event.target.value.length.toLocaleString("zh-CN")} / ${maxLen.toLocaleString("zh-CN")}`;
  });
  const search = document.getElementById("searchInput");
  if (search) search.addEventListener("input", event => { state.search = event.target.value; renderApp(); const next = document.getElementById("searchInput"); next?.focus(); next?.setSelectionRange(next.value.length, next.value.length); });
  const providerSelect = document.getElementById("provider");
  if (providerSelect) providerSelect.addEventListener("change", event => {
    const meta = PROVIDER_META[event.target.value];
    const modelInput = document.getElementById("providerModel");
    const keyInput = document.getElementById("providerKey");
    const hint = document.getElementById("provider-hint");
    if (modelInput && meta) modelInput.value = meta.defaultModel;
    if (keyInput) { keyInput.disabled = event.target.value === "mock"; keyInput.placeholder = keyInput.disabled ? "无需填写" : "粘贴 API Key"; }
    if (hint && meta) hint.textContent = meta.hint;
  });
  const backdrop = document.querySelector(".modal-backdrop");
  if (backdrop) backdrop.addEventListener("click", event => { if (event.target === backdrop) { state.modal = null; persist(); renderApp(); } });
  const chatInput = document.getElementById("industryChatInput");
  if (chatInput) chatInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); sendIndustryChat(); } });
  const boundaryInput = document.getElementById("industryCustomBoundary");
  if (boundaryInput) boundaryInput.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); confirmIndustryCustom(); } });
}

function toast(message, type = "") {
  clearTimeout(toastTimer);
  const root = document.getElementById("toast-root");
  root.innerHTML = `<div class="toast ${type}">${escapeHTML(message)}</div>`;
  toastTimer = setTimeout(() => { root.innerHTML = ""; }, 3600);
}

function updateProject(project, updates) { Object.assign(project, updates, { updatedAt: now() }); persist(); }
function selectProject(id) { if (state.run) cancelRun(false); state.currentProjectId = id; const project = currentProject(); state.currentTaskType = currentTask(project)?.type || "smart"; state.draftInput = ""; state.resumeTaskId = null; state.evidenceOpen = false; state.editing = null; renderApp(); }
function selectTask(id) { const project = currentProject(); project.selectedTaskId = id; const task = currentTask(project); state.currentTaskType = task?.type || "smart"; state.draftInput = task?.input || ""; state.resumeTaskId = null; state.evidenceOpen = false; state.editing = null; persist(); renderApp(); document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function selectType(type) { state.currentTaskType = type; if (!state.run) state.draftInput = ""; renderApp(); document.getElementById("taskInput")?.focus(); }

function useExample(index) { const example = SAMPLE_TASKS[index]; if (!example) return; state.currentTaskType = example.type; state.draftInput = example.text; renderApp(); document.getElementById("taskInput")?.focus(); }
function clearInput() { state.draftInput = ""; renderApp(); document.getElementById("taskInput")?.focus(); }

function ensureTask(project, input, type) {
  const task = { id: uid("task"), type, title: `${TASK_TYPES[type]?.label || "智能识别"} · ${project.name}`, input, status: "running", createdAt: now(), updatedAt: now(), versions: [] };
  project.tasks.push(task); project.selectedTaskId = task.id; updateProject(project, {}); return task;
}

function setRunStep(step, message) {
  if (!state.run) return;
  state.run.step = step; state.run.message = message; persist(); renderApp();
}

async function startAnalysis(inputOverride = null, typeOverride = null) {
  if (state.run) return;
  const project = currentProject();
  const input = normalizeText(inputOverride ?? state.draftInput);
  const type = typeOverride || selectedType();
  if (!input) { toast("请先描述当前业务任务，再开始分析。", "error"); document.getElementById("taskInput")?.focus(); return; }
  if (type === "industry") return startIndustry(input);
  const reusableTask = state.resumeTaskId ? project.tasks.find(item => item.id === state.resumeTaskId) : null;
  const task = reusableTask || ensureTask(project, input, type);
  if (reusableTask) { task.type = type; task.input = input; task.status = "running"; task.updatedAt = now(); project.selectedTaskId = task.id; }
  state.resumeTaskId = null;
  state.draftInput = input;
  state.run = { taskId: task.id, input, type, step: 0, status: "running", startedAt: now(), message: "正在理解你的任务…" };
  state.connectionStatus = hasConnection() ? "pending" : "idle";
  state.connectionMessage = hasConnection() ? "正在运行任务" : "尚未配置模型通道，无法运行任务";
  persist(); renderApp();
  const stepMessages = ["正在理解你的任务…", "正在整理项目背景和任务资料…", "正在生成交付物…", "正在进行风险与事实检查…"];
  let index = 0;
  runTimer = setInterval(() => {
    index += 1;
    if (index < 4) setRunStep(index, stepMessages[index]);
    else clearInterval(runTimer);
  }, 650);
  if (!hasConnection()) {
    setTimeout(() => finishRun({ kind: "failed", message: "连接信息不完整。请先在连接设置中选择模型通道并填写 API Key。" }), 2850);
    return;
  }
  try {
    const payload = await callOrchestrator(project, input, type);
    finishRun(payload);
  } catch (error) {
    finishRun({ kind: error.name === "AbortError" ? "cancelled" : "failed", message: friendlyConnectionError(error) });
  }
}

async function callOrchestrator(project, input, type) {
  const controller = new AbortController();
  runController = controller;
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  try {
    const response = await fetch(`${apiBase()}/api/run`, { method: "POST", signal: controller.signal, headers: apiHeaders(), body: JSON.stringify({
      input,
      task_hint: type === "smart" ? "" : type,
      project: { name: project.name, object: project.object, audience: project.audience, stage: project.stage, scope: project.scope, constraints: project.constraints, openQuestions: project.openQuestions },
      history: [],
      provider: { id: state.settings.provider, apiKey: state.settings.apiKey || "", model: state.settings.model || "" }
    }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) { const error = new Error(data?.error?.message || `HTTP ${response.status}`); error.status = response.status; error.node = data?.error?.node; throw error; }
    return data.result;
  } finally { clearTimeout(timeout); runController = null; }
}

function friendlyConnectionError(error) {
  if (error.name === "AbortError") return "等待时间过长，任务已超时取消。可在连接设置中检查模型通道，或重试。";
  if (error.message?.includes("Failed to fetch") || error.message?.includes("NetworkError") || error.message?.includes("fetch failed")) return "无法连接本地编排服务。请先在项目目录运行 node server.js，再刷新页面。";
  if (error.status === 401 || error.status === 403) return "身份校验失败：请检查 API Key 以及连接设置中的访问令牌。";
  if (error.status === 402 || error.status === 429) return "模型账户额度不足或触发限流，请检查服务商控制台。";
  if (error.status === 404) return "模型 ID 不存在，请在连接设置中确认模型名称。";
  if (error.status >= 500) return `执行失败${error.node ? `（${error.node}）` : ""}：${error.message || "编排服务暂时不可用。"}`;
  return error.message || "任务执行失败，请检查连接设置后重试。";
}

// 编排服务已返回最终结构（kind + text + meta），前端无需再猜测响应格式
function createEvidenceFromMeta(meta = {}) {
  const intent = meta.intent || {};
  const knowledge = Array.isArray(meta.knowledge) ? meta.knowledge : [];
  const evidence = {
    facts: ["以上正文由本地编排服务（意图识别 → 分支生成 → 风险审校）返回。", ...(intent.known_facts || [])],
    sources: knowledge.length ? knowledge.map(hit => `知识库召回:《${hit.source}》`) : ["本次知识库没有召回相关内容。"],
    suggestions: intent.routing_reason ? [`路由依据：${intent.routing_reason}`] : [],
    assumptions: [...(intent.missing_fields || []).map(field => `待确认：${field}`), ...(intent.knowledge_supported || []).map(item => `知识库支持：${item}`)],
    risks: [...(intent.risk_flags || []), `意图：${intent.intent || "未知"} · 风险等级：${intent.risk_level || "未知"} · 置信度：${intent.confidence || "未知"}`, "请人工核对正文中的事实、权限和业务规则后再使用。"]
  };
  return evidence;
}

function finishRun(result) {
  if (!state.run) return;
  clearInterval(runTimer); runTimer = null;
  const project = currentProject(); const task = project.tasks.find(item => item.id === state.run.taskId);
  if (!task) { state.run = null; renderApp(); return; }
  task.updatedAt = now(); task.status = result.kind;
  state.connectionStatus = ["completed", "risk", "needs_input", "guidance"].includes(result.kind) ? "connected" : state.connectionStatus === "pending" ? "error" : state.connectionStatus;
  if (result.kind === "completed" || result.kind === "risk") {
    const version = { id: uid("version"), number: (task.versions?.length || 0) + 1, createdAt: now(), generatedAt: now(), title: `${TASK_TYPES[task.type]?.label || "交付物"} · ${project.name}`, type: task.type, status: result.kind, demo: false, saved: false, body: result.text || "", evidence: createEvidenceFromMeta(result.meta) };
    task.versions = [...(task.versions || []), version]; task.selectedVersionId = version.id; state.connectionMessage = result.kind === "risk" ? "已连接，本次结果为高风险安全回复，需人工确认" : "任务已完成";
  } else if (result.kind === "needs_input") { state.connectionMessage = "任务需要补充信息"; state.draftInput = `${state.run.input}\n\n补充信息：${result.text || result.message || ""}`; }
  else if (result.kind === "guidance") { task.guidance = result.text; state.connectionMessage = "已连接，当前请求未匹配到任务类型，请按引导选择"; }
  else { state.connectionStatus = result.kind === "cancelled" ? state.connectionStatus : "error"; state.connectionMessage = result.message || "任务没有返回有效结果。"; }
  state.run = null; persist(); renderApp();
  if (result.kind === "completed") toast("交付物已生成，请查看并保存到项目。", "success");
  else if (result.kind === "risk") toast("结果已返回，但需要人工确认。", "error");
  else if (result.kind === "guidance") toast("当前请求未匹配到支持的任务类型，请按引导选择。");
}

function cancelRun(showToast = true) {
  if (!state.run) return;
  if (state.run.type === "industry") {
    if (industryController) { industryController.abort(); if (showToast) toast("正在停止当前步骤…"); return; }
    // 没有正在流式的步骤（如等待选择边界）：干净取消，已生成内容保留，之后仍可选边界续跑
    const task = industryTask();
    state.run = null;
    stopIndustryTimer();
    if (task && task.industry.phase === "awaiting") { task.status = "cancelled"; task.updatedAt = now(); }
    persist(); renderApp();
    if (showToast) toast("已取消本次运行。已生成的内容保留，选择边界后可继续。");
    return;
  }
  runController?.abort(); clearInterval(runTimer); runTimer = null;
  const project = currentProject(); const task = project.tasks.find(item => item.id === state.run.taskId);
  if (task) { task.status = "cancelled"; task.updatedAt = now(); }
  state.draftInput = state.run.input; state.run = null; persist(); renderApp(); if (showToast) toast("任务已取消，输入内容已保留。");
}

function retryTask() { const task = currentTask(); if (!task) return; state.resumeTaskId = task.id; startAnalysis(task.input, task.type); }
function continueFollowup() { const task = currentTask(); if (task) state.resumeTaskId = task.id; document.getElementById("taskInput")?.focus(); document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "center" }); }

function showSettings() { state.modal = "settings"; renderApp(); document.getElementById("provider")?.focus(); }
function saveProjectForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  if (!normalizeText(data.name)) { toast("项目名称不能为空。", "error"); return; }
  const editing = state.modal === "project-edit";
  if (editing) updateProject(currentProject(), data);
  else { const project = { id: uid("project"), ...data, createdAt: now(), updatedAt: now(), selectedTaskId: null, tasks: [] }; state.projects.push(project); state.currentProjectId = project.id; state.currentTaskType = "smart"; state.draftInput = ""; }
  state.modal = null; persist(); renderApp(); toast(editing ? "项目背景已保存。" : "项目已创建。", "success");
}

function saveSettingsForm(form) {
  const data = Object.fromEntries(new FormData(form).entries());
  const provider = normalizeText(data.provider);
  state.settings = {
    provider,
    apiKey: provider === "mock" ? "" : normalizeText(data.apiKey),
    model: normalizeText(data.model) || PROVIDER_META[provider]?.defaultModel || "",
    serverUrl: normalizeText(data.serverUrl),
    authToken: normalizeText(data.authToken)
  };
  state.connectionStatus = "idle";
  state.connectionMessage = hasConnection() ? (provider === "mock" ? "Mock 通道可用，可直接运行任务" : "已保存，请测试连接") : "尚未配置模型通道";
  state.modal = null; persist(); renderApp(); toast("连接设置已保存。", "success");
}

async function testConnection() {
  const form = document.getElementById("settingsForm"); if (!form) return;
  const data = Object.fromEntries(new FormData(form).entries());
  const provider = normalizeText(data.provider);
  const settings = {
    provider,
    apiKey: provider === "mock" ? "" : normalizeText(data.apiKey),
    model: normalizeText(data.model) || PROVIDER_META[provider]?.defaultModel || "",
    serverUrl: normalizeText(data.serverUrl),
    authToken: normalizeText(data.authToken)
  };
  if (!settings.provider || (provider !== "mock" && !settings.apiKey)) { state.connectionStatus = "error"; state.connectionMessage = "连接信息不完整，请选择通道并填写 API Key。"; renderApp(); showSettings(); return; }
  state.settings = settings; state.connectionStatus = "pending"; state.connectionMessage = "正在测试连接…"; persist(); renderApp(); showSettings();
  try {
    const response = await fetch(`${apiBase()}/api/test`, { method: "POST", headers: apiHeaders(), body: JSON.stringify({ provider: { id: settings.provider, apiKey: settings.apiKey, model: settings.model } }) });
    if (response.status === 401) { state.connectionStatus = "error"; state.connectionMessage = "访问令牌不正确，请在下方「访问令牌」中填写服务端设置的 authToken。"; persist(); renderApp(); showSettings(); return; }
    const outcome = await response.json().catch(() => ({}));
    state.connectionStatus = outcome.ok ? "connected" : "error";
    state.connectionMessage = outcome.message || (outcome.ok ? "连接成功。" : "连接失败。");
  } catch { state.connectionStatus = "error"; state.connectionMessage = "无法连接编排服务。请确认服务地址是否正确、服务是否已启动。"; }
  persist(); renderApp(); showSettings();
}

function saveCurrentResult() { const task = currentTask(); const version = currentVersion(task); if (!version) return; version.saved = true; task.status = version.status === "risk" ? "risk" : "completed"; persist(); renderApp(); toast("交付物已保存到当前项目。", "success"); }
async function copyCurrentResult() { const version = currentVersion(); if (!version) return; try { await navigator.clipboard.writeText(version.body); toast("全文已复制。", "success"); } catch { toast("当前浏览器不允许复制，请手动选择正文。", "error"); } }
function beginEdit() { const task = currentTask(); const version = currentVersion(task); if (!version) return; state.editing = { taskId: task.id, versionId: version.id }; renderApp(); document.getElementById("documentEditor")?.focus(); }
function saveEdit() { const editor = document.getElementById("documentEditor"); const task = currentTask(); const version = currentVersion(task); if (!editor || !version) return; version.body = editor.value; version.saved = true; state.editing = null; persist(); renderApp(); toast("修改已保存。", "success"); }
function regenerate() { const task = currentTask(); if (!task) return; state.resumeTaskId = task.id; startAnalysis(task.input, task.type); }
function continueNext() { const task = currentTask(); const next = { requirements: "solution", solution: "prd", prd: "competitor", competitor: "requirements", smart: "requirements" }[task?.type || "smart"]; const label = TASK_TYPES[next].label; state.currentTaskType = next; state.draftInput = `请基于当前项目和上一份交付物，继续完成${label}。请明确引用哪些内容来自已有结果，并列出仍需确认的事实。`; renderApp(); document.getElementById("taskInput")?.focus(); document.getElementById("composer")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
function selectVersion(id) { const task = currentTask(); if (!task) return; task.selectedVersionId = id; state.evidenceOpen = false; state.editing = null; persist(); renderApp(); document.getElementById("resultSection")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function deleteVersion(id) { const task = currentTask(); if (!task || task.versions.length <= 1) { toast("至少保留一个版本。", "error"); return; } if (!window.confirm("确定删除这个版本吗？删除后无法恢复。")) return; task.versions = task.versions.filter(version => version.id !== id); if (task.selectedVersionId === id) task.selectedVersionId = task.versions.at(-1).id; persist(); renderApp(); toast("版本已删除。", "success"); }
function deleteProject() { const project = currentProject(); if (!project) return; if (!window.confirm(`确定删除项目“${project.name}”吗？项目内的任务和交付物都会被删除，无法恢复。`)) return; if (state.run) cancelRun(false); state.projects = state.projects.filter(item => item.id !== project.id); const next = state.projects[0]; state.currentProjectId = next?.id || null; state.currentTaskType = next ? currentTask(next)?.type || "smart" : "smart"; state.draftInput = ""; state.modal = null; persist(); renderApp(); toast("项目已删除。", "success"); }

document.addEventListener("click", event => {
  const actionElement = event.target.closest("[data-action]"); if (!actionElement) return;
  if (actionElement.classList.contains("modal-backdrop") && event.target !== actionElement) return;
  const action = actionElement.dataset.action;
  if (action === "select-project") selectProject(actionElement.dataset.projectId);
  else if (action === "select-task") selectTask(actionElement.dataset.taskId);
  else if (action === "select-type") selectType(actionElement.dataset.type);
  else if (action === "use-example") useExample(Number(actionElement.dataset.example));
  else if (action === "clear-input") clearInput();
  else if (action === "start-analysis") startAnalysis();
  else if (action === "cancel-run") cancelRun();
  else if (action === "new-project") { state.modal = "project-new"; renderApp(); document.getElementById("projectName")?.focus(); }
  else if (action === "edit-project") { state.modal = "project-edit"; renderApp(); document.getElementById("projectName")?.focus(); }
  else if (action === "delete-project") deleteProject();
  else if (action === "settings") showSettings();
  else if (action === "test-connection") testConnection();
  else if (action === "help") { state.modal = "help"; renderApp(); }
  else if (action === "close-modal") { state.modal = null; persist(); renderApp(); }
  else if (action === "toggle-sidebar") document.getElementById("sidebar")?.classList.toggle("open");
  else if (action === "view-evidence") { state.evidenceOpen = true; renderApp(); }
  else if (action === "close-evidence") { state.evidenceOpen = false; renderApp(); }
  else if (action === "copy-result") copyCurrentResult();
  else if (action === "save-result") saveCurrentResult();
  else if (action === "edit-result") beginEdit();
  else if (action === "save-edit") saveEdit();
  else if (action === "cancel-edit") { state.editing = null; renderApp(); }
  else if (action === "regenerate") regenerate();
  else if (action === "continue-next") continueNext();
  else if (action === "select-version") selectVersion(actionElement.dataset.versionId);
  else if (action === "delete-version") deleteVersion(actionElement.dataset.versionId);
  else if (action === "retry-task") retryTask();
  else if (action === "continue-followup") continueFollowup();
  else if (action === "industry-choose-candidate") chooseIndustryCandidate(Number(actionElement.dataset.candidate));
  else if (action === "industry-confirm-custom") confirmIndustryCustom();
  else if (action === "industry-start-interview") startIndustryInterview();
  else if (action === "industry-send-chat") sendIndustryChat();
  else if (action === "retry-industry-step") retryIndustryStep(Number(actionElement.dataset.step));
  else if (action === "export-industry") exportIndustryMarkdown();
});

document.addEventListener("submit", event => {
  if (event.target.id === "projectForm") { event.preventDefault(); saveProjectForm(event.target); }
  if (event.target.id === "settingsForm") { event.preventDefault(); saveSettingsForm(event.target); }
});

renderApp();
