/// <reference types="@cloudflare/workers-types" />

// 通用内容接口 —— 站内后台的第一块
//
//   GET  /api/content?type=posts            列出该类型已有的文件
//   POST /api/content                       新建或更新一篇（写 .md 进仓库）
//
// 设计要点
// - 复用设置服务器那套鉴权（ADMIN_PASSWORD / GH_TOKEN / GH_REPO / GH_BRANCH）
// - 类型白名单：只允许写入下面 TYPES 里声明的目录，防止拿它写任意文件
// - 路径校验：类型 + 由标题生成的 slug，不接受调用方传任意路径
// - frontmatter 自己序列化，只输出白名单字段，避免注入
// - 已存在的文件会先读取 sha，走更新而不是覆盖报错

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";

// 允许的内容类型 -> 目录
const TYPES: Record<string, string> = {
	posts: "src/content/posts",
	dynamic: "src/content/dynamic",
	projects: "src/content/projects",
};

// 每种类型允许的 frontmatter 字段（同时也是写入顺序）
// pinned 是 2026-10-18 加的：首页只放置顶的 4 篇，所以编辑器必须能改它。
const FIELDS: Record<string, string[]> = {
	posts: ["title", "published", "description", "image", "tags", "category", "draft", "pinned"],
	dynamic: ["published", "content"],
	projects: ["title", "description", "image", "link", "order", "draft"],
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
	});
}

function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

// 由标题生成 slug：保留汉字、字母、数字，其余折成单个连字符
function slugify(input: string): string {
	const s = input
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^\p{L}\p{N}-]/gu, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "");
	return s.slice(0, 60);
}

function yamlValue(v: unknown): string {
	if (typeof v === "boolean" || typeof v === "number") return String(v);
	if (Array.isArray(v)) return "[" + v.map((x) => JSON.stringify(String(x))).join(", ") + "]";
	// 用 JSON 的双引号形式，YAML 1.2 里是合法字符串
	return JSON.stringify(String(v ?? ""));
}

// 已知字段（FIELDS）→ frontmatter 行。空值不输出。
function serializeFields(type: string, data: Record<string, unknown>): string[] {
	const lines: string[] = [];
	for (const k of FIELDS[type] ?? []) {
		const v = data[k];
		if (v === undefined || v === null || v === "") continue;
		if (Array.isArray(v) && v.length === 0) continue;
		// published 用裸日期（YAML 里是 date 类型），其余走 yamlValue
		if (k === "published" && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
			lines.push(`${k}: ${v}`);
			continue;
		}
		lines.push(`${k}: ${yamlValue(v)}`);
	}
	return lines;
}

function buildFile(type: string, data: Record<string, unknown>, body: string): string {
	// published 是主题 schema 的必填项，缺了会让整个构建失败
	// （真实事故：站长试用编辑器发了一篇没带 published 的文章，
	//   CI 报 InvalidContentEntryDataError，整站构建失败）。
	// 这里统一补当天日期，且按 YAML 日期写法输出 —— 不能加引号，否则会变成字符串。
	if (type !== "dynamic" && !data.published) {
		data.published = new Date().toISOString().slice(0, 10);
	}

	const lines = ["---", ...serializeFields(type, data), "---", ""];
	return lines.join("\n") + (body ? body.replace(/\s+$/, "") + "\n" : "");
}

