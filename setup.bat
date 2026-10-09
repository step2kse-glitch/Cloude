@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo  네이버 블로그 자동 작성 툴 - 처음 설치
echo ==========================================
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js가 없습니다. 브라우저에서 nodejs.org 를 열어 LTS 버전을 설치한 뒤
  echo     이 파일을 다시 더블클릭하세요.
  start https://nodejs.org
  pause
  exit /b 1
)
echo [1/4] 필요한 부품 설치 중...
call npm install || goto :fail
echo [2/4] 자동화용 크롬 설치 중...
call npx playwright install chromium || goto :fail
echo [3/4] Claude Code 확인 중...
where claude >nul 2>nul
if errorlevel 1 call npm install -g @anthropic-ai/claude-code || goto :fail
echo [4/4] 네이버 로그인 - 크롬 창이 뜨면 직접 로그인하세요 (5분 안에)
call node scripts\naver_login.js || goto :fail
echo.
echo 설치 완료! 이제 start-phone.bat 을 더블클릭하면 핸드폰에서 쓸 수 있어요.
echo (처음 한 번은 Claude 계정 로그인 창이 뜰 수 있어요)
pause
exit /b 0
:fail
echo.
echo [X] 설치 중 오류가 났어요. 위 빨간 메시지를 사진 찍어서 Claude에게 보여주세요.
pause
exit /b 1
