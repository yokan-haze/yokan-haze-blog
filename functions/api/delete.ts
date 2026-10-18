/// <reference types="@cloudflare/workers-types" />

// 删除内容接口 —— 站内后台第二轮
//
//   POST /api/delete   { path: "src/content/posts/xxx.md" }
//
// 安全设计
// - 复用 ADMIN_PASSWORD
// - 只允许删除三个内容目录下的 .md 文件（白名单前缀），不能拿它删仓库里别的文件
// - 路径里不允许出现 .. 或反斜杠
// - 必须先读到文件 sha 才删（GitHub 的删除必须带 sha），读不到就报错而不是静默成功

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

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	let payload: { path?: string };
	try {
		payload = await request.json();
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	const path = String(payload.path || "").trim();
	if (!path) return json({ ok: false, error: "缺少 path" }, 400);
	if (path.includes("..") || path.includes("\\")) return json({ ok: false, error: "路径不合法" }, 400);
	if (!ALLOWED_DIRS.some((d) => path.startsWith(d)) || !path.endsWith(".md")) {
		return json({ ok: false, error: "只能删除内容目录下的 .md 文件" }, 400);
	}

	const repo = env.GH_REPO || DEFAULT_REPO;
	const branch = env.GH_BRANCH || DEFAULT_BRANCH;
	const headers = {
		authorization: `Bearer ${env.GH_TOKEN}`,
		accept: "application/vnd.github+json",
		"content-type": "application/json",
		"user-agent": "yokan-haze-cms",
	};

	try {
		// 1) 取 sha
		const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, { headers });
		if (!getRes.ok) {
			return json({ ok: false, error: `读取文件失败 HTTP ${getRes.status}` }, 502);
		}
		const file = (await getRes.json()) as { sha: string };

		// 2) 删除
		const delRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
			method: "DELETE",
			headers,
			body: JSON.stringify({
				message: `删除内容：${path.split("/").pop()}`,
				sha: file.sha,
				branch,
			}),
		});
		if (!delRes.ok) {
			return json({ ok: false, error: `删除失败 HTTP ${delRes.status} ${(await delRes.text()).slice(0, 160)}` }, 502);
		}

		return json({ ok: true, path, note: "已删除并提交，约 1 分钟后重新构建" });
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
