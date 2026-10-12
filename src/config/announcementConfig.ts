import announcement from "@/data/announcement.json";
import type { AnnouncementConfig } from "../types/announcementConfig";

// 公告内容（标题 / 正文 / 链接 / 是否可关闭）由 src/data/announcement.json 维护，
// 可在 Pages CMS 的「站点外观」板块里直接编辑，不需要改代码。
export const announcementConfig: AnnouncementConfig = {
	// 公告标题，留空则走i18n默认标题
	title: announcement.title,

	// 公告内容
	content: announcement.content,

	// 是否允许用户关闭公告
	closable: announcement.closable,

	link: {
		// 启用链接
		enable: announcement.link.enable,
		// 链接文本
		text: announcement.link.text,
		// 链接 URL
		url: announcement.link.url,
		// 内部链接
		external: announcement.link.external,
	},
};
