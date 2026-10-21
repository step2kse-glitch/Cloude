@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules\ffmpeg-static call npm install
if not exist assets\fonts\Pretendard-Bold.otf call node scripts\reels_fonts.js
echo 릴스 스튜디오를 켭니다. 이 창을 닫으면 꺼져요.
node scripts\reels_studio.js
pause
