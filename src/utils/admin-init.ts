// 站内后台的客户端逻辑
//
// 覆盖四个入口：
//   /admin/       设置保存（把当前外观存成全站默认）
//   /admin/list/  内容列表（删除 / 编辑入口）
//   /admin/edit/  编辑器（新建、修改已有文章）
//   文章详情页    右下角「编辑」按钮 + 就地编辑面板
//
// ── 为什么写在这里，而不是各页面里的 <script is:inline> ──
// 主题用 Swup 做软导航，只替换 #swup-container 等少数容器。写在页面里的
// is:inline 脚本落在容器之外：软导航到后台页时，它们既不会执行、也不会被
// 插进文档 —— 于是页面「看着在、点了没用」，只能按 F5 刷新。
// （站长原话：「每次用都要刷新一遍，不刷新就没用」。）
//
// 现在：逻辑放进 Layout 的打包脚本（整站只执行一次），再监听
// astro:page-load（@swup/astro 在 swup 的 page:view 时派发）重新绑定
// 当前页面的 DOM。每个入口元素用 data-admin-bound 打标：Swup 换掉 DOM 后
// 标记随之消失，所以「同一页重复收到事件」不会重复绑定，「换到新页」
// 一定会重新绑定。这套做法与主题里 MusicPlayerView 的思路一致。

// 「读取本机设置 → 提交为全站默认」这套逻辑和右上角设置面板共用一份，
// 见 src/utils/site-settings-client.ts（键白名单、类型还原、提交、回执都在那里）。
// 这里只负责 /admin/ 页面上的 DOM。

import {
	readLocalSettings,
	readStoredPassword,
	rememberPassword,
	saveSiteSettings,
} from "@/utils/site-settings-client";

type Json = Record<string, unknown>;

interface ApiResult {
	status: number;
	body: Json;
}

// ── 小工具 ───────────────────────────────────────────────────

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
	return document.getElementById(id) as T | null;
}

const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

