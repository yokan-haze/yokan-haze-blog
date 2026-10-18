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

## 三、站长明确要求、还没做的（优先做这些）

1. **后台脚本在 SPA 换页后不重新初始化** —— 站长反馈「每次用都要刷新一遍，不刷新就没用」。
   主题用 Swup，页面换页不重载，`<script is:inline>` 只在首次加载执行。
   需要改成监听 `swup:page:view` / `astro:page-load` 重新初始化，或把后台页面排除在 SPA 之外。

2. **音乐卡片加载很慢** —— 每次加载都请求第三方 Meting 接口（`api.i-meto.com`），国内时快时慢。
   建议改成不阻塞首屏（懒加载 / 点击后再请求），或直接改成 local 模式。

3. **文章详情页右下角要「编辑」按钮，就地编辑** ——
   站长要的不是跳到 `/admin/edit/`，而是**在文章页面里直接改这一篇**。
   实现思路：文章页加悬浮按钮 → 弹出面板/内联表单 → 调用 `POST /api/content` 覆盖同一文件。

4. **编辑器标题字号** —— 已从 text-sm 改成 1.6rem（commit e899605），需站长确认到位。

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
