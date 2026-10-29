# Copies the locally built Working Title WT21 (see tools\build-wt21.ps1) into the F27 package under a private folder name, so it cannot
# override the simulator's own WT21 (used by the real CJ4) for other aircraft.
#
# Instruments\WT21v2  ->  Instruments\F27WT21
# The old name appears only inside asset URLs (fonts, icons) in the three html files, wt21shared.css and wt21shared.js; all are rewritten.
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\stage-wt21-instrument.ps1
$ErrorActionPreference = 'Stop'
$srcRoot = 'C:\Projetos\msfs-avionics-mirror\src\workingtitle-instruments-wt21\instruments\dist\workingtitle-instruments-wt21-v2\html_ui\Pages\VCockpit\Instruments\WT21v2'
$dstRoot = 'C:\Projetos\f27-g1000\PackageSources\bgt-f27500-modernized\html_ui\Pages\VCockpit\Instruments\F27WT21'
$old = 'WT21v2'
$new = 'F27WT21'

if (-not (Test-Path "$srcRoot\PFD\PFD.js")) { throw 'WT21 build not found; run C:\Projetos\f27-g1000\tools\build-wt21.ps1 first' }
if (Test-Path $dstRoot) { Remove-Item $dstRoot -Recurse -Force }
New-Item -ItemType Directory -Force $dstRoot | Out-Null
robocopy $srcRoot $dstRoot /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

# The F27 MFD plugin (plugin-wt21, Dart engine indication) is loaded by the central MFD through a <Plugin> tag in panel.WT21\panel.xml.
$pluginJs = 'C:\Projetos\f27-g1000\plugin-wt21\dist\F27MfdPlugin.js'
if (-not (Test-Path $pluginJs)) { throw "plugin not built: $pluginJs (cd plugin-wt21; npm run build)" }
New-Item -ItemType Directory -Force "$dstRoot\Plugins" | Out-Null
Copy-Item $pluginJs "$dstRoot\Plugins\F27MfdPlugin.js" -Force

# v10.2: the F27 tablet instrument (plugin-wt21 builds dist\F27Tablet.js; html, css and its font are in plugin-wt21\tablet)
$tabletJs = 'C:\Projetos\f27-g1000\plugin-wt21\dist\F27Tablet.js'
if (-not (Test-Path $tabletJs)) { throw "tablet not built: $tabletJs (cd plugin-wt21; npm run build)" }
New-Item -ItemType Directory -Force "$dstRoot\Tablet" | Out-Null
Copy-Item $tabletJs "$dstRoot\Tablet\F27Tablet.js" -Force
foreach ($f in 'F27Tablet.html', 'F27Tablet.css', 'DejaVuSans-SemiBold.ttf', 'DejaVu-LICENSE.txt') { Copy-Item "C:\Projetos\f27-g1000\plugin-wt21\tablet\$f" "$dstRoot\Tablet\$f" -Force }
# v11 (published): the Working Title / Microsoft licence (MIT + "only for usage in Microsoft Flight Simulator") goes with their files
Copy-Item 'C:\Projetos\msfs-avionics-mirror\LICENSE' "$dstRoot\LICENSE-WorkingTitle.txt" -Force

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
if ($left -ne 0) { throw 'old path still referenced' }
