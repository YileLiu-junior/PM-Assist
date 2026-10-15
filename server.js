// AI 产品经理工作台 · 本地编排服务
// 零依赖，Node 18+（内置 fetch）。启动：node server.js
//
// - 静态托管前端（index.html / app.js / styles.css）
// - POST /api/run     执行完整流程：知识检索 → 意图识别 → 路由 → 分支生成 → 风险审校
// - POST /api/industry/stream 行业分析工作台的流式步骤（SSE 下发 delta/rollback/usage/done/error）
// - POST /api/test    测试模型通道连通性
// - GET  /api/knowledge 查看本地知识库索引状态
// - GET  /api/health  服务与通道概览

const http = require("http");
const fs = require("fs");
const path = require("path");

const providers = require("./orchestrator/providers");
const knowledge = require("./orchestrator/knowledge");
const { runFlow } = require("./orchestrator/flow");
const industry = require("./orchestrator/industry-prompts");

const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;
const MAX_BODY = 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8"
};

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => {
      data += chunk;
      if (data.length > MAX_BODY) { reject(new Error("请求体过大")); req.destroy(); }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function serveStatic(req, res, urlPath) {
  let pathname = decodeURIComponent(urlPath.split("?")[0]);
  if (pathname === "/" || pathname === "") pathname = "/index.html";
  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end("Forbidden"); return; }
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Not Found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
    res.end(content);
  });
}

async function handleRun(req, res) {
  let request;
  try {
    request = JSON.parse(await readBody(req));
  } catch { return sendJSON(res, 400, { ok: false, error: { message: "请求体不是合法 JSON。" } }); }

  const input = String(request.input || "").trim();
  if (!input) return sendJSON(res, 400, { ok: false, error: { message: "任务内容不能为空。" } });

  const credentials = providers.resolveCredentials(request.provider?.id, request.provider);
  if (credentials.id !== "mock" && !credentials.apiKey) {
    return sendJSON(res, 400, { ok: false, error: { message: `尚未配置 ${credentials.meta.label} 的 API Key，请打开连接设置填写，或先用 Mock 通道测试。` } });
  }

  // 客户端取消（浏览器 abort）时中断后续模型调用
  const abort = new AbortController();
  req.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    const result = await runFlow({
      input,
      credentials,
      history: Array.isArray(request.history) ? request.history : [],
      project: request.project || {},
      task_hint: request.task_hint || "",
      signal: abort.signal
    });
    sendJSON(res, 200, { ok: true, result });
  } catch (error) {
    sendJSON(res, 502, { ok: false, error: { message: error.message || "流程执行失败。", node: error.node || "", provider: credentials.id, model: credentials.model } });
  }
}

async function handleTest(req, res) {
  let request;
  try { request = JSON.parse(await readBody(req)); } catch { request = {}; }
  const credentials = providers.resolveCredentials(request.provider?.id, request.provider);
  const outcome = await providers.testConnection(credentials);
  sendJSON(res, 200, { ok: outcome.ok, message: outcome.message, provider: credentials.id, model: credentials.model });
}

// ── 行业分析工作台：流式链路 ────────────────────────────────────────
// 提示词只存在于服务端（industry-prompts.js）。前端只发进度状态：
//   mode=step      → { step: 0..4, industry, boundary, steps: [已完成步骤的正文…] }
//   mode=interview → { steps: […], interview: [{role, content}]，首条 user 为 INTERVIEW_SENTINEL 占位 }
// 服务端重建完整消息序列后走 streamChat，向浏览器下发 SSE 事件：
//   delta / rollback / usage / done / error
function buildIndustryMessages(request) {
  const messages = [{ role: "system", content: industry.SYSTEM }];
  const vars = { industry: request.industry || "", boundary: request.boundary || "" };
  (Array.isArray(request.steps) ? request.steps : []).forEach((text, index) => {
    if (typeof text === "string" && text.trim()) {
      messages.push({ role: "user", content: industry.stepUserPrompt(index, vars) });
      messages.push({ role: "assistant", content: text });
    }
  });
  if (request.mode === "interview") {
    for (const item of Array.isArray(request.interview) ? request.interview : []) {
      if (!item || typeof item.content !== "string" || !item.content.trim()) continue; // 跳过空占位（前端流式前的 assistant 空壳）
      const content = item.content === industry.INTERVIEW_SENTINEL
        ? industry.INTERVIEW_PROMPT
        : item.content === industry.DIAGNOSTIC_SENTINEL ? industry.DIAGNOSTIC_NUDGE : item.content;
      messages.push({ role: item.role === "assistant" ? "assistant" : "user", content });
    }
  } else {
    const step = Number(request.step) || 0;
    messages.push({ role: "user", content: industry.stepUserPrompt(step, vars) });
  }
  return messages;
}

