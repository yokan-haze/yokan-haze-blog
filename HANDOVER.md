# 交接文档（HANDOVER）

> 新对话接手时**先读这个文件**，再读 `AGENTS.md` 和下面的代码。
> 最后更新：2026-10-18

## 一、项目现状

站点：`https://yokan-haze.pages.dev`（Cloudflare Pages，Direct Upload + GitHub Actions 自动构建）
仓库：`yokan-haze/yokan-haze-blog`，主题 Firefly v6.16.8（Astro 7 静态站）
站长：零（ownerName），界面语言中文。

## 二、已经做完并上线的（都实测过）

| 功能 | 位置 |
|---|---|
| 4K 壁纸（3840×2160/60fps，8.35 MB） | `public/assets/videos/silhouette-field-4k.mp4` |
| 壁纸首帧占位（消除黑屏） | `public/assets/images/wallpaper-poster.webp` + `layout-styles.css` 末尾 |
| 全站默认外观设置 | `src/data/siteSettings.json`（**站长自己维护**） |
| 设置保存接口 | `functions/api/settings.ts` |
| 设置保存后台 | `src/pages/admin/index.astro` → `/admin/` |
| 写文章接口 | `functions/api/content.ts`（GET 列表 + POST 新建/更新） |
| 读单篇接口 | `functions/api/file.ts`（GET，供编辑器回填） |
| 删除接口 | `functions/api/delete.ts` |
| 文章编辑器 | `src/pages/admin/edit.astro` → `/admin/edit/` |
| 内容列表 | `src/pages/admin/list.astro` → `/admin/list/` |
| 写作悬浮按钮 | `src/components/common/WriteFab.astro`（右下角） |

**Cloudflare 环境变量**（已配，勿动）：`ADMIN_PASSWORD`、`GH_TOKEN`（都是 Secret 类型）。

## 二·补：2026-10-18 夜里这一轮（代码完成、本地实测通过，等上线）

站长提的四件事已全部改完，**验证方式**见每条的「怎么验的」：

### 1. 后台换页后不初始化 → 已修（根因不是「没监听事件」）

- **根因**：`/admin/`、`/admin/list/`、`/admin/edit/` 的逻辑写在各页面的
  `<script is:inline>` 里。Astro 把这些脚本渲染到 `</html>` 之后（swup 容器之外），
  软导航时 swup 只换容器内容 —— 脚本既不会执行也不会被插进文档，页面看着在、点了没反应。
- **改法**：逻辑全部搬进 `src/utils/admin-init.ts`，由 `Layout.astro` 的打包脚本调用一次，
  监听 `astro:page-load` 与 `swup:page:view` 重新绑定；每个入口按钮用
  `data-admin-bound` 打标（DOM 被 swup 换掉后标记自然消失 → 新页面一定重新绑定）。
  三个 admin 页面里的内联脚本已删除。
- **怎么验的**：headless Chrome 真点 —— 首页点「写文章」软导航到 `/admin/edit/`，
  确认 `window` 标记还在（证明没整页刷新），再点「读取内容」，状态文字出现；
  再软导航到 `/admin/list/`，用 mock 接口读列表并渲染出 `first.md`。

### 2. 音乐卡片加载慢 → 改成不阻塞

- `MusicManager.astro`：歌单成功拉到后写 `localStorage`（键 `firefly-music-playlist-v1`，TTL 6 小时），
  6 小时内直接用缓存、**完全不请求第三方**；接口不可用时最多等 4 秒（每个镜像单独 AbortController），
  且原来「串行重试 3 个镜像」改成**并行抢第一个成功的**（最坏情况从 ~3×超时 变成 1×超时）。
  缓存过期但接口挂了 → 用旧歌单兜底，卡片不空。
- `MusicPlayerView.astro`：加载遮罩不再去掉 `pointer-events-none`（以前加载期间整张卡片点不动）；
  失败时标题变成「歌单加载失败 · 点此重试」，点标题或点播放都会重新请求。
- **怎么验的**：用 CDP `Fetch` 域把三个 meting 域名全部挂起（模拟接口卡死）：
  4.3 秒内初始化结束、遮罩淡出、卡片可点、点播放会重新发起请求；
  预置缓存后 0.6 秒内出歌单；预置过期缓存 + 接口卡死 → 出旧歌单。

### 3. 文章页右下角「编辑」，就地编辑（不跳页）

- 新组件 `src/components/admin/PostInlineEditor.astro` + `admin-init.ts` 的 `initPostInlineEditor`。
- 文章页（`src/pages/posts/[...slug].astro`）用 `entry.filePath` 传真实仓库路径
  （`src/content/posts/xxx.md`），按钮 `data-file-path` 带着它。
- 点按钮 → 弹层 → `GET /api/file` 读回标题/简介/标签/分类/草稿/正文 → 改完
  `POST /api/content`（`filename` 用原文件名，走更新）→ 停留在这篇文章。
- **必须知道的两个坑**（都实测踩到了）：
  1. `#content-wrapper` 带 `.onload-animation`（`animation: fade-in-up ... forwards`），
     动画结束后 `transform` 是 `translateY(0)` 而不是 `none` → **会成为 `position: fixed` 的包含块**，
     按钮直接跑到屏幕外（实测 `bottom: -1037px`）。所以初始化时把整个 `#post-edit-root`
     **搬进主题的浮动控件列**（`.floating-controls-container`，见下面「按钮位置」）。
  2. 一次软导航里 `astro:page-load` 和 `swup:page:view` **都会来**，清理函数被调用两次；
     不能无脑删所有搬出来的节点，否则会把刚搬出来的按钮自己删掉（第一版就这么翻车了）。
     现在的判定：`#swup-container` 里有新 SSR 节点就全删旧；否则按 `data-admin-url` 比对 URL。
