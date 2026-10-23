#!/usr/bin/env tsx
/**
 * A local page for labelling a calibration corpus version: one answer per screen, its items beside it.
 * Keys 1–4 set the label, a mouse selection in the answer becomes the deciding passage verbatim, and
 * every change is written straight back to `labels-template.csv` in its committed format.
 *
 * It shows only what the worksheet shows (the answer's neutral id and text, and each item's id and
 * fact), never an origin, model or source, and every item starts as the file has it. When the version
 * has a `validation-subset.json`, only those items are shown.
 *
 * Usage, from apps/worker:
 *   pnpm exec tsx scripts/label-calibration.ts src/perception/calibration/v1
 * then open http://127.0.0.1:4317. Stop it with Ctrl-C; nothing is lost, since every change is saved.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import path from "node:path";

const PORT = 4317;
const LABELS = ["supports", "contradicts", "not_mentioned", "unclear"] as const;
const COLUMNS = ["item_id", "answer", "fact_id", "fact", "label", "evidence_quote", "rationale"] as const;
type Row = Record<(typeof COLUMNS)[number], string>;

const dir = process.argv[2];
if (!dir) {
	console.error("Pass the corpus version directory, e.g. src/perception/calibration/v1.");
	process.exit(1);
}
const csvPath = path.join(dir, "labels-template.csv");
const worksheet = readFileSync(path.join(dir, "worksheet.md"), "utf8");
const procedure = readFileSync(path.join(dir, "..", "PROCEDURE.md"), "utf8");
const facts = JSON.parse(readFileSync(path.join(dir, "facts.json"), "utf8")) as {
	id: string;
	statement: string;
	notes: string | null;
}[];
const subsetPath = path.join(dir, "validation-subset.json");
const subset = existsSync(subsetPath)
	? new Set((JSON.parse(readFileSync(subsetPath, "utf8")) as { items: string[] }).items)
	: null;

/** Each answer's verbatim text and the item ids listed under it, in worksheet order. */
function parseWorksheet(source: string): { id: string; text: string; items: string[] }[] {
	const answers: { id: string; text: string; items: string[] }[] = [];
	const pattern = /^## (W\d+)\n\n~~~~text\n([\s\S]*?)\n~~~~\n([\s\S]*?)(?=^## W\d+\n|(?![\s\S]))/gm;
	for (const match of source.matchAll(pattern)) {
		const items = [...match[3].matchAll(/^- (I\d+) — /gm)].map((item) => item[1]);
		answers.push({ id: match[1], text: match[2], items });
	}
	return answers;
}

/** RFC 4180 fields: quoted (with "" for a quote) or bare, comma-separated, one record per LF. */
function parseCsv(source: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	for (const match of source.matchAll(/("(?:[^"]|"")*"|[^,\n]*)(,|\n|$)/g)) {
		if (match[0] === "") break;
		const field = match[1].startsWith('"') ? match[1].slice(1, -1).replace(/""/g, '"') : match[1];
		row.push(field);
		if (match[2] !== ",") {
			rows.push(row);
			row = [];
		}
	}
	return rows;
}

/** Minimal quoting, LF endings and a trailing newline: the format the template was committed in. */
function toCsv(rows: Row[]): string {
	const cell = (value: string) => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
	return [COLUMNS.join(","), ...rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(","))]
		.map((line) => `${line}\n`)
		.join("");
}

function loadRows(): Row[] {
	const [header, ...body] = parseCsv(readFileSync(csvPath, "utf8"));
	if (header.join(",") !== COLUMNS.join(",")) throw new Error(`${csvPath} doesn't have the expected columns.`);
	return body.map((cells) => Object.fromEntries(COLUMNS.map((column, i) => [column, cells[i] ?? ""])) as Row);
}

const answers = parseWorksheet(worksheet);
let rows = loadRows();
const textOf = new Map(answers.map((answer) => [answer.id, answer.text]));
if (answers.length === 0 || rows.some((row) => !textOf.has(row.answer))) {
	throw new Error("worksheet.md and labels-template.csv don't describe the same answers.");
}

function rulesText(): string {
	const start = procedure.indexOf("## 4. Fact label rules");
	const end = procedure.indexOf("## 5. Attribute");
	const ignore = procedure.slice(procedure.indexOf("## 5a."), procedure.indexOf("## 6. Item origin"));
	const notes = facts.filter((fact) => fact.notes).map((fact) => `${fact.id} (${fact.statement}) — ${fact.notes}`);
	return `${procedure.slice(start, end).trim()}\n\n${ignore.trim()}\n\n## Fact notes\n\n${notes.join("\n\n")}`;
}

