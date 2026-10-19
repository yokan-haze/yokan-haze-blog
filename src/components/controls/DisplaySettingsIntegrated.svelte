<script lang="ts">
import {
	WALLPAPER_BANNER,
	WALLPAPER_FULLSCREEN,
	WALLPAPER_NONE,
	WALLPAPER_OVERLAY,
	DARK_MODE,
	LIGHT_MODE,
	SYSTEM_MODE,
} from "@constants/constants";
import siteAppearanceRaw from "@/data/siteAppearance.json";
import I18nKey from "@i18n/i18nKey";
import { i18n } from "@i18n/translation";
import { getLqipProps } from "@/utils/lqip-utils";
import {
	getDefaultBannerCarouselEnabled,
	getDefaultBannerTitleEnabled,
	getDefaultCardBorderEnabled,
	getDefaultCardFollowThemeEnabled,
	getDefaultFullscreenLayout,
	getDefaultGradientEnabled,
	getDefaultHue,
	getDefaultOverlayBlur,
	getDefaultOverlayCardOpacity,
	getDefaultOverlayOpacity,
	getDefaultSakuraEnabled,
	getDefaultWavesEnabled,
	getHue,
	getStoredBannerCarouselEnabled,
	getStoredBannerTitleEnabled,
	getStoredCardBorderEnabled,
	getStoredCardFollowThemeEnabled,
	getStoredFullscreenLayout,
	getStoredGradientEnabled,
	getStoredOverlayBlur,
	getStoredOverlayCardOpacity,
	getStoredOverlayOpacity,
	getStoredSakuraEnabled,
	getStoredTheme,
	getStoredWallpaperMode,
	getStoredWavesEnabled,
	getStoredWallpaperSource,
	setTheme,
	setWallpaperSource,
	setBannerCarouselEnabled,
	setBannerTitleEnabled,
	setCardBorderEnabled,
	setCardFollowThemeEnabled,
	setFullscreenLayout,
	setGradientEnabled,
	setHue,
	setOverlayBlur,
	setOverlayCardOpacity,
	setOverlayOpacity,
	setSakuraEnabled,
	setWallpaperMode,
	setWavesEnabled,
} from "@utils/setting-utils";
import { onMount } from "svelte";
import Icon from "@/components/common/Icon.svelte";
import {
	backgroundWallpaper,
	displaySettingsConfig,
	siteConfig,
} from "@/config";
import type { FullscreenWallpaperLayout, LIGHT_DARK_MODE, WALLPAPER_MODE } from "@/types/config";

type OverlaySliderItem = {
	key: "opacity" | "blur" | "cardOpacity";
	enabled: boolean;
	label: string;
	displayValue: string;
	ariaLabel: string;
	min: number;
	max: number;
	step: number;
	value: number;
	onValueChange: (value: number) => void;
};

type TabKey = "appearance" | "wallpaper" | "effects" | "site";

// 头像 / Logo 的「当前真实 URL」由 Navbar.astro 在构建期解析好传进来
// （JSON 里存的是 "assets/images/..." 这种 src 源路径，直接当 img src 会 404）。
let { avatarUrl = "", logoUrl = "", wallpaperDesktop = "", wallpaperVideo = "", wallpaperDesktopRaw = "" }: {
	avatarUrl?: string;
	logoUrl?: string;
	wallpaperDesktop?: string;
	wallpaperVideo?: string;
	wallpaperDesktopRaw?: string;
} = $props();

// 站点外观数据（头像 / Logo / 标题 / 导航栏）—— 由 /api/appearance 写回这份 JSON，
// 这里读出来做「当前值」，构建期类型是 JSON 推断的，统一放宽成可选字段。
type AppearanceJson = {
	avatar?: string;
	title?: string;
	subtitle?: string;
	logo?: { type?: string; value?: string; valueDark?: string; alt?: string };
	navbar?: { mode?: string; widthFull?: boolean; transparentMode?: string; blur?: number };
};
const appearance = siteAppearanceRaw as AppearanceJson;

let hue = $state(getHue());
const defaultHue = getDefaultHue();
let wallpaperMode: WALLPAPER_MODE = $state(backgroundWallpaper.mode);
const defaultWallpaperMode = backgroundWallpaper.mode;
let fullscreenLayout: FullscreenWallpaperLayout = $state(
	getDefaultFullscreenLayout(),
);
const defaultFullscreenLayout = getDefaultFullscreenLayout();
let currentLayout: "list" | "grid" = $state("list");
const defaultLayout = siteConfig.postListLayout.defaultMode;
const mobileDefaultLayout =
	siteConfig.postListLayout.mobileDefaultMode || defaultLayout;
let mounted = $state(false);
let isSmallScreen = $state(
	typeof window !== "undefined" ? window.innerWidth < 1200 : false,
);
let isMobileWidth = $state(
	typeof window !== "undefined" ? window.innerWidth < 780 : false,
);
let isMobileViewport = $state(
	typeof window !== "undefined" ? window.innerWidth < 1024 : false,
);
let isSwitching = $state(false);
let wavesEnabled = $state(true);
const defaultWavesEnabled = getDefaultWavesEnabled();
let gradientEnabled = $state(true);
const defaultGradientEnabled = getDefaultGradientEnabled();
let bannerTitleEnabled = $state(true);
const defaultBannerTitleEnabled = getDefaultBannerTitleEnabled();
let bannerCarouselEnabled = $state(true);
const defaultBannerCarouselEnabled = getDefaultBannerCarouselEnabled();
let sakuraEnabled = $state(true);
const defaultSakuraEnabled = getDefaultSakuraEnabled();
let overlayOpacity = $state(getDefaultOverlayOpacity());
const defaultOverlayOpacity = getDefaultOverlayOpacity();
let overlayBlur = $state(getDefaultOverlayBlur());
const defaultOverlayBlur = getDefaultOverlayBlur();
let overlayCardOpacity = $state(getDefaultOverlayCardOpacity());
const defaultOverlayCardOpacity = getDefaultOverlayCardOpacity();
let cardBorderEnabled = $state(false);
const defaultCardBorderEnabled = getDefaultCardBorderEnabled();
let cardFollowThemeEnabled = $state(false);
const defaultCardFollowThemeEnabled = getDefaultCardFollowThemeEnabled();

const isWallpaperSwitchable = displaySettingsConfig.wallpaperModeSwitchable;
const isFullscreenLayoutSwitchable = $derived(
	displaySettingsConfig.fullscreenLayoutSwitchable &&
		wallpaperMode === WALLPAPER_FULLSCREEN,
);
const allowLayoutSwitch = displaySettingsConfig.layoutSwitchable;
let effectiveDefaultLayout = $derived(
	isMobileWidth ? mobileDefaultLayout : defaultLayout,
);
const showThemeColor = displaySettingsConfig.themeColorSwitchable;
const isWavesSwitchable = displaySettingsConfig.wavesSwitchable;
const isGradientSwitchable = displaySettingsConfig.gradientSwitchable;
// 检查是否启用横幅标题配置（功能开关，非用户切换开关）
const isBannerTitleEnabled =
	backgroundWallpaper.common?.homeText?.enable ?? false;
const isBannerTitleSwitchable =
	isBannerTitleEnabled && displaySettingsConfig.bannerTitleSwitchable;
const isBannerCarouselSwitchable =
	displaySettingsConfig.bannerCarouselSwitchable;
const isSakuraSwitchable = displaySettingsConfig.sakuraSwitchable;
const isCardBorderSwitchable = displaySettingsConfig.cardBorderSwitchable;
const isCardFollowThemeSwitchable =
	displaySettingsConfig.cardFollowThemeSwitchable;
// 是否有任何横幅设置可显示（后续添加新设置时在此处添加条件）
const hasBannerSettings =
	isWavesSwitchable ||
	isGradientSwitchable ||
	isBannerTitleSwitchable ||
	isBannerCarouselSwitchable;
const overlaySwitchableConfig = displaySettingsConfig.overlaySwitchable;
const isOverlaySettingsSwitchable =
	typeof overlaySwitchableConfig === "boolean" ? overlaySwitchableConfig : true;
const isOverlayOpacitySwitchable =
	typeof overlaySwitchableConfig === "boolean"
		? overlaySwitchableConfig
		: (overlaySwitchableConfig.opacity ?? false);
