@echo off
:: TracePulse CLI launcher for Windows
:: Resolves the real path and runs the ESM entry point via node
node "%~dp0..\dist\cli.js" %*
