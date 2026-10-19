// 「把本机外观设置保存为全站默认」的共用逻辑（2026-10-19 抽出来）
//
// 为什么要有这个文件：这件事原来只有 /admin/ 一个入口，站长每次都要跑到后台去点；
// 现在右上角设置面板也要有同一个按钮。如果两边各写一套「读 localStorage → 还原类型 →
// POST /api/settings」，白名单和类型转换迟早漂移（历史上就因为键名猜错丢过值）。
// 所以：**读取、类型还原、提交、回执文案全部只在这里写一次**，两个入口都调它。
//
// 依赖的后端：functions/api/settings.ts（ADMIN_PASSWORD 鉴权 + 键白名单 + 类型校验）。
// 键名必须和主题真实使用的 localStorage 键一致（theme / postListLayout 这些），
// 不能想当然写成 themeMode / postLayout —— 白名单之外的值会被服务端直接丢弃。

/** 与服务端白名单、主题真实 localStorage 键保持一致（顺序 = 面板里的展示顺序） */
export const SETTING_KEYS = [
	"theme",
	"hue",
	"wallpaperMode",
	"fullscreenLayout",
	"postListLayout",
	"overlayOpacity",
	"overlayBlur",
	"overlayCardOpacity",
	"wavesEnabled",
	"gradientEnabled",
	"sakuraEnabled",
	"bannerTitleEnabled",
	"bannerCarouselEnabled",
	"cardBorderEnabled",
	"cardFollowThemeEnabled",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** 真正的 JSON 值（布尔/数字还原成真实类型，服务端不接受字符串化的 true / 0.8） */
export type SiteSettingsPayload = Partial<Record<SettingKey, string | number | boolean>>;

/** 后台密码在 localStorage 里的键（设置面板和 /admin/ 共用同一个） */
export const SETTINGS_PASSWORD_KEY = "adminPassword";

export function readStoredPassword(): string {
	try {
		return localStorage.getItem(SETTINGS_PASSWORD_KEY) ?? "";
	} catch {
		return "";
	}
}

export function rememberPassword(password: string): void {
	try {
		localStorage.setItem(SETTINGS_PASSWORD_KEY, password);
	} catch {
		// 隐私模式写不进去也不影响本次使用
	}
}

/**
 * 读取当前浏览器里存的外观设置。
 * 主题把布尔存成 "true"/"false"、数字存成字符串，这里还原成真实类型，
 * 否则 /api/settings 的类型校验会把值丢掉。
 */
export function readLocalSettings(): SiteSettingsPayload {
	const out: SiteSettingsPayload = {};
	if (typeof localStorage === "undefined") return out;
	for (const key of SETTING_KEYS) {
		const raw = localStorage.getItem(key);
		if (raw === null) continue;
		if (raw === "true") out[key] = true;
		else if (raw === "false") out[key] = false;
		else if (raw !== "" && !Number.isNaN(Number(raw))) out[key] = Number(raw);
		else out[key] = raw;
	}
	return out;
}

export interface SaveSiteSettingsResult {
	ok: boolean;
	status: number;
	/** 服务端实际写进 siteSettings.json 的键数 */
	savedCount: number;
	error?: string;
}

/**
 * 把外观设置提交为全站默认（写 src/data/siteSettings.json → 触发重新构建，约 1 分钟生效）。
 * @param password 后台密码（ADMIN_PASSWORD）
 * @param settings 不传则读取当前本机设置
 */
export async function saveSiteSettings(
	password: string,
	settings?: SiteSettingsPayload,
): Promise<SaveSiteSettingsResult> {
	const data = settings ?? readLocalSettings();
	const keys = Object.keys(data);
	if (!keys.length) {
		return {
			ok: false,
			status: 0,
			savedCount: 0,
			error: "这台浏览器里没有可保存的设置，先调一下再试",
		};
	}
	if (!password.trim()) {
		return { ok: false, status: 0, savedCount: 0, error: "先填后台密码" };
	}

	const response = await fetch("/api/settings", {
		method: "POST",
		headers: { "content-type": "application/json", "x-admin-password": password.trim() },
		body: JSON.stringify({ settings: data }),
	});

	let body: Record<string, unknown> = {};
	try {
		body = (await response.json()) as Record<string, unknown>;
	} catch {
		body = {};
	}

	if (body.ok === true) {
		const saved = body.saved;
		return {
			ok: true,
			status: response.status,
			savedCount:
				saved && typeof saved === "object"
					? Object.keys(saved).length
					: Object.keys(data).length,
		};
	}

	const error =
		typeof body.error === "string" && body.error ? body.error : "HTTP " + response.status;
	return { ok: false, status: response.status, savedCount: 0, error };
}
