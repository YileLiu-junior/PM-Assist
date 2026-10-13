// 本地知识库检索（替代 Coze 云端知识库节点 186295）
// 用法：把从 Coze 导出的知识库文档（.md / .txt / .csv）放进 orchestrator/knowledge/，
// 服务会在每次请求时自动发现新文件并重建索引。检索采用中文字符 bigram + 词频加权，
// 按 topK 返回最相关片段。文件名会作为“来源”随召回内容一起进入提示词。
// 以 README 开头或 _ 开头的文件不参与索引。

const fs = require("fs");
const path = require("path");

const KNOWLEDGE_DIR = path.join(__dirname, "knowledge");
const SUPPORTED_EXT = new Set([".md", ".txt", ".csv", ".markdown"]);
const IGNORED_PREFIX = ["readme", "_"];

let cache = { docs: [], chunks: [], indexedAt: 0, signature: "" };

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (SUPPORTED_EXT.has(path.extname(entry.name).toLowerCase())) out.push(full);
  }
  return out;
}

function shouldIgnore(file) {
  const base = path.basename(file).toLowerCase();
  return IGNORED_PREFIX.some(prefix => base.startsWith(prefix));
}

// 中文按相邻两字切 bigram，英文数字按整词，降低单字噪声
function tokenize(text) {
  const tokens = [];
  const cleaned = String(text || "").toLowerCase();
  const asciiMatches = cleaned.match(/[a-z0-9][a-z0-9._-]*/g) || [];
  tokens.push(...asciiMatches);
  const cjk = cleaned.match(/[\u4e00-\u9fff]+/g) || [];
  for (const segment of cjk) {
    if (segment.length === 1) { tokens.push(segment); continue; }
    for (let i = 0; i < segment.length - 1; i += 1) tokens.push(segment.slice(i, i + 2));
  }
  return tokens;
}

function buildIndex() {
  const files = listFiles(KNOWLEDGE_DIR).filter(file => !shouldIgnore(file));
  const docs = [];
  const chunks = [];
  for (const file of files) {
    let content = "";
    try { content = fs.readFileSync(file, "utf8"); } catch { continue; }
    const relName = path.relative(KNOWLEDGE_DIR, file).replace(/\\/g, "/");
    docs.push({ name: relName, size: content.length });
    for (const piece of splitChunks(content, 700)) {
      const tf = new Map();
      for (const token of tokenize(piece.text)) tf.set(token, (tf.get(token) || 0) + 1);
      if (!tf.size) continue;
      chunks.push({ source: relName, text: piece.text, tf, length: [...tf.values()].reduce((a, b) => a + b, 0) });
    }
  }
  // 计算 IDF
  const df = new Map();
  for (const chunk of chunks) for (const token of chunk.tf.keys()) df.set(token, (df.get(token) || 0) + 1);
  const idf = new Map();
  const total = Math.max(chunks.length, 1);
  for (const [token, count] of df) idf.set(token, Math.log((total + 1) / (count + 0.5)));
  for (const chunk of chunks) chunk.idf = idf;
  cache = { docs, chunks, indexedAt: Date.now(), signature: files.map(f => `${f}:${fs.statSync(f).mtimeMs}`).join("|") };
  return cache;
}

function splitChunks(content, size) {
  const paragraphs = String(content).replace(/\r/g, "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  const pieces = [];
  let buffer = "";
  for (const paragraph of paragraphs) {
    if ((buffer + "\n\n" + paragraph).length > size && buffer) {
      pieces.push({ text: buffer });
      buffer = paragraph.length > size * 1.5 ? "" : paragraph;
      if (paragraph.length > size * 1.5) {
        // 超长段落按句号硬切
        for (const sentence of paragraph.split(/(?<=[。！？!?])/)) {
          if ((buffer + sentence).length > size && buffer) { pieces.push({ text: buffer }); buffer = sentence; }
          else buffer += sentence;
        }
      }
    } else buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph;
  }
  if (buffer.trim()) pieces.push({ text: buffer.trim() });
  return pieces.filter(piece => piece.text.length >= 20);
}

function getIndex() {
  const files = listFiles(KNOWLEDGE_DIR).filter(file => !shouldIgnore(file));
  let signature = "";
  try { signature = files.map(f => `${f}:${fs.statSync(f).mtimeMs}`).join("|"); } catch { signature = ""; }
  if (signature !== cache.signature || (!cache.chunks.length && files.length)) return buildIndex();
  return cache;
}

// 检索：query 为用户输入，extraContext 为最近的会话内容（对应原节点 useRewrite + 3 轮历史）
function search(query, extraContext = "", topK = 5, minScore = 0.01) {
  const index = getIndex();
  if (!index.chunks.length) return { chunks: [], docs: index.docs };
  const queryTf = new Map();
  for (const token of tokenize(`${query}\n${extraContext}`)) queryTf.set(token, (queryTf.get(token) || 0) + 1);
  if (!queryTf.size) return { chunks: [], docs: index.docs };

  const scored = [];
  for (const chunk of index.chunks) {
    let dot = 0;
    for (const [token, count] of queryTf) {
      const weight = chunk.idf.get(token) || 0;
      if (!weight) continue;
      dot += Math.sqrt(count) * Math.sqrt(chunk.tf.get(token) || 0) * weight;
    }
    if (!dot) continue;
    const norm = [...chunk.tf.entries()].reduce((sum, [token, count]) => sum + count * (chunk.idf.get(token) || 0) ** 2, 0) ** 0.5;
    const score = norm ? dot / norm : 0;
    if (score >= minScore) scored.push({ source: chunk.source, text: chunk.text, score: Number(score.toFixed(4)) });
  }
  scored.sort((a, b) => b.score - a.score);
  return { chunks: scored.slice(0, topK), docs: index.docs };
}

function status() {
  const index = getIndex();
  return { dir: KNOWLEDGE_DIR, docs: index.docs.length, chunks: index.chunks.length, files: index.docs.map(doc => doc.name) };
}

// 把召回结果渲染成提示词里的文本块（对应原节点输出 outputList）
function renderForPrompt(hits) {
  if (!hits.length) return "（知识库没有召回相关内容。资料不足时写“未知”，不得编造企业事实。）";
  return hits
    .map((hit, i) => `[${i + 1}] 来源:《${hit.source}》\n${hit.text}`)
    .join("\n\n");
}

module.exports = { search, status, renderForPrompt };
