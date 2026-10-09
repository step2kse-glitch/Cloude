@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 핸드폰 연결 모드를 켭니다. 이 창을 닫으면 연결이 끊겨요.
echo 핸드폰 Claude 앱 - Claude Code 에서 이 컴퓨터 세션을 선택하세요.
echo (컴퓨터가 절전 모드로 들어가지 않게 해 두세요)
call claude remote-control
pause
