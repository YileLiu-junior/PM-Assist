// 流程编排：复现 Coze Chatflow「AI_PM_Business_Assistant」的完整执行路径
//
// 开始(100001) → 知识库检索(186295) → 意图识别(100003)
//   → 条件「是否需要追问」(100004)：
//        risk_level == high 或 safe_response_requir == true → 高风险回复生成(184211) → 输出
//        sufficient == false → 输出追问(100005)
//        否则 → 条件「任务路由」(100006)：
//             requirement_analysis → 需求分析(100007) ┐
//             solution_design      → AI方案设计(100008) ├→ 风险审校(100011) → 业务结果输出(100016)
//             prd_draft            → PRD草稿(100009)  │
//             competitor_analysis  → 竞品分析(100010) ┘
//             其他 / unknown       → 未知任务引导(100012) → 输出(100017)

const knowledge = require("./knowledge");
const providers = require("./providers");
const {
  INTENT, REQUIREMENT, SOLUTION, PRD, COMPETITOR, REVIEW, GUIDANCE, HIGH_RISK, KNOWLEDGE
} = require("./prompts");

const BRANCHES = {
  requirement_analysis: REQUIREMENT,
  solution_design: SOLUTION,
  prd_draft: PRD,
  competitor_analysis: COMPETITOR
};

const TASK_HINT_LABELS = {
  requirement_analysis: "需求分析",
  solution_design: "AI 方案设计",
  prd_draft: "PRD 草稿",
  competitor_analysis: "竞品分析"
};

function fillTemplate(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name) => {
    const value = vars[name];
    return value === undefined || value === null ? "" : String(value);
  });
}

// 取最近 N 轮会话（对应节点参数 enableChatHistory / chatHistoryRound）
function historyMessages(history, rounds) {
  if (!rounds || !Array.isArray(history) || !history.length) return [];
  const valid = history.filter(item => item && typeof item.content === "string" && item.content.trim() && ["user", "assistant"].includes(item.role));
  return valid.slice(-rounds * 2).map(item => ({ role: item.role, content: item.content }));
}

function buildMessages(node, systemPrompt, userContent, history) {
  return [
    { role: "system", content: systemPrompt },
    ...historyMessages(history, node.historyRounds),
    { role: "user", content: userContent }
  ];
}

// 从模型输出中稳健地提取 JSON 对象
function parseIntent(text) {
  let raw = String(text || "").trim();
  raw = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) raw = raw.slice(start, end + 1);
  let parsed;
  try { parsed = JSON.parse(raw); } catch { return null; }
  const asArray = value => Array.isArray(value) ? value.map(String) : [];
  const asBool = value => value === true || value === "true";
  return {
    intent: String(parsed.intent || "unknown"),
    risk_level: String(parsed.risk_level || "low"),
    risk_flags: asArray(parsed.risk_flags),
    safe_response_requir: asBool(parsed.safe_response_requir),
    confidence: String(parsed.confidence || "low"),
    sufficient: parsed.sufficient === undefined ? true : asBool(parsed.sufficient),
    known_facts: asArray(parsed.known_facts),
    knowledge_supported: asArray(parsed.knowledge_supported),
    missing_fields: asArray(parsed.missing_fields),
    clarifying_question: String(parsed.clarifying_question || ""),
    routing_reason: String(parsed.routing_reason || "")
  };
}

function renderProjectContext(project) {
  if (!project) return "（未提供项目背景）";
  const rows = [
    ["项目名称", project.name], ["业务对象", project.object], ["目标用户", project.audience],
    ["当前阶段", project.stage], ["已确认范围", project.scope], ["关键约束", project.constraints],
    ["待确认事项", project.openQuestions]
  ].filter(([, value]) => value && String(value).trim());
  if (!rows.length) return "（未提供项目背景）";
  return rows.map(([label, value]) => `${label}：${value}`).join("\n");
}

async function runNode(credentials, node, vars, history, trace, signal) {
  // vars 为 null 时表示 userPromptTemplate 已是填好的最终内容
  const userContent = vars === null ? node.userPromptTemplate : fillTemplate(node.userPromptTemplate, vars);
  const startedAt = Date.now();
  const entry = { node: node.id, title: node.title };
  try {
    const response = await providers.chat(credentials, {
      messages: buildMessages(node, node.systemPrompt, userContent, history),
      temperature: node.temperature,
      topP: node.topP,
      maxTokens: node.maxTokens,
      json: Boolean(node.json),
      timeoutMs: node.timeoutMs || 150000,
      signal
    });
    entry.ms = Date.now() - startedAt;
    entry.ok = true;
    trace.push(entry);
    return response.text;
  } catch (error) {
    entry.ms = Date.now() - startedAt;
    entry.ok = false;
    entry.error = error.message;
    trace.push(entry);
    error.node = node.title;
    throw error;
  }
}

