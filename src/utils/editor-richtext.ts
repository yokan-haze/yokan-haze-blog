// 编辑器里的「像 WPS 那样选文字改格式」的白板
//
// 由 admin-init.ts 调用：initRichTextEditor(root)，root 里需要
//   [data-rt-input]   —— 存 Markdown 的 input / textarea（原来的表单控件，保留 id 不变）
//   [data-rt-canvas]  —— 显示文本的白板容器
//   [data-rt-toolbar] —— 工具条
//
// 白板是 contenteditable=false：文字不可编辑（避免把 Markdown 打乱），但可以用鼠标拖选、
// 双击选词、Shift+方向键扩展；工具条对**当前选区**生效。

export type RichTextFormat =
	| { kind: "size"; value: number }
	| { kind: "bold" }
	| { kind: "color"; value: string };

interface SelectionInfo {
	start: number;
	end: number;
}

const SIZE_MIN = 10;
const SIZE_MAX = 40;

// ── 选区换算：DOM 位置 ↔ 纯文本偏移 ──
function getTextOffset(root: HTMLElement, node: Node, offset: number): number {
	let total = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let current: Node | null = walker.nextNode();
	while (current) {
		if (current === node) return total + offset;
		total += (current.textContent ?? "").length;
		current = walker.nextNode();
	}
	// node 本身是元素（点到了空白处）→ 退化成元素起点
	return total;
}

