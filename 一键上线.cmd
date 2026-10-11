@echo off
chcp 65001 >nul
cd /d D:\Firefly-blog

set GIT=D:\PortableGit\cmd\git.exe

echo.
echo  ==========================================
echo   正在上线 yokan-haze
echo  ==========================================
echo.

echo  [1/3] 从 GitHub 拉取最新内容...
"%GIT%" pull --quiet 2>&1
if errorlevel 1 (
  echo.
  echo  拉取失败。可能是网络问题，稍后重试即可。
  echo  如果你刚才在 Pages CMS 里改过东西，必须先拉取成功才能上线。
  echo.
  pause
  exit /b 1
)
echo        完成

echo.
echo  [2/3] 构建网站（约 1 分钟）...
call pnpm build > "%TEMP%\yokan-build.log" 2>&1
if errorlevel 1 (
  echo.
  echo  构建失败！最后的日志：
  echo  ------------------------------------------
  powershell -NoProfile -Command "Get-Content '%TEMP%\yokan-build.log' -Tail 25"
  echo  ------------------------------------------
  echo  把上面的报错发给我。
  echo.
  pause
  exit /b 1
)
echo        完成

echo.
echo  [3/3] 上传到 Cloudflare...
call pnpm exec wrangler pages deploy dist --project-name=yokan-haze --branch=main --commit-dirty=true 2>&1 | findstr /C:"Success" /C:"Deployment complete" /C:"ERROR" /C:"error"
if errorlevel 1 (
  echo.
  echo  上传失败，把上面的信息发给我。
  echo.
  pause
  exit /b 1
)

echo.
echo  ==========================================
echo   上线完成
echo   https://yokan-haze.pages.dev/
echo  ==========================================
echo.
echo  浏览器可能还缓存着旧页面，按 Ctrl+F5 强制刷新即可看到最新内容。
echo.
pause
