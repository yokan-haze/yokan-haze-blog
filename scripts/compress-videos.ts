// 构建期视频压缩
// ----------------
// 在 `astro build` 之后运行。Astro 会把整个 public/ 原样拷进 dist/，历史上背景视频
// 有 8.8 MB，占首屏传输的绝大部分，冷缓存 LCP 因此超标。
//
// 本脚本只重编码 **dist/ 里的那份拷贝**，public/assets/videos/ 下的源文件保持不动
// （源文件是站长的母版，构建脚本不应改写它）。
//
// 定位：**「过大视频」的兜底闸门**，不是质量目标。
//   · 站长已经把背景视频从 4K 原片直接编码到 1080p30 / 1400 kbps（≈2.6 MiB）放进 public/，
//     这是画质与体积的定点。它在上限内，所以构建期**原样跳过**。
//   · 做二次有损编码会让损失叠加（发丝与眼睛高光出现块状），上一轮画质回归就是这么来的。
//   · 这个闸门只为拦住「从 Pages CMS 后台上传了一个几十 MB 的大视频」这种情况。
//
// 设计约束（站长要求）：
//   · 有 ffmpeg → 把**超过 TARGET_BYTES** 的视频压到上限内；已经在上限内的原样跳过。
//   · 在体积上限内追求最好观感：限帧（见 MAX_FPS）+ 把预算尽量吃满（见 FIRST_PASS_RATIO），
//     而不是产出一个小文件了事。
//   · `--check`：只回答「有没有超限视频」，不编码、不碰 ffmpeg。workflow 用它决定
//     要不要安装 ffmpeg（没有超限视频就不装，省约 24s）。判断用的是同一个 TARGET_BYTES。
//
// 失败策略：**本地宽松、CI 严格**（见 IS_CI 与 reportFailure）
//   · 本地（没有 CI 环境变量）：ffmpeg 缺失/编码失败 → 只警告、跳过、构建照常通过。
//     开发机不该被 ffmpeg 拦住。
//   · CI（GitHub Actions 会设 CI=true）：ffmpeg 供给失败 / 编码失败 / 压完仍超上限
//     → **以非 0 退出码终止构建**。否则会出现最坏的一种静默失败：
//     「CI 绿 + 部署成功 + 线上继续发 8.78 MB 未压缩视频」，而这恰恰是这个站点头号问题
//     （背景视频占首屏 87%）的修复被无声绕过。

import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveSiteRoot } from "./site-root";

// ── 配置 ──────────────────────────────────────────────────────────────

/**
 * 体积上限（字节）—— **「过大视频」的兜底闸门，不是质量目标。**
 *
 * 语义：`public/assets/videos/` 下的 mp4 **超过**这个体积时，构建期才会重编码一次；
 * 已经 ≤ 它的文件一律原样跳过（见 main() 里的 `⏭` 日志），**绝不二次压缩**。
 *
 * 为什么是 12 MB（2026-10-12 从 3 MB 上调）：
 * 站长明确要求**恢复背景视频原有的画质**，不接受构建期对已定稿素材做任何画质干预。
 * 现在的 public/assets/videos/shorekeeper-night.mp4 是 1920x1080 / 60fps / 3897 kb/s
 * （8,784,159 B），比原来的 3 MB 上限大得多 —— 若上限仍是 3 MB，构建期会把它再压一遍，
 * 这正是上一轮画质回归的成因。所以上限必须抬到它之上。
 *
 * 12 MB 的取值理由：它远高于任何合理的手工定稿素材，又明显低于 Cloudflare Pages
 * 单文件 25 MiB 的硬限制，因此只在「从 Pages CMS 后台上传了一个明显过大的视频」时才会触发。
 *
 * **不要为了压小体积而调低这个值** —— 那等于对已定稿的源文件再做一次有损编码。
 * 要减小视频体积，正确做法是拿**原始母带**重新编码一次（而不是压一个已经压过的文件）。
 */
const TARGET_BYTES = 12_000_000;

/**
 * 输出帧率上限。
 *
 * 这是第一个画质杠杆：源是 1080p**60fps**，在固定体积预算下把帧率减半 =
 * 每帧比特翻倍，观感提升明显；而背景壁纸是慢速漂浮场景，平滑度的损失几乎察觉不到
 * （壁纸类视频的行业常规本来就是 24-30fps）。比降分辨率划算得多 —— 720p 在高分屏上
 * 一眼就能看出模糊。
 */