async function runFlow(request) {
  const input = String(request.input || "").trim();
  const credentials = request.credentials;
  const history = Array.isArray(request.history) ? request.history : [];
  const projectContext = renderProjectContext(request.project);
  const taskHint = TASK_HINT_LABELS[request.task_hint] || "";
  const trace = [];
  const startedAt = Date.now();

  // 1. 知识库检索（节点 186295）
  const recentUserTurns = history.filter(item => item.role === "user").slice(-KNOWLEDGE.historyRounds).map(item => item.content);
  const retrieval = knowledge.search(input, recentUserTurns.join("\n"), KNOWLEDGE.topK, KNOWLEDGE.minScore);
  const knowledgeText = knowledge.renderForPrompt(retrieval.chunks);
  trace.push({ node: "186295", title: "知识库检索", ok: true, ms: 0, hits: retrieval.chunks.length });

  // 2. 意图识别与完整性检查（节点 100003，输出 JSON）
  const intentVars = { user_input: input, knowledge: knowledgeText };
  let intentUserPrompt = fillTemplate(INTENT.userPromptTemplate, intentVars);
  if (taskHint) {
    intentUserPrompt += `\n\n<task_hint>用户在界面上选择了任务路径：「${taskHint}」。该选择仅供参考，仍以用户输入的实际内容为准。</task_hint>`;
  }
  const intentRaw = await runNode(credentials, { ...INTENT, userPromptTemplate: intentUserPrompt }, null, history, trace, request.signal);
  const intent = parseIntent(intentRaw);
  if (!intent) {
    const error = new Error("意图识别节点没有返回合法 JSON，请重试或更换模型。");
    error.node = INTENT.title;
    throw error;
  }

  const intentMeta = { ...intent };
  delete intentMeta.clarifying_question;

  const meta = {
    route: "",
    provider: credentials.id,
    model: credentials.model,
    intent: intentMeta,
    knowledge: retrieval.chunks,
    knowledgeDocs: retrieval.docs.length,
    evidence: {
      facts: intent.known_facts,
      sources: retrieval.chunks.map(hit => `来源:《${hit.source}》`),
      suggestions: intent.routing_reason ? [`路由依据：${intent.routing_reason}`] : [],
      assumptions: intent.missing_fields.map(field => `待确认：${field}`),
      risks: intent.risk_flags
    },
    trace,
    startedAt: new Date(startedAt).toISOString()
  };

  // 3. 条件节点 100004：是否需要追问 / 高风险
  if (intent.risk_level === "high" || intent.safe_response_requir) {
    meta.route = "high_risk";
    const text = await runNode(credentials, HIGH_RISK, { input }, history, trace, request.signal);
    return { kind: "risk", text, meta };
  }
  if (!intent.sufficient) {
    meta.route = "clarify";
    return { kind: "needs_input", text: intent.clarifying_question || "请补充任务的关键信息后再继续。", meta };
  }

  // 4. 条件节点 100006：任务路由
  const branch = BRANCHES[intent.intent];
  if (!branch) {
    meta.route = "unknown";
    const text = await runNode(credentials, GUIDANCE, { user_input: input }, history, trace, request.signal);
    return { kind: "guidance", text, meta };
  }

  meta.route = intent.intent;
  // 5. 分支生成 → 6. 风险审校与最终整理（节点 100011）
  const draft = await runNode(credentials, branch, { input, knowledge: knowledgeText, project_context: projectContext }, history, trace, request.signal);
  const reviewVars = { Requirement: "", Solution: "", Draft: "", Competitive_Analysis: "" };
  const reviewKey = { requirement_analysis: "Requirement", solution_design: "Solution", prd_draft: "Draft", competitor_analysis: "Competitive_Analysis" }[intent.intent];
  reviewVars[reviewKey] = draft;
  const text = await runNode(credentials, REVIEW, reviewVars, history, trace, request.signal);
  return { kind: "completed", text, meta };
}

module.exports = { runFlow };
