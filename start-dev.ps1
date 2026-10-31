# Levanta backend (puerto 3000) y frontend (http://localhost:4200) en dos ventanas.
# Uso:  .\start-dev.ps1        (o doble click en start-dev.bat)
#       .\start-dev.ps1 -Stop  (cierra lo que quede escuchando en 3000 y 4200)
#       .\start-dev.ps1 -Legacy  (backend sin modo autoritativo, como la fase 1)
param([switch]$Stop, [switch]$Legacy)

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverDir = Join-Path $root 'server'

function Get-PortPids([int]$port) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
}

if ($Stop) {
    foreach ($port in 3000, 4200) {
        foreach ($procId in (Get-PortPids $port)) {
            Write-Host "Cerrando proceso $procId (puerto $port)"
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    return
}

foreach ($port in 3000, 4200) {
    if (Get-PortPids $port) {
        Write-Host "El puerto $port ya esta en uso. Cerralo con:  .\start-dev.ps1 -Stop" -ForegroundColor Yellow
        return
    }
}

if (-not (Test-Path (Join-Path $root 'node_modules'))) {
    Write-Host 'Instalando dependencias del frontend...'
    Push-Location $root; npm install; Pop-Location
}
if (-not (Test-Path (Join-Path $serverDir 'node_modules'))) {
    Write-Host 'Instalando dependencias del backend...'
    Push-Location $serverDir; npm install; Pop-Location
}

Start-Process powershell -WorkingDirectory $serverDir -ArgumentList '-NoExit', '-Command', ('$Host.UI.RawUI.WindowTitle = "Azes - Backend :3000"; ' + $(if ($Legacy) { '' } else { '$env:AUTHORITATIVE = "1"; ' }) + 'npm run dev')
Start-Process powershell -WorkingDirectory $root -ArgumentList '-NoExit', '-Command', '$Host.UI.RawUI.WindowTitle = "Azes - Frontend :4200"; npm start'

Write-Host 'Backend:  http://localhost:3000'
Write-Host 'Frontend: http://localhost:4200  (tarda unos segundos en compilar)'
Write-Host 'Para jugar de a dos, abri dos pestanas (o una normal y una incognito).'
