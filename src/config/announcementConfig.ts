import raw from "@/data/announcement.json";
import type { AnnouncementConfig } from "../types/announcementConfig";

// 公告内容（标题 / 正文 / 链接 / 是否可关闭）由 src/data/announcement.json 维护，
// 可在 Pages CMS 的「站点外观」板块里直接编辑，不需要改代码。
//
// ⚠️ 这里必须做防御性读取，不能直接写 raw.title —— 这是踩过的坑：
// Pages CMS 保存时会**丢掉空值字段**。公告标题留空时，title 这个键会从 JSON 里消失，
// TypeScript 从 JSON 推断出的类型随之改变，raw.title 直接报
// ts(2339) Property 'title' does not exist。**这不是运行时才出问题，而是构建期就报错**
// —— 类型检查闸门会因此拦住整个部署（2026-10-14 真实发生过，见 Issue #9）。
// 所以：先把 JSON 放宽成「所有字段都可选」，再逐个给默认值。
type AnnouncementJson = {
	title?: string;
	content?: string;
	closable?: boolean;
	link?: {
		enable?: boolean;
		text?: string;
		url?: string;
		external?: boolean;
	};
};

const announcement = raw as AnnouncementJson;

export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: announcement.title ?? "",

	// 公告内容
	content: announcement.content ?? "",

	// 是否允许用户关闭公告
	closable: announcement.closable ?? true,

	link: {
		// 启用链接
		enable: announcement.link?.enable ?? false,
		// 链接文本
		text: announcement.link?.text ?? "",
		// 链接 URL
		url: announcement.link?.url ?? "",
		// 内部链接
		external: announcement.link?.external ?? false,
	},
};
