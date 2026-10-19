/// <reference types="@cloudflare/workers-types" />

// 站点外观接口 —— 头像 / Logo / 标题 / 副标题 / 导航栏外观
//
//   POST /api/appearance
//   headers: x-admin-password
//   body: {
//     avatar?: string,                    // "assets/images/avatar.webp" 或 "/uploads/xxx.webp" 或 http(s) 链接
//     logo?: { type?: string, value?: string, valueDark?: string, alt?: string },
//     title?: string,
//     subtitle?: string,
//     navbar?: { mode?: string, widthFull?: boolean, transparentMode?: string, blur?: number }
//   }
//   -> { ok, path, saved: {...}, note }
//
// 为什么要这个接口：头像 / Logo / 标题 / 导航栏现在都由 `src/data/siteAppearance.json`
// 驱动（构建期读入）。站内「设置」面板要在浏览器里直接改它们，就得把新值写回这个文件，
// 然后由 GitHub Actions 重新构建 —— 约 1 分钟后全站生效（和 /admin/ 保存设置同一个套路）。
//
// 安全：ADMIN_PASSWORD 鉴权；只允许写这一个文件；值都要过白名单校验，
// 防止 `javascript:` 之类的地址被塞进页面。

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";
const FILE_PATH = "src/data/siteAppearance.json";

// 允许的图片地址：站内相对路径（assets/...）、public 路径（/uploads/...）、或 http(s) 外链
const SAFE_PATH = /^(assets\/|https?:\/\/|\/)/;

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

function text(value: unknown, max: number): string | null {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	if (trimmed.length > max) return null;
	return trimmed;
}

function safePath(value: unknown): string | null {
	const raw = text(value, 300);
	if (raw === null) return null;
	if (raw === "") return "";
	if (!SAFE_PATH.test(raw)) return null;
	if (raw.includes("..")) return null;
	return raw;
}

function b64ToUtf8(b64: string): string {
	const bin = atob(b64.replace(/\s/g, ""));
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return new TextDecoder().decode(bytes);
}

async function ghGet(repo: string, branch: string, path: string, token: string) {
	const res = await fetch(`https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`, {
		headers: {
			authorization: `Bearer ${token}`,
			accept: "application/vnd.github+json",
			"user-agent": "yokan-haze-cms",
		},
	});
	if (res.status === 404) return null;
	if (!res.ok) throw new Error(`读取失败 HTTP ${res.status}`);
	return (await res.json()) as { sha?: string; content?: string };
}

async function ghPut(
	repo: string,
	branch: string,
	path: string,
	token: string,
	content: string,
	sha: string | undefined,
	message: string,
) {
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
	if (!res.ok) throw new Error(`提交失败 HTTP ${res.status} ${(await res.text()).slice(0, 160)}`);
	return res.json();
}

type Appearance = {
	avatar?: string;
	title?: string;
	subtitle?: string;
	logo?: { type?: string; value?: string; valueDark?: string; alt?: string };
	navbar?: { mode?: string; widthFull?: boolean; transparentMode?: string; blur?: number };
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) {
		return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	}
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	let payload: Appearance;
	try {
		payload = (await request.json()) as Appearance;
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	const repo = env.GH_REPO || DEFAULT_REPO;
	const branch = env.GH_BRANCH || DEFAULT_BRANCH;

	try {
		// 读现有文件（保留这段逻辑之外的字段，例如以后加的键）
		const existing = await ghGet(repo, branch, FILE_PATH, env.GH_TOKEN);
		const current: Appearance = existing?.content
			? (JSON.parse(b64ToUtf8(existing.content)) as Appearance)
			: {};

		const next: Appearance = { ...current };
		const saved: Record<string, unknown> = {};

		if (payload.avatar !== undefined) {
			const avatar = safePath(payload.avatar);
			if (avatar === null) return json({ ok: false, error: "头像地址不合法" }, 400);
			next.avatar = avatar;
			saved.avatar = avatar;
		}

		if (payload.logo !== undefined) {
			const type = text(payload.logo?.type, 10) ?? "image";
			if (!["icon", "image", "url"].includes(type)) {
				return json({ ok: false, error: "Logo 类型不合法" }, 400);
			}
			const value = safePath(payload.logo?.value);
			if (value === null) return json({ ok: false, error: "Logo 地址不合法" }, 400);
			const valueDark =
				payload.logo?.valueDark === undefined ? current.logo?.valueDark : safePath(payload.logo.valueDark);
			if (valueDark === null) return json({ ok: false, error: "深色 Logo 地址不合法" }, 400);
			const alt = payload.logo?.alt === undefined ? (current.logo?.alt ?? "") : (text(payload.logo.alt, 60) ?? "");
			next.logo = { type, value, alt };
			if (valueDark) next.logo.valueDark = valueDark;
			saved.logo = next.logo;
		}

		if (payload.title !== undefined) {
			const title = text(payload.title, 40);
			if (title === null || title === "") return json({ ok: false, error: "站点标题不能为空（且不超过 40 字）" }, 400);
			next.title = title;
			saved.title = title;
		}

		if (payload.subtitle !== undefined) {
			const subtitle = text(payload.subtitle, 80);
			if (subtitle === null) return json({ ok: false, error: "副标题不能超过 80 字" }, 400);
			next.subtitle = subtitle;
			saved.subtitle = subtitle;
		}

		if (payload.navbar !== undefined) {
			const navbar = { ...(current.navbar ?? {}) };
			const mode = payload.navbar?.mode;
			if (mode !== undefined) {
				if (!["static", "fixed", "dynamic"].includes(String(mode))) {
					return json({ ok: false, error: "导航栏模式不合法" }, 400);
				}
				navbar.mode = String(mode);
			}
			const transparentMode = payload.navbar?.transparentMode;
			if (transparentMode !== undefined) {
				if (!["semi", "semifull", "none"].includes(String(transparentMode))) {
					return json({ ok: false, error: "导航栏透明模式不合法" }, 400);
				}
				navbar.transparentMode = String(transparentMode);
			}
			if (payload.navbar?.widthFull !== undefined) {
				navbar.widthFull = payload.navbar.widthFull === true;
			}
			if (payload.navbar?.blur !== undefined) {
				const blur = Number(payload.navbar.blur);
				if (!Number.isFinite(blur) || blur < 0 || blur > 24) {
					return json({ ok: false, error: "导航栏模糊度要在 0-24 之间" }, 400);
				}
				navbar.blur = Math.round(blur * 10) / 10;
			}
			next.navbar = navbar;
			saved.navbar = navbar;
		}

		if (!Object.keys(saved).length) {
			return json({ ok: false, error: "没有要保存的内容" }, 400);
		}

		const content = JSON.stringify(next, null, 2) + "\n";
		await ghPut(
			repo,
			branch,
			FILE_PATH,
			env.GH_TOKEN,
			content,
			existing?.sha,
			`站点外观：更新 ${Object.keys(saved).join(" / ")}（站内设置面板）`,
		);

		return json({
			ok: true,
			path: FILE_PATH,
			saved,
			note: "已提交到仓库，约 1 分钟后全站生效（构建期间看到的还是旧值）",
		});
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