const MAX_FPS = 30;

/**
 * 首轮编码打算用掉预算的比例 —— 也就是「把预算花在画质上」的力度。
 *
 * 0.92 是早期的保守值，只为避开容器开销导致的轻微超限。限帧到 MAX_FPS 之后，同样的
 * 码率能买到约两倍的「每帧比特」，再按 0.92 编就等于白白把 8% 的预算留在桌上，
 * 所以这里提到 0.97：让编码器把绝大部分预算吃掉换画质，只留 ~3% 给容器开销与码率抖动。
 * 万一真的超限，下面的重压循环会把码率收回到 ≤ TARGET_BYTES，所以提高这个比例
 * 不会牺牲体积上限。
 */
const FIRST_PASS_RATIO = 0.97;
/** 有音轨时的音频码率（kbps）。无音轨则全部预算给视频。 */
const AUDIO_BITRATE_KBPS = 64;
/** 视频码率下限，避免为了达标把画质压到不可看。 */
const MIN_VIDEO_BITRATE_KBPS = 300;
/** 最多编码次数（每次按实测超限比例收紧码率）。 */
const MAX_ATTEMPTS = 3;
/** x264 preset：体积/画质/耗时折中。想更小可改 "slow"，想更快可改 "fast"。 */
const PRESET = "medium";
/** 使用的 H.264 编码器名（需要在 ffmpeg -encoders 里存在）。 */
const VIDEO_ENCODER = "libx264";

/**
 * 是否处于 CI。
 *
 * GitHub Actions 会把 `CI` 设为字符串 `"true"`；这里也接受 `"1"`（其它 CI 的常见写法），
 * 而 `"false"` / `"0"` / 未设置都算本地。**这是本地与 CI 行为分叉的唯一开关。**
 */
const CI_RAW = (process.env.CI ?? "").trim().toLowerCase();
const IS_CI = CI_RAW === "true" || CI_RAW === "1";

// ── 类型 ──────────────────────────────────────────────────────────────

interface ProbeInfo {
	durationSec: number;
	hasAudio: boolean;
	width: number;
	height: number;
	/** 源帧率；读不出来时为 0。 */
	fps: number;
}

interface RunResult {
	ok: boolean;
	/** 退出码；进程根本没起来（spawn 失败）时为 null。 */
	status: number | null;
	stdout: string;
	stderr: string;
	/** spawn 层错误码（例如 ENOENT）。用来区分「ffmpeg 没装」与「装了但跑不起来」。 */
	errorCode: string | null;
}

interface EncodeOutcome {
	ok: boolean;
	size: number | null;
	stderr: string;
}

/** 一次 ffmpeg 候选的探测结果。 */
interface FfmpegProbe {
	candidate: string;
	/** ok=能跑；missing=根本没有这个可执行文件；unusable=文件在但跑不起来。 */
	kind: "ok" | "missing" | "unusable";
	detail: string;
}

interface FfmpegResolution {
	/** 可用的 ffmpeg 路径；都没探测成功时为 null。 */
	path: string | null;
	/** 每个候选的探测记录，用于在 CI 里说清「是供给失败还是别的原因」。 */
	probes: FfmpegProbe[];
}

/** 压缩失败发生在哪一步，决定了「根本没压」还是「压了但没到位」。 */
type CompressFailureStage = "probe" | "encode" | "exception";

/**
 * 一次压缩的结果。
 * 注意：`ok: true` 只表示「ffmpeg 成功产出了文件」，**不表示已达标** ——
 * 是否 ≤ TARGET_BYTES、是否比原文件小，由 main() 按实际字节数判定。
 */
type CompressOutcome =
	| {
			ok: true;
			/** 产出体积（字节） */
			bytes: number;
			/** 产出平均码率（kbps，含音频与容器开销） */
			kbps: number;
			/** 产出帧率 */
			fps: number;
	  }
	| {
			ok: false;
			stage: CompressFailureStage;
			detail: string;
	  };

// ── 基础工具 ──────────────────────────────────────────────────────────

