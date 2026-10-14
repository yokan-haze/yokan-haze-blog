import siteAppearanceRaw from "@/data/siteAppearance.json";
import type { ProfileConfig } from "../types/profileConfig";

// ⚠️ 防御性读取：Pages CMS 保存时会丢掉空值字段，键消失会让 TypeScript 从 JSON
// 推断出的类型改变，直接链式访问会报 ts(2339)，进而被类型检查闸门拦住部署。
// 详见 src/config/siteConfig.ts 顶部关于这次事故的说明（Issue #9）。
const siteAppearance = siteAppearanceRaw as { avatar?: string };

export const profileConfig: ProfileConfig = {
	// 头像
	// 由 src/data/siteAppearance.json 的 avatar 字段维护，可在 Pages CMS 的「站点外观」板块里换图。
	// 图片路径支持三种格式：
	// 1. public 目录（以 "/" 开头，不优化）："/assets/images/avatar.webp"
	// 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/avatar.webp"
	// 3. 远程 URL："https://example.com/avatar.jpg"
	avatar: siteAppearance.avatar ?? "",

	// 名字
	name: "零",

	// 个人签名
	bio: "记录，然后忘记",

	// 链接配置
	// 已经预装的图标集：fa7-brands，fa7-regular，fa7-solid，material-symbols，simple-icons
	// 访问https://icones.js.org/ 获取图标代码，
	// 如果想使用尚未包含相应的图标集，则需要安装它
	// `pnpm add @iconify-json/<icon-set-name>`
	// showName: true 时显示图标和名称，false 时只显示图标
	links: [
		{
			name: "RSS",
			icon: "fa7-solid:rss",
			url: "/rss/",
			showName: false,
		},
		{
			name: "Atom",
			icon: "fa7-solid:atom",
			url: "/atom/",
			showName: false,
		},
	],
};
