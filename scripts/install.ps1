# Antigravity CLI Windows Installer
# Usage: powershell -ExecutionPolicy Bypass -File scripts/install.ps1

$ErrorActionPreference = "Stop"

Write-Host "Instalando Antigravity CLI..." -ForegroundColor Cyan

$InstallDir = Join-Path $HOME ".antigravity\bin"
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$DistFile = Join-Path $PSScriptRoot "..\dist\index.js"
if (Test-Path $DistFile) {
    Copy-Item $DistFile -Destination (Join-Path $InstallDir "agent.js") -Force
    # Cria wrapper executável .cmd para permitir execução via 'agent'
    $CmdWrapper = "@echo off`r`nnode `"%~dp0agent.js`" %*"
    Set-Content -Path (Join-Path $InstallDir "agent.cmd") -Value $CmdWrapper -Encoding ASCII
    Write-Host "Binários copiados com sucesso para $InstallDir" -ForegroundColor Green
} else {
    Write-Host "Aviso: dist/index.js não encontrado. Execute 'pnpm run build' primeiro." -ForegroundColor Yellow
}

# Adiciona ao PATH se ainda não estiver
$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($UserPath -notlike "*$InstallDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$UserPath;$InstallDir", "User")
    Write-Host "✔ $InstallDir adicionado ao PATH do Usuário." -ForegroundColor Green
    Write-Host "Reinicie seu terminal para usar o comando 'agent' globalmente." -ForegroundColor Yellow
} else {
    Write-Host "✔ $InstallDir já está no PATH." -ForegroundColor Green
}

Write-Host "Instalação concluída com sucesso!" -ForegroundColor Cyan