/** 同步执行一个命令，永不抛出（spawn 失败也只是 ok=false）。 */
function run(cmd: string, args: string[]): RunResult {
	const result = spawnSync(cmd, args, {
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	});
	// spawn 失败（ENOENT 等）时 result.error 有值且 status 为 null；
	// 这两条信息是区分「ffmpeg 没装」与「装了但跑不起来」的唯一依据。
	const spawnError = result.error as NodeJS.ErrnoException | undefined;
	return {
		ok: result.status === 0,
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		errorCode: spawnError?.code ?? null,
	};
}

/** 取一段日志的尾部（多行 stderr 里最有用的通常在最末尾），并做长度截断。 */
function tailText(text: string, maxChars: number): string {
	const trimmed = text.trim();
	if (trimmed.length === 0) return "(无 stderr 输出)";
	return trimmed.length <= maxChars
		? trimmed
		: `…${trimmed.slice(-maxChars)}`;
}

/** 同上，但把 stdout 当二进制收（用于 stdout 直传模式）。 */
function runBuffer(
	cmd: string,
	args: string[],
): { ok: boolean; buffer: Buffer; stderr: string } {
	const result = spawnSync(cmd, args, { maxBuffer: 256 * 1024 * 1024 });
	return {
		ok: result.status === 0,
		buffer: result.stdout ?? Buffer.alloc(0),
		stderr: result.stderr ? result.stderr.toString("utf8") : "",
	};
}

/** 人类可读体积；同时给出精确字节数，避免 MB / MiB 的口径歧义。 */
function sizeText(bytes: number): string {
	return `${(bytes / 1024 / 1024).toFixed(2)} MiB (${bytes} B)`;
}

async function sizeOf(file: string): Promise<number | null> {
	try {
		return (await fs.stat(file)).size;
	} catch {
		return null;
	}
}

/**
 * 报告一次「压缩没有成功」。
 *
 * 本地：只警告、**不改退出码** —— 开发机不该被 ffmpeg 拦住。
 * CI  ：必须响亮地失败 —— 非 0 退出码 + `::error::` 注解（GitHub Actions 会标红）。
 *       否则就会出现「绿构建 + 部署成功 + 线上继续发 8.78 MB 未压缩视频」的静默失败。
 *
 * @param kind   失败类别，让读日志的人一眼分辨是「供给失败」「编码失败」还是「压了没到位」
 * @param detail 具体原因与现象，**必须带上实际观测到的字节数**
 * @param remedy 只在 CI 分支打印的处置建议（本地不需要看这些 CI 侧的排查指引）
 */
function reportFailure(kind: string, detail: string, remedy: string): void {
	if (!IS_CI) {
		console.warn(`⚠  ${detail}`);
		console.warn(
			"   本地环境：跳过压缩、不影响构建（同样的情形在 CI 上会直接判失败，不会静默放过）。",
		);
		return;
	}
	console.error(`::error::构建期视频压缩失败【${kind}】：${detail}`);
	console.error(`   ${remedy}`);
	console.error(
		"   视频没有按预期压到上限内，构建已被判失败，部署不会继续。修好后重新推送即可。",
	);
	process.exitCode = 1;
}

/**
 * 找一个能用的 ffmpeg：先看 FFMPEG_PATH，再走 PATH。
 *
 * 除了可用的路径，还返回**每个候选的探测记录** —— 有了它，CI 上的失败信息才能说清是
 * 「根本没装」（spawn ENOENT）还是「装了但跑不起来」（进程能起来但退出码非 0，
 * 例如架构不符 / 缺共享库 / 二进制损坏）。
 */
function resolveFfmpeg(): FfmpegResolution {
	const candidates = [process.env.FFMPEG_PATH, "ffmpeg"].filter(
		(candidate): candidate is string =>
			typeof candidate === "string" && candidate.trim().length > 0,
	);

	const probes: FfmpegProbe[] = [];
	for (const candidate of candidates) {
		const probe = run(candidate, ["-version"]);
		if (probe.ok) {
			probes.push({
				candidate,
				kind: "ok",
				detail: probe.stdout.trim().split("\n")[0] ?? "",
			});
			return { path: candidate, probes };
		}
		if (probe.errorCode === "ENOENT") {
			probes.push({
				candidate,
				kind: "missing",
				detail: "找不到这个可执行文件（spawn ENOENT）",
			});
			continue;
		}
		probes.push({
			candidate,
			kind: "unusable",
			detail: probe.errorCode
				? `spawn 失败：${probe.errorCode}`
				: `进程能起来但退出码 ${probe.status}；stderr 尾部：${tailText(probe.stderr, 200)}`,
		});
	}
	return { path: null, probes };
}