const isOverlayBlurSwitchable =
	typeof overlaySwitchableConfig === "boolean"
		? overlaySwitchableConfig
		: (overlaySwitchableConfig.blur ?? false);
const isOverlayCardOpacitySwitchable =
	typeof overlaySwitchableConfig === "boolean"
		? overlaySwitchableConfig
		: (overlaySwitchableConfig.cardOpacity ?? false);
const hasOverlaySettings =
	isOverlaySettingsSwitchable &&
	(isOverlayOpacitySwitchable ||
		isOverlayBlurSwitchable ||
		isOverlayCardOpacitySwitchable);
// 全屏壁纸模式的模糊渐变是否启用（按当前设备读取 fullscreen.blurRamp 配置，未配置默认开启）
const isFullscreenBlurRampEnabled = $derived.by(() => {
	const enable = backgroundWallpaper.fullscreen?.blurRamp?.enable;
	if (typeof enable === "boolean") return enable;
	if (!enable) return true;
	return isMobileViewport ? enable.mobile : enable.desktop;
});
let overlaySettingsIsDefault = $derived(
	(!isOverlayOpacitySwitchable || overlayOpacity === defaultOverlayOpacity) &&
		(!isOverlayBlurSwitchable || overlayBlur === defaultOverlayBlur) &&
		(!isOverlayCardOpacitySwitchable ||
			overlayCardOpacity === defaultOverlayCardOpacity),
);
// 横幅设置是否全部为默认值（用于控制恢复默认按钮的显隐）
let bannerSettingsIsDefault = $derived(
	(!isBannerTitleSwitchable ||
		bannerTitleEnabled === defaultBannerTitleEnabled) &&
		(!isWavesSwitchable || wavesEnabled === defaultWavesEnabled) &&
		(!isGradientSwitchable || gradientEnabled === defaultGradientEnabled) &&
		(!isBannerCarouselSwitchable ||
			bannerCarouselEnabled === defaultBannerCarouselEnabled),
);
let cardSettingsIsDefault = $derived(
	(!isCardBorderSwitchable || cardBorderEnabled === defaultCardBorderEnabled) &&
		(!isCardFollowThemeSwitchable ||
			cardFollowThemeEnabled === defaultCardFollowThemeEnabled),
);

// 站点 tab（头像 / Logo / 标题 / 导航栏 / 明暗）始终存在，所以面板永远有内容。
// 其它开关仍然决定「外观 / 壁纸 / 特效」三个 tab 是否出现。
const hasAnyContent = true;

// --- Tab visibility ---
const hasAppearanceTab = $derived(
	showThemeColor ||
		allowLayoutSwitch ||
		isCardBorderSwitchable ||
		isCardFollowThemeSwitchable,
);
const hasWallpaperTab = $derived(
	isWallpaperSwitchable ||
		isFullscreenLayoutSwitchable ||
		((wallpaperMode === WALLPAPER_OVERLAY ||
			wallpaperMode === WALLPAPER_FULLSCREEN) &&
			hasOverlaySettings) ||
		((wallpaperMode === WALLPAPER_BANNER ||
			wallpaperMode === WALLPAPER_FULLSCREEN) &&
			hasBannerSettings),
);
const hasEffectsTab = $derived(isSakuraSwitchable);

let visibleTabs = $derived.by(() => {
	const tabs: { key: TabKey; icon: string; label: string }[] = [];
	if (hasAppearanceTab)
		tabs.push({
			key: "appearance",
			icon: "material-symbols:palette",
			label: i18n(I18nKey.settingsTabAppearance),
		});
	if (hasWallpaperTab)
		tabs.push({
			key: "wallpaper",
			icon: "material-symbols:wallpaper",
			label: i18n(I18nKey.settingsTabWallpaper),
		});
	if (hasEffectsTab)
		tabs.push({
			key: "effects",
			icon: "mdi:flower-poppy",
			label: i18n(I18nKey.settingsTabEffects),
		});
	// 站点外观（头像 / Logo / 标题 / 导航栏 / 明暗）—— 2026-10-19 新增，始终可见
	tabs.push({
		key: "site",
		icon: "material-symbols:settings-rounded",
		label: "站点",
	});
	return tabs;
});

let showTabBar = $derived(visibleTabs.length > 1);
let activeTab = $state<TabKey>("appearance");

// ── 站点 tab（2026-10-19 新增）─────────────────────────────────────────
// 头像 / Logo / 标题 / 导航栏外观 = 构建期数据（src/data/siteAppearance.json）。
// 在这个面板里改完点「保存到站点」，会调用 /api/appearance 写回仓库并触发重建
// （约 1 分钟生效）。上传图片复用 /api/upload，和其它后台接口共用 ADMIN_PASSWORD。
// 明暗模式是**本机即时生效**（localStorage），不写入仓库。
let themeMode = $state<LIGHT_DARK_MODE>(
	typeof window !== "undefined" ? getStoredTheme() : LIGHT_MODE,
);
let avatarRaw = $state(appearance.avatar ?? "");
let avatarPreview = $state(avatarUrl);
let logoValue = $state(appearance.logo?.value ?? "");
let logoValueDark = $state(appearance.logo?.valueDark ?? "");
// Logo 预览：刚上传的 /uploads 路径直接能用；否则用构建期解析好的 URL
let logoPreview = $state(
	logoValue.startsWith("/") || logoValue.startsWith("http") ? logoValue : logoUrl,
);
let siteTitleValue = $state(appearance.title ?? siteConfig.title);
let navbarStyle = $state<"semi" | "semifull" | "none">(
	(backgroundWallpaper.banner?.navbar?.transparentMode ?? "semi") as "semi" | "semifull" | "none",
);
let navbarBlur = $state(backgroundWallpaper.banner?.navbar?.blur ?? 12);
let navbarFull = $state(siteConfig.navbar.widthFull === true);
let navbarModeValue = $state<"static" | "fixed" | "dynamic">(
	(siteConfig.navbar.navbarMode ?? "dynamic") as "static" | "fixed" | "dynamic",
);

// 导航栏外观（透明程度 / 固定方式 / 模糊 / 满宽）以前点了没反应 ——
// 因为那几个值要「保存到站点 + 重新构建」才生效。现在点一下先改当前页面的 DOM，
// 当场就能看到效果；保存到站点后才是全站生效。
function applyNavbarPreview(): void {
	if (typeof document === "undefined") return;
	const nav = document.getElementById("navbar");
	if (nav) {
		nav.setAttribute("data-transparent-mode", navbarStyle);
		nav.style.setProperty("--navbar-glass-blur", `${navbarBlur}px`);
		nav.setAttribute("data-full-width", String(navbarFull));
	}
	document.body.classList.toggle("sticky-navbar", navbarModeValue === "fixed");
	document.body.classList.toggle("dynamic-navbar", navbarModeValue === "dynamic");
}

function pickNavbarStyle(value: "semi" | "semifull" | "none"): void {
	navbarStyle = value;
	applyNavbarPreview();
}

function pickNavbarMode(value: "static" | "fixed" | "dynamic"): void {
	navbarModeValue = value;
	applyNavbarPreview();
}
let adminPassword = $state("");
let siteBusy = $state(false);
let siteStatus = $state("");

// ── 壁纸图片 / 背景视频（2026-10-19）────────────────────────────────────
// 上传后先更新本地预览，点「保存壁纸」才写回 src/data/wallpapers.json（约 1 分钟生效）。
// 只想改上传哪一项就只提交哪一项，不会把另外两项冲掉。
let desktopPath = $state("");
let videoPath = $state("");
let desktopPreview = $state(wallpaperDesktop);
let videoPreview = $state(wallpaperVideo);
let wallpaperBusy = $state(false);
let wallpaperStatus = $state("");

// 壁纸来源：电脑壁纸 / 背景视频（本机即时生效，2026-10-19 站长要求）
let wallpaperSource = $state<"image" | "video">("video");

function pickWallpaperSource(next: "image" | "video"): void {
	wallpaperSource = next;
	setWallpaperSource(next);
}

function fileNameOf(url: string): string {
	if (!url) return "";
	try {
		const clean = url.split("?")[0].split("#")[0];
		return decodeURIComponent(clean.substring(clean.lastIndexOf("/") + 1)) || url;
	} catch {
		return url;
	}
}

