/// <reference types="@cloudflare/workers-types" />

// 壁纸接口 —— 站内「设置 → 壁纸」里上传图片 / 视频后保存
//
//   POST /api/wallpapers
//   headers: x-admin-password
//   body: {
//     desktop?: string,   // 电脑端壁纸（单张）："/uploads/xxx.avif"、"assets/..."、http(s)
//     mobile?: string,    // 手机端壁纸（单张）
//     video?: string,     // 背景视频："/uploads/xxx.mp4"、"assets/videos/x.mp4"、http(s)
//     reset?: boolean     // true = 恢复成仓库里原本那套壁纸（d1-d6 / m1-m6 / 4K 视频）
//   }
//   -> { ok, path, saved, note }
//
// 为什么要这个接口：壁纸在构建期从 `src/data/wallpapers.json` 读进来
// （src 里的图片走 Astro 优化、public 下的视频原样发布）。设置面板要能换壁纸，
// 就得把新路径写回这个文件，再让 GitHub Actions 重新构建 —— 约 1 分钟后全站生效。
//
// 注意：**只改指向，不删旧文件**。旧壁纸文件仍留在仓库里，所以「恢复默认」随时能回去。
//
// 安全：ADMIN_PASSWORD 鉴权；只允许写这一个文件；路径白名单
// （assets/、/uploads/、http(s)），拒绝 ".."，防止写到别处或塞 javascript:。

interface Env {
	ADMIN_PASSWORD?: string;
	GH_TOKEN?: string;
	GH_REPO?: string;
	GH_BRANCH?: string;
}

const DEFAULT_REPO = "yokan-haze/yokan-haze-blog";
const DEFAULT_BRANCH = "main";
const FILE_PATH = "src/data/wallpapers.json";

// 仓库里原本那套壁纸（站长 2026-10-17 定的：6 张桌面 + 6 张手机 + 4K 视频）。
// 「恢复默认」写回的就是这三组。
const DEFAULTS = {
	desktop: [
		"assets/images/DesktopWallpaper/d1.avif",
		"assets/images/DesktopWallpaper/d2.avif",
		"assets/images/DesktopWallpaper/d3.avif",
		"assets/images/DesktopWallpaper/d4.avif",
		"assets/images/DesktopWallpaper/d5.avif",
		"assets/images/DesktopWallpaper/d6.avif",
	],
	mobile: [
		"assets/images/MobileWallpaper/m1.avif",
		"assets/images/MobileWallpaper/m2.avif",
		"assets/images/MobileWallpaper/m3.avif",
		"assets/images/MobileWallpaper/m4.avif",
		"assets/images/MobileWallpaper/m5.avif",
		"assets/images/MobileWallpaper/m6.avif",
	],
	videos: ["/assets/videos/silhouette-field-4k.mp4"],
};

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

function safePath(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const raw = value.trim();
	if (!raw || raw.length > 300) return null;
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

type Wallpapers = {
	desktop?: unknown;
	mobile?: unknown;
	videos?: unknown;
	[key: string]: unknown;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
	if (!env.ADMIN_PASSWORD || !env.GH_TOKEN) {
		return json({ ok: false, error: "服务端未配置密码或令牌" }, 503);
	}
	if (!safeEqual(request.headers.get("x-admin-password") || "", env.ADMIN_PASSWORD)) {
		return json({ ok: false, error: "密码不正确" }, 401);
	}

	let payload: { desktop?: string; mobile?: string; video?: string; reset?: boolean };
	try {
		payload = (await request.json()) as typeof payload;
	} catch {
		return json({ ok: false, error: "不是合法的 JSON" }, 400);
	}

	const repo = env.GH_REPO || DEFAULT_REPO;
	const branch = env.GH_BRANCH || DEFAULT_BRANCH;

	try {
		const existing = await ghGet(repo, branch, FILE_PATH, env.GH_TOKEN);
		const current: Wallpapers = existing?.content
			? (JSON.parse(b64ToUtf8(existing.content)) as Wallpapers)
			: {};

		const next: Wallpapers = { ...current };
		const saved: Record<string, unknown> = {};

		if (payload.reset === true) {
			next.desktop = DEFAULTS.desktop;
			next.mobile = DEFAULTS.mobile;
			next.videos = DEFAULTS.videos;
			saved.desktop = DEFAULTS.desktop;
			saved.mobile = DEFAULTS.mobile;
			saved.videos = DEFAULTS.videos;
		} else {
			if (payload.desktop !== undefined) {
				const desktop = safePath(payload.desktop);
				if (desktop === null) return json({ ok: false, error: "电脑端壁纸地址不合法" }, 400);
				next.desktop = [desktop];
				saved.desktop = next.desktop;
			}
			if (payload.mobile !== undefined) {
				const mobile = safePath(payload.mobile);
				if (mobile === null) return json({ ok: false, error: "手机端壁纸地址不合法" }, 400);
				next.mobile = [mobile];
				saved.mobile = next.mobile;
			}
			if (payload.video !== undefined) {
				const video = safePath(payload.video);
				if (video === null) return json({ ok: false, error: "背景视频地址不合法" }, 400);
				next.videos = [video];
				saved.videos = next.videos;
			}
		}

		if (!Object.keys(saved).length) {
			return json({ ok: false, error: "没有要保存的内容" }, 400);
		}

		const content = JSON.stringify(next, null, 2) + "\n";
		const what = payload.reset === true ? "恢复默认壁纸" : `更新 ${Object.keys(saved).join(" / ")}`;
		await ghPut(repo, branch, FILE_PATH, env.GH_TOKEN, content, existing?.sha, `壁纸：${what}（站内设置面板）`);

		return json({
			ok: true,
			path: FILE_PATH,
			saved,
			note: "已提交到仓库，约 1 分钟后新壁纸生效（构建期间还是旧壁纸）",
		});
	} catch (e) {
		return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 502);
	}
};
