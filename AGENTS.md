# Repository Guidelines

## Project Structure & Module Organization

Firefly is an Astro 7 site with Svelte islands and TypeScript configuration. Main source code lives in `src/`: routes in `src/pages`, layouts in `src/layouts`, reusable UI in `src/components`, styles in `src/styles`, content in `src/content`, helpers in `src/utils`, and Markdown/HTML plugins in `src/plugins`. Site configuration is split across `src/config` with matching type definitions in `src/types`; prefer imports from `@/config` when available. Static files served directly belong in `public`, source-managed images in `src/assets`, docs in `docs` and `Firefly-Docs`, and automation in `scripts`.

## Build, Test, and Development Commands

Use `pnpm`; the `preinstall` script enforces it.

- `pnpm dev` or `pnpm start`: run the local Astro dev server.
- `pnpm check`: run Astro diagnostics.
- `pnpm type-check`: run TypeScript with `--noEmit`.
- `pnpm format`: format `src` with Biome.
- `pnpm lint`: run Biome checks and safe fixes on `src`.
- `pnpm build`: generate icons, LQIPs, the Astro build, font subsets, and Pagefind search output in `dist`.
- `pnpm preview`: preview the production build locally.
- `pnpm new-post`: scaffold a new content post.

## Coding Style & Naming Conventions

Biome is the formatter and linter. It uses tabs for indentation and double quotes for JavaScript/TypeScript strings. Keep Astro and Svelte components in `PascalCase` (`PostCard.astro`, `Search.svelte`), config modules in `camelCase` ending with `Config.ts`, and utilities in descriptive kebab case such as `date-utils.ts`. Keep `src/types` aligned with `src/config`. Avoid unrelated formatting churn.

## Testing Guidelines

There is no dedicated unit-test framework configured. Before submitting changes, run `pnpm check`, `pnpm type-check`, and `pnpm build` for rendering, content, or generated asset work. For visual or interactive changes, verify with `pnpm dev` or `pnpm preview` and include screenshots in the PR. Name future tests near the feature they cover, using the local file name as the stem.

## Commit & Pull Request Guidelines

Use Conventional Commits, matching the current history: `feat: ...`, `fix: ...`, and `chore: ...`. Keep commits and PRs focused on one concern. PRs should include a concise summary, linked issues when relevant, validation commands run, and screenshots for UI changes. Discuss major features or design changes in an issue or discussion before implementation.

## Security & Configuration Tips

Do not commit secrets, tokens, or service keys in config files. Keep deployment-specific settings in the target platform environment, and review generated files such as `dist`, `src/constants/lqips.json`, and `src/constants/icons.ts` before committing them.

## 站点所有者的操作纪律（2026-10-12 补充）

下面每条都来自这个站点真实发生过的事故，并写明了**具体怎么检查**。改动上线前请逐条过一遍。

### 1. 改任何素材之前，先查它是不是已经被处理过

- **事故**：构建期的视频压缩脚本对一个「此前已经从 4K 母带转码成 1080p 的文件」再压了一次。
  两次有损编码的损失叠加，发丝与高光处出现明显块状，站点所有者当即发现画面变糊。
- **检查**：`git log --oneline -- <文件路径>`。若历史里存在「转码 / 压缩 / A MB -> B MB」这类提交，
  说明它已经是成品，**任何二次编码都会叠加损失**。
- **正确做法**：从**原始母带**重新编码一次，而不是去压一个已经压过的文件。

### 2. 构建脚本里的「体积上限」不是质量目标

- `scripts/compress-videos.ts` 的 `TARGET_BYTES` 语义是「拦住明显过大的上传」，不是
  「把所有素材都压到这个数值以下」。调低它等于对已定稿素材再做一次有损编码。
- 当前值的取值理由写在该文件顶部注释里。**不要为了压小体积而调低这个值。**

### 3. 验证要覆盖副作用，不能只验主效果