/** 把探测记录拼成一句人话，供 CI 的失败报告使用。 */
function describeFfmpegProbes(probes: FfmpegProbe[]): string {
	if (probes.length === 0) {
		return "FFMPEG_PATH 未设置，PATH 里也没有 ffmpeg";
	}
	return probes
		.map((probe) => {
			const label =
				probe.candidate === "ffmpeg"
					? "PATH 里的 ffmpeg"
					: `FFMPEG_PATH=${probe.candidate}`;
			const state = probe.kind === "missing" ? "未安装" : "存在但不可用";
			return `${label} → ${state}（${probe.detail}）`;
		})
		.join("；");
}

/** 检查 ffmpeg 是否带某个编码器（`ffmpeg -encoders` 里的一列）。 */
function hasEncoder(ffmpeg: string, name: string): boolean {
	const result = run(ffmpeg, ["-hide_banner", "-encoders"]);
	if (!result.ok) return false;
	return new RegExp(`^\\s*\\S+\\s+${name}\\s`, "m").test(result.stdout);
}

/**
 * 读时长 / 分辨率 / 帧率 / 有无音轨。
 * 只给 `-i` 不给输出文件时 ffmpeg 以退出码 1 结束，但信息全在 stderr 里，属正常用法。
 */
function probe(ffmpeg: string, file: string): ProbeInfo | null {
	const result = run(ffmpeg, ["-hide_banner", "-i", file]);
	const text = `${result.stderr}\n${result.stdout}`;

	const duration = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
	if (!duration) return null;
	const durationSec =
		Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
	if (!Number.isFinite(durationSec) || durationSec <= 0) return null;

	const dims = /Video:.*?,\s*(\d{2,5})x(\d{2,5})/.exec(text);
	// 只认 `<数字> fps` 这个 token；后面的 `60 tbr` / `15360 tbn` 不会被误匹配
	const fps = /,\s*(\d+(?:\.\d+)?)\s*fps\b/.exec(text);
	return {
		durationSec,
		hasAudio: /Stream #\d+:\d+.*: Audio:/.test(text),
		width: dims ? Number(dims[1]) : 0,
		height: dims ? Number(dims[2]) : 0,
		fps: fps ? Number(fps[1]) : 0,
	};
}

/**
 * 是否需要限帧。
 * 源帧率高于 MAX_FPS 时限帧；**读不到帧率时也套上限**（宁可稳一点，别让输出超过 30fps）。
 * 源本来 ≤ MAX_FPS 时不会上采样，原样保留。
 */
function shouldCapFps(info: ProbeInfo): boolean {
	return info.fps <= 0 || info.fps > MAX_FPS;
}

/** 本次编码实际的输出帧率。 */
function outputFps(info: ProbeInfo): number {
	return shouldCapFps(info) ? MAX_FPS : info.fps;
}

// ── 编码 ──────────────────────────────────────────────────────────────

/**
 * 组装一次编码的参数。
 * `stream=true` 时输出目标是 stdout（`-f mp4 -`）。MP4 muxer 拒绝非 seekable 输出，
 * 所以管道模式必须用分片 MP4（frag_keyframe+empty_moov）替代 `+faststart`。
 */