// 壁纸三行：电脑端 / 背景视频（手机端壁纸按站长 2026-10-19 要求删掉了）
const WALLPAPER_ROWS: { kind: "desktop" | "video"; label: string; action: string; accept: string }[] = [
	{ kind: "desktop", label: "电脑端壁纸", action: "换图", accept: "image/*" },
	{ kind: "video", label: "背景视频", action: "换视频", accept: "video/*" },
];

// 当前壁纸的「底色」：用构建期生成的 LQIP 渐变（不依赖能不能拿到优化后的图片 URL，
// 线上 CI 构建时那个 URL 有时拿不到，有渐变至少能看出是哪张壁纸）
let desktopThumbStyle = $derived(wallpaperDesktopRaw ? getLqipProps(wallpaperDesktopRaw, "").style : "");

async function uploadWallpaper(file: File, kind: "desktop" | "video"): Promise<void> {
	if (!adminPassword.trim()) {
		wallpaperStatus = "先填后台密码（上传与保存都要它）";
		return;
	}
	wallpaperStatus = `正在上传 ${file.name}（${(file.size / 1048576).toFixed(1)} MB）……`;
	try {
		// 原始字节直传：不压缩、不转码，文件多大就传多大（服务端也不做任何处理）
		const res = await fetch("/api/upload", {
			method: "POST",
			headers: {
				"content-type": file.type || "application/octet-stream",
				"x-filename": encodeURIComponent(file.name),
				"x-admin-password": adminPassword.trim(),
			},
			body: file,
		});
		const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
		if (!body.ok || !body.url) {
			wallpaperStatus = `✗ 上传失败：${body.error ?? "HTTP " + res.status}`;
			return;
		}
		if (kind === "desktop") {
			desktopPath = body.url;
			desktopPreview = body.url;
		} else {
			videoPath = body.url;
			videoPreview = body.url;
		}
		wallpaperStatus = `✓ 已上传 ${body.url} —— 还要点下面「保存壁纸」才会生效`;
	} catch (e) {
		wallpaperStatus = `✗ 上传失败：${String(e)}`;
	}
}

async function saveWallpapers(reset = false): Promise<void> {
	if (!adminPassword.trim()) {
		wallpaperStatus = "先填后台密码";
		return;
	}
	const payload: Record<string, unknown> = {};
	if (reset) payload.reset = true;
	else {
		if (desktopPath) payload.desktop = desktopPath;
		if (videoPath) payload.video = videoPath;
		if (!Object.keys(payload).length) {
			wallpaperStatus = "还没上传新壁纸";
			return;
		}
	}
	wallpaperBusy = true;
	wallpaperStatus = "正在提交……";
	try {
		const res = await fetch("/api/wallpapers", {
			method: "POST",
			headers: { "content-type": "application/json", "x-admin-password": adminPassword.trim() },
			body: JSON.stringify(payload),
		});
		const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
		if (!body.ok) {
			wallpaperStatus = `✗ ${body.error ?? "HTTP " + res.status}`;
			return;
		}
		try {
			localStorage.setItem("adminPassword", adminPassword.trim());
		} catch {
			// ignore
		}
		wallpaperStatus = reset
			? "✓ 已恢复默认壁纸，约 1 分钟后生效"
			: "✓ 已保存，约 1 分钟后换成新壁纸（构建完成前看到的还是旧的）";
	} catch (e) {
		wallpaperStatus = `✗ 请求失败：${String(e)}`;
	} finally {
		wallpaperBusy = false;
	}
}

function onPickWallpaper(event: Event, kind: "desktop" | "video"): void {
	const input = event.currentTarget as HTMLInputElement | null;
	const file = input?.files?.[0];
	if (input) input.value = "";
	if (file) void uploadWallpaper(file, kind);
}

onMount(() => {
	try {
		adminPassword = localStorage.getItem("adminPassword") ?? "";
	} catch {
		// 隐私模式读不到就算了
	}
	themeMode = getStoredTheme();
	wallpaperSource = getStoredWallpaperSource();
});

function pickTheme(next: LIGHT_DARK_MODE): void {
	themeMode = next;
	setTheme(next);
}

function onPickFile(event: Event, target: "avatar" | "logo" | "logoDark"): void {
	const input = event.currentTarget as HTMLInputElement | null;
	const file = input?.files?.[0];
	if (input) input.value = "";
	if (file) void uploadForSite(file, target);
}

