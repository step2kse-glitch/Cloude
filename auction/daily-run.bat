@echo off
rem 윈도우 작업 스케줄러가 매일 부르는 파일 (직접 실행해도 됨)
chcp 65001 >nul
cd /d "%~dp0.."
if not exist auction\workspace\daily mkdir auction\workspace\daily
node auction\src\cli.js daily --ai >> auction\workspace\daily\schedule.log 2>&1
