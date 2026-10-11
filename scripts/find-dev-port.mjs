// 找出可用的本地预览端口。
// 规则：从 4321 起扫描，遇到「已在正常提供博客」的端口就直接用它，
// 遇到「被占用但返回错误」的端口就跳过，遇到空闲端口就用它。
// 输出格式：<端口> <是否已在运行 0|1>
import net from "node:net";

const isFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true)));
    s.listen(port, "127.0.0.1");
  });

const isServing = async (port) => {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) });
    return r.status === 200;
  } catch {
    return false;
  }
};

for (let port = 4321; port <= 4330; port++) {
  const free = await isFree(port);
  if (!free && (await isServing(port))) { console.log(`${port} 1`); process.exit(0); }
  if (free) { console.log(`${port} 0`); process.exit(0); }
}
console.log("4321 0");