function buildEncodeArgs(
	src: string,
	out: string,
	info: ProbeInfo,
	videoKbps: number,
	stream: boolean,
): string[] {
	const args = [
		"-y",
		"-hide_banner",
		"-loglevel",
		"error",
		"-i",
		src,
		"-map",
		"0:v:0",
		// `?` 表示「有音轨就带上，没有也不报错」
		"-map",
		"0:a?",
	];

	// yuv420p 要求宽高为偶数；源本身是偶数时就不加滤镜，避免无谓的重采样
	// （分辨率保持源尺寸，不做任何缩放 —— 1080p 保持不变）
	if (info.width % 2 !== 0 || info.height % 2 !== 0) {
		args.push("-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2");
	}

	// 帧率上限：60fps → 30fps。限帧后每帧可分到的比特翻倍，是这个预算下
	// 性价比最高的画质杠杆（见 MAX_FPS 的说明）。
	if (shouldCapFps(info)) {
		args.push("-r", String(MAX_FPS));
	}

	args.push(
		"-c:v",
		VIDEO_ENCODER,
		"-preset",
		PRESET,
		"-b:v",
		`${videoKbps}k`,
		"-maxrate",
		`${Math.round(videoKbps * 1.3)}k`,
		"-bufsize",
		`${videoKbps * 2}k`,
		"-pix_fmt",
		"yuv420p",
		"-map_metadata",
		"-1",
	);

	if (stream) {
		// 管道输出：只能写分片 MP4，浏览器可直接播放，但结构上不是 faststart
		args.push("-movflags", "frag_keyframe+empty_moov");
	} else {
		// moov 前置，浏览器可以边下边播而不是等整个文件下完
		args.push("-movflags", "+faststart");
	}

	if (info.hasAudio) {
		args.push("-c:a", "aac", "-b:a", `${AUDIO_BITRATE_KBPS}k`);
	}
	if (stream) args.push("-f", "mp4");

	args.push(out);
	return args;
}

/**
 * 跑一次编码，产物落到 `tmp`。
 *
 * 默认让 ffmpeg 直接写文件。但有些受限环境（沙箱/权限策略）只允许 ffmpeg 写特定目录，
 * 此时 ffmpeg 会以 EACCES 失败；这种情况下退化为「ffmpeg 写 stdout、由 Node 落盘」
 * —— Node 有完整写权限，且这条路径在任何平台都可用，代价是拿不到 +faststart。
 */
async function encodeOnce(
	ffmpeg: string,
	src: string,
	info: ProbeInfo,
	videoKbps: number,
	tmp: string,
	stream: boolean,
): Promise<EncodeOutcome> {
	if (!stream) {
		const result = run(ffmpeg, buildEncodeArgs(src, tmp, info, videoKbps, false));
		const produced = await sizeOf(tmp);
		return {
			ok: result.ok && produced !== null && produced > 0,
			size: produced,
			stderr: result.stderr,
		};
	}

	const result = runBuffer(
		ffmpeg,
		buildEncodeArgs(src, "-", info, videoKbps, true),
	);
	if (!result.ok || result.buffer.length === 0) {
		return { ok: false, size: null, stderr: result.stderr };
	}
	await fs.rm(tmp, { force: true });
	await fs.writeFile(tmp, result.buffer);
	return { ok: true, size: result.buffer.length, stderr: result.stderr };
}

/**
 * 反复收紧码率直到 ≤ TARGET_BYTES；返回产出信息或失败分类。
 *
 * 码率目标是「预算 × FIRST_PASS_RATIO」，也就是先把预算尽量花满（换成画质），
 * 超出上限时才往回收。配合 MAX_FPS 限帧，预算里的每一分钱都买到更多的每帧比特。
 */
