@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo ==========================================
echo  법원경매 AI 분석
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
echo 처음이면 채팅에 데모 라고 쳐서 샘플 리포트부터 보세요.
echo 예) 화성 아파트 5억 이하 투자 / 동탄 실거주 내 집 찾기
call claude "/auction"
pause
exit /b 0
:fail
echo [X] 설치 오류 - 이 창을 사진 찍어 Claude에게 보여주세요.
pause
exit /b 1
