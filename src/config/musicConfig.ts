import type { MusicPlayerConfig } from "../types/musicConfig";
import musicDataRaw from "@/data/music.json";

// 音乐播放器配置
export const musicPlayerConfig: MusicPlayerConfig = {
	// 是否在导航栏显示音乐播放器入口
	// 站长要求「在《我的》旁边加个乐库栏目」—— 打开它，导航栏会出现音乐入口。
	showInNavbar: true,

	// 是否在侧边栏显示音乐播放器组件
	// 站长要求「主页放个音乐播放器」—— 打开它，首页侧栏出现播放器卡片。
	showInSidebar: true,

	// 使用方式："meting" 使用 Meting API，"local" 使用本地音乐列表
	// local = 用下面 playlist 里的本地文件（现在 playlist 是空的，所以之前什么都不显示）
	// meting = 走在线 API，直接引用网易云歌单/单曲，不用自己传文件
	mode: "meting",

	// 默认音量 (0-1)
	volume: 0.7,

	// 播放模式：'list'=列表循环, 'one'=单曲循环, 'random'=随机播放
	playMode: "list",

	// 是否显启用歌词
	showLyrics: false,

	// Meting API 配置
	meting: {
		// Meting API 地址
		// 默认使用官方 API，也可以使用自定义 API
		api: "https://api.i-meto.com/meting/api?server=:server&type=:type&id=:id&r=:r",
		// 音乐平台：netease=网易云音乐, tencent=QQ音乐, kugou=酷狗音乐, xiami=虾米音乐, baidu=百度音乐
		server: "netease",
		// 类型：song=单曲, playlist=歌单, album=专辑, search=搜索, artist=艺术家
		type: "playlist",
		// 歌单/专辑/单曲 ID 或搜索关键词
		id: (musicDataRaw as { neteasePlaylistId?: string }).neteasePlaylistId ?? "10046455237",
		// 认证 token（可选）
		auth: "",
		// 备用 API 配置（当主 API 失败时使用）
		fallbackApis: [
			"https://api.injahow.cn/meting/?server=:server&type=:type&id=:id",
			"https://api.moeyao.cn/meting/?server=:server&type=:type&id=:id",
		],
	},

	// 本地音乐配置（当 mode 为 'local' 时使用）
	// 1. 支持传入歌词文件的路径
	// lrc: "/assets/music/lrc/使一颗心免于哀伤-哼唱.lrc",
	// 2. 或者直接填入歌词字符串内容
	// lrc: "[00:00.00]歌词内容...",
	local: {
		// 歌单数据源：src/data/music.json（后台「乐库」可编辑）。
		// 这里写明确的元素类型，不用 MusicPlayerConfig["local"]["playlist"] ——
		// 那个索引写法会被 TS 解析成 local 对象本身，报 ts(2339) Property 'playlist' does not exist
		// （这就是 CI 上那次失败的原因）。
		playlist:
			(musicDataRaw as {
				playlist?: {
					name: string;
					artist: string;
					url: string;
					cover?: string;
					lrc?: string;
				}[];
			}).playlist ?? [],
	},
};