async function compressFile(
	ffmpeg: string,
	file: string,
): Promise<CompressOutcome> {
	const tmp = `${file}.compressing.mp4`;

	try {
		const info = probe(ffmpeg, file);
		if (!info) {
			return {
				ok: false,
				stage: "probe",
				detail: `ffmpeg -i 没有输出可解析的时长信息，无法确定目标码率`,
			};
		}

		const audioKbps = info.hasAudio ? AUDIO_BITRATE_KBPS : 0;
		let videoKbps = Math.max(
			MIN_VIDEO_BITRATE_KBPS,
			Math.floor((TARGET_BYTES * 8 * FIRST_PASS_RATIO) / info.durationSec / 1000) -
				audioKbps,
		);

		console.log(
			`   ℹ ${path.basename(file)}：${info.fps > 0 ? `${info.fps}fps` : "帧率未知"} → ${outputFps(info)}fps，` +
				`${info.width}x${info.height}（不缩放），目标码率 ${videoKbps} kbps（预算使用率 ${(FIRST_PASS_RATIO * 100).toFixed(0)}%）`,
		);

		let best: number | null = null;
		let streamMode = false;
		let attempt = 0;

		while (attempt < MAX_ATTEMPTS) {
			attempt++;

			const outcome = await encodeOnce(
				ffmpeg,
				file,
				info,
				videoKbps,
				tmp,
				streamMode,
			);

			if (!outcome.ok || outcome.size === null) {
				if (!streamMode) {
					// R3：直写模式失败时把 ffmpeg 的 stderr 尾部打出来 —— 真正的失败原因
					// （权限受限 / 流映射不匹配 / 输入损坏…）全在那里，不打出来就查不到。
					console.log(
						"   … 直写模式没有产出文件，改用 stdout 直传模式重试（真实原因见下面这行 ffmpeg stderr）",
					);
					console.log(
						`     直写模式 ffmpeg stderr 尾部：${tailText(outcome.stderr, 400)}`,
					);
					streamMode = true;
					attempt--; // 换模式不计入重试次数
					continue;
				}
				const detail = `第 ${attempt} 次编码失败；ffmpeg stderr 尾部：${tailText(outcome.stderr, 400)}`;
				console.warn(`   ⚠ ${detail}`);
				return { ok: false, stage: "encode", detail };
			}

			best = outcome.size;
			if (best <= TARGET_BYTES) break;
			if (attempt >= MAX_ATTEMPTS) break;

			const nextKbps = Math.max(
				MIN_VIDEO_BITRATE_KBPS,
				Math.floor(videoKbps * (TARGET_BYTES / best) * 0.95),
			);
			if (nextKbps >= videoKbps) break;
			console.log(
				`   … 第 ${attempt} 次产出 ${sizeText(best)} 仍超限，收紧到 ${nextKbps} kbps 重压`,
			);
			videoKbps = nextKbps;
		}

		if (best === null) {
			return {
				ok: false,
				stage: "encode",
				detail: "所有编码尝试都没有产出文件",
			};
		}
		if (best > TARGET_BYTES) {
			// 注意：这里刻意仍然算“产出成功”，把真实字节数交给 main 去判定并报告，
			// 这样 CI 的报错能带上「压了多少、超了多少」，而不是一句笼统的失败。
			console.warn(
				`   ⚠ 已到码率下限 ${MIN_VIDEO_BITRATE_KBPS} kbps，产出仍有 ${sizeText(best)}`,
			);
		}

		// 同目录改名 = 原子替换，避免半截文件落进 dist/
		await fs.rename(tmp, file);
		return {
			ok: true,
			bytes: best,
			// 含音频与容器开销的整文件平均码率，便于和上一版对比
			kbps: Math.round((best * 8) / info.durationSec / 1000),
			fps: outputFps(info),
		};
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		console.warn(`   ⚠ 压缩过程异常：${detail}`);
		return { ok: false, stage: "exception", detail };
	} finally {
		await fs.rm(tmp, { force: true }).catch(() => undefined);
	}
}

// ── 主流程 ────────────────────────────────────────────────────────────

/**
 * 是不是「只检查、不压缩」模式（`--check`）。
 *
 * workflow 在 `astro build` **之前**跑 `tsx scripts/compress-videos.ts --check`：
 * 退出码 0 = 没有超限视频（可以不装 ffmpeg）；1 = 有（必须装）；2 = 检查本身出错。
 */
const CHECK_ONLY = process.argv.includes("--check");

/**
 * 只回答一个问题：`public/assets/videos/` 里有没有超过 TARGET_BYTES 的视频？
 *
 * **目录口径说明**：normal 模式查的是构建产物 `dist/assets/videos/`（astro 把 public/
 * 原样拷进 dist/，两边字节数完全相同）；--check 跑在构建之前、dist/ 还不存在，所以查源目录。
 * 两边用的是**同一个 TARGET_BYTES 常量**、同一种「`> TARGET_BYTES`」判定，因此不会漂移。
 *
 * 兜底逻辑仍然在 normal 模式里：就算这里判断失误（漏装 ffmpeg），构建期一旦发现真有
 * 超限视频而 ffmpeg 不可用，compress-videos.ts 会按 t13 的约定在 CI 上硬失败 ——
 * 最坏结果是「构建红了」，绝不会变成「静默发一个未压缩的大视频」。
 *
 * 退出码：0 = 不需要压缩；1 = 需要压缩；2 = 检查本身出错（调用方应保守地照常安装 ffmpeg）。
 */
