$ErrorActionPreference = "Stop"

$root = "d:\trabalho\GalaTime\GalaTime 1 Chronicles of the Past\Project\GalaTime - Chronicles of the Past"
Set-Location $root

Write-Host "Installing root dependencies..." -ForegroundColor Cyan
npm.cmd install

Write-Host "Installing desktop dependencies..." -ForegroundColor Cyan
Set-Location "$root\apps\desktop"
npm.cmd install

Write-Host "Project setup complete." -ForegroundColor Green
