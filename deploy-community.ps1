# Copies the built package into the MSFS 2024 Community folder as its OWN folder (bgt-f27500-modernized; until v10.10 bgt-f27500-g1000).
# It never touches any other package (the baseline bgt-f27500-v2 and the zz- overlay stay as they are).
# The simulator must be restarted to pick up changes; do not run this to "refresh" while a flight is being recorded.
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\deploy-community.ps1   (add -Remove to uninstall)
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$pkg       = 'bgt-f27500-modernized'
$built     = "C:\Projetos\f27-g1000\out\Packages\$pkg"
$community = Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community'   # MSFS 2024, Microsoft Store
$target    = "$community\$pkg"

if (-not (Test-Path $community)) { throw "Community folder not found: $community" }
if ($target -ne "$community\bgt-f27500-modernized") { throw 'unexpected target' }
# v10.11: the same aircraft under its old folder name would give the sim every title twice: it must be backed up and taken out first
if (-not $Remove -and (Test-Path "$community\bgt-f27500-g1000")) { throw "the old folder $community\bgt-f27500-g1000 is still installed: back it up to _fallback and remove it first" }

$running = Get-Process -Name 'FlightSimulator2024' -ErrorAction SilentlyContinue
if ($running) { "NOTE: the simulator is running; restart it to load the aircraft." }

if ($Remove) {
    if (Test-Path $target) { Remove-Item $target -Recurse -Force; "removed $target" } else { "nothing to remove" }
    return
}
if (-not (Test-Path "$built\layout.json")) { throw 'build first: build-package.ps1' }
robocopy $built $target /MIR /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$f = Get-ChildItem $target -Recurse -File
"installed {0} files, {1:N1} MB -> {2}" -f $f.Count, (($f | Measure-Object Length -Sum).Sum / 1MB), $target
