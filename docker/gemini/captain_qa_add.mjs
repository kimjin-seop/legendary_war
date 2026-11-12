// 기본 부장 초상 QA 기록 보조(호출 없음): node docker/gemini/captain_qa_add.mjs <verdict> <sheet 근거> <group|code>... [--issue=code:문구]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { P_CAP } from './captain_style.mjs';
const p = 'docker/gemini/portrait_captain/qa.json'; const q = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
const [verdict, sheet, ...rest] = process.argv.slice(2); const issues = {}; const targets = [];
for (const a of rest) { if (a.startsWith('--issue=')) { const [c, ...t] = a.slice(8).split(':'); (issues[c] ??= []).push(t.join(':')); } else targets.push(a); }
for (const [code, h] of Object.entries(P_CAP)) {
  if (!targets.some((t) => t === code || t === h.group)) continue;
  q[code] = { verdict: issues[code] && verdict === 'pass' ? 'minor' : verdict, attempt_used: 'r0', calls: 1, issues: issues[code] ?? [], notes: `${h.name}. 근거 ${sheet}` };
}
writeFileSync(p, JSON.stringify(q, null, 1)); console.log(Object.keys(q).length);