function data() {
	const shown = (id: string) => !subset || subset.has(id);
	return {
		rules: rulesText(),
		answers: answers
			.map((answer) => ({
				id: answer.id,
				text: answer.text,
				items: answer.items
					.filter(shown)
					.map((id) => rows.find((row) => row.item_id === id) as Row)
					.map((row) => ({
						item_id: row.item_id,
						fact_id: row.fact_id,
						fact: row.fact,
						label: row.label,
						evidence_quote: row.evidence_quote,
						rationale: row.rationale,
					})),
			}))
			.filter((answer) => answer.items.length > 0),
	};
}

/** Validates one item's labelling and writes the whole file atomically. */
function save(update: { item_id: string; label: string; evidence_quote: string; rationale: string }): string | null {
	const row = rows.find((candidate) => candidate.item_id === update.item_id);
	if (!row || (subset && !subset.has(row.item_id))) return "unknown item";
	if (update.label && !LABELS.includes(update.label as (typeof LABELS)[number])) return "unknown label";
	if (update.evidence_quote && !textOf.get(row.answer)?.includes(update.evidence_quote)) {
		return "the passage isn't verbatim answer text";
	}
	if (/[\r\n]/.test(update.rationale)) return "the rationale must be one line";
	rows = rows.map((candidate) =>
		candidate === row
			? { ...row, label: update.label, evidence_quote: update.evidence_quote, rationale: update.rationale }
			: candidate,
	);
	const temporary = `${csvPath}.tmp`;
	writeFileSync(temporary, toCsv(rows));
	renameSync(temporary, csvPath);
	return null;
}

function body(request: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let text = "";
		request.on("data", (chunk) => {
			text += chunk;
		});
		request.on("end", () => resolve(text));
		request.on("error", reject);
	});
}

function send(response: ServerResponse, status: number, type: string, payload: string) {
	response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
	response.end(payload);
}

createServer(async (request, response) => {
	try {
		if (request.method === "GET" && request.url === "/") return send(response, 200, "text/html; charset=utf-8", PAGE);
		if (request.method === "GET" && request.url === "/data") {
			return send(response, 200, "application/json", JSON.stringify(data()));
		}
		if (request.method === "POST" && request.url === "/label") {
			const error = save(JSON.parse(await body(request)));
			return send(response, error ? 400 : 200, "application/json", JSON.stringify({ error }));
		}
		send(response, 404, "text/plain", "not found");
	} catch (error) {
		send(response, 500, "application/json", JSON.stringify({ error: String(error) }));
	}
}).listen(PORT, "127.0.0.1", () => {
	const count = data().answers.reduce((sum, answer) => sum + answer.items.length, 0);
	console.log(`Labelling ${count} items${subset ? " (validation subset)" : ""}: http://127.0.0.1:${PORT}`);
});

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Calibration labelling</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--panel:#fff;--accent:#2563eb;--warn:#b91c1c}
@media (prefers-color-scheme:dark){:root{--bg:#1c1917;--fg:#f5f5f4;--muted:#a8a29e;--line:#44403c;--panel:#292524;--accent:#60a5fa;--warn:#f87171}}
*{box-sizing:border-box}body{margin:0;font:15px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg);height:100vh;display:flex;flex-direction:column}
header{padding:10px 16px;border-bottom:1px solid var(--line);display:flex;gap:16px;align-items:baseline;flex-wrap:wrap}
header b{font-size:16px}#status{margin-left:auto;color:var(--muted)}#status.err{color:var(--warn)}
main{flex:1;display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);min-height:0}
#answer{margin:0;padding:16px;overflow:auto;white-space:pre-wrap;font:14px/1.55 ui-monospace,monospace;border-right:1px solid var(--line)}
#side{overflow:auto;padding:12px 16px}
.item{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:var(--panel);cursor:pointer}
.item.current{outline:2px solid var(--accent)}
.fact{font-weight:600}.meta{color:var(--muted);font-size:13px}
.labels{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.labels button{font:inherit;padding:3px 9px;border:1px solid var(--line);border-radius:6px;background:transparent;color:var(--fg);cursor:pointer}
.labels button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.quote{font-size:13px;white-space:pre-wrap;border-left:3px solid var(--line);padding-left:8px;margin:6px 0;color:var(--muted)}
textarea{width:100%;font:inherit;font-size:14px;padding:6px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--fg);resize:vertical}
details{border-top:1px solid var(--line);padding:8px 16px;max-height:40vh;overflow:auto}
details pre{white-space:pre-wrap;font:13px/1.5 system-ui,sans-serif}
kbd{border:1px solid var(--line);border-radius:4px;padding:0 4px;font-size:12px}
@media (max-width:800px){main{grid-template-columns:1fr}#answer{border-right:0;border-bottom:1px solid var(--line);max-height:50vh}}
</style></head><body>
<header><b id="where"></b><span class="meta"><kbd>1</kbd> supports <kbd>2</kbd> contradicts <kbd>3</kbd> not_mentioned <kbd>4</kbd> unclear · select text in the answer for the passage · <kbd>Enter</kbd> next · <kbd>Backspace</kbd> back · <kbd>Esc</kbd> leave the rationale box</span><span id="status"></span></header>
<main><pre id="answer"></pre><div id="side"></div></main>
<details><summary>Rules (PROCEDURE.md §4) and fact notes</summary><pre id="rules"></pre></details>
<script>
const LABELS=["supports","contradicts","not_mentioned","unclear"];
let answers=[],flat=[],cur=0;
const $=id=>document.getElementById(id);
function status(t,err){const s=$("status");s.textContent=t;s.className=err?"err":"";}
async function load(){const d=await (await fetch("/data")).json();answers=d.answers;$("rules").textContent=d.rules;
 flat=[];answers.forEach((a,ai)=>a.items.forEach((it,ii)=>flat.push({ai,ii})));
 const first=flat.findIndex(f=>!item(f).label);cur=first<0?0:first;render();}
function item(f){return answers[f.ai].items[f.ii];}
async function save(it){const r=await fetch("/label",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({item_id:it.item_id,label:it.label,evidence_quote:it.evidence_quote,rationale:it.rationale})});
 const j=await r.json();if(j.error)status("Not saved: "+j.error,true);else status("Saved · "+flat.filter(f=>item(f).label).length+" of "+flat.length+" labelled");}