- 按钮位置（2026-10-18 晚，站长追加：「把编辑改到和他们一起，这样更好看」）：
  不再是自己做的绿色胶囊，而是**直接复用主题的 `<FloatingButton>`**（同样的 3rem 圆角玻璃块、
  同样的主题色图标、同样的 8px 间距），初始化时插进 `.floating-controls-container` 的**第一位** ——
  也就是右下角「目录 / 沉浸阅读 / 回首页」那一列的最上面，与它们完全同款同列。
  那一列自带响应式（≤480px 变 2.5rem），移动端自动跟随。
  注意：那一列是 `pointer-events: none`（`pointer-events` 会继承），所以面板与遮罩
  必须显式写 `pointer-events: auto`，否则弹层点不动。
- 「写文章」胶囊保持原样（绿色、带文字、显眼），位置改成 `right: 6.5rem; bottom: 6.5rem`，
  留 30px 让开那一列（移动端 `right: 4.5rem`）。

### 4. 编辑器标题字号 → 已确认到位（并顺手修了两个小问题）

- `#title` 是 `style="font-size: 1.6rem; line-height: 1.3"`，实测 computed `25.6px / 700`，
  简介 16px，正文 24 行 —— 层次成立。
- 顺手：`WriteFab` 的图标原本写的是 `<span class="material-symbols:edit-document">`（只是个类名，
  没有对应图标规则，等于没有图标；移动端又把文字藏了 → 一个点不到的小绿圆），
  改用主题的 `<Icon>` 组件；同时把「写文章」按钮左移一列，避免压住主题自带的圆形浮动控件。
- 另外 `src/utils/site-settings.ts` 的导出没写显式类型，`pnpm type-check`
  （`--isolatedDeclarations`）一直是红的 —— 本次补了 `SiteSettings` 接口，现在 type-check 通过。

### 接口层同时加固（不然「就地编辑」会悄悄改坏文章）

- `functions/api/content.ts`：更新已有文件时**保留调用方没提交的 frontmatter 字段**
  （`pinned` / `comment` / `slug` / `password` / `series` …原样保留，连写法都不动）；
  `body` 不传 = 保留原正文（传空串才是明确清空）。以前是按新版整体重写，这些字段会被静默丢掉。
- `functions/api/file.ts`：frontmatter 解析补上块状写法（`tags:` 换行 `- 随笔`）与多行标量，
  否则编辑器把标签读成空、保存时又把它抹掉。
- **怎么验的**：`ff-api-test.mts`（会话工作区里）用假 GitHub API 直接跑 `onRequestPost` /
  `onRequestGet`，11 组断言全过：字段保留、空值删除、`published` 裸日期、401、块状 tags 读成数组。

## 二·补二：2026-10-18 深夜这一轮（首页只放置顶 4 篇 / 本子 / 上传）

站长原话四件事：

### 1. 「文章」下拉里加「本子」——把所有文章都记进去

- 页面：`src/pages/notebook/[...page].astro` → `/notebook/`（超过一页时 `/notebook/2/` …）。
  导航在 `navBarConfig.ts` 的 `LinkPresets.Notebook`，图标 `material-symbols:menu-book-rounded`。
- **形态是「文章卡片」，不是文字列表**（站长第一版反馈：「本子里的内容是以卡片的形式，而不是这样，
  你这个和归档重复了」）。实现上直接复用 `PostPage` / `PostCard`：网格/列表切换、封面、摘要、
  置顶标记全都跟首页一致，只是**不过滤置顶、全量**。
- 排序同首页（置顶优先 → 发布日期倒序，见 `getSortedPosts()`），页头显示「共 N 篇 / 置顶 M 篇」。
- 为什么必须有它：首页只放置顶的 4 篇，没置顶的文章从首页看不到；而归档是按年罗列的文字列表，
  不是卡片，两者不要做成一样。

### 2. 首页只留 4 篇，而且必须是置顶的

- `src/pages/[...page].astro` 的 `getStaticPaths`：`getSortedPosts()`（置顶优先、再按日期）
  → `filter(pinned)` → `slice(0, 4)` → `paginate(..., { pageSize: 4 })`。
- 结果：**取消置顶 = 文章从首页消失**；把 5 篇以上置顶时只显示最新的 4 篇；
  `/page/2/` 这类分页不再生成；一篇置顶都没有时首页显示「去本子看全部」的提示卡。
- 实测：造 4 篇临时置顶（共 5 篇置顶）→ 首页正好 4 张卡、最早那篇被挤出列表；删掉临时文件还原。

### 3. 写文章里要有「置顶」

- 编辑器 `/admin/edit/` 加了 `#pinned` 复选框（挨着「存为草稿」，文案带「首页只放置顶的 4 篇」）；
  文章页的就地编辑面板也加了 `#pe-pinned`。
- `functions/api/content.ts` 的 `FIELDS.posts` 补了 `pinned`，否则服务端白名单会把值丢掉。
- 实测：勾选/取消 → 发布 → 抓 `POST /api/content` 的 payload 确认 `data.pinned` 正确；
  接口层直接跑处理器：写入 `pinned: true`、取消写成 `pinned: false`、不会出现两条 `pinned`。

### 4. 写文章里要能上传图片和视频

- 新接口 `functions/api/upload.ts`：`POST /api/upload`，body = `{ filename, type, data(base64) }`。
  - 走 **Git Data API**（blob → tree → commit → 更新 ref），写进 `public/uploads/`，
    构建后公开在 `/uploads/xxx`；和原来的 `birds-fly.webp` 同一个目录。
  - 单文件上限 **25 MB**；只收图片（png/jpg/webp/gif/avif/svg）与视频（mp4/webm/mov/m4v/ogg）。
  - 文件名 = UTC 时间戳 + 纯 ASCII slug（汉字会被丢掉、落到 `media`）—— 因为文件名会进正文 URL。
  - 分支被并发推进（PATCH 422）会**重读 head 重试**，否则第二个上传会丢文件。
  - **每次上传 = 一次提交 = 一次重新构建（约 1 分钟）**，所以编辑器提示是「约 1 分钟后生效」。