async function checkVideos(): Promise<void> {
	const videosDir = path.join("public", "assets", "videos");
	console.log(
		`🎬 --check：检查 ${videosDir}/ 里有没有超过 ${sizeText(TARGET_BYTES)} 的视频`,
	);

	let names: string[];
	try {
		names = (await fs.readdir(videosDir)).filter((name) =>
			name.toLowerCase().endsWith(".mp4"),
		);
	} catch {
		console.log(`   （没有 ${videosDir}/）→ 没有需要压缩的视频。`);
		return;
	}

	const oversized: { name: string; bytes: number }[] = [];
	for (const name of names) {
		const bytes = await sizeOf(path.join(videosDir, name));
		if (bytes === null) continue;
		if (bytes > TARGET_BYTES) {
			oversized.push({ name, bytes });
			continue;
		}
		console.log(
			`   ⏭ ${name}：${sizeText(bytes)} 已经 ≤ 上限 ${sizeText(TARGET_BYTES)}，无需压缩`,
		);
	}

	if (oversized.length === 0) {
		console.log(
			`   ✅ ${names.length} 个视频都在上限内 → 不需要压缩，workflow 可以不安装 ffmpeg。`,
		);
		return;
	}

	for (const { name, bytes } of oversized) {
		console.warn(
			`   ⚠ ${name}：${sizeText(bytes)} 超过上限 ${sizeText(TARGET_BYTES)}，需要压缩`,
		);
	}
	console.log(
		`   结论：${oversized.length} 个视频需要压缩 → workflow 必须安装 ffmpeg（--check 退出码 1）。`,
	);
	process.exitCode = 1;
}