function pickIndustryMock(request) {
  if (request.mode === "interview") {
    const assistantTurns = (request.interview || []).filter(m => m.role === "assistant" && (m.content || "").trim()).length;
    const { MOCK_INTERVIEW } = industry;
    if (assistantTurns === 0) return MOCK_INTERVIEW.q1;
    if (assistantTurns === 1) return MOCK_INTERVIEW.q2;
    if (assistantTurns === 2) return MOCK_INTERVIEW.q3;
    return MOCK_INTERVIEW.diag;
  }
  const step = Number(request.step) || 0;
  return step === 0 ? industry.MOCK.step0(request.industry || "") : industry.MOCK["step" + step] || industry.MOCK.step1;
}

async function handleIndustryStream(req, res) {
  let request;
  try {
    request = JSON.parse(await readBody(req));
  } catch {
    return sendJSON(res, 400, { ok: false, error: { message: "请求体不是合法 JSON。" } });
  }
  const credentials = providers.resolveCredentials(request.provider?.id, request.provider);
  if (credentials.id !== "mock" && !credentials.apiKey) {
    return sendJSON(res, 400, { ok: false, error: { message: `尚未配置 ${credentials.meta.label} 的 API Key，请打开连接设置填写，或先用 Mock 通道测试。` } });
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  const send = event => res.write(`data: ${JSON.stringify(event)}\n\n`);

  // 客户端取消（浏览器 abort）时中断上游流
  const abort = new AbortController();
  req.on("close", () => { if (!res.writableEnded) abort.abort(); });

  try {
    const result = await providers.streamChat(credentials, {
      messages: buildIndustryMessages(request),
      temperature: 0.4,
      maxTokens: Number(request.maxTokens) || 8192,
      signal: abort.signal,
      mockText: credentials.id === "mock" ? pickIndustryMock(request) : undefined,
      onDelta: chunk => send({ type: "delta", text: chunk }),
      onRollback: chars => send({ type: "rollback", chars })
    });
    const usage = result.usage || {
      inputTokens: Math.round(JSON.stringify(request).length * 0.31),
      outputTokens: Math.round((result.text || "").length * 0.62)
    };
    send({ type: "usage", input: usage.inputTokens, output: usage.outputTokens });
    send({ type: "done", finishReason: result.finishReason || "stop" });
  } catch (error) {
    send({ type: "error", message: error.message || "行业分析步骤执行失败。" });
  }
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, x-auth-token",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    });
    res.end();
    return;
  }
  const urlPath = req.url || "/";
  // 设置了访问令牌（AUTH_TOKEN / config.local.json authToken）时，业务接口一律校验
  const requiredToken = providers.getAuthToken();
  if (requiredToken && req.headers["x-auth-token"] !== requiredToken) {
    sendJSON(res, 401, { ok: false, error: { message: "访问令牌缺失或不正确。请在页面「连接设置 → 访问令牌」中填写服务端部署时设置的 authToken。" } });
    return;
  }
  if (req.method === "POST" && urlPath.startsWith("/api/run")) { handleRun(req, res).catch(error => sendJSON(res, 500, { ok: false, error: { message: error.message } })); return; }
  if (req.method === "POST" && urlPath.startsWith("/api/test")) { handleTest(req, res).catch(error => sendJSON(res, 500, { ok: false, error: { message: error.message } })); return; }
  if (req.method === "POST" && urlPath.startsWith("/api/industry/stream")) { handleIndustryStream(req, res).catch(error => { if (!res.writableEnded) { sendJSON(res, 500, { ok: false, error: { message: error.message } }); } }); return; }
  if (req.method === "GET" && urlPath.startsWith("/api/knowledge")) { sendJSON(res, 200, { ok: true, ...knowledge.status() }); return; }
  if (req.method === "GET" && urlPath.startsWith("/api/health")) {
    sendJSON(res, 200, {
      ok: true,
      service: "ai-pm-orchestrator",
      knowledge: knowledge.status(),
      providers: Object.entries(providers.PROVIDERS).map(([id, meta]) => ({ id, label: meta.label, defaultModel: meta.defaultModel, hint: meta.hint }))
    });
    return;
  }
  if (urlPath.startsWith("/api/")) { sendJSON(res, 404, { ok: false, error: { message: "未知接口。" } }); return; }
  serveStatic(req, res, urlPath);
});

server.listen(PORT, HOST, () => {
  const status = knowledge.status();
  console.log("AI 产品经理工作台 · 编排服务已启动");
  console.log(`  前端地址   http://${HOST}:${PORT}`);
  console.log(`  知识库     ${status.docs} 个文档 / ${status.chunks} 个片段（目录 orchestrator/knowledge/）`);
  console.log("  模型通道   deepseek（deepseek-flash）· zhipu（glm-5.3-flash）· mock（离线测试）");
  console.log(`  访问保护   ${providers.getAuthToken() ? "已开启访问令牌校验" : "未设令牌（仅建议本机使用；公开部署务必设置 AUTH_TOKEN）"}`);
});
