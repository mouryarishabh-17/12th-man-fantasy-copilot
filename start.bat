@echo off
cd /d "%~dp0"
echo Starting 12th Man... keep this window open while you use the app.
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8011"
python server.py
pause