- **事故**：循环播放最初用 `ended` 回调重播实现，而重播函数里会给 `video.src` 重新赋值 ——
  赋同一个值也会让浏览器把视频整段重新加载。上线前的验证只测了「循环生效」与
  「currentTime 回到 0」，没测「循环时有没有重新加载」，结果表现为每 18 秒画面闪一下。
- **检查**：改动态媒体或交互之后，用探针统计**相邻事件**（`loadstart` / `emptied` / `stalled` 等）
  在一段**长于内容周期**的窗口里各发生多少次。主效果为真 **且** 副作用计数为 0 才算通过。
- 同理：`video` 的循环应当交给原生 `loop` 属性，不要靠事件回调重新播放。

### 4. 多智能体任务契约必须三向自洽

任务书里有三组内容必须互相比对，**任一组合矛盾都会让实现者做不下去**。已真实发生过两次，形式不同：

**（a）inScope 与 outOfScope 不得互相覆盖**
- **事故**：某任务的 `inScope` 写了 `src/config/sponsorConfig.ts`，而 `outOfScope` 里有一个
  通配的 `src/` —— 后者把前者盖住，改动无法登记为 changedPaths，任务被判 failed
  （而实现本身是正确的、也已经上线）。
- **检查**：把 `inScope` 的每一条与 `outOfScope` 的每一条做前缀比对。
  **任何 outOfScope 条目若是某条 inScope 的父路径，即为矛盾，必须改成精确路径。**

**（b）验收标准与约束不得互相矛盾**
- **事故**：某任务的验收要求「把部署命令改坏、跑一次真实工作流，确认重试与 Issue 创建」，
  而同一任务的约束写着「不要自己 push、不要运行部署命令」—— 而该工作流**只能由 push 触发**。
  实现者无法执行这两条验收，只能如实报 failed（实现已完成、质量良好）。
- **检查**：逐条问「这条验收，在我自己写的约束下**真的执行得了吗**」。
  凡涉及 push、部署、真实 CI 运行、访问外部账号的验收，必须在任务书里**显式写明授权范围**
  （例如「允许推送到临时分支，严禁推 main」），否则就是把不可能完成的要求交给实现者。

**（c）验收标准不得要求改动 inScope 之外的文件**
- 若某条验收需要通过修改某个在 `inScope` 之外的文件来验证，同样是矛盾。

**通用做法**：写完之后把 inScope、outOfScope、验收清单、约束四块**放在一起读一遍**，
模拟实现者的执行路径。只要有一条走不通，就是契约错误 —— 改契约，不要指望实现者绕过去。

### 5. 本机环境注意事项

- **没有 ffmpeg 在 PATH 上**；需要时用绝对路径调用（本会话工作区内有装好的 win32-x64 版本）。
- 受限沙箱会禁止 ffmpeg 在会话工作区之外创建文件；压缩脚本已内置「改走 stdout、由 Node 落盘」的兜底。
- **不要用 PowerShell 的字符串管线去修改本仓库的文件。** 已发生两次真实损坏：
  - `git show <ref>:<path> > file` 会把**二进制**转成 UTF-16 文本，体积翻倍、文件损坏。
    取回二进制请用 `git checkout <ref> -- <path>`。
  - `Get-Content -Raw` + `WriteAllText` 处理**含中文的 UTF-8 文件**时，会被按 GBK 解码再按 UTF-8 写回 ——
    实际发生过：一个 9607 字节的工作流文件被写成 11228 字节，且 `on:` 块被改坏，导致该分支任意 push
    都触发工作流、`workflow_dispatch` 报 422。
  改仓库文件请用能逐字节保真的方式（编辑器、`edit` 类工具、或 node 的 `fs.readFileSync/writeFileSync`）。
- 同一个工作区里**并发执行 `pnpm build` 会互相清空 `dist/`**（Astro 构建开始时会清空输出目录），
  导致 `Pagefind was not able to build an index` 之类的假故障。同一次验证只允许一个人构建。
- `github.com` 与 `api.github.com` 的连通性时好时坏。`git push` 失败时改用 GitHub API 提交并重试，
  不要判定为不可恢复。
