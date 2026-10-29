# Copies the locally built Working Title G1000 NXi (see C:\Projetos\f27-efis\build-g1000.ps1) into the F27 G1000 package
# under a private folder name, so it cannot override the simulator's own G1000 for other aircraft.
#
# NavSystems\WTG1000v2  ->  NavSystems\F27G1000
# The old name appears in only 12 places (PFD/MFD html, css and the asset base path inside PFD.js/MFD.js); they are rewritten.
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\stage-g1000-instrument.ps1
$ErrorActionPreference = 'Stop'
$srcRoot = 'C:\Projetos\msfs-avionics-mirror\src\workingtitle-instruments-g1000\dist\workingtitle-instruments-g1000-v2\html_ui\Pages\VCockpit\Instruments\NavSystems\WTG1000v2'
$dstRoot = 'C:\Projetos\f27-g1000\PackageSources\bgt-f27500-g1000\html_ui\Pages\VCockpit\Instruments\NavSystems\F27G1000'
$old = 'WTG1000v2'
$new = 'F27G1000'

if (-not (Test-Path "$srcRoot\PFD\PFD.js")) { throw "G1000 build not found; run C:\Projetos\f27-efis\build-g1000.ps1 first" }
if (Test-Path $dstRoot) { Remove-Item $dstRoot -Recurse -Force }
New-Item -ItemType Directory -Force $dstRoot | Out-Null
robocopy $srcRoot $dstRoot /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

$utf8 = New-Object System.Text.UTF8Encoding($false)
$rewritten = 0
foreach ($f in Get-ChildItem $dstRoot -Recurse -File -Include *.html, *.css, *.js) {
    $text = [System.IO.File]::ReadAllText($f.FullName)
    if ($text.Contains($old)) {
        $count = ([regex]::Matches($text, [regex]::Escape($old))).Count
        [System.IO.File]::WriteAllText($f.FullName, $text.Replace($old, $new), $utf8)
        $rewritten += $count
        "{0}: {1} replacement(s)" -f $f.FullName.Substring($dstRoot.Length + 1), $count
    }
}
$left = (Get-ChildItem $dstRoot -Recurse -File | Select-String -Pattern $old -SimpleMatch -List | Measure-Object).Count
"total replacements: $rewritten; files still containing '$old': $left"
if ($left -ne 0) { throw "old path still referenced" }
