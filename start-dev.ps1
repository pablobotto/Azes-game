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

# Si se hace clic dentro de una consola de Windows (o se selecciona texto) entra el modo "seleccionar" y pausa la
# escritura en pantalla: el backend escribe los logs de forma sincrona y se CONGELA hasta apretar Enter, sin dar error
# (el puerto sigue abierto pero nadie contesta). Cada ventana apaga ese modo al arrancar.
$noQuickEdit = @'
$k = Add-Type -Namespace Win -Name K -PassThru -MemberDefinition '[DllImport("kernel32.dll")] public static extern System.IntPtr GetStdHandle(int n); [DllImport("kernel32.dll")] public static extern bool GetConsoleMode(System.IntPtr h, out uint m); [DllImport("kernel32.dll")] public static extern bool SetConsoleMode(System.IntPtr h, uint m);'
$h = $k::GetStdHandle(-10); $m = [uint32]0
if ($k::GetConsoleMode($h, [ref]$m)) { [void]$k::SetConsoleMode($h, [uint32](($m -bor 0x80) - ($m -band 0x40))) }
'@

# El comando va codificado: al pasarlo como texto, PowerShell pierde las comillas dobles (y el titulo daba error).
function Start-DevWindow([string]$dir, [string]$title, [string]$command) {
    $script = $noQuickEdit + "`n`$Host.UI.RawUI.WindowTitle = '$title'`n" + $command
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    Start-Process powershell -WorkingDirectory $dir -ArgumentList '-NoExit', '-EncodedCommand', $enc
}

Start-DevWindow $serverDir 'Azes - Backend :3000' ($(if ($Legacy) { '' } else { '$env:AUTHORITATIVE = ''1''' + "`n" }) + 'npm run dev')
Start-DevWindow $root 'Azes - Frontend :4200' 'npm start'

Write-Host 'Backend:  http://localhost:3000'
Write-Host 'Frontend: http://localhost:4200  (tarda unos segundos en compilar)'
Write-Host 'Para jugar de a dos, abri dos pestanas (o una normal y una incognito).'
