@echo off
title RendoFren Cluster Services Launcher
cls
echo ======================================================================
echo                   RENDOFREN CLUSTER CONCURRENT LAUNCHER
echo ======================================================================
echo.
echo Starting Backend and Frontend cluster instances in side-by-side stream...
echo Press Ctrl+C at any time in this window to stop both servers.
echo.
node start_network.js
pause
