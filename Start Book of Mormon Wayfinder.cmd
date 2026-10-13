@echo off
cd /d "%~dp0"
echo Open http://127.0.0.1:4174 in your browser.
echo Keep this window open while studying.
start "" http://127.0.0.1:4174
node scripts\serve.mjs
pause
