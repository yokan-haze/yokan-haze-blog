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

### 4. 多智能体任务契约：inScope 与 outOfScope 不得互相覆盖

- **事故**：一个任务的 `inScope` 写了 `src/config/sponsorConfig.ts`，而 `outOfScope` 里有一个
  通配的 `src/` —— 后者把前者盖住，改动无法登记，任务被判 failed（实现本身正确且已上线）。
- **检查**：把 `inScope` 的每一条与 `outOfScope` 的每一条做前缀比对。
  **任何 outOfScope 条目若是某条 inScope 的父路径，即为矛盾，必须改成精确路径。**

### 5. 本机环境注意事项

- **没有 ffmpeg 在 PATH 上**；需要时用绝对路径调用（本会话工作区内有装好的 win32-x64 版本）。
- 受限沙箱会禁止 ffmpeg 在会话工作区之外创建文件；压缩脚本已内置「改走 stdout、由 Node 落盘」的兜底。
- **PowerShell 的 `>` 重定向会把二进制转成 UTF-16 文本**（文件体积会翻倍）。取回二进制文件请用
  `git checkout <commit> -- <path>`，不要用 `git show ... > file`。
- 同一个工作区里**并发执行 `pnpm build` 会互相清空 `dist/`**（Astro 构建开始时会清空输出目录），
  导致 `Pagefind was not able to build an index` 之类的假故障。同一次验证只允许一个人构建。
- `github.com` 与 `api.github.com` 的连通性时好时坏。`git push` 失败时改用 GitHub API 提交并重试，
  不要判定为不可恢复。
