@echo off
chcp 65001 >nul
rem 윈도우: 매일 아침 07:30 "1억으로 경매" 오늘의 물건 → 블로그 초안 준비 (임시저장·발행은 승인 후)
schtasks /Create /F /SC DAILY /ST 07:30 /TN "CloudeAuctionDaily" /TR "\"%~dp0auction\daily-run.bat\""
if errorlevel 1 (
  echo [X] 등록 실패 - 이 창을 사진 찍어 Claude에게 보여주세요.
) else (
  echo 매일 아침 7:30에 오늘의 경매 물건을 준비해요. 컴퓨터가 켜져 있어야 해요.
  echo 끄려면: 매일경매-끄기.bat
)
pause