- 编辑器 UI：封面行（`#image` + 「上传封面图」）、正文上方「上传图片 / 上传视频」，
  上传成功后：封面图直接填进 `#image`；图片插入 `![](url)`；视频插入
  `<video src controls playsinline>`（Markdown 里的原生 HTML 会原样输出）。

### 5. 「文章」下拉里的「标签」删掉

- `navBarConfig.ts` 里注释掉了 `LinkPresets.Tags`，下拉现在是：本子 / 归档 / 分类 / 系列。
- `/tags/` 页面本身还在（老链接不会 404），只是导航栏不再给入口。
- **注意**：文章卡片上的 `#随笔` 这类标签仍然会显示（站长只说了图 1 的菜单项）。
  如果他也要去掉卡片上的标签，改 `PostCard.astro` 的 tag 区块与前台的 `PostMeta`。

### 这一轮的验证脚本（都在会话工作区 `~/.dsh/browser-sessions`）

- `ff-api-test.mts`：直接跑 `content.ts`/`file.ts` 处理器，30 条断言（含 pinned 写入/取消）。
- `ff-upload-test.mts`：直接跑 `upload.ts`，11 条断言（blob 内容、tree 路径、422 重试、类型/空内容/401）。
- `verify-features.mjs`：headless Chrome 真点编辑器 —— DataTransfer 造 File 触发上传、
  检查插入的 Markdown/HTML、封面回填、pinned 进 payload。
- `test-home-limit.mjs`：临时造 5 篇置顶验证「首页正好 4 篇」。
- `check-build-features.mjs`：构建产物里首页/本子/导航/编辑器的关键点。

### 本地工作区的一条提醒（2026-10-18 深夜）

站长的文章是在 **Pages CMS / 线上后台**里增删的，所以本地 src/content/posts/ 会落后。
这一轮已经用 ~/.dsh/browser-sessions/sync-posts.mjs 从远端同步过：

- 本地现在有 3 篇：irst.md（置顶）、2026-10-13-133540.md（岸宝）、2026-10-14-195638.md（若我放生…）
- git status 里会看到 2026-10-11-.md / 2026-10-11-birds-fly.md 显示为删除、两篇新文章显示为未跟踪 —— 
  **这是「本地跟上远端」的正常状态，内容与远端一致，不要回退、也不要当成没提交的改动推上去。**
- 同理 src/data/siteSettings.json 也是从远端同步来的（与远端逐字节一致）。

下次改动前如果又隔了几天，先跑一遍 sync-posts.mjs 与 sync-settings.mjs 再动手。

## 二·补三：2026-10-19 右上角「设置」面板

站长发来右上角「调色盘 + 太阳」两个图标的截图，要求：「弄一个设置插件，里面要有壁纸修改，
把这两个也一并弄进去，还有头像、logo、标题、站点外观头像、导航栏修改都要在里面」。

### 做法：合并成一个齿轮入口 + 原显示面板加「站点」tab

- **右上角只剩一个按钮**：`src/components/layout/Navbar.astro` 里原来的
  `#display-settings-switch`（调色盘）和 `LightDarkSwitch`（太阳 + `#theme-mode-panel` 下拉）
  合并成**一个齿轮按钮**（仍然沿用 `id="display-settings-switch"`，浮动面板的开关脚本不用改）。
  太阳那个下拉已删除，明暗改到面板里。
- **面板本体**是 `src/components/controls/DisplaySettingsIntegrated.svelte`，现在 4 个 tab：
  - 外观：主题色相 / 文章布局 / 卡片样式（原有）
  - 壁纸：壁纸模式 + 透明度 / 背景模糊 / 卡片透明度（原有）
  - 特效：樱花（原有）
  - **站点**（新增）：明暗三选（浅色 / 深色 / 跟随系统，只对本机生效）、
    头像、导航栏 Logo、深色模式 Logo（各自可「换图」上传）、站点标题、副标题、
    导航栏（透明程度 / 固定方式 / 毛玻璃模糊度 / 满宽）、后台密码 + 「保存到站点」
- 为了加 tab：`TabKey` 加了 `"site"`、`visibleTabs` 里总是 push 站点 tab、
  `hasAnyContent` 改成恒 `true`（站点 tab 永远存在）。

### 数据与接口

- `src/data/siteAppearance.json` 新增 `navbar: { mode, widthFull, transparentMode, blur }`；
  `siteConfig.ts`（navbarMode / widthFull）和 `backgroundWallpaper.ts`（banner.navbar 的
  transparentMode / blur）改成从这里读（防御性读取 + 默认值）。
- **新接口 `functions/api/appearance.ts`**：`POST /api/appearance`（ADMIN_PASSWORD 鉴权）
  把头像 / Logo / 标题 / 副标题 / 导航栏写回 `src/data/siteAppearance.json`：
  - 只覆盖调用方给的那几个键，其它键原样保留（避免把 Pages CMS 写的字段冲掉）
  - 地址白名单：只允许 `assets/`、`/`、`http(s)://`，且拒绝 `..`（挡 `javascript:`）
  - 标题 1-40 字、副标题 ≤80 字、模糊度 0-24、导航栏模式/透明度的枚举校验
  - 写出 2 空格缩进 + 末尾换行的 JSON，和仓库里现有格式一致
- 上传复用 **`/api/upload`**（写 `public/uploads/`），选图后回填地址 + 预览，再点「保存到站点」。
- **一个坑**：`siteAppearance.json` 里的头像是 `assets/images/avatar.webp`（src 源路径），
  直接当 `<img src>` 会 404。预览用的 URL 在 `Navbar.astro` 构建期用
  `getAuthorAvatarUrl()` / `getSiteLogo()` 解析，再去掉 origin 变成站内相对路径传进组件
  （`avatarUrl` / `logoUrl` 两个 props）。否则面板里就是一个裂图的圆圈。

