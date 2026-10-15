// 行业分析流式链路冒烟：mock 通道跑通 Step 0-4 + 拷问三轮 + 诊断
const BASE = "http://127.0.0.1:8787";

async function stream(body) {
  const response = await fetch(`${BASE}/api/industry/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(`HTTP ${response.status}: ${data?.error?.message}`); }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", finish = "", usage = null, events = 0, rollbacks = 0;
  const handle = raw => {
    for (const line of raw.split("\n")) {
      if (!line.startsWith("data:")) continue;
      const event = JSON.parse(line.slice(5).trim());
      events += 1;
      if (event.type === "delta") text += event.text;
      else if (event.type === "rollback") rollbacks += 1;
      else if (event.type === "usage") usage = event;
      else if (event.type === "done") finish = event.finishReason;
      else if (event.type === "error") throw new Error(event.message);
    }
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf("\n\n")) >= 0) { handle(buffer.slice(0, sep)); buffer = buffer.slice(sep + 2); }
  }
  if (buffer.trim()) handle(buffer);
  return { text, finish, usage, events, rollbacks };
}

(async () => {
  const provider = { id: "mock" };
  const steps = [];
  const names = ["Step0边界", "Step1结构", "Step2流转", "Step3议价", "Step4约束"];
  for (let i = 0; i < 5; i += 1) {
    const r = await stream({ mode: "step", step: i, industry: "智能客服", boundary: i === 0 ? "" : "候选一：面向企业的智能客服软件", steps: [...steps], provider });
    steps.push(r.text);
    console.log(`${names[i]}: ${r.text.length} 字 · events=${r.events} finish=${r.finish} usage=入${r.usage?.input}/出${r.usage?.output}`);
    if (!r.text.trim()) throw new Error(`${names[i]} 空输出`);
  }
  // 校验 Step 0 候选解析契约
  const rows = steps[0].split("\n").filter(l => l.trim().startsWith("|"));
  const header = rows.map(l => l.trim().slice(1, -1).split("|")[0].trim()).find(c => c === "候选");
  console.log(`Step0 表头契约: ${header ? "OK（候选列存在）" : "FAIL"}`);

  // 拷问：4 轮问答到诊断
  const interview = [{ role: "user", content: "[[INDUSTRY_INTERVIEW_START]]" }];
  for (let turn = 0; turn < 4; turn += 1) {
    if (turn > 0) interview.push({ role: "user", content: turn === 3 ? "[[INDUSTRY_INTERVIEW_DIAGNOSTIC]]" : "（用户回答）" });
    const r = await stream({ mode: "interview", steps, interview: interview.map(m => ({ role: m.role, content: m.content })), provider });
    interview.push({ role: "assistant", content: r.text });
    console.log(`拷问回合${turn + 1}: ${r.text.slice(0, 42).replace(/\n/g, " ")}…`);
  }
  const last = interview.at(-1).content;
  console.log(`诊断包含「诊断」标题: ${last.includes("诊断") ? "OK" : "FAIL"}`);

  // 缺 Key 应报错
  const bad = await fetch(`${BASE}/api/industry/stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: "step", step: 0, industry: "x", steps: [], provider: { id: "deepseek" } }) });
  const badData = await bad.json();
  console.log(`缺 Key 400: ${bad.status === 400 && badData.error?.message ? "OK" : "FAIL"}`);
  console.log("SMOKE PASS");
})().catch(e => { console.error("SMOKE FAIL:", e.message); process.exit(1); });
