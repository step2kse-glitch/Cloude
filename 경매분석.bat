@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo  내 경매 비서
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js가 없습니다. 먼저 setup.bat 을 실행하세요.
  pause
  exit /b 1
)
if not exist node_modules (
  echo [준비] 필요한 부품 설치 중...
  call npm install || goto :fail
  call npx playwright install chromium || goto :fail
)
echo 브라우저가 자동으로 열려요. 이 창을 닫으면 화면도 꺼져요.
node auction\src\cli.js web
pause
exit /b 0
:fail
echo [X] 설치 오류 - 이 창을 사진 찍어 Claude에게 보여주세요.
pause
exit /b 1