function b64ToUtf8(b64: string): string {
	const bin = atob(b64.replace(/\s/g, ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

// 把已有文件的 frontmatter 拆成「块」：一个顶层 `key:` 行 + 它下面所有缩进行
// （块状数组、多行标量都靠这个原样保留）。不是键的裸行单独成块，也原样保留。
function splitFrontmatterBlocks(text: string): { blocks: string[][]; keys: string[]; body: string } | null {
	if (!text.startsWith("---")) return null;
	const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
	if (!match) return null;

	const blocks: string[][] = [];
	const keys: string[] = [];
	for (const line of match[1].split(/\r?\n/)) {
		const kv = /^([A-Za-z0-9_-]+)\s*:/.exec(line);
		if (kv) {
			blocks.push([line]);
			keys.push(kv[1]);
		} else if (blocks.length > 0) {
			blocks[blocks.length - 1].push(line);
		} else if (line.trim()) {
			blocks.push([line]);
			keys.push("");
		}
	}
	return { blocks, keys, body: text.slice(match[0].length) };
}

// 更新已有文件：保留「这次没改到」的 frontmatter 字段。
//
// 为什么必须这样做：编辑器（/admin/edit/ 和文章页的就地编辑）只提交它管得着的
// 那几个字段（标题 / 简介 / 标签 / 分类 / 草稿 / 正文）。如果按新版整体重写，
// 文章里的 pinned、comment、password、series、slug 这些字段会被静默丢掉 ——
// 那是「提交成功、内容却被改坏」，比报错更糟。
//
// 规则：
//   · 调用方明确给了值的键 → 按 FIELDS 顺序重写（空值 = 删掉这一项）
//   · 没给的键 → 原样保留（连引号、块状数组的写法都不动）
//   · body 传 undefined → 保留原正文；传空字符串 → 明确清空正文
function mergeFile(
	type: string,
	existing: string,
	data: Record<string, unknown>,
	body: string | undefined
): string {
	const parsed = splitFrontmatterBlocks(existing);
	if (!parsed) return buildFile(type, data, body ?? "");

	const provided = new Set(Object.keys(data));
	const out: string[] = [];

	parsed.blocks.forEach((block, index) => {
		const key = parsed.keys[index];
		if (key && provided.has(key)) return; // 交给下面按新值重写 / 删除
		out.push(...block);
	});

	out.push(...serializeFields(type, data));

	const nextBody = body === undefined ? parsed.body : body;
	return ["---", ...out, "---", ""].join("\n") + (nextBody ? nextBody.replace(/\s+$/, "") + "\n" : "");
}

async function ghGet(repo: string, branch: string, path: string, token: string) {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`,
		{ headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "user-agent": "yokan-haze-cms" } }
	);
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`读取失败 HTTP ${res.status}`);
	return (await res.json()) as { sha?: string; content?: string };
}

async function ghPut(repo: string, branch: string, path: string, token: string, content: string, sha: string | undefined, message: string) {
	const body: Record<string, unknown> = {
		message,
		content: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
		branch,
	};
	if (sha) body.sha = sha;
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
		method: "PUT",
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"content-type": "application/json",
			"user-agent": "yokan-haze-cms",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) throw new Error(`提交失败 HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
	return res.json();
}

// ── 列表 ──
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	const type = new URL(request.url).searchParams.get("type") || "posts";
	const dir = TYPES[type];
	if (!dir) return json({ ok: false, error: "未知的内容类型" }, 400);

	try {
		const repo = env.GH_REPO || DEFAULT_REPO;
		const branch = env.GH_BRANCH || DEFAULT_BRANCH;
		const res = await fetch(`https://api.github.com/repos/${repo}/contents/${dir}?ref=${branch}`, {
			headers: { authorization: `Bearer ${env.GH_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "yokan-haze-cms" },
		});
		if (!res.ok) return json({ ok: true, type, files: [] });
		const arr = (await res.json()) as { name: string; path: string }[];
		return json({ ok: true, type, files: arr.filter((f) => f.name.endsWith(".md")).map((f) => ({ name: f.name, path: f.path })) });
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};

// ── 新建 / 更新 ──
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	const raw = await request.text();
	if (raw.length > 512 * 1024) return json({ ok: false, error: "内容过大（上限 512KB）" }, 413);

	let payload: { type?: string; filename?: string; data?: Record<string, unknown>; body?: string };
	try {
		payload = JSON.parse(raw);
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	const type = payload.type || "posts";
	const dir = TYPES[type];
	if (!dir) return json({ ok: false, error: "未知的内容类型" }, 400);

	const data = payload.data || {};
	const title = String(data.title ?? "").trim();
	if (type !== "dynamic" && !title) return json({ ok: false, error: "标题不能为空" }, 400);

	// 文件名：允许调用方指定（编辑已有文章时），否则按标题生成
	let filename = String(payload.filename || "").trim();
	if (filename) {
		if (!/^[\p{L}\p{N}._-]+\.md$/u.test(filename)) {
			return json({ ok: false, error: "文件名不合法" }, 400);
		}
	} else {
		const slug = slugify(title) || "untitled";
		const stamp = new Date().toISOString().slice(0, 10);
		filename = `${stamp}-${slug}.md`;
	}

	const path = `${dir}/${filename}`;
	// body 传 undefined = 不改正文（更新时保留原文）；传空字符串 = 明确清空
	const bodyText = payload.body === undefined ? undefined : String(payload.body);

	try {
		const repo = env.GH_REPO || DEFAULT_REPO;
		const branch = env.GH_BRANCH || DEFAULT_BRANCH;
		const existing = await ghGet(repo, branch, path, env.GH_TOKEN);
		// 更新已有文件：先读出原文，把没改到的 frontmatter 字段原样带过去
		const existingText = existing?.content ? b64ToUtf8(existing.content) : null;
		const content = existingText
			? mergeFile(type, existingText, data, bodyText)
			: buildFile(type, data, bodyText ?? "");
		await ghPut(
			repo,
			branch,
			path,
			env.GH_TOKEN,
			content,
			existing?.sha,
			existing ? `更新内容：${filename}` : `新增内容：${filename}`
		);
		return json({
			ok: true,
			path,
			filename,
			updated: Boolean(existing),
			note: "已提交到仓库，约 1 分钟后重新构建完成",
		});
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