function needs(it){if(!it.label)return "choose a label";if(it.label!=="not_mentioned"&&!it.evidence_quote)return "select the deciding passage in the answer";
 if((it.label==="contradicts"||it.label==="unclear")&&!it.rationale.trim())return "a rationale is required for "+it.label;return null;}
function render(){const f=flat[cur],a=answers[f.ai];
 $("where").textContent="answer "+(f.ai+1)+" of "+answers.length+" · item "+(cur+1)+" of "+flat.length;
 if($("answer").dataset.id!==a.id){$("answer").textContent=a.text;$("answer").dataset.id=a.id;$("answer").scrollTop=0;}
 const side=$("side");side.textContent="";
 a.items.forEach((it,ii)=>{const box=document.createElement("div");box.className="item"+(ii===f.ii?" current":"");
  box.onclick=()=>{cur=flat.findIndex(x=>x.ai===f.ai&&x.ii===ii);render();};
  const head=document.createElement("div");head.className="meta";head.textContent=it.item_id+" · "+it.fact_id;box.append(head);
  const fact=document.createElement("div");fact.className="fact";fact.textContent=it.fact;box.append(fact);
  const row=document.createElement("div");row.className="labels";
  LABELS.forEach((l,li)=>{const b=document.createElement("button");b.textContent=(li+1)+" "+l;if(it.label===l)b.className="on";
   b.onclick=e=>{e.stopPropagation();cur=flat.findIndex(x=>x.ai===f.ai&&x.ii===ii);setLabel(l);};row.append(b);});
  box.append(row);
  const q=document.createElement("div");q.className="quote";q.textContent=it.evidence_quote?"“"+it.evidence_quote+"”":"no passage selected";box.append(q);
  const ta=document.createElement("textarea");ta.rows=2;ta.placeholder="rationale (required for contradicts and unclear)";ta.value=it.rationale;
  ta.oninput=()=>{it.rationale=ta.value.replace(/[\\r\\n]+/g," ");};ta.onchange=()=>save(it);ta.onclick=e=>e.stopPropagation();
  ta.onkeydown=e=>{if(e.key==="Escape"){ta.blur();}else if(e.key==="Enter"){e.preventDefault();save(it);ta.blur();next();}};
  box.append(ta);side.append(box);if(ii===f.ii)setTimeout(()=>box.scrollIntoView({block:"nearest"}));});}
function setLabel(l){const it=item(flat[cur]);it.label=l;if(l==="not_mentioned"&&it.evidence_quote){it.evidence_quote="";status("not_mentioned takes no passage, so the passage was cleared");}
 save(it);render();}
function next(){const it=item(flat[cur]),n=needs(it);if(n){status("Can't move on: "+n,true);return;}if(cur<flat.length-1){cur++;render();}else status("Last item. Every change is already saved.");}
function back(){if(cur>0){cur--;render();}}
document.addEventListener("keydown",e=>{if(e.target.tagName==="TEXTAREA")return;
 if(["1","2","3","4"].includes(e.key)){setLabel(LABELS[+e.key-1]);}
 else if(e.key==="Enter"){e.preventDefault();next();}else if(e.key==="Backspace"){e.preventDefault();back();}});
$("answer").addEventListener("mouseup",()=>{const s=window.getSelection().toString();if(!s)return;const a=answers[flat[cur].ai];
 if(!a.text.includes(s)){status("That selection isn't verbatim answer text; select within the answer only",true);return;}
 const it=item(flat[cur]);if(it.label==="not_mentioned"){status("not_mentioned takes no passage",true);return;}it.evidence_quote=s;save(it);render();});
load();
</script></body></html>`;
