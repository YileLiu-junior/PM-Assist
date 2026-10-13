// 模型通道（OpenAI 兼容协议）
// 两个正式通道：deepseek / zhipu，另有 mock 通道用于无 Key 的离线测试。
// API Key 优先取请求参数，其次取 config.local.json（见 config.example.json）。

const fs = require("fs");
const path = require("path");

const PROVIDERS = {
  deepseek: {
    label: "DeepSeek",
    endpoint: "https://api.deepseek.com/v1/chat/completions",
    defaultModel: "deepseek-flash",
    keyUrl: "https://platform.deepseek.com",
    hint: "模型 ID 使用 deepseek-flash（V4.1 Flash）。"
  },
  zhipu: {
    label: "智谱 BigModel",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    defaultModel: "glm-5.3-flash",
    keyUrl: "https://open.bigmodel.cn",
    hint: "模型 ID 使用 glm-5.3-flash（免费）。"
  },
  mock: {
    label: "离线测试（Mock）",
    endpoint: "",
    defaultModel: "mock",
    keyUrl: "",
    hint: "不需要 API Key，返回固定演示内容，用于打通全流程。"
  }
};

let localConfig = {};
try {
  localConfig = JSON.parse(fs.readFileSync(path.join(__dirname, "config.local.json"), "utf8"));
} catch { /* 没有服务端配置文件时忽略 */ }

function resolveCredentials(providerId, requestProvider) {
  const id = PROVIDERS[providerId] ? providerId : "mock";
  const meta = PROVIDERS[id];
  const fromFile = (localConfig.providers || {})[id] || {};
  return {
    id,
    meta,
    apiKey: (requestProvider && requestProvider.apiKey) || fromFile.apiKey || "",
    model: (requestProvider && requestProvider.model) || fromFile.model || meta.defaultModel
  };
}