- **本地 `main` 与 `origin/main` 会分叉**：走 GitHub API 提交时，远端会产生与本地**不同哈希**的提交，
  于是 `git push` 被拒（非快进）。此时要么用 API 脚本继续推（基准要传**本地**的对应提交哈希，
  不是远端的），要么在网络恢复时做一次 `git fetch && git reset --hard origin/main` 对齐。

### 6. 推送与验证的两个坑（2026-10-13 追加）

**（a）用 API 推送后，必须逐文件比对「远端内容」与「本地 HEAD 内容」**
- **事故**：一次 API 推送把 `src/config/backgroundWallpaper.ts` 推成了**旧版本** ——
  远端是新功能关着的状态（`false`），本地与本地 HEAD 都是开启（`true`）。
  构建成功、部署成功、CI 全绿，**但线上功能没生效**，且没有任何报错。
  同一次推送的另外 4 个文件都是正确的，只有这一个错 —— 所以「推送成功」不等于「内容正确」。
- **检查**：推送后立即用 GitHub Contents API 取回每个改动文件，与 `git show HEAD:<path>`
  逐字节比对（大小 + 哈希）。不一致就立刻用 Contents API 重写该文件。
- **教训**：CI 的成功只能证明「被推上去的那份内容能构建」，不能证明「推上去的是你想推的内容」。

**（b）浏览器探针必须打在冻结快照上，不能在共享的 `dist/` 上直接测**
- **事故**：同一个工作区里多人协作时，别人的 `pnpm build` 会在你探测的中途重建 `dist/`。
  实测因此拿到**稳定的假阴性**（读到 `opacity: 0`、并误判「DOM 里没有那段 style」），
  而同一棵树的 HTML 里明明有。同类问题已发生两次（另一次是共享的预览服务器在探测中途崩溃）。
- **检查**：探测前把 `dist/` 复制到本次任务专属的临时目录（冻结快照），探针只读快照；
  或者确保探测期间没有他人构建。读到异常结果时，先查被测文件的 mtime 是否在探测期间变过。

**（c）Astro 的 `<style>` 里不要放 JS 模板字面量**
- Astro **只在构建期静态提取 `<style>`，不对其内容做表达式求值**。
  写成 `<style>{`...${x}...`}</style>` 会把反引号、花括号、`${}` 原样当成 CSS 输出，规则失效。
  需要按条件输出样式时，用 `is:inline` + `set:html` 直接输出 CSS 文本（绕开提取管线），
  或者用 `define:vars` 传 CSS 自定义属性。条件渲染的普通 `<style>` 也不可靠 ——
  它无论真假都会被提取进 CSS 包，等于条件失效。

## 壁纸画质标准（2026-10-17 站长确认，以后换壁纸一律照此执行）

站长明确要求：**壁纸画质优先于文件体积**，并且**不允许以降分辨率/帧率/码率的方式"优化"**。

换壁纸时的固定标准：

1. **从原始母带重新编码**，绝不用已有的低分辨率文件放大。
2. **目标分辨率 = 母带原生分辨率**，不缩放。若母带是 4K，就出 4K（3840×2160）。
3. **帧率保持母带帧率**（当前素材是 60fps，不要降到 30fps）。
4. **码率宁可高**。参考实测：4K / 60fps / 4.68s 的慢运动素材，
   libx264 preset slow、CRF 22 得到 14960 kb/s、8.35 MB，画质与体积都合适。
5. **必须落在构建脚本上限 12,000,000 B 以内**，否则构建期会二次压缩（等于白做）。
   若 CRF 22 超标，依次退 23 / 24 / 26；**不要**通过降分辨率来达标。
6. 无音轨、yuv420p、`-movflags +faststart`。
7. **同步更新首帧占位图**（`public/assets/images/wallpaper-poster.webp`），
   尺寸随分辨率提高（4K 用 1600 宽），避免视频到达前放大发虚。

反面案例（都发生过，不要再犯）：
- 曾经把 1080p 视频压到更小以"省流量"，被站长否决："不要降低我壁纸画质"。
- 曾建议"60fps 降到 30fps 可以减半体积"，同样被否决。
