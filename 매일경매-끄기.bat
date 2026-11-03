@echo off
chcp 65001 >nul
schtasks /Delete /F /TN "CloudeAuctionDaily"
echo 매일 자동 실행을 껐어요.
pause