// 单次对话调用。opts: {messages, temperature, topP, maxTokens, json, timeoutMs, signal}
async function chat(credentials, opts) {
  const { meta } = credentials;
  if (credentials.id === "mock") return mockChat(opts);

  const timeoutMs = opts.timeoutMs || 150000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (opts.signal) opts.signal.addEventListener("abort", onExternalAbort);

  const body = {
    model: credentials.model,
    messages: opts.messages,
    max_tokens: opts.maxTokens,
    stream: false
  };
  if (typeof opts.temperature === "number") body.temperature = opts.temperature;
  if (typeof opts.topP === "number") body.top_p = opts.topP;
  if (opts.json) body.response_format = { type: "json_object" };

  try {
    let response = await fetch(meta.endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Authorization": `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    // 部分模型不支持 response_format，去掉后重试一次
    if (!response.ok && opts.json && (response.status === 400 || response.status === 422)) {
      delete body.response_format;
      response = await fetch(meta.endpoint, {
        method: "POST",
        signal: controller.signal,
        headers: { "Authorization": `Bearer ${credentials.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    }
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* 保留原文，下面统一报错 */ }
    if (!response.ok) {
      const detail = data?.error?.message || data?.message || text.slice(0, 300) || `HTTP ${response.status}`;
      const error = new Error(detail);
      error.status = response.status;
      throw error;
    }
    const message = data?.choices?.[0]?.message || {};
    const content = (message.content || "").trim() || (message.reasoning_content || "").trim();
    if (!content) throw new Error("模型返回了空内容。");
    return { text: content, usage: data.usage || null };
  } catch (error) {
    if (error.name === "AbortError" && opts.signal?.aborted) { const e = new Error("任务已取消。"); e.cancelled = true; throw e; }
    if (error.name === "AbortError") throw new Error(`模型响应超时（${Math.round(timeoutMs / 1000)} 秒），请重试或更换模型。`);
    if (error.cause?.code === "ENOTFOUND" || error.cause?.code === "ECONNREFUSED") throw new Error(`无法访问 ${meta.label} 接口，请检查网络。`);
    throw error;
  } finally {
    clearTimeout(timer);
    if (opts.signal) opts.signal.removeEventListener("abort", onExternalAbort);
  }
}

// 测试连通性：发一个最小请求
async function testConnection(credentials) {
  if (credentials.id === "mock") return { ok: true, message: "Mock 通道可用，不需要 API Key。" };
  if (!credentials.apiKey) return { ok: false, message: `请先填写 ${credentials.meta.label} 的 API Key（${credentials.meta.keyUrl}）。` };
  try {
    await chat(credentials, {
      messages: [{ role: "user", content: "请只回复两个字：成功" }],
      maxTokens: 512,
      timeoutMs: 30000
    });
    return { ok: true, message: `${credentials.meta.label} 连接成功（模型 ${credentials.model}），可以运行真实任务。` };
  } catch (error) {
    const status = error.status;
    if (status === 401 || status === 403) return { ok: false, message: "API Key 无效或没有权限，请检查后重新填写。" };
    if (status === 404) return { ok: false, message: `找不到模型「${credentials.model}」，请确认模型 ID 是否正确。` };
    if (status === 402 || status === 429) return { ok: false, message: "账户额度不足或触发限流，请检查服务商控制台。" };
    return { ok: false, message: error.message || "连接失败，请检查网络。" };
  }
}

// ── Mock 通道：按输入关键词模拟意图识别，返回固定交付物 ─────────
function mockChat(opts) {
  const userText = opts.messages.filter(m => m.role === "user").map(m => m.content).join("\n");
  if (opts.json) return { text: JSON.stringify(mockIntent(userText)), usage: null };
  return {
    text: `# Mock 交付物（离线测试数据）

当前结果是 **Mock 通道** 返回的固定内容，用于验证本地编排链路，不代表真实模型输出。

## 覆盖的流程环节

1. 知识库检索：已按本地 knowledge/ 目录执行检索（当前可能是空库）。
2. 意图识别与完整性检查：已输出结构化 JSON 判定。
3. 分支生成 + 风险审校：已按流程串联执行。

## 下一步

在“连接设置”中切换到 DeepSeek 或智谱通道并填入 API Key，即可获得真实结果。`,
    usage: null
  };
}

function mockIntent(userText) {
  const text = userText || "";
  const riskHit = /一定会购买|必须.*退款|直接退款|自动改价|最低价承诺|客户名单.*购买/.test(text);
  if (riskHit) {
    return {
      intent: "solution_design", risk_level: "high", risk_flags: ["要求确定性商业承诺（Mock 判定）"],
      safe_response_requir: true, confidence: "high", sufficient: true,
      known_facts: [], knowledge_supported: [], missing_fields: [],
      clarifying_question: "", routing_reason: "Mock：命中高风险规则，走安全回复分支"
    };
  }
  if (/信息不足|资料不全/.test(text)) {
    return {
      intent: "requirement_analysis", risk_level: "low", risk_flags: [],
      safe_response_requir: false, confidence: "medium", sufficient: false,
      known_facts: [], knowledge_supported: [], missing_fields: ["目标用户", "业务目标"],
      clarifying_question: "（Mock 追问）请补充：目标用户是谁？希望改善的业务结果是什么？",
      routing_reason: "Mock：模拟信息不完整，走追问分支"
    };
  }
  let intent = "requirement_analysis";
  if (/prd|需求文档/.test(text.toLowerCase())) intent = "prd_draft";
  else if (/竞品|对比|差异化/.test(text)) intent = "competitor_analysis";
  else if (/方案|架构|工作流设计|agent/i.test(text)) intent = "solution_design";
  else if (/随便聊聊|讲个笑话|写首诗/.test(text)) intent = "unknown";
  return {
    intent, risk_level: "low", risk_flags: [],
    safe_response_requir: false, confidence: "high", sufficient: true,
    known_facts: ["（Mock）用户输入了任务描述"], knowledge_supported: [], missing_fields: [],
    clarifying_question: "", routing_reason: `Mock：关键词判定为 ${intent}`
  };
}

module.exports = { PROVIDERS, resolveCredentials, chat, testConnection };
