import type { BackgroundWallpaperConfig } from "@/types/backgroundWallpaper";
import wallpapersRaw from "@/data/wallpapers.json";
import socialLinksRaw from "@/data/socialLinks.json";
import { siteSettings } from "@/utils/site-settings";

// ⚠️ 防御性读取：Pages CMS 保存时会丢掉空值字段（例如把所有背景视频都删掉时，
// videos 这个键会从 JSON 里消失）。键一旦消失，TypeScript 从 JSON 推断的类型就变了，
// 直接 wallpapers.videos 会报 ts(2339) —— 构建期错误，会被类型检查闸门拦住部署。
// 详见 src/config/siteConfig.ts 顶部关于这次事故的说明（Issue #9）。
// 下面两个转换函数本来就接受 unknown 并对非数组做兜底，所以这里只需放宽类型。
const wallpapers = wallpapersRaw as {
	desktop?: unknown;
	mobile?: unknown;
	videos?: unknown;
};

// 壁纸列表由 src/data/wallpapers.json 维护，可在 Pages CMS 后台上传和增删。
// Pages CMS 写入的路径可能是 "/assets/..." 形式，这里统一去掉开头的斜杠，
// 转成 Astro 需要的 src 相对路径（"assets/..."），从而享受图片自动优化。
// 视频列表与壁纸同在一个文件（src/data/wallpapers.json 的 videos 字段），
// 在 Pages CMS 的「壁纸与背景视频」板块里一起管理。
// 视频放在 public/ 下（Astro 不处理视频，原样发布），所以这里要的是公共路径 "/assets/videos/x.mp4"。
const toPublicPath = (list: unknown): string[] =>
	(Array.isArray(list) ? list : [])
		.map((p) => String(p).trim())
		.filter(Boolean)
		.map((p) => (/^https?:\/\//.test(p) || p.startsWith("/") ? p : "/" + p));

const toSrcPath = (list: unknown): string[] =>
	(Array.isArray(list) ? list : [])
		.map((p) => String(p).replace(/^\/+/, ""))
		.filter(Boolean);

export const backgroundWallpaper: BackgroundWallpaperConfig = {
	// 壁纸模式："banner" 横幅壁纸，"fullscreen" 全屏壁纸，"overlay" 覆盖透明，"none" 纯色背景无壁纸
	// 值来自 src/data/siteSettings.json（设置面板「保存为全站默认」写入）
	mode: siteSettings.wallpaperMode as "banner" | "fullscreen" | "overlay" | "none",
	// 是否启用背景视频播放，配置后将在导航栏显示视频播放按钮
	playerEnable: true,
	// 进入页面就自动播放，不用点导航栏那个按钮（静音播放，符合浏览器自动播放策略）
	playerAutoplay: true,
	// 单个视频播完后循环重播，而不是淡出停下
	playerLoop: true,
	// 是否显示导航栏上的播放/暂停按钮。既然已经自动播放了，按钮就多余了，设为 false 隐藏
	// （隐藏后就不提供手动暂停入口；想恢复随时改回 true）
	playerButtonVisible: false,
	/**
	 * 背景图片配置
	 * 图片路径支持三种格式：
	 * 1. public 目录（以 "/" 开头，不优化）："/assets/images/banner.avif"
	 * 2. src 目录（不以 "/" 开头，自动优化但会增加构建时间，推荐）："assets/images/banner.avif"
	 * 3. 远程 URL："https://example.com/banner.jpg"
	 * 注意：远程URL和public目录的图片不会被优化，请确保图片体积足够小以免影响加载速度
	 *
	 * 建议不要替换d1-d6，m1-m6这些默认示例图片，但你可以删除掉节省空间
	 * 因为以后可能会更换示例图片，导致你自定义的图片被覆盖
	 * 所以建议使用自己的图片的时候命名为其他名称，不要使用d1-d6，m1-m6这些名称
	 *
	 * 如果只使用一张图片或者使用随机图API，推荐直接使用字符串格式：
	 * desktop: "https://t.alcy.cc/pc",   // 随机图API
	 * desktop: "assets/images/DesktopWallpaper/d1.avif", // 单张图片
	 *
	 * mobile: "https://t.alcy.cc/mp", // 随机图API
	 * mobile: "assets/images/MobileWallpaper/m1.avif", // 单张图片
	 *
	 * 支持配置多张图片（数组），每次刷新页面随机显示一张：
	 * desktop: [
	 * "assets/images/DesktopWallpaper/d1.avif",
	 * "assets/images/DesktopWallpaper/d2.avif",
	 * ],
	 *
	 * mobile:[
	 *   "assets/images/MobileWallpaper/m1.avif",
	 *   "assets/images/MobileWallpaper/m2.avif",
	 * ],
	 */
	src: {
		// 桌面背景图片（支持单张或多张随机）
		// desktop: "assets/images/DesktopWallpaper/d1.avif",
		desktop: toSrcPath(wallpapers.desktop),
		// 移动背景图片（支持单张或多张随机）
		// mobile: "assets/images/MobileWallpaper/m1.avif",
		mobile: toSrcPath(wallpapers.mobile),
		// 背景视频播放地址
		// 支持单个视频路径（字符串）或多个视频循环（数组，参考上面壁纸配置）
		// 支持远程视频URL，本地视频请放在 public/assets/videos/ 目录下
		// playerUrl: "/assets/videos/firefly.mp4",
		playerUrl: toPublicPath(wallpapers.videos),
	},
	// 横幅壁纸和全屏壁纸共享配置
	common: {
		// 壁纸遮罩暗度，让横幅文字显示更清晰，0-1之间，值越大越暗
		dimOpacity: 0.2,
		// 多视频播放模式："order" 顺序循环，"random" 随机切换（仅当 playerUrl 为数组时生效）
		playerMode: "random",
		// 背景视频播放时是否保留横幅文字（标题 / 副标题 / 文章横幅信息）。
		// 设为 true：视频自动播放的同时文字照常显示，并保留文字底衬（dimOpacity）保证可读性。
		// 设为 false：回到主题原设计——视频一播放就把横幅文字淡出、只留画面。
		// 站长反馈「首页横幅标题不见了」，正是因为 playerAutoplay 会让视频在进页面时立即播放，
		// 而原设计会在那一刻把文字淡出。这里按站长要求保留文字。
		keepTextWhileVideoPlaying: true,
		// 主页横幅文字
		homeText: {
			// 是否启用主页横幅文字
			enable: true,
			// 主页横幅主标题
			title: "yokan-haze",
			// 主页横幅主标题字体大小
			titleSize: "4.5rem",
			// 主页横幅副标题
			subtitle: [
				"记录，然后忘记",
				"青春是萤火绚丽般的流动银河，灿烂却也极致短暂。",
			],
			// 主页横幅副标题字体大小
			subtitleSize: "1.5rem",
			typewriter: {
				// 是否启用打字机效果
				// 打字机开启 → 循环显示所有副标题
				// 打字机关闭 → 每次刷新随机显示一条副标题
				enable: true,
				// 打字速度（毫秒）
				speed: 100,
				// 删除速度（毫秒）
				deleteSpeed: 50,
				// 完全显示后的暂停时间（毫秒）
				pauseTime: 2000,
			},
			// 是否显示标题下方的链接图标
			// 站长要求「所有这样的东西都删掉」—— 关掉。links 配置本身保留着，
			// 想显示把这里改回 true 即可（内容仍来自 src/data/socialLinks.json）。
			linksEnable: false,
			// 首页横幅标题下方的链接图标（可选，支持 showName 显示文字）
			// 数据源：src/data/socialLinks.json —— 可在 Pages CMS「站点外观」里维护。
			// 图标支持 Iconify 格式：fa7-brands:github、fa7-solid:envelope、mdi:rss 等
			links: (socialLinksRaw as { links?: { name: string; icon: string; url: string; showName?: boolean }[] }).links ?? [],
		},
		// 壁纸轮播配置，横幅壁纸和全屏壁纸共享，仅在配置多张图片时生效
		carousel: {
			// 是否启用壁纸轮播；关闭时保持每次刷新随机显示一张
			enable: false,
			// 轮播切换间隔（毫秒）
			interval: 5000,
			// 过渡效果: 'fade' 渐变 | 'zoom' 缩放 | 'slide' 滑动 | 'kenburns' 旋转木马
			transitionEffect: "zoom",
		},
		// 水波纹动画效果配置，开启会影响页面性能，增加内存占用，请根据自己的喜好开启
		waves: {
			enable: {
				// 桌面端是否启用水波纹动画效果
				desktop: true,
				// 移动端是否启用水波纹动画效果
				mobile: true,
			},
		},
		// 渐变过渡效果配置，当水波纹关闭时自动启用，提供壁纸底部到背景色的平滑过渡
		gradient: {
			enable: {
				// 桌面端是否启用渐变过渡
				desktop: true,
				// 移动端是否启用渐变过渡
				mobile: true,
			},
			// 渐变高度
			height: "10%",
		},
	},
	// Banner模式特有配置
	banner: {
		// 图片位置
		// 支持所有CSS object-position值，如: 'top', 'center', 'bottom', 'left top', 'right bottom', '25% 75%', '10px 20px'..
		// 如果不知道怎么配置百分百之类的配置，推荐直接使用：'center'居中，'top'顶部居中，'bottom' 底部居中，'left'左侧居中，'right'右侧居中
		position: "0% 20%",
		// 文章横幅信息："description" 显示描述，"meta" 显示日期、字数和阅读时长
		postInfo: {
			mode: "description",
		},
		// 导航栏配置
		navbar: {
			// 导航栏透明模式："semi" 半透明，"semifull" 动态透明，"none" 纯色不透明
			transparentMode: "semi",
			// 毛玻璃模糊度，0 即关闭导航栏的毛玻璃
			// 注意：导航栏子菜单与浮动面板始终保留毛玻璃，模糊度跟随此项但有最小值
			blur: 12,
		},
	},
	// 覆盖透明覆盖模式特有配置
	overlay: {
		// 首页内容顶部留白。主题默认是 5.5rem（内容紧贴导航栏，壁纸全被压在内容下面，看不见）
		// 想让壁纸在顶部露出来一块，就把它调大：60vh ≈ 屏幕高度的 60%
		// 可自行改成 "40vh" / "50vh" / "500px" 等；改完推送后约 1 分钟自动生效
		contentTop: "38vh",
		// 层级，确保壁纸在背景层
		zIndex: -1,
		// 壁纸透明度
		opacity: siteSettings.overlayOpacity,
		// 背景模糊度
		blur: siteSettings.overlayBlur,
		// 卡片透明度，0-1之间，值越小越透明
		// 站长要求「融入壁纸」—— 一路从主题默认的 0.6 降到 0.35，仍觉得不够透，
		// 最后定在 0.28（0.12 试过，站长反馈过头了）。
		// 代价是文字直接压在壁纸上，所以下面同时给卡片文字加了一层柔和描边
		// （见 src/styles/card-blend.css），保证在亮/暗壁纸上都读得清。
		// 访客仍可在设置面板里拖「卡片透明度」滑块临时调整；注意滑块调过之后
		// 会存进浏览器 localStorage，会盖住这里的默认值（想回到新默认需把滑块拖回去）。
		cardOpacity: siteSettings.overlayCardOpacity,
	},
	// 全屏壁纸模式特有配置
	// 壁纸模糊度(blur)、卡片透明度(cardOpacity)、层级(zIndex) 复用上方 overlay 模式的配置；
	// 背景透明度(opacity)不适用（全屏壁纸不透明）；导航栏透明模式由 fullscreen.navbar.transparentMode 控制，脱离 banner 的 navbar 配置
	fullscreen: {
		// 布局模式："classic" 经典文档流全屏壁纸，"hero" 固定全屏首屏壁纸
		layout: "classic",
		// 图片位置
		position: "center",
		// 全屏壁纸模式的导航栏配置
		navbar: {
			// 导航栏透明模式："semi" 半透明，"semifull" 动态透明（仅首页顶部透明、下滑玻璃化；非首页均跟卡片半透明）
			transparentMode: "semifull",
			// 导航栏毛玻璃模糊度，0 即关闭（玻璃态生效）
			blur: 12,
		},
		// 首页下滑时壁纸模糊渐变开关（从 0 渐变为 overlay.blur 的最大模糊）
		// 关闭后该设备上全屏壁纸保持清晰（首页与非首页都不模糊），设置面板的模糊度滑块也会隐藏
		blurRamp: {
			enable: {
				// 桌面端是否启用模糊渐变
				desktop: true,
				// 移动端是否启用模糊渐变
				mobile: true,
			},
		},
	},
};
