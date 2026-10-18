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

- 新页面 `src/pages/notebook.astro` → `/notebook/`，导航 `文章 → 本子`（`navBarConfig.ts` 的
  `LinkPresets.Notebook`，图标 `material-symbols:menu-book-rounded`）。
- 内容：按年份分组、按发布日期倒序、**全量**（不受置顶影响），置顶的多一个「置顶」小标。
- 为什么必须有它：首页现在只放置顶的 4 篇，没置顶的文章从首页看不到。

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