async function main(): Promise<void> {
	const videosDir = path.join(resolveSiteRoot(), "assets", "videos");

	let names: string[];
	try {
		names = (await fs.readdir(videosDir)).filter((name) =>
			name.toLowerCase().endsWith(".mp4"),
		);
	} catch {
		console.log(`🎬 没有 ${videosDir}（构建产物里没有视频），跳过。`);
		return;
	}
	if (names.length === 0) {
		console.log(`🎬 ${videosDir} 下没有 mp4，跳过。`);
		return;
	}

	// 先算出「本来需要压缩」的文件：失败信息里必须带上真实的字节数，
	// 让人一眼分清「根本没压」与「压了但没到位」。
	const pending: { name: string; bytes: number }[] = [];
	for (const name of names) {
		const bytes = await sizeOf(path.join(videosDir, name));
		if (bytes === null) continue;
		if (bytes > TARGET_BYTES) {
			pending.push({ name, bytes });
			continue;
		}
		// 已经在上限内 → 原样跳过，**不做二次编码**。有损编码的损失会叠加，
		// 把已定稿的源文件再压一遍只会更糊（这正是上一轮画质回归的成因）。
		console.log(
			`   ⏭ ${name}：${sizeText(bytes)} 已经 ≤ 上限 ${sizeText(TARGET_BYTES)}，原样跳过、不做二次压缩`,
		);
	}
	if (pending.length === 0) {
		console.log(
			`✨ ${names.length} 个视频全部在上限 ${sizeText(TARGET_BYTES)} 以内，无需压缩。`,
		);
		return;
	}
	const pendingText = pending
		.map((item) => `${item.name} ${item.bytes} B`)
		.join("、");

	const { path: ffmpeg, probes } = resolveFfmpeg();
	if (!ffmpeg) {
		// 供给失败：ffmpeg 压根不在（或跑不起来）。这是「根本没压」。
		reportFailure(
			"ffmpeg 供给失败",
			`${describeFfmpegProbes(probes)}。因此 ${pendingText} 完全没有被压缩（上限 ${TARGET_BYTES} B）。`,
			"这属于 ffmpeg 供给失败、不是编码失败：请检查 workflow 里「确保 ffmpeg 可用（含 libx264 编码器）」那一步有没有真的装成功；本机则把 ffmpeg 放进 PATH 或设置 FFMPEG_PATH。",
		);
		return;
	}

	if (!hasEncoder(ffmpeg, VIDEO_ENCODER)) {
		// 同样算供给失败：ffmpeg 能跑但缺 H.264 编码器，仍是「根本没压」。
		reportFailure(
			"ffmpeg 供给失败",
			`ffmpeg（${ffmpeg}）能运行，但 \`ffmpeg -encoders\` 里没有 ${VIDEO_ENCODER} 编码器；` +
				`因此 ${pendingText} 完全没有被压缩（上限 ${TARGET_BYTES} B）。`,
			"这同样属于 ffmpeg 供给失败：Debian/Ubuntu 上安装 libavcodec-extra 可补齐 libx264（workflow 里那一步已经带上了它）。",
		);
		return;
	}

	console.log("🎬 Compressing build-time videos in dist/...");

	let savedBytes = 0;
	let compressed = 0;

	for (const { name, bytes: before } of pending) {
		const file = path.join(videosDir, name);
		console.log(
			`   ⏳ ${name}：${sizeText(before)} → 目标 ≤ ${sizeText(TARGET_BYTES)}`,
		);

		const result = await compressFile(ffmpeg, file);
		if (!result.ok) {
			reportFailure(
				result.stage === "probe" ? "读不出视频信息" : "编码失败",
				`${name}：${result.detail}。原文件 ${before} B 完全没有被压缩（上限 ${TARGET_BYTES} B）。`,
				"这属于编码失败（不是 ffmpeg 供给失败）：上面那行 ffmpeg stderr 就是根因，先按它排查；确认 ffmpeg 本身能手工压这个文件。",
			);
			continue;
		}

		if (result.bytes > TARGET_BYTES) {
			reportFailure(
				"压缩后仍超上限",
				`${name} 压到了 ${result.bytes} B，仍超过上限 ${TARGET_BYTES} B（超出 ${result.bytes - TARGET_BYTES} B）。` +
					"这是「压了但没到位」，不是「根本没压」。",
				`码率已到下限 ${MIN_VIDEO_BITRATE_KBPS} kbps 仍不达标：需要放宽 TARGET_BYTES、或降低素材分辨率/时长，光调参数已经压不动了。`,
			);
			continue;
		}

		if (result.bytes >= before) {
			reportFailure(
				"压缩未生效",
				`${name} 压缩后 ${result.bytes} B，并不比原文件 ${before} B 小（上限 ${TARGET_BYTES} B）。`,
				"编码没有带来任何收益：检查素材本身（是否已经是低码率文件、或时长/帧率被误读）。",
			);
			continue;
		}

		savedBytes += before - result.bytes;
		compressed++;
		const ratio = (((before - result.bytes) / before) * 100).toFixed(1);
		const budgetUsed = ((result.bytes / TARGET_BYTES) * 100).toFixed(1);
		console.log(
			`   ✔ ${name}：${sizeText(before)} → ${sizeText(result.bytes)}` +
				`（-${ratio}%，平均 ${result.kbps} kb/s @ ${result.fps}fps，占预算 ${budgetUsed}%）`,
		);
	}

	console.log(
		`✨ Compressed ${compressed}/${pending.length} video(s), saved ${sizeText(savedBytes)}.`,
	);
}

// 顶层 await：保证 main() 一定跑完（脚本由 pnpm build 的 && 链驱动）。
// 本地：任何异常都降级成警告，退出码保持 0。
// CI  ：连「脚本自己崩了」也必须响亮失败 —— 否则又是「绿构建 + 未压缩视频」。
if (CHECK_ONLY) {
	// --check 模式：只读目录、不碰 ffmpeg、不改任何文件。
	// 出错时用退出码 2（而不是 1），让调用方能把「需要压缩」与「判断不了」分开处理。
	try {
		await checkVideos();
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		console.error(`::error::--check 检查视频体积时出错：${detail}`);
		process.exitCode = 2;
	}
} else {
	try {
		await main();
	} catch (err) {
		const detail = err instanceof Error ? err.message : String(err);
		if (IS_CI) {
			console.error(`::error::构建期视频压缩脚本异常终止：${detail}`);
			console.error(
				"   视频没有按预期压缩，构建已被判失败，部署不会继续。修好后重新推送即可。",
			);
			process.exitCode = 1;
		} else {
			console.warn(`⚠  视频压缩脚本出错，已跳过（不影响构建）：${detail}`);
		}
	}
}