### 验证

- `verify-settings-panel.mjs`（headless Chrome）：齿轮存在、旧调色盘/太阳都不在了、
  4 个 tab 都在、站点 tab 的控件齐全、点「深色」真的切主题、没密码时上传给提示、
  有密码时上传头像预览变成 `/uploads/...`、保存真的 POST 到 `/api/appearance` 且带上 navbar 四字段。
- `ff-appearance-test.mts`（直接跑接口处理器，假 GitHub）：16 条断言 —— 只改标题时其它字段保留、
  导航栏四字段写入、脏地址 / 空标题 / 越界模糊度 / 未知模式 / 错密码全部被挡、JSON 格式正确。
- `probe-tabs.mjs`：逐个点 4 个 tab，确认内容都在（`hasAnyContent` 改动没弄坏别的 tab）。

### 追加（2026-10-19 中午）：删掉深色 Logo + 壁纸上传

站长看完面板后说：「深色模式 logo 可以删除，里面要有修改壁纸的功能，就是上传图片视频修改壁纸的功能」。

- **深色模式 Logo 入口已删**：站点 tab 里只剩「头像 / 导航栏 Logo」两个上传行。
  保存时**不再下发 `valueDark`**，服务端看到字段缺省会保留原来那张深色 Logo
  （`/api/appearance` 的 merge 逻辑本来就是这样），导航栏暗色态不受影响。
- **壁纸 tab 新增「壁纸图片 / 背景视频」**：电脑端壁纸 / 手机端壁纸 / 背景视频三行，
  每行有缩略预览 + 「换图 / 换视频」；选图 → `/api/upload` 传到 `public/uploads/` → 预览更新 →
  点「保存壁纸」写回 `src/data/wallpapers.json` → 约 1 分钟生效。另有「恢复默认」
  （写回 d1-d6 / m1-m6 / 4K 视频那套）。
- **新接口 `functions/api/wallpapers.ts`**：`POST /api/wallpapers`
  - 只替换提交的那一项（`desktop` / `mobile` / `video`），其它键原样保留；`{reset:true}` 恢复默认
  - 路径白名单（`assets/`、`/`、`http(s)`），拒绝 `..`；只写这一个文件
  - **只改指向、不删旧文件**：换掉的壁纸文件仍在仓库里，所以随时能「恢复默认」回去
- **⚠ 配置里踩过的坑**：`backgroundWallpaper.src` 的视频地址是
  **`src.playerUrl`（和 desktop/mobile 同级）**，不是 `src.videos.playerUrl` ——
  按后者取会一直拿到空值，面板里视频那行显示「未设置」。
- `toSrcPath()` 现在会**保留 `/uploads/` 开头的公共路径**：原来它无条件去掉开头的斜杠，
  上传到 public 的壁纸会被当成 `src/assets` 相对路径而 404。`/assets/...` 这类旧值仍然会去斜杠
  （它们确实在 src 下）。`ImageWrapper` 对以 `/` 开头的图直接输出 `<img>`，不参与优化。
- 限制：上传的壁纸**不走构建期优化**（原格式、原体积），图片建议 AVIF/WebP；
  视频受 `/api/upload` 的 25MB 上限约束，建议先压到 1080p 以上。

### 追加二（2026-10-19 下午）：壁纸上传上线 + 一个埋了很久的坑

上线后逐项复查，发现面板里「电脑端 / 手机端壁纸」的缩略图在线上是空的。**继续挖下去发现根因不在面板：**

> `src/assets/images/DesktopWallpaper/*`、`MobileWallpaper/*` 这 12 张壁纸图**从来没进过远程仓库**
> （远端 `src/assets/images/` 下只有 `avatar.webp` 和 `logo/`，GitHub Contents API 对壁纸目录直接 404）。
> 也就是说**线上站点一直没有壁纸图**——因为首页用的是 4K 背景视频（在 `public/assets/videos/` 里，那个确实推过），
> 视频把画面全盖住了，所以一直没人发现。

修法：用新写的小工具把文件补进仓库。

```powershell
# 用法：node push-files-via-api.mjs "<提交信息>" <文件...>
node push-files-via-api.mjs "add: 把 12 张原创壁纸图（桌面 6 / 手机 6）补进仓库" src/assets/images/DesktopWallpaper/d1.avif ...
```

为什么需要它：`push-via-api2.mjs` 是按「本地 commit 差异」算变更的，而这些图在本地**早就提交过**，
所以从任何近期的基准 commit 都 diff 不出来 —— 这正是它们缺席好几轮部署的原因。
`push-files-via-api.mjs` 直接按文件列表上传 blob + 建一次提交（内容相同的会跳过），专门补这种「本地有、远端没有」的文件。

补进去之后，线上的壁纸图（`/_astro/d1...webp` 等 12 张）和面板缩略图全都正常了。

### 另外两条教训（都很贵）

1. **本地 `pnpm check` 必须看退出码，不要只看 grep**：`pnpm check | Select-String 'error' | Select-Object -First N`
   只看了前几行 / 只看 `Result`，漏掉了 `- 1 error`（单数），结果 CI 的 `pnpm astro check` 闸门把我拦下来一次。
   现在固定用 `"check exit=$LASTEXITCODE"`。
2. **eager glob 的类型不一样**：`import.meta.glob(..., { eager: true })` 得到的是 `ImageMetadata`（不是函数），
   别再 `typeof file === "function" ? await file() : file` —— 会得到 `never` 并让 `astro check` 报 ts(2349)。

### 壁纸上传的最终形态

