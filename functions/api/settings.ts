/// <reference types="@cloudflare/workers-types" />
// Cloudflare Pages Functions —— 全站设置保存接口
//
// 地址：POST /api/settings
//
// 背景：博客是静态站点，设置面板改的东西只存在访客自己的 localStorage 里。
// 站长希望「我改了，所有访客也跟着变」。静态站点没有地方存这种数据，
// 所以加了这个接口：它把设置提交回 Git 仓库 → 触发重新构建 → 所有人拿到的
// 就是固化进代码后的样子。
//
// 需要的环境变量（Cloudflare 项目 Settings → Environment variables）：
//   ADMIN_PASSWORD  保存接口的密码（站长自己定）
//   GH_TOKEN        能写本仓库的 GitHub 令牌（classic，勾 repo 即可）
// 可选（一般不用改）：
//   GH_REPO         默认 yokan-haze/yokan-haze-blog
//   GH_BRANCH       默认 main
//
// 安全：没有 ADMIN_PASSWORD 时接口直接拒绝（503/401），绝不会出现
// 「没配密码却能被任何人写」的情况。

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const SETTINGS_PATH = "src/data/siteSettings.json";
const MAX_BODY_BYTES = 16 * 1024; // 设置就几十字节，给 16KB 已经很宽松

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";

// 允许出现的设置键 —— 取自主题真实使用的 localStorage 键（见 src/utils/setting-utils.ts）。
// 一开始我按猜测写过 themeMode / postLayout 之类的名字，那是错的：主题实际用的是
// theme / postListLayout。白名单之外的一律丢弃，所以名字必须和主题完全一致。
//
// 白名单的目的：万一令牌泄漏，也不能拿这个接口往仓库里写任意文件 / 任意内容。
const ALLOWED_KEYS = new Set([
	"theme", // "light" | "dark"
	"hue", // 主题色相，0-360
	"wallpaperMode", // "banner" | "fullscreen" | "overlay" | "none"
	"fullscreenLayout", // 全屏壁纸布局
	"postListLayout", // "list" | "grid"
	"overlayOpacity", // 0-1
	"overlayBlur", // 0-20
	"overlayCardOpacity", // 0-1
	"wavesEnabled",
	"gradientEnabled",
	"sakuraEnabled",
	"bannerTitleEnabled",
	"bannerCarouselEnabled",
	"cardBorderEnabled",
	"cardFollowThemeEnabled",
]);

// 每个键允许的值类型。类型不符的直接丢弃，不写进仓库。
const KEY_TYPES: Record<string, "boolean" | "number" | "string"> = {
	theme: "string",
	hue: "number",
	wallpaperMode: "string",
	fullscreenLayout: "string",
	postListLayout: "string",
	overlayOpacity: "number",
	overlayBlur: "number",
	overlayCardOpacity: "number",
	wavesEnabled: "boolean",
	gradientEnabled: "boolean",
	sakuraEnabled: "boolean",
	bannerTitleEnabled: "boolean",
	bannerCarouselEnabled: "boolean",
	cardBorderEnabled: "boolean",
	cardFollowThemeEnabled: "boolean",
};

function json(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: {
			"content-type": "application/json; charset=utf-8",
			"cache-control": "no-store",
		},
	});
}

// 常量时间比较，避免通过响应时间猜密码
function safeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
}

function sanitize(input: unknown): Record<string, unknown> {
	if (!input || typeof input !== "object" || Array.isArray(input)) {
		throw new Error("settings 必须是一个对象");
	}
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
		if (!ALLOWED_KEYS.has(k)) continue;

		// 类型必须和该键预期的类型一致；不一致就丢弃（不做隐式转换，
		// 避免 "true" 这种字符串被当成布尔值写进配置）。
		const want = KEY_TYPES[k];
		if (want === "boolean" && typeof v === "boolean") {
			out[k] = v;
			continue;
		}
		if (want === "number" && typeof v === "number" && Number.isFinite(v)) {
			out[k] = v;
			continue;
		}
		if (want === "string" && typeof v === "string" && v.length <= 64) {
			out[k] = v;
			continue;
		}
	}
	return out;
}