function readSelection(root: HTMLElement): SelectionInfo | null {
	const sel = window.getSelection();
	if (!sel || sel.rangeCount === 0) return null;
	const range = sel.getRangeAt(0);
	if (!range || !root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
	if (range.collapsed) return null;
	const start = getTextOffset(root, range.startContainer, range.startOffset);
	const end = getTextOffset(root, range.endContainer, range.endOffset);
	return start < end ? { start, end } : null;
}

function offsetToNode(root: HTMLElement, offset: number): { node: Node; offset: number } | null {
	let total = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
	let current: Node | null = walker.nextNode();
	while (current) {
		const len = (current.textContent ?? "").length;
		if (offset <= total + len) return { node: current, offset: offset - total };
		total += len;
		current = walker.nextNode();
	}
	return null;
}

function selectRange(root: HTMLElement, start: number, end: number): void {
	const a = offsetToNode(root, start);
	const b = offsetToNode(root, end);
	if (!a || !b) return;
	const range = document.createRange();
	range.setStart(a.node, a.offset);
	range.setEnd(b.node, b.offset);
	const sel = window.getSelection();
	sel?.removeAllRanges();
	sel?.addRange(range);
}

// ── 标记语言：把格式写成标签，再写回 Markdown 文本 ──
function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// 把「带格式标记的正文」渲染成白板 HTML。
// 只认我们自己写进去的三种标签，其它一律当纯文本转义 —— 正文里本来就有的 HTML
// （比如 <video>）会原样显示成文字，不会被当成标签执行。
function markdownToCanvas(markdown: string): string {
	const html = escapeHtml(markdown)
		.replace(/&lt;span data-size=&quot;(\d+)&quot;&gt;/g, '<span data-size="$1">')
		.replace(/&lt;\/span&gt;/g, "</span>")
		.replace(/&lt;b class=&quot;rt-bold&quot;&gt;/g, '<b class="rt-bold">')
		.replace(/&lt;\/b&gt;/g, "</b>")
		.replace(/&lt;span data-color=&quot;(#[0-9a-fA-F]{3,8})&quot;&gt;/g, '<span data-color="$1">')
		.replace(/&lt;br\s*\/?&gt;/g, "<br>");
	// 空行也要看得见
	return html.replace(/\n/g, '<span data-rt-newline>↵</span>\n') || "";
}

export function createRichTextEditor(options: {
	toolbar: HTMLElement;
	canvas: HTMLElement;
	textarea: HTMLInputElement | HTMLTextAreaElement;
	onChange?: () => void;
}): {
	getValue: () => string;
	setValue: (value: string) => void;
	focus: () => void;
	/** 把一段文本插到「最后一次选区之后」；没有选区就追加到末尾 */
	insert: (snippet: string) => void;
	/** 外部改过提交源后，把内容同步进白板 */
	syncFromSource: () => void;
} {
	const { toolbar, canvas, textarea } = options;

	// Markdown 的唯一真源就是这个变量。之前用 canvas.dataset 存，
	// 结果「清格式」按 source 重渲染时把内容吞掉了（dataset 被同步成空串）。
	let markdown = textarea.value;

	const render = (): void => {
		// 只在需要的时候重绘；用户正在输入时不打断
		const html = markdownToCanvas(markdown);
		if (canvas.innerHTML !== html) canvas.innerHTML = html;
		// 提交源（隐藏 input）永远跟着走
		textarea.value = markdown;
		options.onChange?.();
	};

	const getPlain = (): string => markdown;

	const setPlain = (next: string): void => {
		markdown = next;
		render();
	};

	const applyToSelection = (kind: RichTextFormat): void => {
		const sel = readSelection(canvas);
		if (!sel) {
			canvas.focus();
			return;
		}
		const text = getPlain();
		const selected = text.slice(sel.start, sel.end);
		let wrapped = selected;
		if (kind.kind === "size") {
			const size = Math.max(SIZE_MIN, Math.min(SIZE_MAX, Math.round(kind.value)));
			wrapped = `<span data-size="${size}">${selected}</span>`;
		} else if (kind.kind === "bold") {
			wrapped = `<b class="rt-bold">${selected}</b>`;
		} else {
			const color = /^#[0-9a-fA-F]{3,8}$/.test(kind.value) ? kind.value : "#e11d48";
			wrapped = `<span data-color="${color}">${selected}</span>`;
		}
		const next = text.slice(0, sel.start) + wrapped + text.slice(sel.end);
		setPlain(next);
		// 选中刚被包住的那段，方便连续操作
		selectRange(canvas, sel.start, sel.start + wrapped.length);
	};

	// 工具条里的按钮：data-rt-cmd="size"（值取同行的 select/number）
	toolbar.addEventListener("click", (event) => {
		const target = event.target as HTMLElement | null;
		const btn = target?.closest<HTMLElement>("[data-rt-cmd]");
		if (!btn) return;
		event.preventDefault();
		const cmd = btn.dataset.rtCmd;
		// ⚠ 一定要从「按钮所在的那条工具条」取数：页面上可能同时有两条（落笔页 + 就地编辑），
		// 用 document.querySelector 会拿到第一条，把字号套到另一个编辑器上（实测踩过）。
		const bar = btn.closest<HTMLElement>("[data-rt-toolbar]") ?? toolbar;
		if (cmd === "size") {
			const field = bar.querySelector<HTMLInputElement | HTMLSelectElement>("[data-rt-size]");
			const value = Number(field?.value ?? 15) || 15;
			applyToSelection({ kind: "size", value });
		} else if (cmd === "bold") {
			applyToSelection({ kind: "bold" });
		} else if (cmd === "color") {
			const field = bar.querySelector<HTMLInputElement>("[data-rt-color]");
			applyToSelection({ kind: "color", value: field?.value ?? "#e11d48" });
		} else if (cmd === "clear") {
			setPlain(getPlain());
			window.getSelection()?.removeAllRanges();
		}
	});

	// 初始内容是 textarea 里已有的 Markdown
	render();

	// 表单里如果有别的代码直接改 textarea.value（比如上传插图 insertAtCursor），
	// 白板要能跟上 —— 用 MutationObserver 监听 value 属性变化不可靠（property 改不触发），
	// 所以在 getValue/focus 时对一次账：不一致就以 textarea 为准（它是提交源）。
	const reconcile = (): void => {
		if (textarea.value !== markdown) {
			markdown = textarea.value;
			render();
		}
	};

	// 白板可编辑：用户可以直接在里打 Markdown（原来 contenteditable=false，
	// 只能选字改格式、不能打字，这一点站长 2026-10-22 反馈后修正）。
	canvas.setAttribute("contenteditable", "true");
	canvas.spellcheck = false;

	// 从 DOM 读回「带格式标记的 Markdown」：只认我们自己写的三种标签，
	// 其它标签一律丢掉（免得浏览器把 div / br 也塞进来）。
	const domToMarkdown = (): string => {
		const walk = (node: Node): string => {
			if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? "";
			if (node.nodeType !== Node.ELEMENT_NODE) return "";
			const el = node as HTMLElement;
			const tag = el.tagName.toLowerCase();
			const inner = Array.from(el.childNodes).map(walk).join("");
			if (tag === "br" || el.hasAttribute("data-rt-newline")) return "\n";
			if (el.hasAttribute("data-size")) return `<span data-size="${el.getAttribute("data-size") ?? "15"}">${inner}</span>`;
			if (el.hasAttribute("data-color")) return `<span data-color="${el.getAttribute("data-color") ?? "#e11d48"}">${inner}</span>`;
			if (tag === "b" && el.classList.contains("rt-bold")) return `<b class="rt-bold">${inner}</b>`;
			// 其余标签只保留文字（浏览器可能自动包 div / font）
			return inner;
		};
		return Array.from(canvas.childNodes).map(walk).join("");
	};

	// 输入后把"所见即所得"的 DOM 折回 Markdown，并同步给提交源
	canvas.addEventListener("input", () => {
		markdown = domToMarkdown();
		textarea.value = markdown;
		options.onChange?.();
	});

	// 记录最后一次在白板里的选区（上传插图时要知道插在哪）
	let lastSelection: SelectionInfo | null = null;
	canvas.addEventListener("mouseup", () => {
		lastSelection = readSelection(canvas);
	});
	canvas.addEventListener("keyup", () => {
		lastSelection = readSelection(canvas);
	});

	return {
		getValue: () => {
			reconcile();
			return textarea.value;
		},
		setValue: (value: string) => setPlain(value),
		focus: () => {
			reconcile();
			canvas.focus();
		},
		/** 外部改过提交源（例如读了原文）之后调用，把内容同步进白板 */
		syncFromSource: () => {
			markdown = textarea.value;
			render();
		},
		/** 把一段文本插到「当前选区之后」；没有选区就追加到末尾 */
		insert: (snippet: string) => {
			reconcile();
			const text = getPlain();
			const at = lastSelection ? lastSelection.end : text.length;
			const before = text.slice(0, at);
			const after = text.slice(at);
			const block = `${before === "" || before.endsWith("\n") ? "" : "\n"}${snippet}\n`;
			setPlain(before + block + after);
			lastSelection = { start: at + block.length, end: at + block.length };
			selectRange(canvas, lastSelection.start, lastSelection.start);
		},
	};
}

export type RichTextEditor = ReturnType<typeof createRichTextEditor>;
export { SIZE_MIN, SIZE_MAX };
