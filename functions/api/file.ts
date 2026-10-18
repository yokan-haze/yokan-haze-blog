/// <reference types="@cloudflare/workers-types" />

// 读取单篇内容的接口 —— 供编辑器「修改已有文章」使用
//
//   GET /api/file?path=src/content/posts/xxx.md
//   -> { ok, path, data: {...frontmatter}, body: "...正文..." }
//
// 安全：与 /api/content、/api/delete 一致 —— 复用 ADMIN_PASSWORD，
// 只允许读三个内容目录下的 .md，拒绝 .. 与反斜杠。

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";

const ALLOWED_DIRS = [
	"src/content/posts/",
	"src/content/dynamic/",
	"src/content/projects/",
];

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

function b64ToUtf8(b64: string): string {
	const bin = atob(b64.replace(/\s/g, ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

// 极简 frontmatter 解析：只处理本项目用到的形态
//   key: value          （字符串 / 未加引号的值）
//   key: "value"
//   key: [a, b]         （数组）
//   key: true / 123
function parseFrontmatter(text: string): { data: Record<string, unknown>; body: string } {
	if (!text.startsWith("---")) return { data: {}, body: text };
	const end = text.indexOf("\n---", 3);
	if (end < 0) return { data: {}, body: text };

	const head = text.slice(3, end).trim();
	const body = text.slice(end + 4).replace(/^\r?\n/, "");
	const data: Record<string, unknown> = {};

	for (const rawLine of head.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line || line.startsWith("#")) continue;
		const idx = line.indexOf(":");
		if (idx < 0) continue;
		const key = line.slice(0, idx).trim();
		let val = line.slice(idx + 1).trim();

		if (val === "true") { data[key] = true; continue; }
		if (val === "false") { data[key] = false; continue; }
		if (/^-?\d+(\.\d+)?$/.test(val)) { data[key] = Number(val); continue; }
		if (val.startsWith("[") && val.endsWith("]")) {
			data[key] = val
				.slice(1, -1)
				.split(",")
				.map((s) => s.trim().replace(/^["']|["']$/g, ""))
				.filter(Boolean);
			continue;
		}
		// 去掉成对的引号
		if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
			val = val.slice(1, -1);
		}
		data[key] = val;
	}

	return { data, body };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	const path = new URL(request.url).searchParams.get("path") || "";
	if (!path) return json({ ok: false, error: "缺少 path" }, 400);
	if (path.includes("..") || path.includes("\\")) return json({ ok: false, error: "路径不合法" }, 400);
	if (!ALLOWED_DIRS.some((d) => path.startsWith(d)) || !path.endsWith(".md")) {
		return json({ ok: false, error: "只能读取内容目录下的 .md 文件" }, 400);
	}

	const repo = env.GH_REPO || DEFAULT_REPO;
	const branch = env.GH_BRANCH || DEFAULT_BRANCH;

	try {
		const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
			headers: {
				authorization: `Bearer ${env.GH_TOKEN}`,
				accept: "application/vnd.github+json",
				"user-agent": "yokan-haze-cms",
			},
		});
		if (!res.ok) return json({ ok: false, error: `读取失败 HTTP ${res.status}` }, 502);

		const file = (await res.json()) as { content?: string };
		const text = b64ToUtf8(file.content || "");
		const { data, body } = parseFrontmatter(text);

		return json({ ok: true, path, filename: path.split("/").pop(), data, body });
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