- 壁纸 tab 三行：电脑端壁纸 / 手机端壁纸 / 背景视频，各自「换图 / 换视频」→ `/api/upload` → 预览 → 「保存壁纸」
- 「恢复默认」= 写回 d1-d6 / m1-m6 / 4K 视频那套（旧文件不删，随时能回去）
- 缩略图优先用构建期解析出的优化图 URL；拿不到时用 LQIP 渐变底 + 图片图标兜底
- 上传的图走 `public/uploads/`（公共路径），所以 `toSrcPath()` 特意保留 `/uploads/` 前缀

### 追加三（2026-10-19 傍晚）：壁纸来源可切 / 删多余项 / 导航栏即时预览 / 上传不压缩

站长三条要求：①「电脑壁纸和背景视频自由切换，把纯色背景按钮改成切换这两个的按钮」
②「手机壁纸删掉、副标题删掉；导航栏那几个点了没看到效果，有什么用」
③「上传壁纸的视频/照片不要压缩，4K 就 4K」。

- **壁纸来源**：壁纸模式去掉「纯色背景」（只剩横幅 / 全屏 / 覆盖），下面新增一组
  「壁纸来源：电脑壁纸 / 背景视频」，点一下即时切换（localStorage + `<html data-wallpaper-source="image">`）。
  - ⚠ 关键坑：**光把视频层 `display:none` 不够**。视频播放时 BackgroundPlayer 会挂
    `data-bg-video-playing`，那条属性会把 `#banner-images-container` 等壁纸图层淡出成 `opacity:0`，
    于是「电脑壁纸」模式只看到 `#wallpaper-wrapper` 的 poster 底图（`/assets/images/wallpaper-poster.webp`），
    根本不是配置的那 6 张壁纸。正确做法是走播放器自己的开关
    （`window.dispatchEvent(new CustomEvent("bg-player-toggle"))`），它会撤掉那条属性、壁纸图才真的露出来；
    BackgroundPlayer 里的自动播放也加了判断：`data-wallpaper-source === "image"` 时不自动播。
- **删掉**：壁纸 tab 的「手机端壁纸」行（只留电脑端 + 背景视频，接口也不再提交 mobile）、
  站点 tab 的「副标题」输入框（保存时不下发 subtitle，服务端保留原值）。
- **导航栏四项改成即时预览**：透明程度 → `#navbar[data-transparent-mode]`；模糊度 →
  `--navbar-glass-blur`；满宽 → `#navbar[data-full-width]`；固定方式 → `body.sticky-navbar` /
  `dynamic-navbar`。点一下当场看到效果，保存到站点后才是全站生效（分区标题写了这句）。
- **上传不压缩**：`/api/upload` 支持**原始字节直传**（`content-type` 是图片/视频 + `x-filename` 头），
  不再走 base64 JSON（请求体不再膨胀 1/3）；接口不做任何转码/压缩/改分辨率；
  上限从 25MB 提到 **图片 30MB / 视频 40MB**（Worker 内存 + GitHub 接口的安全线），超限 413 并说明原因。
  `/admin/` 编辑器上传也改走这条（新增 `postBinary`）。

### 这辈子都别再踩一次：headless Chrome 连 Cloudflare 走 HTTP/3 会“假死”

第三轮上线后，线上复查一度显示「设置面板打不开、tab 点不动、所有 island 都没水合」，
但同一份产物在本机 dev server 里完全正常。查了很久，结论是**环境问题**：

> 本机 headless Chrome 访问 `https://yokan-haze.pages.dev` 时走 HTTP/3（QUIC），
> `<script type="module">` 会一直挂起不执行 —— `document.readyState` 永远停在 `interactive`，
> `astro-island` 的 `ssr` 属性不消失（没水合），`window.swup` 是 `undefined`，
> 控制台却一个错误都不报。加 `--disable-quic` 立刻恢复正常。

所以 `browser-sessions/` 下**所有 headless 验证脚本现在都带 `--disable-quic`**。
以后线上复查再看到「整页都没有交互」，先加这个参数排除，别急着怀疑代码。

## 二·补四：2026-10-19 夜深：设置后台并进面板 / 卡片标签删除

站长原话：「把设置后台一并弄到设置里去，还有你上次说的卡片标签要删掉」。
（注意：这两件事当天下午做过一次，站长先说「弄错了取消」让我全撤了，随后又要求照做 ——
所以这一轮是**重新做**，不是改上一轮。）

### 1. 「保存为全站默认」现在两个入口共用一套逻辑

- 新文件 **`src/utils/site-settings-client.ts`**（唯一实现）：
  `SETTING_KEYS`（15 项，和 /api/settings 白名单、主题真实的 localStorage 键一致）、
  `readLocalSettings()`（把 `"true"`/`"0.8"` 还原成布尔/数字 —— 服务端不做隐式转换，类型不对会直接丢）、
  `saveSiteSettings(password, settings?)`（POST /api/settings，解析回执，返回 `{ok,status,savedCount,error}`）、
  `readStoredPassword()` / `rememberPassword()`（键仍是 `adminPassword`）。
- **入口 A（新）**：右上角齿轮 → 站点 tab → 「全站默认外观」区块 + 「保存为全站默认（约 1 分钟生效）」按钮。
  密码复用同一个输入框（和「保存到站点」共用 `adminPassword` 状态），不再需要跑去 /admin/。
- **入口 B（旧）**：`/admin/`（`src/pages/admin.astro` + `admin-init.ts`）只保留 DOM 与表格渲染，
  读取/提交都改成调共用模块 —— 两边不会再各维护一份白名单。
- **接口修正**：`functions/api/settings.ts` 以前是**整体覆盖**（只保留 `_` 开头的注释键）。
  面板只提交「这台浏览器里改过」的键，整体覆盖会把没提交的键清掉 → 构建时回退成代码默认值，
  等于悄悄重置站长设置。现在保留已有项，只覆盖本次提交的键。

### 2. 文章卡片上的标签删除了

- `PostCard.astro`：删掉底部标签区块（`post-card-bottom-tags`）与相关计算
  （`tagsPosition` / `tagCount` / `tagsBottomStyle`），PostMetadata 不再传 `tags`，尾部固定显示 stats。
