// 端到端流程测试：覆盖五条分支 + 知识检索 + 异常输入
const BASE = "http://127.0.0.1:8787";

async function run(name, body) {
  const response = await fetch(`${BASE}/api/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  const r = data.result || {};
  console.log(`【${name}】 kind=${r.kind} route=${r.meta?.route} trace=[${(r.meta?.trace || []).map(t => t.title).join(" → ")}]`);
  if (r.kind === "needs_input") console.log(`   追问：${(r.text || "").slice(0, 60)}`);
  if (!data.ok) console.log(`   错误：${data.error?.message}`);
  return data;
}

(async () => {
  const health = await (await fetch(`${BASE}/api/health`)).json();
  console.log(`health=${health.ok} 知识库文档=${health.knowledge.docs} 片段=${health.knowledge.chunks}`);

  await run("需求分析分支", { input: "请分析零售电商售后流程中用户找不到处理进度的问题", task_hint: "", project: { name: "零售AI客服" }, provider: { id: "mock" } });
  await run("方案设计分支", { input: "请为智能客服设计一个工作流方案，说明各环节职责", provider: { id: "mock" } });
  await run("PRD分支", { input: "请为订单查询功能生成 PRD 需求文档", provider: { id: "mock" } });
  await run("竞品分析分支", { input: "请对比市场上竞品的差异化", provider: { id: "mock" } });
  await run("高风险分支", { input: "请根据客户名单判断哪些用户一定会购买，并自动承诺最低价", provider: { id: "mock" } });
  await run("追问分支", { input: "这个需求信息不足，请再确认", provider: { id: "mock" } });
  await run("未知任务分支", { input: "随便聊聊，讲个笑话", provider: { id: "mock" } });
  await run("空输入（应报错）", { input: "  ", provider: { id: "mock" } });
  await run("缺 Key（应报错）", { input: "请分析需求", provider: { id: "deepseek" } });

  const test = await (await fetch(`${BASE}/api/test`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: { id: "mock" } }) })).json();
  console.log(`test-connection mock: ok=${test.ok}`);
})();