async function readCurrentFile(repo: string, branch: string, token: string) {
	const res = await fetch(
		`https://api.github.com/repos/${repo}/contents/${SETTINGS_PATH}?ref=${branch}`,
		{
			headers: {
				authorization: `Bearer ${token}`,
				accept: "application/vnd.github+json",
				"user-agent": "yokan-haze-settings",
			},
		}
	);
	if (res.status === 404) return null; // 文件还不存在，正常
	if (!res.ok) throw new Error(`读取文件失败：HTTP ${res.status}`);
	const data = (await res.json()) as { content?: string; sha?: string };
	return {
		sha: data.sha,
		text: data.content
			? decodeURIComponent(
					atob(data.content.replace(/\s/g, ""))
						.split("")
						.map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
						.join("")
				)
			: "{}",
	};
}

async function writeFile(
	repo: string,
	branch: string,
	token: string,
	content: string,
	sha: string | undefined,
	message: string
) {
	const body: Record<string, unknown> = {
		message,
		content: btoa(String.fromCharCode(...new TextEncoder().encode(content))),
		branch,
	};
	if (sha) body.sha = sha;

	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${SETTINGS_PATH}`, {
		method: "PUT",
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"content-type": "application/json",
			"user-agent": "yokan-haze-settings",
		},
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`提交失败：HTTP ${res.status} ${text.slice(0, 200)}`);
	}
	return res.json();
}

// ── 健康检查：GET /api/settings 只告诉你接口在不在、配置齐不齐 ──
export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
	json({
		ok: true,
		hasPassword: Boolean(env.ADMIN_PASSWORD),
		hasToken: Boolean(env.GH_TOKEN),
		repo: env.GH_REPO || DEFAULT_REPO,
		branch: env.GH_BRANCH || DEFAULT_BRANCH,
	});

// ── 保存：POST /api/settings ──
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	// 1) 没配密码 = 接口不可用（绝不能默认放行）
	if (!env.ADMIN_PASSWORD) {
		return json(
			{ ok: false, error: "服务端未配置 ADMIN_PASSWORD，保存功能已禁用" },
			503
		);
	}
	if (!env.GH_TOKEN) {
		return json({ ok: false, error: "服务端未配置 GH_TOKEN，保存功能已禁用" }, 503);
	}

	// 2) 鉴权：请求头 x-admin-password
	const given = request.headers.get("x-admin-password") || "";
	if (!safeEqual(given, env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	// 3) 体积限制
	const raw = await request.text();
	if (raw.length > MAX_BODY_BYTES) {
		return json({ ok: false, error: "内容过大" }, 413);
	}

	// 4) 解析 + 白名单过滤
	let payload: unknown;
	try {
		payload = JSON.parse(raw);
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	let settings: Record<string, unknown>;
	try {
		settings = sanitize((payload as { settings?: unknown })?.settings ?? payload);
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 400);
	}

	if (Object.keys(settings).length === 0) {
		return json({ ok: false, error: "没有任何有效的设置项" }, 400);
	}

	// 5) 写回仓库（保留 _说明 之类的注释字段，只替换实际设置）
	const repo = env.GH_REPO || DEFAULT_REPO;
	const branch = env.GH_BRANCH || DEFAULT_BRANCH;

	try {
		const current = await readCurrentFile(repo, branch, env.GH_TOKEN);
		let merged: Record<string, unknown> = {};
		if (current) {
			try {
				const parsed = JSON.parse(current.text) as Record<string, unknown>;
				// 保留以下划线开头的注释键
				for (const [k, v] of Object.entries(parsed)) {
					if (k.startsWith("_")) merged[k] = v;
				}
			} catch {
				// 旧文件坏了就重写，不阻断保存
			}
		}
		merged = { ...merged, ...settings };

		const content = JSON.stringify(merged, null, "\t") + "\n";
		const stamp = new Date().toISOString().replace("T", " ").slice(0, 19);
		await writeFile(
			repo,
			branch,
			env.GH_TOKEN,
			content,
			current?.sha,
			`更新全站默认设置（来自站内设置面板 ${stamp} UTC）`
		);

		return json({
			ok: true,
			saved: settings,
			note: "已提交到仓库，约 1 分钟后自动重新部署生效",
		});
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
