@echo off
chcp 65001 >nul
setlocal

echo.
echo  ============================================================
echo   把 Cloudflare 令牌写入 GitHub 仓库密钥
echo  ============================================================
echo.
echo   接下来会提示你粘贴令牌。
echo   粘贴时屏幕上不会显示任何字符（这是正常的安全行为），
echo   粘贴完按回车即可。
echo.
echo   令牌不会经过任何第三方 —— gh 直接调用 GitHub 官方 API 写入。
echo.
pause

"D:\gh\bin\gh.exe" secret set CLOUDFLARE_API_TOKEN --repo yokan-haze/yokan-haze-blog --app actions

if errorlevel 1 (
  echo.
  echo  写入失败。把上面的报错截图给我。
  echo.
  pause
  exit /b 1
)

echo.
echo  ============================================================
echo   成功！密钥已写入 GitHub。
echo  ============================================================
echo.
echo   下一步：去 GitHub 的 Actions 页面，点一次「Run workflow」
echo   手动触发构建，验证整条链路。
echo.
echo   https://github.com/yokan-haze/yokan-haze-blog/actions
echo.
pause
