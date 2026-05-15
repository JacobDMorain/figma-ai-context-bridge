@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-mcp-server.ps1" %*
if errorlevel 1 (
  echo.
  echo MCP server failed to start.
  pause
  exit /b %errorlevel%
)
echo.
echo MCP server command exited.
pause
