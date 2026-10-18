/// <reference types="@cloudflare/workers-types" />

// 上传接口（图片 / 视频）—— 站内编辑器用
//
//   POST /api/upload
//   headers: x-admin-password
//   body: { filename: string, type?: string, data: string }   data = base64（可带 data:...;base64, 前缀）
//   -> { ok: true, url: "/uploads/xxx.png", path: "public/uploads/xxx.png", size, note }
//
// 为什么要有它：本站是「静态站 + GitHub Actions 构建」，没有对象存储；
// 能持久化的地方只有仓库本身。所以把二进制通过 Git Data API 写进
// public/uploads/，构建时原样发布到 /uploads/xxx（和现有的 birds-fly.webp 同一个目录）。
//
// 单文件上限 25MB：再大 base64 之后请求体过大，Worker 与 GitHub 都很吃力。
// 视频建议先压到 1080p；这个接口只负责「能传上去」，不做转码。
//
// 注意：每次上传都会产生一次提交 → 触发一次重新构建（约 1 分钟）。所以编辑器里
// 提示写的是「上传后约 1 分钟才能在页面上看到」。

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";
const MAX_BYTES = 25 * 1024 * 1024;
const UPLOAD_DIR = "public/uploads";

// 只收图片与视频。svg 是文本但按图片存（浏览器直接能显示）。
const ALLOWED_EXT = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"gif",
	"avif",
	"svg",
	"mp4",
	"webm",
	"mov",
	"m4v",
	"ogg",
]);

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

// 文件名：只留 ASCII 的字母/数字/连字符（时间戳保证不重名）。
// 为什么要砍掉汉字：文件名会变成正文里的 URL，中文在 URL 里会被百分号编码，
// 既难辨认也容易在 Markdown 图片、LQIP 之类的环节出意外 —— 统一成安全字符最省事。
function slugify(input: string): string {
	const cleaned = input
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
	return cleaned || "";
}

function stamp(): string {
	const d = new Date();
	const p = (n: number): string => String(n).padStart(2, "0");
	return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

async function gh(token: string, path: string, init?: { method?: string; body?: string }): Promise<unknown> {
	const res = await fetch(`https://api.github.com${path}`, {
		method: init?.method ?? "GET",
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"content-type": "application/json",
			"user-agent": "yokan-haze-cms",
		},
		body: init?.body,
	});
	const text = await res.text();
	let parsed: unknown = null;
	try {
		parsed = JSON.parse(text);
	} catch {
		parsed = text;
	}
	if (!res.ok) {
		throw new Error(`${init?.method ?? "GET"} ${path} → HTTP ${res.status} ${text.slice(0, 200)}`);
	}
	return parsed;
}

// 把单个二进制文件写进仓库，返回新 commit 的 sha。
// 用 Git Data API（blob → tree → commit → ref）而不是 Contents API：
// blob 支持大文件，也不会因为「没传 sha」而覆盖失败。
async function commitFile(
	repo: string,
	branch: string,
	path: string,
	base64: string,
	message: string,
	token: string,
): Promise<string> {
	for (let attempt = 0; attempt < 3; attempt++) {
		const ref = (await gh(token, `/repos/${repo}/git/ref/heads/${branch}`)) as { object: { sha: string } };
		const head = ref.object.sha;
		const parent = (await gh(token, `/repos/${repo}/git/commits/${head}`)) as { tree: { sha: string } };
		const blob = (await gh(token, `/repos/${repo}/git/blobs`, {
			method: "POST",
			body: JSON.stringify({ content: base64, encoding: "base64" }),
		})) as { sha: string };
		const tree = (await gh(token, `/repos/${repo}/git/trees`, {
			method: "POST",
			body: JSON.stringify({
				base_tree: parent.tree.sha,
				tree: [{ path, mode: "100644", type: "blob", sha: blob.sha }],
			}),
		})) as { sha: string };
		const commit = (await gh(token, `/repos/${repo}/git/commits`, {
			method: "POST",
			body: JSON.stringify({ message, tree: tree.sha, parents: [head] }),
		})) as { sha: string };

		try {
			await gh(token, `/repos/${repo}/git/refs/heads/${branch}`, {
				method: "PATCH",
				body: JSON.stringify({ sha: commit.sha, force: false }),
			});
			return commit.sha;
		} catch (e) {
			// 422 = 这期间分支又被推进了（另一次上传/保存）。重读 head 再来一次，
			// 否则并发上传会出现「第二个文件丢失」这种很难查的问题。
			const msg = String(e instanceof Error ? e.message : e);
			if (attempt < 2 && msg.includes("422")) continue;
			throw e;
		}
	}
	throw new Error("分支更新失败（并发写入过多，请重试）");
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) {
		return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	}
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	let payload: { filename?: string; type?: string; data?: string };
	try {
		payload = (await request.json()) as typeof payload;
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	const originalName = String(payload.filename || "file");
	const ext = (originalName.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "").toLowerCase();
	if (!ALLOWED_EXT.has(ext)) {
		return json({ ok: false, error: `不支持的文件类型 .${ext || "（无扩展名）"}（只收图片与视频）` }, 400);
	}

	const base64 = String(payload.data || "")
		.replace(/^data:[^,]*,/, "")
		.replace(/\s/g, "");
	if (!base64) return json({ ok: false, error: "缺少文件内容" }, 400);

	// base64 → 原始字节数（每 4 个字符 3 字节，末尾 "=" 各少 1 字节）
	const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
	const bytes = Math.floor((base64.length * 3) / 4) - padding;
	if (bytes <= 0) return json({ ok: false, error: "文件内容为空" }, 400);
	if (bytes > MAX_BYTES) {
		return json(
			{ ok: false, error: `文件太大（${(bytes / 1048576).toFixed(1)} MB，上限 25 MB）` },
			413,
		);
	}

	const base = slugify(originalName.replace(/\.[^.]+$/, "")) || "media";
	const name = `${stamp()}-${base}.${ext}`;
	const path = `${UPLOAD_DIR}/${name}`;

	try {
		const repo = env.GH_REPO || DEFAULT_REPO;
		const branch = env.GH_BRANCH || DEFAULT_BRANCH;
		const commit = await commitFile(
			repo,
			branch,
			path,
			base64,
			`上传素材：${name}（${(bytes / 1024).toFixed(0)} KB）`,
			env.GH_TOKEN,
		);
		return json({
			ok: true,
			url: `/uploads/${name}`,
			path,
			size: bytes,
			commit,
			note: "已提交到仓库，约 1 分钟后链接才能打开（构建期间页面里还是 404）",
		});
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