- `PostMeta.astro`：删掉标签渲染块与 props（`tags` / `showTags` / `maxTags` / `showNoTags` /
  `hideTagsForMobile`）以及 `.post-meta-tags` 的 CSS。
- 调用方 `PostPage.astro`、`posts/[...slug].astro`（封面变体 + 正文上方）同步去掉 `tags` 传参。
- **标签数据本身没动**：frontmatter、`/tags/` 页面、RSS/JSON 元信息都在，老链接不 404。
  以后想恢复显示，把 `PostMeta` 的按钮块加回来即可（配置项 `postListLayout.meta.showTags` 等仍留在 siteConfig 里）。

### 验证（这一轮按「验证纪律」逐层过）

| 层 | 脚本 | 结果 |
|---|---|---|
| 共用模块 | `ff-settings-client-test.mts` | 18 条断言全过（类型还原、请求形状、密码头、401 / 空密码 / 无设置不发请求） |
| 接口处理器 | `ff-settings-api-test.mts` | 14 条全过（15 项写入且类型正确、脏值丢弃、已有项保留、401/400/503、tab 缩进 JSON） |
| 界面（本地 dist + mock） | `verify-panel-defaults.mjs` | 19 条全过（面板按钮真的 POST、/admin/ 仍可用、卡片/文章页无标签、/tags/ 仍 200） |
| 构建 | `pnpm check` / `type-check` / functions tsc / `pnpm build` | 全 exit 0；产物里 `post-card-bottom-tags`/`post-meta-tags`/`#随笔` 均为 0 |
| 线上 | `live-check-round4.mjs` | 10 条全过（接口 401/健康检查、面板有按钮且点了有反馈、首页与文章页无标签、/tags/ 200） |

上线 commit：`6a71b6e`（远端），工作流 `39240553276` success。

## 二·补五：2026-10-19 深夜：「写文章」→「落笔」

站长原话：「主页右下角的写文章按钮不好看，换一个文雅点的名字，图标也要改，绿色的很难看很突兀。
以后写文章这个按钮只会出现在主页和本子里，其他地方一律不要出现。」

### 改成了什么

- 文案 **写文章 → 落笔**（`title` / `aria-label` 也一起：落笔 · 写一篇新文章）
- 图标 `material-symbols:edit-document` → **`material-symbols:ink-pen`**（钢笔，先确认过
  `@iconify-json/material-symbols` 里有，构建后是真的 svg 而不是空 span —— 这个坑 10-18 踩过一次）
- 样式从「`--primary` 实心绿胶囊」改成跟主题浮动控件同款的**玻璃胶囊**：
  `--card-bg` 底 + `backdrop-filter: blur(12px)` + 细描边 + 柔和投影，文字/图标用 `--deep-text`
  （深墨色），hover 只加深底色并上浮 1px
- ⚠ **这套主题里所有颜色的 hue 都是 165**（绿的）：`--primary` 彩度 .14、`--btn-content` .12、
  `--deep-text` 只有 .02。所以「绿不绿」要看**彩度 C**，不能看 hue，也别再用 `--btn-content` 当文字色

### 只在首页与本子出现（两个坑）

1. **SSR 判断**：`MainGridLayout.astro` 用 `shouldShowWriteFab(Astro.url.pathname)` 决定首帧显隐；
   逻辑在 `src/utils/write-fab.ts`：`/` 或含 `/notebook`（含分页 `/notebook/2/`、兼容子路径部署）。
2. **不能只在目标页面渲染这个元素**：`#write-fab` 渲染在 swup 容器之外，
   从「文章页」软导航回「本子」时，swup 只替换容器内容 —— 元素不会被补回来，
   站长会遇到「本子里看不见落笔」。所以现在**处处渲染**（`<WriteFab hidden={!showWriteFab} />`，
   隐藏时 SSR 直接写 `style="display: none"`），再由 `initWriteFabVisibility()`
   在 `astro:page-load` / `swup:page:view` 时按当前地址校正（隐藏时同时 `aria-hidden` + `tabindex=-1`）。

### 顺带发现（记一笔，不是这轮引入的）

线上生产构建里 `window.swup` 是 `undefined`、`<html>` 没有 `swup-enabled` 类，
点链接看起来是**整页跳转**；而同一份 dist 在本机 mock server 里 swup 是正常工作的。
无头 Chrome 访问线上时 `document.readyState` 长期停在 `interactive`（load 事件不来）。
以后线上复查看到「没有软导航」先别慌，用整页打开逐页断言即可；
真要查软导航行为，用本机 dist（mock-server.mjs）那套。

### 验证

| 层 | 脚本 | 结果 |
|---|---|---|
| 本地界面 | `verify-write-fab.mjs` | 17 条全过：文案/标题/链接/图标 svg、底色是浅色玻璃、毛玻璃、胶囊圆角、文字彩度 ≤ .04；归档/文章页/admin 都 `display:none` 且宽高 0；本子可见；软导航 首页→归档 隐藏、→本子 恢复；移动端仍有「落笔」且在视口内 |
| 线上 | `live-check-writefab.mjs` | 16 条全过：5 个页面的 HTML 首帧显隐正确、文案/图标/配色/位置正确、整页打开四页显隐正确 |
| 构建 | `pnpm check` / `type-check` / `pnpm build` | 全 exit 0 |

上线 commit：`e37a2dd`、`f04bf17`（远端），工作流均 success。

#### 追加：位置从右下角挪到个人卡片（2026-10-19 深夜）

站长：「他在右下角不太好看，我想换一个地方。而且我希望他可以固定，不要我滑动他也跟着滑动」
→ 问了三个候选位置，站长选了 **C：放进左侧栏个人卡片下面**。