function esc(value: unknown): string {
	return String(value ?? "").replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

function errText(body: Json, status: number): string {
	const err = body.error;
	return typeof err === "string" && err ? err : `HTTP ${status}`;
}

function message(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

async function readJson(response: Response): Promise<Json> {
	try {
		const value: unknown = await response.json();
		return value && typeof value === "object" ? (value as Json) : {};
	} catch {
		return {};
	}
}

async function getJson(url: string, password: string): Promise<ApiResult> {
	const response = await fetch(url, { headers: { "x-admin-password": password } });
	return { status: response.status, body: await readJson(response) };
}

async function postJson(url: string, password: string, payload: unknown): Promise<ApiResult> {
	const response = await fetch(url, {
		method: "POST",
		headers: { "content-type": "application/json", "x-admin-password": password },
		body: JSON.stringify(payload),
	});
	return { status: response.status, body: await readJson(response) };
}

// 二进制上传：文件字节直传（不压缩、不转码），文件名放在 x-filename 里。
// 走这条路是为了 4K 图片/视频 —— base64 会把请求体撑大 1/3，大文件容易撞上限。
async function postBinary(url: string, password: string, file: File): Promise<ApiResult> {
	const response = await fetch(url, {
		method: "POST",
		headers: {
			"content-type": file.type || "application/octet-stream",
			"x-filename": encodeURIComponent(file.name),
			"x-admin-password": password,
		},
		body: file,
	});
	return { status: response.status, body: await readJson(response) };
}

// ── /admin/ 设置保存 ─────────────────────────────────────────

function initSettingsPage(): void {
	const savePwBtn = byId<HTMLButtonElement>("savePw");
	if (!savePwBtn || savePwBtn.dataset.adminBound === "1") return;
	savePwBtn.dataset.adminBound = "1";

	const pwEl = byId<HTMLInputElement>("pw");
	const pwState = byId("pwState");
	const listEl = byId("list");
	const outEl = byId("out");
	const readBtn = byId<HTMLButtonElement>("read");
	const pushBtn = byId<HTMLButtonElement>("push");
	if (!pwEl || !pwState || !listEl || !outEl || !readBtn || !pushBtn) return;

	const showPwState = (): void => {
		const value = readStoredPassword();
		pwState.textContent = value ? `✓ 已记住（长度 ${value.length}）` : "尚未记住";
		if (value) pwEl.value = value;
	};

	savePwBtn.addEventListener("click", () => {
		const value = pwEl.value.trim();
		if (!value) {
			pwState.textContent = "请先填密码";
			return;
		}
		rememberPassword(value);
		showPwState();
	});

	// 类型还原（"true" → true、"0.8" → 0.8）在共用模块里做，这里只取结果
	const readLocal = (): Json => readLocalSettings() as Json;

	const render = (obj: Json): void => {
		const keys = Object.keys(obj);
		if (!keys.length) {
			listEl.textContent = "这台浏览器里没找到任何设置 —— 先去设置面板调一下，再回来点这里。";
			return;
		}
		let html = "<table class='w-full text-sm'>";
		for (const key of keys) {
			html +=
				`<tr><td class='py-1 pr-4 text-75'>${esc(key)}</td>` +
				`<td class='py-1 text-90 font-medium'>${esc(obj[key])}</td></tr>`;
		}
		html += "</table>";
		listEl.innerHTML = html;
	};

	let lastRead: Json | null = null;

	readBtn.addEventListener("click", () => {
		lastRead = readLocal();
		render(lastRead);
	});

	pushBtn.addEventListener("click", () => {
		void (async () => {
			const password = pwEl.value.trim();
			if (!password) {
				outEl.textContent = "先在上面输入并记住密码";
				return;
			}
			const data = lastRead ?? readLocal();
			if (!Object.keys(data).length) {
				outEl.textContent = "没有可保存的设置，先点「读取本机设置」";
				return;
			}

			outEl.textContent = "提交中……";
			try {
				// 和右上角设置面板走的是同一个函数（src/utils/site-settings-client.ts）
				const res = await saveSiteSettings(password, data as never);
				if (res.ok) {
					outEl.textContent = `✓ 已保存 ${res.savedCount} 项。约 1 分钟后重新构建完成，届时所有人看到的都是这个样子。`;
				} else {
					outEl.textContent = `✗ 失败（HTTP ${res.status}）：${res.error ?? ""}`;
				}
			} catch (e) {
				outEl.textContent = `✗ 请求出错：${message(e)}`;
			}
		})();
	});

	showPwState();
}

// ── /admin/list/ 内容列表 ───────────────────────────────────

function initListPage(): void {
	const loadBtn = byId<HTMLButtonElement>("load");
	if (!loadBtn || loadBtn.dataset.adminBound === "1") return;
	loadBtn.dataset.adminBound = "1";

	const pwEl = byId<HTMLInputElement>("pw");
	const outEl = byId("out");
	const listEl = byId("list");
	const typeEl = byId<HTMLSelectElement>("type");
	if (!pwEl || !outEl || !listEl || !typeEl) return;

	const load = async (): Promise<void> => {
		const password = pwEl.value.trim();
		if (!password) {
			outEl.textContent = "先填密码";
			return;
		}
		rememberPassword(password);

		const type = typeEl.value;
		outEl.textContent = "读取中……";

		try {
			const res = await getJson(`/api/content?type=${encodeURIComponent(type)}`, password);
			if (res.body.ok !== true) {
				outEl.textContent = `✗ ${errText(res.body, res.status)}`;
				listEl.innerHTML = "";
				return;
			}

			const files = Array.isArray(res.body.files) ? (res.body.files as { name: string; path: string }[]) : [];
			outEl.textContent = `共 ${files.length} 个`;
			if (!files.length) {
				listEl.textContent = "这个类型下还没有内容。";
				return;
			}

			let html = "<table class='w-full'>";
			for (const file of files) {
				html +=
					"<tr class='border-t border-(--line-divider)'>" +
					`<td class='py-2 pr-4 text-90'>${esc(file.name)}</td>` +
					"<td class='py-2 text-right whitespace-nowrap'>" +
					`<a href='/admin/edit/?file=${encodeURIComponent(file.path)}' class='btn-regular rounded-lg px-3 py-1 text-xs mr-2'>编辑</a>` +
					`<button data-path='${esc(file.path)}' class='del btn-regular rounded-lg px-3 py-1 text-xs'>删除</button>` +
					"</td></tr>";
			}
			html += "</table>";
			listEl.innerHTML = html;

			const buttons = listEl.querySelectorAll<HTMLButtonElement>("button.del");
			for (const btn of Array.from(buttons)) {
				btn.addEventListener("click", () => {
					const path = btn.dataset.path ?? "";
					if (!window.confirm(`确定删除？\n${path}`)) return;
					btn.disabled = true;
					btn.textContent = "删除中…";
					void (async () => {
						try {
							const del = await postJson("/api/delete", pwEl.value.trim(), { path });
							if (del.body.ok === true) {
								outEl.textContent = `✓ 已删除 ${path}，约 1 分钟后重新构建`;
								await load();
							} else {
								outEl.textContent = `✗ ${errText(del.body, del.status)}`;
								btn.disabled = false;
								btn.textContent = "删除";
							}
						} catch (e) {
							outEl.textContent = `✗ 请求失败：${message(e)}`;
							btn.disabled = false;
							btn.textContent = "删除";
						}
					})();
				});
			}
		} catch (e) {
			outEl.textContent = `✗ 请求失败：${message(e)}`;
		}
	};

	loadBtn.addEventListener("click", () => void load());
	// 换类型时如果已经填了密码，直接刷新，省一次点击
	typeEl.addEventListener("change", () => {
		if (pwEl.value.trim()) void load();
	});
}

// ── /admin/edit/ 编辑器 ────────────────────────────────────

function initEditPage(): void {
	const goBtn = byId<HTMLButtonElement>("go");
	if (!goBtn || goBtn.dataset.adminBound === "1") return;
	goBtn.dataset.adminBound = "1";

	const pwEl = byId<HTMLInputElement>("pw");
	const outEl = byId("out");
	const typeEl = byId<HTMLSelectElement>("type");
	const filenameEl = byId<HTMLInputElement>("filename");
	const titleEl = byId<HTMLInputElement>("title");
	const descriptionEl = byId<HTMLInputElement>("description");
	const tagsEl = byId<HTMLInputElement>("tags");
	const categoryEl = byId<HTMLInputElement>("category");
	const draftEl = byId<HTMLInputElement>("draft");
	const bodyEl = byId<HTMLTextAreaElement>("body");
	const loadState = byId("loadState");
	const reloadBtn = byId<HTMLButtonElement>("reload");
	// 2026-10-18 新增：置顶开关、封面字段、图片/视频上传
	const pinnedEl = byId<HTMLInputElement>("pinned");
	const imageEl = byId<HTMLInputElement>("image");
	const coverFile = byId<HTMLInputElement>("coverFile");
	const pickCover = byId<HTMLButtonElement>("pickCover");
	const imageFile = byId<HTMLInputElement>("imageFile");
	const videoFile = byId<HTMLInputElement>("videoFile");
	const pickImage = byId<HTMLButtonElement>("pickImage");
	const pickVideo = byId<HTMLButtonElement>("pickVideo");
	const uploadState = byId("uploadState");
	if (!pwEl || !outEl || !typeEl || !filenameEl || !titleEl || !descriptionEl) return;
	if (!tagsEl || !categoryEl || !draftEl || !bodyEl || !loadState) return;

	if (!pwEl.value) pwEl.value = readStoredPassword();

	// ── 修改已有文章：URL 带 ?file= 时读回并把内容填进表单 ──
	// 之前的实现只会在 localStorage 里已有密码时才去读，而密码只在「点发布」
	// 时才保存 —— 于是第一次进来表单永远是空的（站长反馈「点击编辑文章为什么
	// 没有字」）。现在：带 ?file= 就调用一次；没密码时提示，并可点「读取内容」
	// 用输入框里的密码再试。
	const loadExisting = async (): Promise<void> => {
		const file = new URLSearchParams(location.search).get("file");
		if (!file) {
			loadState.textContent = "当前没有指定要修改的文章（URL 里没有 ?file=），这里只能新建。";
			return;
		}

		const parts = file.split("/");
		filenameEl.value = (parts[parts.length - 1] ?? "").replace(/\.md$/, "");
		if (file.includes("/dynamic/")) typeEl.value = "dynamic";
		else if (file.includes("/projects/")) typeEl.value = "projects";
		else typeEl.value = "posts";

		const password = pwEl.value.trim() || readStoredPassword();
		if (!password) {
			loadState.textContent = `要修改的是 ${file} —— 请在下方填入密码，然后点「读取内容」`;
			return;
		}
		rememberPassword(password);

		loadState.textContent = `正在读取 ${file} ……`;
		try {
			const res = await getJson(`/api/file?path=${encodeURIComponent(file)}`, password);
			if (res.body.ok !== true) {
				loadState.textContent = `读取失败：${errText(res.body, res.status)}`;
				return;
			}
			const data = (res.body.data && typeof res.body.data === "object" ? res.body.data : {}) as Json;
			titleEl.value = String(data.title ?? "");
			descriptionEl.value = String(data.description ?? "");
			tagsEl.value = Array.isArray(data.tags) ? data.tags.join(", ") : String(data.tags ?? "");
			categoryEl.value = String(data.category ?? "");
			draftEl.checked = data.draft === true;
			if (pinnedEl) pinnedEl.checked = data.pinned === true;
			if (imageEl) imageEl.value = String(data.image ?? "");
			bodyEl.value = String(res.body.body ?? "");
			loadState.textContent = `✓ 已读入 ${file} —— 改完点发布覆盖（历史在 Git 里）`;
		} catch (e) {
			loadState.textContent = `读取失败：${message(e)}`;
		}
	};

	goBtn.addEventListener("click", () => {
		void (async () => {
			const password = pwEl.value.trim();
			if (!password) {
				outEl.textContent = "先填密码";
				return;
			}
			rememberPassword(password);

			const type = typeEl.value;
			const title = titleEl.value.trim();
			if (type !== "dynamic" && !title) {
				outEl.textContent = "标题不能为空";
				return;
			}

			const tagsRaw = tagsEl.value.trim();
			const tags = tagsRaw
				? tagsRaw
						.split(/[,，]/)
						.map((s) => s.trim())
						.filter(Boolean)
				: [];
			const draft = draftEl.checked;

			const data: Json =
				type === "dynamic"
					? { draft }
					: {
							title,
							description: descriptionEl.value.trim(),
							tags,
							category: categoryEl.value.trim(),
							draft,
							// 首页只放置顶的 4 篇，所以这里必须能把置顶写回去
							pinned: pinnedEl?.checked === true,
							image: imageEl?.value.trim() ?? "",
						};

			outEl.textContent = "提交中……";
			try {
				const res = await postJson("/api/content", password, {
					type,
					filename: filenameEl.value.trim() || undefined,
					data,
					body: bodyEl.value,
				});
				if (res.body.ok === true) {
					outEl.textContent = `✓ ${res.body.updated === true ? "已更新" : "已发布"}：${String(res.body.filename ?? "")} —— 约 1 分钟后上线`;
				} else {
					outEl.textContent = `✗ ${errText(res.body, res.status)}`;
				}
			} catch (e) {
				outEl.textContent = `✗ 请求失败：${message(e)}`;
			}
		})();
	});

	// ── 上传图片 / 视频 ───────────────────────────────────────
	// 上传会提交进仓库（public/uploads/）并触发一次构建，所以提示写的是
	// 「约 1 分钟后链接才能打开」。上传成功后：
	//   · 封面图 → 直接填进「封面」输入框
	//   · 正文图片 → 在光标处插入 Markdown 图片
	//   · 视频 → 在光标处插入 <video> 标签（Markdown 里的原生 HTML 会被原样输出）
	const uploadStateEl = uploadState ?? outEl;
	const setUploadState = (text: string): void => {
		uploadStateEl.textContent = text;
	};

	const insertAtCursor = (snippet: string): void => {
		const start = bodyEl.selectionStart ?? bodyEl.value.length;
		const end = bodyEl.selectionEnd ?? start;
		const before = bodyEl.value.slice(0, start);
		const after = bodyEl.value.slice(end);
		const block = `${before === "" || before.endsWith("\n") ? "" : "\n"}${snippet}\n`;
		bodyEl.value = before + block + after;
		const pos = (before + block).length;
		bodyEl.focus();
		bodyEl.setSelectionRange(pos, pos);
	};

	const uploadFile = async (file: File, kind: "cover" | "image" | "video"): Promise<void> => {
		const password = pwEl.value.trim() || readStoredPassword();
		if (!password) {
			setUploadState("先填后台密码，再上传（上传也要鉴权）");
			return;
		}
		rememberPassword(password);
		setUploadState(`正在上传 ${file.name}（${(file.size / 1048576).toFixed(1)} MB）……`);
		try {
			// 原始字节直传（不压缩、不转码）
			const res = await postBinary("/api/upload", password, file);
			if (res.body.ok !== true) {
				setUploadState(`✗ 上传失败：${errText(res.body, res.status)}`);
				return;
			}
			const url = String(res.body.url ?? "");
			const alt = file.name.replace(/\.[^.]+$/, "");
			if (kind === "cover") {
				if (imageEl) imageEl.value = url;
				setUploadState(`✓ 已上传并设为封面：${url}（约 1 分钟后生效）`);
				return;
			}
			if (kind === "image") {
				insertAtCursor(`![${alt}](${url})`);
			} else {
				insertAtCursor(
					`<video src="${url}" controls playsinline preload="metadata" style="max-width:100%;border-radius:0.75rem"></video>`,
				);
			}
			setUploadState(`✓ 已上传并插入正文：${url}（约 1 分钟后生效）`);
		} catch (e) {
			setUploadState(`✗ 上传失败：${message(e)}`);
		}
	};

	const wireUpload = (
		btn: HTMLButtonElement | null,
		input: HTMLInputElement | null,
		kind: "cover" | "image" | "video",
	): void => {
		if (!btn || !input) return;
		btn.addEventListener("click", () => input.click());
		input.addEventListener("change", () => {
			const file = input.files?.[0];
			// 清空，避免选同一个文件不触发 change
			input.value = "";
			if (file) void uploadFile(file, kind);
		});
	};

	wireUpload(pickCover, coverFile, "cover");
	wireUpload(pickImage, imageFile, "image");
	wireUpload(pickVideo, videoFile, "video");

	reloadBtn?.addEventListener("click", () => void loadExisting());

	// 进页面就尝试读回（软导航进来也会走到这里：initEditPage 每次换页都会重跑）
	void loadExisting();
}

// ── 文章详情页：右下角「编辑」+ 就地编辑 ────────────────────

function initPostInlineEditor(): void {
	const fab = byId<HTMLButtonElement>("post-edit-fab");
	if (!fab || fab.dataset.adminBound === "1") return;
	fab.dataset.adminBound = "1";

	// 把「按钮 + 弹层」搬到主题自带的浮动控件列里（右下角那一列圆角按钮）。
	//
	// 两件事一起解决：
	//  1) 站长要求「编辑」和目录/评论/回到顶部那一列同款 → 直接插进
	//     .floating-controls-container（flex column、右对齐、自动堆叠、间距一致）
	//  2) #content-wrapper 带 .onload-animation（animation: fade-in-up … forwards），
	//     动画结束后 transform 仍是 translateY(0) 而不是 none —— 非 none 的 transform
	//     会成为 position: fixed 的包含块，弹层就会按整篇文章的高度定位（实测跑到
	//     屏幕外 bottom: -1037px）。挂到这一列下面就脱离了那个包含块。
	// 换页时由 cleanupStaleEditors() 清理旧节点，不会越积越多。
	const root = byId<HTMLElement>("post-edit-root");
	if (root && !root.closest(".floating-controls-container") && root.parentElement !== document.body) {
		root.dataset.adminUrl = location.pathname + location.search;
		const controls = document.querySelector<HTMLElement>(".floating-controls-container");
		if (controls) controls.insertBefore(root, controls.firstChild);
		else document.body.appendChild(root);
	}

	const panel = byId("post-edit-panel");
	const backdrop = byId("post-edit-backdrop");
	const titleEl = byId<HTMLInputElement>("pe-title");
	const descriptionEl = byId<HTMLInputElement>("pe-description");
	const tagsEl = byId<HTMLInputElement>("pe-tags");
	const categoryEl = byId<HTMLInputElement>("pe-category");
	const draftEl = byId<HTMLInputElement>("pe-draft");
	const pinnedEl = byId<HTMLInputElement>("pe-pinned");
	const bodyEl = byId<HTMLTextAreaElement>("pe-body");
	const pwEl = byId<HTMLInputElement>("pe-pw");
	const statusEl = byId("pe-status");
	const saveBtn = byId<HTMLButtonElement>("pe-save");
	const reloadBtn = byId<HTMLButtonElement>("pe-reload");
	const closeBtn = byId<HTMLButtonElement>("pe-close");
	if (!panel || !backdrop || !titleEl || !descriptionEl || !tagsEl) return;
	if (!categoryEl || !draftEl || !bodyEl || !pwEl || !statusEl || !saveBtn) return;

	const filePath = fab.dataset.filePath ?? "";
	const filename = fab.dataset.filename ?? "";
	if (!filePath || !filename) return;

	const state = { loaded: false, busy: false, data: {} as Json };

	const setStatus = (text: string): void => {
		statusEl.textContent = text;
	};

	const open = (): void => {
		panel.classList.remove("hidden");
		backdrop.classList.remove("hidden");
		panel.setAttribute("aria-hidden", "false");
		// 没读到原文之前不允许保存 —— 否则会把正文写空（这是最危险的一种「成功」）
		saveBtn.disabled = !state.loaded;
		if (!pwEl.value) pwEl.value = readStoredPassword();
		if (state.loaded) {
			setStatus("改动会提交到仓库，约 1 分钟后这一页更新。原始版本在 Git 里，能回退。");
			return;
		}
		if (!pwEl.value.trim()) {
			setStatus("先填后台密码（只存在这台浏览器里），再点「读取原文」。");
			pwEl.focus();
			return;
		}
		void load();
	};

	const close = (): void => {
		panel.classList.add("hidden");
		backdrop.classList.add("hidden");
		panel.setAttribute("aria-hidden", "true");
	};

	const load = async (): Promise<void> => {
		if (state.busy) return;
		const password = pwEl.value.trim();
		if (!password) {
			setStatus("先填后台密码");
			return;
		}
		rememberPassword(password);
		state.busy = true;
		setStatus(`正在读取 ${filename} ……`);
		try {
			const res = await getJson(`/api/file?path=${encodeURIComponent(filePath)}`, password);
			if (res.body.ok !== true) {
				setStatus(`读取失败：${errText(res.body, res.status)}`);
				return;
			}
			const data = (res.body.data && typeof res.body.data === "object" ? res.body.data : {}) as Json;
			state.data = data;
			state.loaded = true;
			titleEl.value = String(data.title ?? "");
			descriptionEl.value = String(data.description ?? "");
			tagsEl.value = Array.isArray(data.tags) ? data.tags.join(", ") : String(data.tags ?? "");
			categoryEl.value = String(data.category ?? "");
			draftEl.checked = data.draft === true;
			if (pinnedEl) pinnedEl.checked = data.pinned === true;
			bodyEl.value = String(res.body.body ?? "");
			saveBtn.disabled = false;
			setStatus("✓ 已读入原文 —— 改完点「保存到仓库」（历史在 Git 里）");
		} catch (e) {
			setStatus(`读取失败：${message(e)}`);
		} finally {
			state.busy = false;
		}
	};

	const save = async (): Promise<void> => {
		if (state.busy) return;
		if (!state.loaded) {
			setStatus("还没读到原文，先点「读取原文」——这个按钮只改不改写，避免把正文写空。");
			return;
		}
		const password = pwEl.value.trim();
		if (!password) {
			setStatus("先填后台密码");
			return;
		}
		const title = titleEl.value.trim();
		if (!title) {
			setStatus("标题不能为空");
			return;
		}
		rememberPassword(password);

		const tagsRaw = tagsEl.value.trim();
		const tags = tagsRaw
			? tagsRaw
					.split(/[,，]/)
					.map((s) => s.trim())
					.filter(Boolean)
			: [];

		// 只提交这里管得着的字段。封面(image)、评论(comment)、密码(password)、
		// 系列(series) 这些由服务端从原文里原样保留。
		const data: Json = {
			title,
			description: descriptionEl.value.trim(),
			tags,
			category: categoryEl.value.trim(),
			draft: draftEl.checked,
			// 首页只放置顶的 4 篇 —— 文章页这里也要能置顶/取消置顶
			pinned: pinnedEl?.checked === true,
		};
		const published = state.data.published;
		if (typeof published === "string" && published) data.published = published;
		const image = state.data.image;
		if (typeof image === "string" && image) data.image = image;

		state.busy = true;
		saveBtn.disabled = true;
		setStatus("提交中……");
		try {
			const res = await postJson("/api/content", password, {
				type: "posts",
				filename,
				data,
				body: bodyEl.value,
			});
			if (res.body.ok === true) {
				setStatus(`✓ 已保存到仓库，约 1 分钟后这一页更新（${String(res.body.path ?? filePath)}）`);
			} else {
				setStatus(`✗ 保存失败：${errText(res.body, res.status)}`);
			}
		} catch (e) {
			setStatus(`✗ 请求失败：${message(e)}`);
		} finally {
			state.busy = false;
			saveBtn.disabled = !state.loaded;
		}
	};

	fab.addEventListener("click", open);
	closeBtn?.addEventListener("click", close);
	backdrop.addEventListener("click", close);
	reloadBtn?.addEventListener("click", () => void load());
	saveBtn.addEventListener("click", () => void save());
	panel.addEventListener("keydown", (event) => {
		if (event.key === "Escape") close();
	});
}

// ── 编排 ─────────────────────────────────────────────────────

// 换页时清掉上一页搬出来的「就地编辑」节点（见 initPostInlineEditor 里的说明）。
//
// 判定规则（不能简单地「删掉容器下所有的」）：
//   · 新页面如果是文章页，swup 容器里会有一份全新的 SSR 节点 → 旧的全删
//   · 不是文章页（容器里没有那份节点）→ 按 URL 比对，URL 变了的旧节点就是上一页的
//   · 同一次切换里本函数可能被调用两次（astro:page-load 与 swup:page:view 都会来），
//     此时节点已经搬出来了、URL 又没变，必须留着，否则按钮会被自己删掉
function cleanupStaleEditors(): void {
	// 只认「已经搬出去的」：还在 #swup-container 里的那份是新页面自带的，不能删
	const moved = Array.from(document.querySelectorAll<HTMLElement>("[data-post-editor]")).filter(
		(el) => !el.closest("#swup-container"),
	);
	if (!moved.length) return;

	const fresh = document.querySelector<HTMLElement>("#swup-container [data-post-editor]");
	const currentUrl = location.pathname + location.search;

	for (const portal of moved) {
		const ownerUrl = portal.getAttribute("data-admin-url") ?? "";
		if (fresh || ownerUrl !== currentUrl) portal.remove();
	}
}

function runAdminUi(): void {
	cleanupStaleEditors();

	// 每个页面只认自己的入口 ID；不存在的直接跳过，成本就是几次 getElementById
	try {
		initSettingsPage();
	} catch (e) {
		console.error("[admin] 设置页初始化失败", e);
	}
	try {
		initListPage();
	} catch (e) {
		console.error("[admin] 内容列表初始化失败", e);
	}
	try {
		initEditPage();
	} catch (e) {
		console.error("[admin] 编辑器初始化失败", e);
	}
	try {
		initPostInlineEditor();
	} catch (e) {
		console.error("[admin] 文章就地编辑初始化失败", e);
	}
}

/**
 * 注册后台客户端逻辑。
 *
 * 在 Layout 的打包脚本里调用一次即可：它自己会在 Swup 换页后
 * （astro:page-load / swup:page:view）重新绑定新页面里的 DOM。
 */
export function initAdminUi(): void {
	const holder = window as unknown as Record<string, unknown>;
	if (holder.__fireflyAdminUi) return;
	holder.__fireflyAdminUi = true;

	runAdminUi();
	document.addEventListener("astro:page-load", runAdminUi);
	document.addEventListener("swup:page:view", runAdminUi);
}
