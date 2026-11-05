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

# v11.6 (test: "não está aparecendo o SPD selecionado"): WT21 shows the selected speed (the cyan box above the tape and the bug on it) only
# while the vertical mode is FLC, but the tablet's autothrottle holds the SPD knob's speed in ALT / VS / PATH too, so the pilot could not
# see what it follows. Both now also show while the autothrottle is on (L:F27_AT_ARMED, written by the tablet); the check runs twice a second
# because the mode annunciation does not change when the autothrottle is armed. Each pattern has to match exactly once.
$pfdJs = "$dstRoot\PFD\PFD.js"
$pfd = [System.IO.File]::ReadAllText($pfdJs)
$pats = @(
    @{ name = 'selected speed box'
       find = "this\.props\.bus\.getSubscriber\(\)\.on\('fma_modes'\)\.handle\(\(v\) => \{\s*this\.selectedSpeedRef\.instance\.classList\.toggle\('hidden', v\.verticalActive != msfsSdk\.APVerticalModes\.FLC\);\s*\}\);"
       with = "let f27Flc = false; const f27Update = () => this.selectedSpeedRef.instance.classList.toggle('hidden', !(f27Flc || SimVar.GetSimVarValue('L:F27_AT_ARMED', 'number') > 0)); this.props.bus.getSubscriber().on('fma_modes').handle((v) => { f27Flc = v.verticalActive == msfsSdk.APVerticalModes.FLC; f27Update(); }); setInterval(f27Update, 500);" },
    @{ name = 'speed bug'
       find = "sub\.on\('fma_modes'\)\.handle\(\(v\) => \{\s*this\.setIsVisible\(v\.verticalActive == msfsSdk\.APVerticalModes\.FLC\);\s*\}\);"
       with = "let f27Flc = false; const f27Update = () => this.setIsVisible(f27Flc || SimVar.GetSimVarValue('L:F27_AT_ARMED', 'number') > 0); sub.on('fma_modes').handle((v) => { f27Flc = v.verticalActive == msfsSdk.APVerticalModes.FLC; f27Update(); }); setInterval(f27Update, 500);" }
)
foreach ($p in $pats) {
    if ([regex]::Matches($pfd, $p.find).Count -ne 1) { throw "PFD.js: the '$($p.name)' code was not found exactly once (WT21 changed?)" }
    $pfd = [regex]::Replace($pfd, $p.find, { param($m) $p.with })
}
[System.IO.File]::WriteAllText($pfdJs, $pfd, (New-Object System.Text.UTF8Encoding($false)))

# The F27 MFD plugin (plugin-wt21, Dart engine indication) is loaded by the central MFD through a <Plugin> tag in panel.WT21\panel.xml.
$pluginJs = 'C:\Projetos\f27-g1000\plugin-wt21\dist\F27MfdPlugin.js'
if (-not (Test-Path $pluginJs)) { throw "plugin not built: $pluginJs (cd plugin-wt21; npm run build)" }
New-Item -ItemType Directory -Force "$dstRoot\Plugins" | Out-Null
Copy-Item $pluginJs "$dstRoot\Plugins\F27MfdPlugin.js" -Force

# v11.5: two of WT21's four fonts are named by no css, html or js (only Custom_Altimeter_wt21-LightCondensed.ttf "WT21" and
# wt21-Condensed.ttf "WT21 FMC" are); they are left out, after checking that is still so.
foreach ($font in 'wt21.ttf', 'wt21-LightCondensed.ttf') {
    $named = '[/\\"''(]' + [regex]::Escape($font)        # the whole file name: Custom_Altimeter_wt21-LightCondensed.ttf is another font
    $users = @(Get-ChildItem $dstRoot -Recurse -File -Include *.css, *.html, *.js | Where-Object { (Get-Content $_.FullName -Raw) -match $named })
    if ($users.Count) { throw "$font is used by $($users[0].FullName): keep it" }
    Remove-Item "$dstRoot\Assets\Fonts\$font" -ErrorAction SilentlyContinue
}

# v10.2: the F27 tablet instrument (plugin-wt21 builds dist\F27Tablet.js; html and css are in plugin-wt21\tablet; v11.5: no font of
# its own, it uses the sim's Roboto)
$tabletJs = 'C:\Projetos\f27-g1000\plugin-wt21\dist\F27Tablet.js'
if (-not (Test-Path $tabletJs)) { throw "tablet not built: $tabletJs (cd plugin-wt21; npm run build)" }
New-Item -ItemType Directory -Force "$dstRoot\Tablet" | Out-Null
Copy-Item $tabletJs "$dstRoot\Tablet\F27Tablet.js" -Force
foreach ($f in 'F27Tablet.html', 'F27Tablet.css') { Copy-Item "C:\Projetos\f27-g1000\plugin-wt21\tablet\$f" "$dstRoot\Tablet\$f" -Force }
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