先说明一个测量结果（免得以后又被绕进去）：原来那个浮动胶囊**本来就是 `position: fixed`**，
在本子页滚 600px 它的 `top` 一点没变（735→735）。所以「跟着滑动」如果指的是
「希望它跟着页面走、滚过去就看不见」，那现在这个位置才对 —— 现在它确实随页面滚动
（线上实测滚动 600px 后 `top` 从 1371 变到 771）。

- `src/components/widget/Profile.astro`：社交图标那一行下面加「落笔」入口
  （`btn-regular` 全宽按钮 + `ink-pen` 图标，和卡片里其它按钮同一套）
  - ⚠ **用 class `.write-entry` 不要用 id**：移动端会渲染两份个人卡片
    （左侧栏那份隐藏 + `mobileBottomComponents` 底部那份可见），id 会撞，
    `getElementById` 只能拿到隐藏的那份
- `src/layouts/MainGridLayout.astro`：不再渲染浮动按钮；
  `src/components/common/WriteFab.astro` 已删除（要回滚看 git 历史）
- `src/utils/write-fab.ts`：`initWriteFabVisibility` → `initWriteEntryVisibility`，
  按 class 遍历所有入口做显隐兜底（移动端底部那份不在 swup 主容器里，切页可能残留）
- 显隐规则不变：首页 / 本子（含分页）才有；归档、标签、文章页、`/admin/` 都没有

验证：`astro check` 0 errors、`pnpm build` exit 0；
`verify-write-entry.mjs` 16 条全过（桌面在个人卡片里、static 不悬浮、宽度撑满、其它页没有、
本子有、手机是底部那份可见且不溢出、无报错）；
`live-check-write-entry.mjs` 10 条全过（5 个页面 HTML 有无入口、线上渲染位置/流内、
旧浮动按钮消失、滚动时随页面移动）。

## 二·补六：2026-10-19 收尾：落笔卡位 / 置顶顺序 / 编辑器字号 / 就地编辑补封面

站长四连（附了 /admin/edit/ 与就地编辑面板两张截图）：

### 1. 「落笔」改成列表末尾的虚线卡位

- 站长原话：「把按钮放在主页卡片中的最后一个卡片的空白处…等我发第四篇时按钮就会出现在第四篇文章上，
  本子页面时就出现在本子的空白处」。
- 做法：`PostPage.astro` 加 `writeEntry` 开关，在 `page.data.map(...)` 之后追加一块
  `#write-entry`（虚线卡片 + ink-pen + 「落笔」+「写一篇新的」），尺寸跟文章卡片同级；
  首页 `[...page].astro` 与本子 `notebook/[...page].astro` 传 `writeEntry`。
  文章变多时它自动排在最后一张卡后面，永远不会压住卡片。
- 顺手删掉：`src/utils/write-fab.ts`（客户端显隐那套不再需要）、
  `Profile.astro` 里的入口（上一版放在个人卡片里，站长说不好看）。

### 2. 首页置顶顺序：由旧到新

- `getSortedPosts()` 是「置顶优先 → 发布日期降序（最新在前）」，所以最早的「青春」被挤到最后一格。
- 站长要「第一个置顶的排最前面，依次往后」→ 首页在 filter 之后显式
  `sort((a,b) => a.published - b.published)` 再 slice(0, 4)。

### 3. 编辑器字号

- 站长澄清：「我说的字号是正文里的」—— 之前我放大的是**标题**，现在标题**改回 1rem**
  （`/admin/edit/` 的 `#title` 与就地编辑的 `#pe-title`）。
- 新增**正文字号调节**：两个编辑器都有 `A− / 读数 / A+`，逻辑在 `admin-init.ts` 的
  `initBodyFontControls()`：localStorage 键 `editorBodyFontSize`，范围 12–26px、默认 15px，
  按钮 `data-font-step="±1"`、文本框 `data-body-font`、读数 `data-font-readout`。

### 4. 就地编辑补齐封面与插图（和「落笔」一致）

- 站长：「编辑文章时为什么没有封面，我如果先换一个封面都换不了；编辑和落笔是一体的，
  不要出现落笔有的功能编辑没有」。
- `PostInlineEditor.astro` 补了**封面行**（输入框 + 上传封面图 + 隐藏 file）和
  **插入行**（上传图片 / 上传视频 + 状态行），并把说明文字改成「封面也在这里改」。
- `admin-init.ts` 的 `initPostInlineEditor`：读原文时回填 `data.image`；
  保存时 **提交 `image`**（原来只是把原值原样带回去，所以换不了封面）；
  上传复用字节直传 + `insertAtCursor`，和 `/admin/edit/` 同一套行为。
- 两个页面的体积提示也更新成「图片 ≤ 30MB、视频 ≤ 40MB；原图原样上传、不压缩」。

### 验证

- `astro check` 0 errors（exit 0）、`pnpm type-check` exit 0、`pnpm build` exit 0
- `verify-round6.mjs`（本地 dist + mock）22 条断言全过：
  首页 3 张置顶顺序 = 青春(10-09) → 岸宝(10-13) → 若我放生(10-14)；
  落笔卡位是列表最后一个子元素、虚线、约 340×192；本子末尾也有，归档/标签/管理页都没有；
  落笔页标题 16px、正文 15px、点两次 A+ 变 17px 且刷新后记住；
  就地编辑封面/上传控件齐全、读原文回填封面、换封面后输入框变 `/uploads/...`、
  上传图片插入 `![...](/uploads/...)`、保存 payload 的 `data.image` 是新封面
- `live-check-round6.mjs`（线上）11 条全过：5 个页面 HTML 有无卡位、首页顺序、
  卡位位置、`/admin/edit/` 标题 16px + 字号控件、文章页就地编辑的封面/上传/字号
- ⚠ 本地仓库里 `2026-10-13-133540.md` / `2026-10-14-195638.md` 是 `pinned: false`（远端是 true），
  所以本地首页只有 1 张卡；验证顺序时临时改成 true、跑完已还原成 false，**不要提交这两个文件的改动**。
