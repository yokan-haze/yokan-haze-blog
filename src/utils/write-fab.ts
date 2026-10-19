// 「落笔」写作入口的显隐（2026-10-19）
//
// 站长要求：这个按钮只出现在**首页**和**本子**（/notebook/ 含其分页），其它页面一律不要。
//
// 为什么需要这个文件而不是只在模板里加个 if：
// 主题用 Swup 做软导航，而 #write-fab 渲染在 swup 容器之外 —— 切页时它不会被替换掉。
// 首页 → 文章页这种软导航，如果只靠 SSR 判断路径，按钮会「留在原地」一直显示。
// 所以：SSR 决定首帧是否渲染（省掉一次闪烁），软导航后再按当前地址补一刀。
//
// 由 Layout.astro 的打包脚本调用一次（和 initAdminUi 同一处）。

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

function applyWriteFabVisibility(): void {
	const el = document.getElementById("write-fab");
	if (!el) return;
	const show = shouldShowWriteFab(currentPathname());
	el.style.display = show ? "" : "none";
	// 无障碍：隐藏时也不该被读屏/键盘读到（display:none 本身已经够，这里只是双保险）
	el.toggleAttribute("aria-hidden", !show);
	el.tabIndex = show ? 0 : -1;
}

export function initWriteFabVisibility(): void {
	if (typeof document === "undefined") return;
	applyWriteFabVisibility();
	// 一次软导航会同时来这两个事件（见 HANDOVER 的坑），所以这个函数必须是幂等的 —— 它本来也是
	document.addEventListener("astro:page-load", applyWriteFabVisibility);
	window.addEventListener("swup:page:view", applyWriteFabVisibility);
}
