@echo off
chcp 65001 >nul
cd /d D:\Firefly-blog

set PORT=
set RUNNING=
for /f "tokens=1,2" %%a in ('node scripts\find-dev-port.mjs 2^>nul') do (
  set PORT=%%a
  set RUNNING=%%b
)
if "%PORT%"=="" set PORT=4321

if "%RUNNING%"=="1" (
  echo.
  echo  博客已经在运行（端口 %PORT%），正在打开浏览器...
  start http://127.0.0.1:%PORT%/
  timeout /t 3 >nul
  exit /b
)

if exist ".astro\dev.json" del /q ".astro\dev.json" >nul 2>&1

echo.
echo  正在启动本地博客预览（端口 %PORT%）...
echo  首次启动需要 20-60 秒，浏览器会在 30 秒后自动打开。
echo  如果页面提示无法连接，等几秒刷新一下即可。
echo  关闭此窗口就会停止博客。
echo.
start "" cmd /c "timeout /t 30 /nobreak >nul & start http://127.0.0.1:%PORT%/"
call pnpm dev --host 127.0.0.1 --port %PORT%
pause