async function uploadForSite(file: File, target: "avatar" | "logo" | "logoDark"): Promise<void> {
	if (!adminPassword.trim()) {
		siteStatus = "先填后台密码（上传与保存都要它）";
		return;
	}
	siteStatus = `正在上传 ${file.name}（${(file.size / 1048576).toFixed(1)} MB）……`;
	try {
		// 原始字节直传：不压缩、不转码，文件多大就传多大（服务端也不做任何处理）
		const res = await fetch("/api/upload", {
			method: "POST",
			headers: {
				"content-type": file.type || "application/octet-stream",
				"x-filename": encodeURIComponent(file.name),
				"x-admin-password": adminPassword.trim(),
			},
			body: file,
		});
		const body = (await res.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
		if (!body.ok || !body.url) {
			siteStatus = `✗ 上传失败：${body.error ?? "HTTP " + res.status}`;
			return;
		}
		if (target === "avatar") {
			avatarRaw = body.url;
			avatarPreview = body.url;
		} else if (target === "logo") {
			logoValue = body.url;
			logoPreview = body.url;
		} else {
			logoValueDark = body.url;
		}
		siteStatus = `✓ 已上传 ${body.url} —— 还要点下面「保存到站点」才会生效`;
	} catch (e) {
		siteStatus = `✗ 上传失败：${String(e)}`;
	}
}

async function saveAppearance(): Promise<void> {
	if (!adminPassword.trim()) {
		siteStatus = "先填后台密码";
		return;
	}
	if (!siteTitleValue.trim()) {
		siteStatus = "站点标题不能为空";
		return;
	}
	siteBusy = true;
	siteStatus = "正在提交……";
	try {
		// Logo 没设就不提交：避免把导航栏 Logo 清空
		const payload: Record<string, unknown> = {
			avatar: avatarRaw,
			title: siteTitleValue.trim(),
			// 副标题的输入框已经按站长要求删掉，这里不再提交（服务端看到缺省会保留原值）
			navbar: {
				mode: navbarModeValue,
				widthFull: navbarFull,
				transparentMode: navbarStyle,
				blur: navbarBlur,
			},
		};
		if (logoValue.trim()) {
			// 注意：不再下发 valueDark（深色 Logo 的入口已按站长要求删掉），
			// 服务端看到字段缺省会保留原来的深色 Logo，不会把它清空。
			payload.logo = {
				type: "image",
				value: logoValue.trim(),
				alt: appearance.logo?.alt ?? "",
			};
		}
		const res = await fetch("/api/appearance", {
			method: "POST",
			headers: { "content-type": "application/json", "x-admin-password": adminPassword.trim() },
			body: JSON.stringify(payload),
		});
		const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
		if (!body.ok) {
			siteStatus = `✗ ${body.error ?? "HTTP " + res.status}`;
			return;
		}
		try {
			localStorage.setItem("adminPassword", adminPassword.trim());
		} catch {
			// ignore
		}
		siteStatus = "✓ 已保存，约 1 分钟后全站生效（构建完成前看到的还是旧值）";
	} catch (e) {
		siteStatus = `✗ 请求失败：${String(e)}`;
	} finally {
		siteBusy = false;
	}
}

// Auto-switch active tab if it becomes invisible
$effect(() => {
	if (!visibleTabs.find((t) => t.key === activeTab) && visibleTabs.length > 0) {
		activeTab = visibleTabs[0].key;
	}
});

// Auto-switch to wallpaper tab when entering overlay/fullscreen mode
$effect(() => {
	if (
		(wallpaperMode === WALLPAPER_OVERLAY ||
			wallpaperMode === WALLPAPER_FULLSCREEN) &&
		hasOverlaySettings
	) {
		activeTab = "wallpaper";
	}
});

let overlaySliderItems = $derived<OverlaySliderItem[]>([
	{
		key: "opacity",
		// 全屏壁纸模式不需要背景透明度，隐藏该滑块（仍显示模糊与卡片透明度）
		enabled:
			isOverlayOpacitySwitchable && wallpaperMode !== WALLPAPER_FULLSCREEN,
		label: i18n(I18nKey.overlayOpacity),
		displayValue: `${Math.round(overlayOpacity * 100)}%`,
		ariaLabel: i18n(I18nKey.overlayOpacity),
		min: 20,
		max: 100,
		step: 1,
		value: Math.round(overlayOpacity * 100),
		onValueChange: (value) => {
			overlayOpacity = value / 100;
		},
	},
	{
		key: "blur",
		// 全屏壁纸模式关闭模糊渐变时隐藏模糊滑块（overlay 模式不受影响）
		enabled:
			isOverlayBlurSwitchable &&
			!(wallpaperMode === WALLPAPER_FULLSCREEN && !isFullscreenBlurRampEnabled),
		label: i18n(I18nKey.overlayBlur),
		displayValue: `${overlayBlur.toFixed(1)}px`,
		ariaLabel: i18n(I18nKey.overlayBlur),
		min: 0,
		max: 20,
		step: 0.5,
		value: overlayBlur,
		onValueChange: (value) => {
			overlayBlur = value;
		},
	},
	{
		key: "cardOpacity",
		enabled: isOverlayCardOpacitySwitchable,
		label: i18n(I18nKey.overlayCardOpacity),
		displayValue: `${Math.round(overlayCardOpacity * 100)}%`,
		ariaLabel: i18n(I18nKey.overlayCardOpacity),
		min: 20,
		max: 100,
		step: 1,
		value: Math.round(overlayCardOpacity * 100),
		onValueChange: (value) => {
			overlayCardOpacity = value / 100;
		},
	},
]);
// 当前模式下是否有任何 overlay 滑块实际可见（模糊滑块可能因关闭模糊渐变而隐藏）
let hasVisibleOverlaySlider = $derived(
	overlaySliderItems.some((item) => item.enabled),
);

function resetHue() {
	hue = getDefaultHue();
	requestAnimationFrame(refreshAllRangeProgress);
}

function resetWallpaperMode() {
	wallpaperMode = defaultWallpaperMode;
	setWallpaperMode(defaultWallpaperMode);
}

function resetFullscreenLayout() {
	fullscreenLayout = defaultFullscreenLayout;
	setFullscreenLayout(defaultFullscreenLayout);
}

function switchFullscreenLayout(layout: FullscreenWallpaperLayout) {
	if (fullscreenLayout === layout) return;
	fullscreenLayout = layout;
	setFullscreenLayout(layout);
}

function resetLayout() {
	currentLayout = effectiveDefaultLayout;
	localStorage.removeItem("postListLayout");

	// 触发自定义事件，通知页面布局已改变
	const event = new CustomEvent("layoutChange", {
		detail: { layout: effectiveDefaultLayout },
	});
	window.dispatchEvent(event);
}

function resetWavesEnabled() {
	wavesEnabled = defaultWavesEnabled;
	setWavesEnabled(defaultWavesEnabled);
}

function resetGradientEnabled() {
	gradientEnabled = defaultGradientEnabled;
	setGradientEnabled(defaultGradientEnabled);
}

function resetBannerSettings() {
	if (
		isBannerTitleSwitchable &&
		bannerTitleEnabled !== defaultBannerTitleEnabled
	) {
		bannerTitleEnabled = defaultBannerTitleEnabled;
		setBannerTitleEnabled(defaultBannerTitleEnabled);
	}
	if (isWavesSwitchable && wavesEnabled !== defaultWavesEnabled) {
		wavesEnabled = defaultWavesEnabled;
		setWavesEnabled(defaultWavesEnabled);
	}
	if (isGradientSwitchable && gradientEnabled !== defaultGradientEnabled) {
		gradientEnabled = defaultGradientEnabled;
		setGradientEnabled(defaultGradientEnabled);
	}
	if (
		isBannerCarouselSwitchable &&
		bannerCarouselEnabled !== defaultBannerCarouselEnabled
	) {
		bannerCarouselEnabled = defaultBannerCarouselEnabled;
		setBannerCarouselEnabled(defaultBannerCarouselEnabled);
	}
}

function resetOverlaySettings() {
	if (isOverlayOpacitySwitchable && overlayOpacity !== defaultOverlayOpacity) {
		overlayOpacity = defaultOverlayOpacity;
		setOverlayOpacity(defaultOverlayOpacity);
	}
	if (isOverlayBlurSwitchable && overlayBlur !== defaultOverlayBlur) {
		overlayBlur = defaultOverlayBlur;
		setOverlayBlur(defaultOverlayBlur);
	}
	if (
		isOverlayCardOpacitySwitchable &&
		overlayCardOpacity !== defaultOverlayCardOpacity
	) {
		overlayCardOpacity = defaultOverlayCardOpacity;
		setOverlayCardOpacity(defaultOverlayCardOpacity);
	}

	requestAnimationFrame(refreshAllRangeProgress);
}

function toggleWavesEnabled() {
	wavesEnabled = !wavesEnabled;
	setWavesEnabled(wavesEnabled);
}

function toggleGradientEnabled() {
	gradientEnabled = !gradientEnabled;
	setGradientEnabled(gradientEnabled);
}

function toggleBannerTitleEnabled() {
	bannerTitleEnabled = !bannerTitleEnabled;
	setBannerTitleEnabled(bannerTitleEnabled);
}

function toggleBannerCarouselEnabled() {
	bannerCarouselEnabled = !bannerCarouselEnabled;
	setBannerCarouselEnabled(bannerCarouselEnabled);
}

function toggleSakuraEnabled() {
	sakuraEnabled = !sakuraEnabled;
	setSakuraEnabled(sakuraEnabled);
}

function toggleCardBorderEnabled() {
	cardBorderEnabled = !cardBorderEnabled;
	setCardBorderEnabled(cardBorderEnabled);
}

function toggleCardFollowThemeEnabled() {
	cardFollowThemeEnabled = !cardFollowThemeEnabled;
	setCardFollowThemeEnabled(cardFollowThemeEnabled);
}

function resetCardSettings() {
	if (
		isCardBorderSwitchable &&
		cardBorderEnabled !== defaultCardBorderEnabled
	) {
		cardBorderEnabled = defaultCardBorderEnabled;
		setCardBorderEnabled(defaultCardBorderEnabled);
	}
	if (
		isCardFollowThemeSwitchable &&
		cardFollowThemeEnabled !== defaultCardFollowThemeEnabled
	) {
		cardFollowThemeEnabled = defaultCardFollowThemeEnabled;
		setCardFollowThemeEnabled(defaultCardFollowThemeEnabled);
	}
}

function switchWallpaperMode(newMode: WALLPAPER_MODE) {
	wallpaperMode = newMode;
	setWallpaperMode(newMode);
	window.scrollTo({ top: 0 });

	if (newMode === WALLPAPER_OVERLAY || newMode === WALLPAPER_FULLSCREEN) {
		requestAnimationFrame(refreshAllRangeProgress);
	}
}

function checkScreenSize() {
	isSmallScreen = window.innerWidth < 1200;
	isMobileWidth = window.innerWidth < 780;
	isMobileViewport = window.innerWidth < 1024;
	// 低于380px强制网格模式
	if (window.innerWidth < 380 && currentLayout === "list") {
		currentLayout = "grid";
		const event = new CustomEvent("layoutChange", {
			detail: { layout: "grid" },
		});
		window.dispatchEvent(event);
	}
}

function updateRangeProgress(input: HTMLInputElement) {
	const min = Number(input.min || 0);
	const max = Number(input.max || 100);
	const value = Number(input.value || 0);
	const progress = ((value - min) * 100) / (max - min || 1);
	input.style.setProperty(
		"--range-progress",
		`${Math.min(100, Math.max(0, progress))}%`,
	);
}

function refreshAllRangeProgress() {
	const panel = document.getElementById("display-setting");
	if (!panel) return;

	const rangeInputs = Array.from(
		panel.querySelectorAll('input[type="range"]'),
	) as HTMLInputElement[];

	rangeInputs.forEach((input) => {
		updateRangeProgress(input);
	});
}

function switchLayout() {
	if (!mounted || isSwitching) return;

	isSwitching = true;
	currentLayout = currentLayout === "list" ? "grid" : "list";
	localStorage.setItem("postListLayout", currentLayout);

	// 触发自定义事件，通知页面布局已改变
	const event = new CustomEvent("layoutChange", {
		detail: { layout: currentLayout },
	});
	window.dispatchEvent(event);

	// 动画完成后重置状态
	setTimeout(() => {
		isSwitching = false;
	}, 500);
}

onMount(() => {
	mounted = true;
	checkScreenSize();

	// 从localStorage读取保存的壁纸模式
	wallpaperMode = getStoredWallpaperMode();

	// 从localStorage读取保存的全屏壁纸布局
	fullscreenLayout = getStoredFullscreenLayout();

	// 从localStorage读取水波纹动画状态
	wavesEnabled = getStoredWavesEnabled();

	// 从localStorage读取渐变过渡状态
	gradientEnabled = getStoredGradientEnabled();

	// 从localStorage读取横幅标题状态
	bannerTitleEnabled = getStoredBannerTitleEnabled();

	// 从localStorage读取横幅轮播状态
	bannerCarouselEnabled = getStoredBannerCarouselEnabled();

	// 从localStorage读取樱花特效状态
	sakuraEnabled = getStoredSakuraEnabled();

	// 从localStorage读取卡片样式状态
	cardBorderEnabled = getStoredCardBorderEnabled();
	cardFollowThemeEnabled = getStoredCardFollowThemeEnabled();

	// 从localStorage读取全屏透明设置状态
	overlayOpacity = getStoredOverlayOpacity();
	overlayBlur = getStoredOverlayBlur();
	overlayCardOpacity = getStoredOverlayCardOpacity();

	// 从localStorage读取用户偏好布局
	const savedLayout = localStorage.getItem("postListLayout");
	if (savedLayout && (savedLayout === "list" || savedLayout === "grid")) {
		currentLayout = savedLayout;
	} else {
		currentLayout =
			window.innerWidth < 780 ? mobileDefaultLayout : defaultLayout;
	}

	// 监听窗口大小变化
	window.addEventListener("resize", checkScreenSize);

	return () => {
		window.removeEventListener("resize", checkScreenSize);
	};
});

// 监听布局变化事件
onMount(() => {
	const handleCustomEvent = (event: Event) => {
		const customEvent = event as CustomEvent<{ layout: "list" | "grid" }>;
		currentLayout = customEvent.detail.layout;
	};

	window.addEventListener("layoutChange", handleCustomEvent);

	return () => {
		window.removeEventListener("layoutChange", handleCustomEvent);
	};
});

onMount(() => {
	const panel = document.getElementById("display-setting");
	if (!panel) return;

	const handleRangeInput = (event: Event) => {
		const target = event.target;
		if (target instanceof HTMLInputElement && target.type === "range") {
			updateRangeProgress(target);
		}
	};

	refreshAllRangeProgress();
	panel.addEventListener("input", handleRangeInput);

	return () => {
		panel.removeEventListener("input", handleRangeInput);
	};
});

onMount(() => {
	const handleWallpaperModeChange = (event: Event) => {
		const customEvent = event as CustomEvent<{ mode: WALLPAPER_MODE }>;
		wallpaperMode = customEvent.detail.mode;
	};

	window.addEventListener("wallpaperModeChange", handleWallpaperModeChange);

	return () => {
		window.removeEventListener(
			"wallpaperModeChange",
			handleWallpaperModeChange,
		);
	};
});

$effect(() => {
	if (hue || hue === 0) {
		setHue(hue);
	}
});

$effect(() => {
	if (wallpaperMode === WALLPAPER_OVERLAY) {
		if (isOverlayOpacitySwitchable) {
			setOverlayOpacity(overlayOpacity);
		}
		if (isOverlayBlurSwitchable) {
			setOverlayBlur(overlayBlur);
		}
		if (isOverlayCardOpacitySwitchable) {
			setOverlayCardOpacity(overlayCardOpacity);
		}
	} else if (wallpaperMode === WALLPAPER_FULLSCREEN) {
		// 全屏壁纸不透明，只应用模糊与卡片透明度
		if (isOverlayBlurSwitchable) {
			setOverlayBlur(overlayBlur);
		}
		if (isOverlayCardOpacitySwitchable) {
			setOverlayCardOpacity(overlayCardOpacity);
		}
	}
});

// Tab 切换后刷新滑块进度（overlay 滑块在 DOM 中才生效）
$effect(() => {
	// eslint-disable-next-line @typescript-eslint/no-unused-expressions
	activeTab;
	requestAnimationFrame(refreshAllRangeProgress);
});
</script>

{#if hasAnyContent}
<div id="display-setting" class="float-panel float-panel-closed absolute transition-all w-80 right-4 px-3 pt-0 pb-3 max-h-[80vh] overflow-y-auto custom-scrollbar" data-floating-panel data-floating-panel-trigger="display-settings-switch" inert aria-hidden="true">
	<!-- Tab Bar -->
	{#if showTabBar}
	<div class="flex gap-1 border-b border-black/5 dark:border-white/10 pt-3 pb-1 mb-3">
		{#each visibleTabs as tab (tab.key)}
			<button
				class="focus-ring-inset flex-1 flex flex-col items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium transition-colors rounded-lg min-w-0
					{activeTab === tab.key
						? 'bg-(--btn-plain-bg-hover) text-(--primary)'
						: 'text-gray-500 dark:text-gray-400 hover:bg-(--btn-plain-bg-hover) hover:text-gray-700 dark:hover:text-gray-300'}"
				onclick={() => activeTab = tab.key}
			>
				<Icon icon={tab.icon} class="text-[1.5rem] shrink-0"></Icon>
				<span class="truncate">{tab.label}</span>
			</button>
		{/each}
	</div>
	{/if}

	<!-- Appearance Tab: Theme Color + Layout -->
	{#if activeTab === "appearance"}
		<!-- Theme Color Section -->
		{#if showThemeColor}
		<div class="">
			<div class="section-title">
				{i18n(I18nKey.themeColor)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={hue === defaultHue} class:pointer-events-none={hue === defaultHue}
						disabled={hue === defaultHue} aria-hidden={hue === defaultHue ? "true" : undefined} onclick={resetHue}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
				<div id="hueValue" class="transition bg-(--btn-regular-bg) rounded-md flex justify-center
				font-bold items-center text-(--btn-content)">
					{hue}
				</div>
			</div>
			<div class="hue-slider-shell w-full h-6 px-1 bg-[oklch(0.80_0.10_0)] dark:bg-[oklch(0.70_0.10_0)] rounded-md select-none">
				<input aria-label={i18n(I18nKey.themeColor)} type="range" min="0" max="360" bind:value={hue}
					   class="slider" id="colorSlider" step="5" style="width: 100%">
			</div>
		</div>
		{/if}

		<!-- Layout Switch Section -->
		{#if allowLayoutSwitch}
		<div class="">
			<div class="section-title">
				{i18n(I18nKey.postListLayout)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={currentLayout === effectiveDefaultLayout} class:pointer-events-none={currentLayout === effectiveDefaultLayout}
						disabled={currentLayout === effectiveDefaultLayout} aria-hidden={currentLayout === effectiveDefaultLayout ? "true" : undefined} onclick={resetLayout}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="flex gap-2">
				<button
					aria-label={i18n(I18nKey.postListLayoutList)}
					class="flex-1 btn-regular rounded-md py-2 px-3 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={currentLayout !== 'list'}
					class:bg-(--btn-regular-bg-hover)={currentLayout === 'list'}
					disabled={isSwitching}
					onclick={switchLayout}
					title={i18n(I18nKey.postListLayoutList)}
				>
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
					</svg>
					<span class="text-xs font-medium">{i18n(I18nKey.postListLayoutList)}</span>
				</button>
				<button
					aria-label={i18n(I18nKey.postListLayoutGrid)}
					class="flex-1 btn-regular rounded-md py-2 px-3 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={currentLayout !== 'grid'}
					class:bg-(--btn-regular-bg-hover)={currentLayout === 'grid'}
					disabled={isSwitching}
					onclick={switchLayout}
					title={i18n(I18nKey.postListLayoutGrid)}
				>
					<svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
						<path d="M3 3h7v7H3V3zm0 11h7v7H3v-7zm11-11h7v7h-7V3zm0 11h7v7h-7v-7z"/>
					</svg>
					<span class="text-xs font-medium">{i18n(I18nKey.postListLayoutGrid)}</span>
				</button>
			</div>
		</div>
		{/if}

		<!-- Card Settings Section -->
		{#if isCardBorderSwitchable || isCardFollowThemeSwitchable}
		<div>
			<div class="section-title">
				{i18n(I18nKey.cardSettings)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={cardSettingsIsDefault} class:pointer-events-none={cardSettingsIsDefault}
						disabled={cardSettingsIsDefault} aria-hidden={cardSettingsIsDefault ? "true" : undefined} onclick={resetCardSettings}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="space-y-1">
				{#if isCardBorderSwitchable}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={cardBorderEnabled}
					onclick={toggleCardBorderEnabled}
				>
					<Icon icon="material-symbols:border-outer-rounded" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.cardBorder)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={cardBorderEnabled}
						 class:bg-(--btn-regular-bg-active)={!cardBorderEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!cardBorderEnabled}
							 class:left-5={cardBorderEnabled}></div>
					</div>
				</button>
				{/if}
				{#if isCardFollowThemeSwitchable}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={cardFollowThemeEnabled}
					onclick={toggleCardFollowThemeEnabled}
				>
					<Icon icon="material-symbols:palette" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.cardFollowTheme)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={cardFollowThemeEnabled}
						 class:bg-(--btn-regular-bg-active)={!cardFollowThemeEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!cardFollowThemeEnabled}
							 class:left-5={cardFollowThemeEnabled}></div>
					</div>
				</button>
				{/if}
			</div>
		</div>
		{/if}
	{/if}

	<!-- Wallpaper Tab: Mode + Overlay + Banner Settings -->
	{#if activeTab === "wallpaper"}
		<!-- Wallpaper Mode Section -->
		{#if isWallpaperSwitchable}
		<div>
			<div class="section-title">
				{i18n(I18nKey.wallpaperMode)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={wallpaperMode === defaultWallpaperMode} class:pointer-events-none={wallpaperMode === defaultWallpaperMode}
						disabled={wallpaperMode === defaultWallpaperMode} aria-hidden={wallpaperMode === defaultWallpaperMode ? "true" : undefined} onclick={resetWallpaperMode}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="grid grid-cols-3 gap-2">
				<button
					class="btn-regular rounded-md py-2 px-2 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={wallpaperMode !== WALLPAPER_BANNER}
					class:bg-(--btn-regular-bg-hover)={wallpaperMode === WALLPAPER_BANNER}
					onclick={() => switchWallpaperMode(WALLPAPER_BANNER)}
				>
					<Icon icon="material-symbols:image-outline" class="text-[1.15rem] shrink-0"></Icon>
					<span class="text-xs font-medium">{i18n(I18nKey.wallpaperBannerMode)}</span>
				</button>
				<button
					class="btn-regular rounded-md py-2 px-2 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={wallpaperMode !== WALLPAPER_FULLSCREEN}
					class:bg-(--btn-regular-bg-hover)={wallpaperMode === WALLPAPER_FULLSCREEN}
					onclick={() => switchWallpaperMode(WALLPAPER_FULLSCREEN)}
				>
					<Icon icon="material-symbols:wallpaper" class="text-[1.15rem] shrink-0"></Icon>
					<span class="text-xs font-medium">{i18n(I18nKey.wallpaperFullscreenMode)}</span>
				</button>
				<button
					class="btn-regular rounded-md py-2 px-2 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={wallpaperMode !== WALLPAPER_OVERLAY}
					class:bg-(--btn-regular-bg-hover)={wallpaperMode === WALLPAPER_OVERLAY}
					onclick={() => switchWallpaperMode(WALLPAPER_OVERLAY)}
				>
					<Icon icon="material-symbols:full-coverage-outline-rounded" class="text-[1.15rem] shrink-0"></Icon>
					<span class="text-xs font-medium">{i18n(I18nKey.wallpaperOverlayMode)}</span>
				</button>
				<!-- 原来的「纯色背景」按钮按站长要求去掉了（2026-10-19），
				     那个位置换成下面的「壁纸来源」切换：电脑壁纸 ↔ 背景视频 -->
			</div>
		</div>
		{/if}

		<!-- 壁纸来源：电脑壁纸 / 背景视频（2026-10-19 站长要求可以自由切换） -->
		<div>
			<div class="section-title">
				壁纸来源
				<span class="text-[0.7rem] font-normal opacity-70">只对这台设备生效</span>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<button
					class="btn-regular rounded-md py-2 px-2 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={wallpaperSource !== "image"}
					class:bg-(--btn-regular-bg-hover)={wallpaperSource === "image"}
					onclick={() => pickWallpaperSource("image")}
				>
					<Icon icon="material-symbols:image-outline" class="text-[1.15rem] shrink-0"></Icon>
					<span class="text-xs font-medium">电脑壁纸</span>
				</button>
				<button
					class="btn-regular rounded-md py-2 px-2 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={wallpaperSource !== "video"}
					class:bg-(--btn-regular-bg-hover)={wallpaperSource === "video"}
					onclick={() => pickWallpaperSource("video")}
				>
					<Icon icon="material-symbols:movie-outline" class="text-[1.15rem] shrink-0"></Icon>
					<span class="text-xs font-medium">背景视频</span>
				</button>
			</div>
			<div class="text-[0.68rem] leading-5 opacity-60 mt-1">
				想让所有人都看到同一个，就选好之后用「保存壁纸」旁边的说明里的方式告诉我（这一项目前是本机即时生效）。
			</div>
		</div>

		<!-- Fullscreen Layout Section -->
		{#if isFullscreenLayoutSwitchable}
		<div>
			<div class="section-title">
				{i18n(I18nKey.fullscreenLayout)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={fullscreenLayout === defaultFullscreenLayout} class:pointer-events-none={fullscreenLayout === defaultFullscreenLayout}
						disabled={fullscreenLayout === defaultFullscreenLayout} aria-hidden={fullscreenLayout === defaultFullscreenLayout ? "true" : undefined} onclick={resetFullscreenLayout}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="grid grid-cols-2 gap-2">
				<button
					class="btn-regular rounded-md py-2 px-3 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={fullscreenLayout !== "classic"}
					class:bg-(--btn-regular-bg-hover)={fullscreenLayout === "classic"}
					onclick={() => switchFullscreenLayout("classic")}
				>
					<Icon icon="material-symbols:view-day-outline" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-xs font-medium">{i18n(I18nKey.fullscreenClassicLayout)}</span>
				</button>
				<button
					class="btn-regular rounded-md py-2 px-3 flex items-center justify-center gap-2 active:scale-95 transition-all relative overflow-hidden"
					class:opacity-60={fullscreenLayout !== "hero"}
					class:bg-(--btn-regular-bg-hover)={fullscreenLayout === "hero"}
					onclick={() => switchFullscreenLayout("hero")}
				>
					<Icon icon="material-symbols:desktop-landscape-outline-rounded" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-xs font-medium">{i18n(I18nKey.fullscreenHeroLayout)}</span>
				</button>
			</div>
		</div>
		{/if}

		<!-- Overlay Settings Section（全屏壁纸模式也复用 overlay 的透明/模糊/卡片透明度设置） -->
		{#if (wallpaperMode === WALLPAPER_OVERLAY || (wallpaperMode === WALLPAPER_FULLSCREEN && fullscreenLayout === "hero")) && hasOverlaySettings && hasVisibleOverlaySlider}
		<div class="">
			<div class="section-title">
				{i18n(I18nKey.overlaySettings)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={overlaySettingsIsDefault} class:pointer-events-none={overlaySettingsIsDefault}
						disabled={overlaySettingsIsDefault} aria-hidden={overlaySettingsIsDefault ? "true" : undefined} onclick={resetOverlaySettings}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="space-y-2">
				{#each overlaySliderItems as item (item.key)}
					{#if item.enabled}
						<div class="rounded-md bg-(--btn-regular-bg) p-2">
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs font-medium text-(--btn-content) opacity-80">{item.label}</span>
								<span class="text-xs text-(--btn-content)">{item.displayValue}</span>
							</div>
							<input
								aria-label={item.ariaLabel}
								type="range"
								min={item.min}
								max={item.max}
								step={item.step}
								value={item.value}
								oninput={(e) => item.onValueChange(Number((e.currentTarget as HTMLInputElement).value))}
								class="slider w-full overlay-slider"
							/>
						</div>
					{/if}
				{/each}
			</div>
		</div>
		{/if}

		<!-- Banner Settings Section -->
		{#if (wallpaperMode === WALLPAPER_BANNER || wallpaperMode === WALLPAPER_FULLSCREEN) && hasBannerSettings}
		<div class="">
			<div class="section-title">
				{i18n(I18nKey.wallpaperSettings)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={bannerSettingsIsDefault} class:pointer-events-none={bannerSettingsIsDefault}
						disabled={bannerSettingsIsDefault} aria-hidden={bannerSettingsIsDefault ? "true" : undefined} onclick={resetBannerSettings}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<div class="space-y-1">
				<!-- Banner Title Switch -->
				{#if isBannerTitleSwitchable}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={bannerTitleEnabled}
					onclick={toggleBannerTitleEnabled}
				>
					<Icon icon="material-symbols:titlecase-rounded" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.wallpaperTitle)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={bannerTitleEnabled}
						 class:bg-(--btn-regular-bg-active)={!bannerTitleEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!bannerTitleEnabled}
							 class:left-5={bannerTitleEnabled}></div>
					</div>
				</button>
				{/if}
				<!-- Banner Carousel Switch -->
				{#if isBannerCarouselSwitchable}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={bannerCarouselEnabled}
					onclick={toggleBannerCarouselEnabled}
				>
					<Icon icon="material-symbols:view-carousel-outline" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.wallpaperCarousel)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={bannerCarouselEnabled}
						 class:bg-(--btn-regular-bg-active)={!bannerCarouselEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!bannerCarouselEnabled}
							 class:left-5={bannerCarouselEnabled}></div>
					</div>
				</button>
				{/if}
				<!-- Waves Animation Switch（横幅模式和 classic 全屏模式） -->
				{#if isWavesSwitchable && (wallpaperMode === WALLPAPER_BANNER || (wallpaperMode === WALLPAPER_FULLSCREEN && fullscreenLayout === "classic"))}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={wavesEnabled}
					onclick={toggleWavesEnabled}
				>
					<Icon icon="material-symbols:airwave-rounded" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.wavesAnimation)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={wavesEnabled}
						 class:bg-(--btn-regular-bg-active)={!wavesEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!wavesEnabled}
							 class:left-5={wavesEnabled}></div>
					</div>
				</button>
				{/if}
				<!-- Gradient Transition Switch（横幅模式和 classic 全屏模式） -->
				{#if isGradientSwitchable && (wallpaperMode === WALLPAPER_BANNER || (wallpaperMode === WALLPAPER_FULLSCREEN && fullscreenLayout === "classic"))}
				<button
					class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
					class:bg-(--btn-regular-bg-hover)={gradientEnabled}
					onclick={toggleGradientEnabled}
				>
					<Icon icon="material-symbols:gradient" class="text-[1.25rem] shrink-0"></Icon>
					<span class="text-sm flex-1">{i18n(I18nKey.gradientTransition)}</span>
					<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
						 class:bg-(--primary)={gradientEnabled}
						 class:bg-(--btn-regular-bg-active)={!gradientEnabled}>
						<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
							 class:left-0.5={!gradientEnabled}
							 class:left-5={gradientEnabled}></div>
					</div>
				</button>
				{/if}
			</div>
		</div>
		{/if}

		<!-- 壁纸图片 / 背景视频（2026-10-19）：站长要求「里面要有上传图片视频修改壁纸的功能」。
		     选图后先上传到 public/uploads/ 并预览，「保存壁纸」才写回
		     src/data/wallpapers.json → 重新构建 → 约 1 分钟生效。 -->
		<div>
			<div class="section-title">
				壁纸图片 / 背景视频
				<span class="text-[0.7rem] font-normal opacity-70">保存后约 1 分钟生效</span>
			</div>

			{#each WALLPAPER_ROWS as item (item.kind)}
				{@const preview = item.kind === "desktop" ? desktopPreview : videoPreview}
				{@const pending = item.kind === "desktop" ? desktopPath : videoPath}
				{@const raw = item.kind === "desktop" ? wallpaperDesktopRaw : ""}
				{@const thumbStyle = item.kind === "desktop" ? desktopThumbStyle : ""}
				<div class="flex items-center gap-3 mb-2">
				<div
					class="w-14 h-10 rounded-md overflow-hidden bg-(--btn-regular-bg) shrink-0 flex items-center justify-center"
					style={preview ? "" : thumbStyle}
					data-wallpaper-thumb={item.kind}
				>
						{#if preview && item.kind === "video"}
							<video src={preview} muted playsinline preload="metadata" class="w-full h-full object-cover"></video>
						{:else if preview}
							<img src={preview} alt={item.label} class="w-full h-full object-cover" />
						{:else if item.kind === "video"}
							<Icon icon="material-symbols:movie-outline" class="text-[1.15rem] opacity-80"></Icon>
						{:else}
							<!-- 没有真实缩略图时，渐变底色上叠一个图片图标，看起来是「占位缩略图」 -->
							<Icon icon="material-symbols:image-outline" class="text-[1.15rem] opacity-70"></Icon>
						{/if}
					</div>
					<div class="flex-1 min-w-0">
						<div class="text-sm">{item.label}</div>
						<div class="text-[0.7rem] opacity-60 truncate">
							{pending ? "待保存：" + fileNameOf(pending) : fileNameOf(raw) || fileNameOf(preview) || "未设置"}
						</div>
					</div>
					<label class="btn-regular rounded-md px-3 py-1.5 text-xs cursor-pointer active:scale-95">
						{item.action}
						<input
							type="file"
							accept={item.accept}
							class="hidden"
							onchange={(e) => onPickWallpaper(e, item.kind)}
						/>
					</label>
				</div>
			{/each}

			<div class="text-[0.68rem] leading-5 opacity-60 mb-2">
				原图 / 原视频直传，<b>不压缩、不转码、不改分辨率</b>（4K 就是 4K）。单个文件上限：图片 30MB、视频 40MB（网关限制）。
			</div>

			<input
				type="password"
				bind:value={adminPassword}
				placeholder="后台密码（与 /admin/ 相同）"
				class="w-full px-2.5 py-1.5 rounded-md bg-(--btn-regular-bg) text-sm text-(--btn-content) mb-2"
			/>
			<div class="flex gap-2">
				<button
					class="flex-1 btn-regular rounded-md py-2 text-sm font-medium active:scale-95"
					disabled={wallpaperBusy}
					onclick={() => void saveWallpapers(false)}
				>
					{wallpaperBusy ? "提交中……" : "保存壁纸"}
				</button>
				<button
					class="btn-regular rounded-md px-3 py-2 text-xs active:scale-95"
					disabled={wallpaperBusy}
					onclick={() => void saveWallpapers(true)}
					title="换回仓库里原本那套壁纸（d1-d6 / m1-m6 / 4K 视频）"
				>
					恢复默认
				</button>
			</div>
			{#if wallpaperStatus}
				<div class="text-[0.72rem] leading-5 mt-2 opacity-80">{wallpaperStatus}</div>
			{/if}
		</div>
	{/if}

	<!-- Effects Tab: Sakura -->
	{#if activeTab === "effects"}
		{#if isSakuraSwitchable}
		<div class="">
			<div class="section-title">
				{i18n(I18nKey.effectsSettings)}
				<button aria-label="Reset to Default" class="btn-regular rounded-md active:scale-90"
						class:opacity-0={sakuraEnabled === defaultSakuraEnabled} class:pointer-events-none={sakuraEnabled === defaultSakuraEnabled}
						disabled={sakuraEnabled === defaultSakuraEnabled} aria-hidden={sakuraEnabled === defaultSakuraEnabled ? "true" : undefined}
						onclick={() => { sakuraEnabled = defaultSakuraEnabled; setSakuraEnabled(defaultSakuraEnabled); }}>
					<div class="text-(--btn-content)">
						<Icon icon="fa7-solid:arrow-rotate-left" class="text-[0.75rem]"></Icon>
					</div>
				</button>
			</div>
			<button
				class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95 transition-all relative overflow-hidden"
				class:bg-(--btn-regular-bg-hover)={sakuraEnabled}
				onclick={toggleSakuraEnabled}
			>
				<Icon icon="mdi:flower-poppy" class="text-[1.25rem] shrink-0"></Icon>
				<span class="text-sm flex-1">{i18n(I18nKey.sakuraEffect)}</span>
				<div class="w-10 h-5 rounded-full transition-all duration-200 relative"
					 class:bg-(--primary)={sakuraEnabled}
					 class:bg-(--btn-regular-bg-active)={!sakuraEnabled}>
					<div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
						 class:left-0.5={!sakuraEnabled}
						 class:left-5={sakuraEnabled}></div>
				</div>
			</button>
		</div>
		{/if}
	{/if}

	<!-- 站点 Tab（2026-10-19）：明暗 / 头像 / Logo / 标题 / 导航栏 / 保存到站点 -->
	{#if activeTab === "site"}
		<!-- 明暗：本机即时生效 -->
		<div>
			<div class="section-title">明暗模式</div>
			<div class="text-[0.7rem] text-(--btn-content) opacity-70 mb-2">只对这台设备生效，不写入站点</div>
			<div class="grid grid-cols-3 gap-2">
				<button
					class="btn-regular rounded-md py-2 flex flex-col items-center gap-1 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={themeMode === LIGHT_MODE}
					onclick={() => pickTheme(LIGHT_MODE)}
				>
					<Icon icon="material-symbols:wb-sunny-outline-rounded" class="text-[1.15rem]"></Icon>
					浅色
				</button>
				<button
					class="btn-regular rounded-md py-2 flex flex-col items-center gap-1 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={themeMode === DARK_MODE}
					onclick={() => pickTheme(DARK_MODE)}
				>
					<Icon icon="material-symbols:dark-mode-outline-rounded" class="text-[1.15rem]"></Icon>
					深色
				</button>
				<button
					class="btn-regular rounded-md py-2 flex flex-col items-center gap-1 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={themeMode === SYSTEM_MODE}
					onclick={() => pickTheme(SYSTEM_MODE)}
				>
					<Icon icon="material-symbols:brightness-auto-outline-rounded" class="text-[1.15rem]"></Icon>
					跟随系统
				</button>
			</div>
		</div>

		<!-- 站点外观：头像 / Logo / 标题 / 副标题 -->
		<div>
			<div class="section-title">
				站点外观
				<span class="text-[0.7rem] font-normal opacity-70">保存后约 1 分钟生效</span>
			</div>

			<!-- 头像 -->
			<div class="flex items-center gap-3 mb-2">
				<div class="w-12 h-12 rounded-full overflow-hidden bg-(--btn-regular-bg) flex items-center justify-center shrink-0">
					{#if avatarPreview}
						<img src={avatarPreview} alt="站点头像" class="w-full h-full object-cover" />
					{:else}
						<Icon icon="material-symbols:person" class="text-[1.25rem]"></Icon>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<div class="text-sm">头像</div>
					<div class="text-[0.7rem] opacity-60 truncate">{avatarRaw || "未设置"}</div>
				</div>
				<label class="btn-regular rounded-md px-3 py-1.5 text-xs cursor-pointer active:scale-95">
					换图
					<input type="file" accept="image/*" class="hidden" onchange={(e) => onPickFile(e, "avatar")} />
				</label>
			</div>

			<!-- 导航栏 Logo -->
			<div class="flex items-center gap-3 mb-2">
				<div class="w-12 h-12 rounded-lg overflow-hidden bg-(--btn-regular-bg) flex items-center justify-center shrink-0">
					{#if logoPreview}
						<img src={logoPreview} alt="站点 Logo" class="w-full h-full object-contain p-1" />
					{:else}
						<Icon icon="material-symbols:image-outline" class="text-[1.25rem]"></Icon>
					{/if}
				</div>
				<div class="flex-1 min-w-0">
					<div class="text-sm">导航栏 Logo</div>
					<div class="text-[0.7rem] opacity-60 truncate">{logoValue || "未设置"}</div>
				</div>
				<label class="btn-regular rounded-md px-3 py-1.5 text-xs cursor-pointer active:scale-95">
					换图
					<input type="file" accept="image/*" class="hidden" onchange={(e) => onPickFile(e, "logo")} />
				</label>
			</div>

			<!-- 深色模式 Logo：站长 2026-10-19 说「可以删除」，这里不再提供入口。
			     已配置的 valueDark 会原样保留（保存时不下发该字段），导航栏暗色态照旧用原来那张图。 -->

			<!-- 标题 / 副标题 -->
			<label class="block mb-2">
				<div class="text-sm mb-1">站点标题</div>
				<input
					bind:value={siteTitleValue}
					maxlength="40"
					placeholder="例如：yokan-haze"
					class="w-full px-2.5 py-1.5 rounded-md bg-(--btn-regular-bg) text-sm text-(--btn-content)"
				/>
			</label>
			<!-- 副标题输入框按站长 2026-10-19 要求删掉了（配置里原来那句保持不变） -->
		</div>

		<!-- 导航栏外观 -->
		<div>
			<div class="section-title">
				导航栏
				<span class="text-[0.7rem] font-normal opacity-70">点一下当场预览 · 保存到站点后全站生效</span>
			</div>

			<div class="text-sm mb-1">透明程度</div>
			<div class="grid grid-cols-3 gap-2 mb-2">
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarStyle === "none"}
					onclick={() => pickNavbarStyle("none")}>纯色</button
				>
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarStyle === "semi"}
					onclick={() => pickNavbarStyle("semi")}>半透明</button
				>
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarStyle === "semifull"}
					onclick={() => pickNavbarStyle("semifull")}>动态透明</button
				>
			</div>

			<div class="text-sm mb-1">固定方式</div>
			<div class="grid grid-cols-3 gap-2 mb-2">
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarModeValue === "fixed"}
					onclick={() => pickNavbarMode("fixed")}>常显</button
				>
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarModeValue === "dynamic"}
					onclick={() => pickNavbarMode("dynamic")}>下滑隐藏</button
				>
				<button
					class="btn-regular rounded-md py-1.5 text-xs active:scale-95"
					class:bg-(--btn-regular-bg-hover)={navbarModeValue === "static"}
					onclick={() => pickNavbarMode("static")}>随页滚动</button
				>
			</div>

			<div class="flex items-center justify-between text-sm mb-1">
				<span>毛玻璃模糊度</span>
				<span class="tabular-nums opacity-70">{navbarBlur}</span>
			</div>
			<input type="range" min="0" max="24" step="1" bind:value={navbarBlur} oninput={() => applyNavbarPreview()} class="slider w-full mb-2" />

			<button
				class="w-full btn-regular rounded-md py-2 px-3 flex items-center gap-3 text-left active:scale-95"
				class:bg-(--btn-regular-bg-hover)={navbarFull}
				onclick={() => { navbarFull = !navbarFull; applyNavbarPreview(); }}
			>
				<Icon icon="material-symbols:width-full" class="text-[1.15rem] shrink-0"></Icon>
				<span class="text-sm flex-1">导航栏满宽</span>
				<div
					class="w-10 h-5 rounded-full transition-all duration-200 relative"
					class:bg-(--primary)={navbarFull}
					class:bg-(--btn-regular-bg-active)={!navbarFull}
				>
					<div
						class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200"
						class:left-0.5={!navbarFull}
						class:left-5={navbarFull}
					></div>
				</div>
			</button>
		</div>

		<!-- 保存到站点 -->
		<div>
			<div class="section-title">保存到站点</div>
			<input
				type="password"
				bind:value={adminPassword}
				placeholder="后台密码（与 /admin/ 相同）"
				class="w-full px-2.5 py-1.5 rounded-md bg-(--btn-regular-bg) text-sm text-(--btn-content) mb-2"
			/>
			<button
				class="w-full btn-regular rounded-md py-2 text-sm font-medium active:scale-95"
				disabled={siteBusy}
				onclick={() => void saveAppearance()}
			>
				{siteBusy ? "提交中……" : "保存到站点（约 1 分钟生效）"}
			</button>
			{#if siteStatus}
				<div class="text-[0.72rem] leading-5 mt-2 opacity-80">{siteStatus}</div>
			{/if}
		</div>
	{/if}
</div>
{/if}
