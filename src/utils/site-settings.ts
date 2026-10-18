import raw from "@/data/siteSettings.json";

// 全站默认外观的唯一读取入口。
//
// 数据来自 src/data/siteSettings.json —— 由站内设置面板「保存为全站默认」经
// /api/settings 接口写入，改完自动重新构建，所以这里读到的永远是最新值。
//
// 每个字段都带兜底：JSON 里缺字段、类型不对、整个文件被清空，都不会让构建炸掉
// （Pages CMS 保存时会丢掉空值字段，这个坑以前踩过）。
//
// 注意：localStorage 里已有的设置**优先级高于这里** —— 也就是说老访客如果以前
// 在设置面板里动过某项，他看到的仍然是他自己的选择。这是主题的既有行为，
// 想用新默认覆盖他，只能让他清一下浏览器数据。

type Raw = Record<string, unknown>;

const d = raw as Raw;

function str(key: string, fallback: string): string {
	return typeof d[key] === "string" && (d[key] as string).length > 0
		? (d[key] as string)
		: fallback;
}

function num(key: string, fallback: number): number {
	const v = d[key];
	return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function bool(key: string, fallback: boolean): boolean {
	const v = d[key];
	return typeof v === "boolean" ? v : fallback;
}

// 显式声明导出类型：tsconfig 开了 --isolatedDeclarations，
// 导出常量必须能脱离推断独立声明（否则 pnpm type-check 报 TS9013）。
export interface SiteSettings {
	theme: string;
	hue: number;
	wallpaperMode: string;
	fullscreenLayout: string;
	postListLayout: string;
	overlayOpacity: number;
	overlayBlur: number;
	overlayCardOpacity: number;
	wavesEnabled: boolean;
	gradientEnabled: boolean;
	sakuraEnabled: boolean;
	bannerTitleEnabled: boolean;
	bannerCarouselEnabled: boolean;
	cardBorderEnabled: boolean;
	cardFollowThemeEnabled: boolean;
}

export const siteSettings: SiteSettings = {
	// 明暗模式："light" | "dark" | "system"
	theme: str("theme", "dark"),
	// 主题色相 0-360
	hue: num("hue", 165),
	// 壁纸模式："banner" | "fullscreen" | "overlay" | "none"
	wallpaperMode: str("wallpaperMode", "banner"),
	// 全屏壁纸布局
	fullscreenLayout: str("fullscreenLayout", "classic"),
	// 文章列表布局："list" | "grid"
	postListLayout: str("postListLayout", "grid"),
	// 壁纸透明度 / 模糊 / 卡片透明度
	overlayOpacity: num("overlayOpacity", 0.8),
	overlayBlur: num("overlayBlur", 10),
	overlayCardOpacity: num("overlayCardOpacity", 0.28),
	// 各种特效开关
	wavesEnabled: bool("wavesEnabled", true),
	gradientEnabled: bool("gradientEnabled", true),
	sakuraEnabled: bool("sakuraEnabled", true),
	bannerTitleEnabled: bool("bannerTitleEnabled", true),
	bannerCarouselEnabled: bool("bannerCarouselEnabled", false),
	cardBorderEnabled: bool("cardBorderEnabled", false),
	cardFollowThemeEnabled: bool("cardFollowThemeEnabled", false),
};