- 上线 commit：`6b7cb61`（远端），工作流 `39254370419` success。

#### 落笔最终位置（2026-10-19 收尾）

站长看了「列表末尾虚线卡位」后澄清：「我是说落笔放到头像那里和头像下面那两个小按钮一起」。
所以最终形态是：

- `Profile.astro`：入口放在**社交图标那一排的末尾** —— `[GitHub] [RSS] [✒]`。
  站长 2026-10-19 追加「大小要和他们一样」，所以是**同尺寸方块**：`h-10 w-10`（40×40）、
  纯钢笔图标（文字放在 `title` / `aria-label`：「落笔 · 写一篇新文章」），
  和 GitHub / RSS 完全对齐（同一父容器、Y 坐标一致）。
- 仍然只在首页与本子渲染；移动端底部那份个人卡片同样生效
  （两份卡片会同时渲染，`querySelector('a[href="/admin/edit/"]')` 会先拿到左边栏那份隐藏的 ——
  测试/脚本里要按「有尺寸的那份」挑，别写死 `querySelector`）。
- 上一版的「列表末尾虚线卡位」已全部撤掉：`PostPage` 的 `writeEntry` 参数、
  卡位 DOM 与样式、首页/本子传参都删了。

验证：`astro check` 0 errors、`pnpm build` exit 0；
`verify-entry-row.mjs` 14 条全过（同一父容器、Y 坐标与 GitHub/RSS 一致、高度 40px、
归档/标签/管理页没有、本子有、手机端可见且不溢出、无报错）；
`live-check-entry-row.mjs` 10 条全过。上线 commit：`2ad067a`。

#### 2026-10-22 试过又撤回：WPS 式正文白板

当天把正文编辑器改成了「白板 + 工具条」（选中文字单独改字号 / 加粗 / 颜色，
实现见当时的 `src/utils/editor-richtext.ts`），上线后站长回复「不对变回去」，**已整段 revert**
（commit `3e5dcb8` / 远端 `999c432`）。现在的正文编辑器回到：
**textarea + 「整篇字号 A−/A+」**（localStorage 键 `editorBodyFontSize`，12–26px，默认 15）。

如果以后还要做「选中文字改字号」，那次踩过的坑值得先看一眼（都已写进历史提交 `92da945`）：
工具条取数别用 `document.querySelector`（页面上可能有两条）、别把正文状态存在 `dataset` 里、
白板要 `contenteditable` 打开才能打字、读入原文后要主动 `syncFromSource()`、
`.rt-canvas span[data-size]` 必须每个档位一条 `font-size` 规则（属性值浏览器不会自动换算）。

## 三、站长明确要求、还没做的

（本轮四条已全部完成，暂无其它待办。等站长在线上验收。）


## 四、站长已经确认过的硬规矩（不要违背）

- **壁纸画质优先**：从母带原生分辨率编码，不降分辨率/帧率/码率；必须压在上限 12,000,000 B 内。
- **外观类需求**：让站长自己在 `/admin/` 调并保存，**不要**再改代码里的默认值。
- **提交前必须同步 `src/data/siteSettings.json`**，否则会覆盖站长保存的设置。
- **不要把密码 / 令牌发给站长，也不要站长发给你**。密码只在浏览器与 Cloudflare 之间流动。

## 五、踩过的坑（别重复）

- `@cloudflare/workers-types` 不能写进主 tsconfig（会让 src 下十余个无关文件报错），用 `functions/tsconfig.json` 单独检查。
- `.astro` 模板里少写嵌套 HTML，容易出现 `Unexpected token`。
- PowerShell 里跑内联 node 脚本，中文引号必坏 —— **一律写成 .mjs 文件再执行**。
- ffmpeg 不能直接写项目目录（沙箱），先输出到会话工作区再 copyFileSync。
- 内容接口写出的 frontmatter 必须符合主题 schema：`published` 必填，且要用裸日期（不加引号）。
- **页面级的 `<script is:inline>` 会被渲染到 `</html>` 之后**（swup 容器之外）：
  软导航时既不执行也不插入文档。后台类逻辑一律放 `src/utils/*.ts` + Layout 打包脚本 + `astro:page-load`。
- **`#content-wrapper` 有 `.onload-animation`（`animation: fade-in-up ... forwards`）**，
  动画结束后 `transform` 仍是 `translateY(0)` 而非 `none` → 它是 `position: fixed` 的包含块，
  里面的悬浮按钮会按整篇文章的高度定位（实测 `bottom: -1037px`）。悬浮件要么脱离容器
  （搬到 `body`），要么别放在 `#content-wrapper` 里。
- **一次软导航会连发 `astro:page-load` 和 `swup:page:view`**：任何「先清理再重建」的逻辑
  都要幂等，否则第二次调用会把第一次建好的东西删掉。
- `WriteFab.astro` 里原本用 `<span class="material-symbols:edit-document">` 当图标 —— 那只是
  一个类名，没有对应规则；图标要用主题统一的 `<Icon name="material-symbols:..." />`。
- 长提交信息用 `git commit -F <文件>`，否则引号会被 shell 截断。
- 本地 git 与远端 hash 会分叉（API 推送导致），用 `push-via-api2.mjs <本地base> main`。

## 六、验证纪律（这条最重要）

**「代码在产物里」≠「功能能用」。**

真实教训：编辑器「修改已有文章」我确认了 `/api/file` 出现在构建产物里就报完成，
实际站长点开发现**表单是空的**（读取逻辑根本没执行）。类似问题发生过不止一次。

以后每条改动必须满足：
1. 构建 `pnpm build` exit 0、`astro check` 0 errors；
2. **接口层面**：用 curl 或脚本实际调用一次，看返回；
3. **界面层面**：能本地起预览就截图看；需要密码的，**明确告诉站长「这一条需要你验证」**，
   不要自己宣布完成。
