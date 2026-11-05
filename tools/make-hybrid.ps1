<#
.SYNOPSIS
Makes the installed Modernized add-on standalone for its CONFIGURATION only, so that OUR systems.cfg (yaw damper, bank 30, autopilot) counts, without
copying the author's models, sounds or textures and without touching the author's Bgt_F27500v2 folder or the F27 original.

Why: v11.6 live test (Developer Mode): with base_container the sim takes systems.cfg ONLY from the author's folder (AUTOPILOT MAX BANK 22, yaw
damper off, even for a container whose own folder has a systems.cfg with max_bank 31). Without base_container, and with the author's small
configuration files in our folder (aircraft.cfg sections, flight_model / engines / cockpit / cameras / gameplay .cfg, the .flt flights, Checklist,
panel, soundai) next to OUR systems.cfg, the sim reads ours (live test of the HYBRID aircraft: max bank 30, yaw damper on, cockpit normal);
models, sound and textures still come from his folder through the explicit paths the add-on already uses.
It copies his files, so it is for this PC only: NOT for the public zip (that stays the lean add-on).

  (no switch)     builds out\hybrid\bgt-f27500-modernized-hybrid: a separate test package (first livery only, no WASM of its own)
  -AsModernized   builds out\hybrid-main\bgt-f27500-modernized: the same package name as the add-on, every livery, the WASM; -Install replaces the add-on
                  with it (and removes the hybrid test package). Run it after deploy-community.ps1 + Add-Liveries.ps1, every time they run.
  -Install        installs what was built (simulator closed); -Remove removes the test package (or, with -AsModernized, the standalone Modernized).
#>
param([switch]$Install, [switch]$Remove, [switch]$AsModernized)
$ErrorActionPreference = 'Stop'
$community = "$env:LOCALAPPDATA\Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache\Packages\Community"
$name = $(if ($AsModernized) { 'bgt-f27500-modernized' } else { 'bgt-f27500-modernized-hybrid' })
$built = $(if ($AsModernized) { 'C:\Projetos\f27-g1000\out\hybrid-main' } else { 'C:\Projetos\f27-g1000\out\hybrid' }) + "\$name"
$folder = $(if ($AsModernized) { 'Bgt_F27500v2_Modernized' } else { 'Bgt_F27500v2_Hybrid' })
if ($Remove) {
    if (Get-Process FlightSimulator2024 -ErrorAction SilentlyContinue) { throw 'close the simulator first' }
    if (Test-Path "$community\$name") { Remove-Item "$community\$name" -Recurse -Force; "removed $community\$name" } else { 'not installed' }
    return
}
if ($Install) {
    if (Get-Process FlightSimulator2024 -ErrorAction SilentlyContinue) { throw 'close the simulator first' }
    if (-not (Test-Path "$built\layout.json")) { throw 'build it first (run without -Install)' }
    if (Test-Path "$community\$name") { Remove-Item "$community\$name" -Recurse -Force }
    Copy-Item $built "$community\$name" -Recurse
    "installed $community\$name"
    if ($AsModernized -and (Test-Path "$community\bgt-f27500-modernized-hybrid")) { Remove-Item "$community\bgt-f27500-modernized-hybrid" -Recurse -Force; 'removed the hybrid test package (the Modernized is standalone now)' }
    return
}

$src = "$community\bgt-f27500-modernized"
$author = "$community\bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2"
if (-not (Test-Path "$src\layout.json")) { throw 'the Modernized add-on is not installed' }
if (-not (Test-Path "$author\flight_model.cfg")) { throw 'the author''s package bgt-f27500-v2 is not in Community' }
if ((Get-Content "$src\SimObjects\Airplanes\Bgt_F27500v2_Modernized\aircraft.cfg" -Raw) -notmatch 'base_container') { throw 'the installed Modernized is already standalone: deploy the add-on again first (deploy-community.ps1, Add-Liveries.ps1)' }
if (Test-Path $built) { Remove-Item $built -Recurse -Force }
New-Item -ItemType Directory -Force $built | Out-Null
if ($AsModernized) { robocopy $src $built /E /NFL /NDL /NJH /NJS /NP /XF layout.json | Out-Null }
else { robocopy $src $built /E /NFL /NDL /NJH /NJS /NP /XD wasm /XF layout.json | Out-Null }
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
$global:LASTEXITCODE = 0

$air = "$built\SimObjects\Airplanes"
if (-not $AsModernized) { Rename-Item "$air\Bgt_F27500v2_Modernized" $folder }
$hy = "$air\$folder"

