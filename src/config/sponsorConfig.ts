import type { SponsorConfig } from "../types/sponsorConfig";

export const sponsorConfig: SponsorConfig = {
	// 页面标题，如果留空则使用 i18n 中的翻译
	title: "",

	// 页面描述文本，如果留空则使用 i18n 中的翻译
	description: "",

	// 打赏用途说明
	usage:
		"您的打赏将用于服务器维护、内容创作和功能开发，帮助我持续提供优质内容。",

	// 是否显示打赏者列表
	showSponsorsList: true,

	// 是否显示评论区，需要先在commentConfig.ts启用评论系统
	showComment: true,

	// 是否在文章详情页底部显示打赏按钮
	showButtonInPost: true,

	// 打赏方式列表
	methods: [
		{
			name: "支付宝",
			icon: "fa7-brands:alipay",
			// 收款码已移除：原 public/assets/images/sponsor/alipay.png 为上游主题作者素材
			qrCode: "",
			link: "",
			description: "使用 支付宝 扫码打赏",
			// 本站未配置自己的支付宝收款码，停用（避免出现「空二维码却提示扫码打赏」）
			enabled: false,
		},
		{
			name: "微信",
			icon: "fa7-brands:weixin",
			// 收款码已移除：原 public/assets/images/sponsor/wechat.png 为上游主题作者素材
			qrCode: "",
			link: "",
			description: "使用 微信 扫码打赏",
			// 本站未配置自己的微信收款码，停用（避免出现「空二维码却提示扫码打赏」）
			enabled: false,
		},
		{
			name: "ko-fi",
			icon: "simple-icons:kofi",
			qrCode: "",
			// 已移除指向上游主题作者的收款链接；本站尚未提供自己的链接，先停用
			link: "",
			description: "Buy a Coffee for Firefly",
			enabled: false,
		},
		{
			name: "爱发电",
			icon: "simple-icons:afdian",
			qrCode: "",
			// 已移除指向上游主题作者的收款链接；本站尚未提供自己的链接，先停用
			link: "",
			description: "通过 爱发电 进行打赏",
			enabled: false,
		},
	],

	// 打赏者列表（可选）
	// 已清空：原为上游主题作者的示例打赏者数据。需要展示本站真实打赏者时再填入。
	sponsors: [],
};
