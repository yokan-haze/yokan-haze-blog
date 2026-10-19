// 「落笔」写作入口的显隐（2026-10-19）
//
// 站长要求：这个入口只出现在**首页**和**本子**（/notebook/ 含其分页），其它页面一律不要。
// 位置：左侧栏「个人资料卡片」里（2026-10-19 从右下角浮动胶囊改过来的）。
//
// 两层保险：
//   1. SSR（src/components/widget/Profile.astro）用 shouldShowWriteFab() 决定渲不渲染；
//   2. 移动端底部的个人卡片（mobileBottomComponents）不在 swup 主容器里，软导航后可能残留，
//      所以再由 initWriteEntryVisibility() 在 astro:page-load / swup:page:view 时按当前地址校正。

/** 首页或本子（/notebook/、/notebook/2/ …）才显示 */
export function shouldShowWriteFab(pathname: string): boolean {
	// 去掉 query/hash 与末尾斜杠，兼容部署在子路径（BASE_URL）的情况
	const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
	if (path === "/" || path === "") return true;
	// /notebook 或 /xxx/notebook（子路径部署）
	return /(^|\/)notebook(\/|$)/.test(path);
}

function currentPathname(): string {
	const raw = window.location.pathname.replace(/\/+$/, "") || "/";
	// 子路径部署（BASE_URL = "/blog"）时把前缀去掉再判断
	const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
	if (base && base !== "/" && raw.startsWith(base)) return raw.slice(base.length) || "/";
	return raw;
}

function applyWriteEntryVisibility(): void {
	// 注意：移动端会渲染两份个人卡片（左侧栏那份是隐藏的，底部 mobileBottomComponents 那份可见），
	// 所以这里按 class 取全部，别用 id（会撞）。
	const els = Array.from(document.querySelectorAll<HTMLElement>(".write-entry"));
	if (!els.length) return;
	const show = shouldShowWriteFab(currentPathname());
	for (const el of els) {
		el.style.display = show ? "" : "none";
		// 无障碍：隐藏时也不该被读屏/键盘读到（display:none 本身已经够，这里只是双保险）
		el.toggleAttribute("aria-hidden", !show);
		el.tabIndex = show ? 0 : -1;
	}
}

export function initWriteEntryVisibility(): void {
	if (typeof document === "undefined") return;
	applyWriteEntryVisibility();
	// 一次软导航会同时来这两个事件（见 HANDOVER 的坑），所以这个函数必须是幂等的 —— 它本来也是
	document.addEventListener("astro:page-load", applyWriteEntryVisibility);
	window.addEventListener("swup:page:view", applyWriteEntryVisibility);
}