# our systems.cfg must be the one of PackageSources (yaw_damper_gain 0.4, max_bank 30, pitch_use_trim 0)
$ours = [IO.File]::ReadAllText("$hy\systems.cfg")
$gm = [regex]::Match($ours, '(?m)^yaw_damper_gain = ([0-9.]+)\s*$')
if (-not $gm.Success -or [double]$gm.Groups[1].Value -le 0 -or $ours -notmatch '(?m)^max_bank = 30\s*$') { throw 'systems.cfg of the add-on lacks a yaw_damper_gain above 0 / max_bank = 30' }

# the author's configuration files, as he ships them (not systems.cfg, not aircraft.cfg)
foreach ($f in 'Approach.flt', 'apron.FLT', 'climb.FLT', 'Cruise.flt', 'final.FLT', 'hangar.flt', 'runway.FLT', 'taxi.FLT',
               'cameras.cfg', 'cockpit.cfg', 'engines.cfg', 'flight_model.cfg', 'gameplay.cfg') {
    Copy-Item "$author\$f" "$hy\$f" -Force
}
foreach ($d in 'Checklist', 'panel', 'soundai') { Copy-Item "$author\$d" "$hy\$d" -Recurse -Force }

# aircraft.cfg: his sections without his variations, then OUR variations (no base_container), then his EXITS / SERVICES
$his = [IO.File]::ReadAllText("$author\aircraft.cfg") -split "`r?`n"
$mine = [IO.File]::ReadAllText("$hy\aircraft.cfg") -split "`r?`n"
$h0 = [array]::IndexOf($his, '[FLTSIM.0]'); $hEnd = [array]::IndexOf($his, '[EXITS]')
if ($h0 -lt 0 -or $hEnd -lt 0) { throw 'his aircraft.cfg: [FLTSIM.0] or [EXITS] not found' }
$m0 = [array]::IndexOf($mine, '[FLTSIM.0]')
if ($m0 -lt 0) { throw 'our aircraft.cfg: [FLTSIM.0] not found' }
if ($AsModernized) {
    $block = $mine[$m0..($mine.Count - 1)]                       # every variation: the Modernized one and the liveries
} else {
    $mEnd = @($mine | Where-Object { $_ -like ';=====*LIVERIES*' })[0]
    if (-not $mEnd) { throw 'our aircraft.cfg: the LIVERIES marker was not found' }
    $block = $mine[$m0..([array]::IndexOf($mine, $mEnd) - 1)] | ForEach-Object {
        $_ -replace '^title = .*?;', 'title = "Fokker F27500 HYBRID (own systems.cfg, local test)" ;' `
           -replace '^ui_variation = .*?;', 'ui_variation = "HYBRID" ;' `
           -replace '^ui_createdby = .*?;', 'ui_createdby = "Bgt (HYBRID)" ;' `
           -replace '^atc_id = .*?;', 'atc_id = "HYBRID" ;'
    }
}
$out = @($his[0..($h0 - 1)]) + @($block) + @('') + @($his[$hEnd..($his.Count - 1)])
if (($out -join "`n") -match 'base_container') { throw 'base_container is still in the aircraft.cfg' }
[IO.File]::WriteAllText("$hy\aircraft.cfg", ($out -join "`r`n"))

if (-not $AsModernized) {
    $m = Get-Content "$built\manifest.json" -Raw | ConvertFrom-Json
    $m.title = 'Fokker F27-500 Modernized HYBRID'
    $m.PSObject.Properties.Remove('total_package_size')
    [IO.File]::WriteAllText("$built\manifest.json", ($m | ConvertTo-Json -Depth 6))
}

$content = @(Get-ChildItem $built -Recurse -File | Where-Object { $_.Name -ne 'layout.json' } | ForEach-Object {
    [ordered]@{ path = $_.FullName.Substring($built.Length + 1).Replace('\', '/'); size = $_.Length; date = $_.LastWriteTimeUtc.ToFileTimeUtc() } })
[IO.File]::WriteAllText("$built\layout.json", ([ordered]@{ content = $content } | ConvertTo-Json -Depth 4))
$vars = @($out | Where-Object { $_ -match '^\[FLTSIM\.\d+\]' }).Count
"built ${built}: $($content.Count) files, $vars variation(s); no base_container; systems.cfg = ours (yaw 0.4, bank 30)"
"install with: powershell -File tools\make-hybrid.ps1$(if ($AsModernized) { ' -AsModernized' }) -Install   (simulator closed); remove with -Remove"
