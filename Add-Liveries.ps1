<#
.SYNOPSIS
  Gives the F27-500 Modernized add-on a variation for EVERY livery of the base F27-500 that is installed on THIS computer.

.DESCRIPTION
  The sim lists an aircraft's paints from the variations written in its aircraft.cfg, and it cannot look for packages by itself, so
  the list has to be written on the machine that has the liveries. This script does that:

    1. looks in the Community folder for every package whose aircraft.cfg inherits from the base aircraft
       (base_container = "..\Bgt_F27500v2") and names a paint it really has;
    2. adds one Modernized variation per livery to the add-on's aircraft.cfg (below a marked "LIVERIES" line), with a texture
       folder that only says "take the paint from the livery's own package, the rest from the aircraft". All of them show as
       liveries of the one Modernized aircraft in the selector (the livery's maker is named in its description);
    3. brings layout.json and manifest.json of the add-on up to date for the files it created.

  Nothing of any livery is copied except its two thumbnail images, on your own computer. The liveries stay installed where they
  are and must stay installed: a variation whose livery was uninstalled shows the plain paint until you run this script again,
  which takes it out.

  Run it again after you add or remove a livery of the base F27, or after you update the add-on (an update brings a fresh
  aircraft.cfg without the variations). It is safe to run any number of times: a second run changes nothing.

  Only the add-on's own folder is touched, and in it only: aircraft.cfg (below the LIVERIES line), the texture.<livery> folders this
  script made, layout.json and manifest.json. -Remove puts the add-on back as it was shipped.

.PARAMETER Community
  The Community folder. Found on its own for MSFS 2024 from the Microsoft Store / Game Pass or Steam (and from UserCfg.opt for a
  custom install path); give it only if yours is elsewhere.

.PARAMETER List
  Only shows the liveries found and what would change. Changes nothing.

.PARAMETER Remove
  Takes every livery variation out of the add-on (it is as shipped again).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\Add-Liveries.ps1
  powershell -ExecutionPolicy Bypass -File .\Add-Liveries.ps1 -List
#>
param([string]$Community, [switch]$List, [switch]$Remove)
$ErrorActionPreference = 'Stop'

$pkgName = 'bgt-f27500-modernized'
$simName = 'Bgt_F27500v2_Modernized'
$baseSim = 'Bgt_F27500v2'
$utf8    = New-Object System.Text.UTF8Encoding($false)
$marker  = ';===================== LIVERIES (made by Add-Liveries.ps1: run it again after adding or removing a livery) ====================='

# ---------------------------------------------------------------------------------------------------------------- where is the sim
function Find-Community {
    $store = Join-Path $env:LOCALAPPDATA 'Packages\Microsoft.Limitless_8wekyb3d8bbwe\LocalCache'
    $steam = Join-Path $env:APPDATA 'Microsoft Flight Simulator 2024'
    $candidates = @((Join-Path $store 'Packages\Community'), (Join-Path $steam 'Packages\Community'))
    foreach ($opt in @((Join-Path $store 'UserCfg.opt'), (Join-Path $steam 'UserCfg.opt'))) {
        if (-not (Test-Path $opt)) { continue }
        $m = [regex]::Match([System.IO.File]::ReadAllText($opt), 'InstalledPackagesPath\s+"([^"]+)"')
        if ($m.Success) { $candidates += (Join-Path $m.Groups[1].Value 'Community') }
    }
    $withAddon = $candidates | Where-Object { Test-Path (Join-Path $_ $pkgName) } | Select-Object -First 1
    if ($withAddon) { return $withAddon }
    $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

# ---------------------------------------------------------------------------------------------------------------- aircraft.cfg
# [SECTION] key = "value" ; comment   ->  @{ SECTION = @{ key = value } }   (keys lower case)
function Read-Cfg([string]$path) {
    $sections = [ordered]@{}
    $cur = $null
    foreach ($raw in [System.IO.File]::ReadAllLines($path)) {
        $line = $raw.TrimStart([char]0xFEFF).Trim()
        if (-not $line -or $line.StartsWith(';')) { continue }
        if ($line -match '^\[([^\]]+)\]') { $cur = @{}; $sections[$Matches[1].ToUpper()] = $cur; continue }
        if ($null -ne $cur -and $line -match '^([^=;]+?)\s*=\s*(.*)$') {
            $key = $Matches[1].Trim().ToLower(); $v = $Matches[2].Trim()
            if ($v -match '^"([^"]*)"') { $v = $Matches[1] } else { $v = ($v -replace '\s*;.*$', '').Trim() }
            $cur[$key] = $v
        }
    }
    $sections
}

# "Rio Sul PT-LZN 1986" -> "Rio Sul": the selector text without registration, year and brackets (atc_airline is often left empty)
function Get-AirlineName([string]$ui, [string]$atcId, [string]$fallback) {
    $s = [regex]::Replace($ui, '\([^)]*\)', ' ')
    if ($atcId) { $s = $s.Replace($atcId, ' ') }
    $s = [regex]::Replace($s, '\b[A-Z0-9]{1,2}-[A-Z0-9]{2,5}\b', ' ')
    $s = [regex]::Replace($s, '\b(19|20)\d{2}\b', ' ')
    $s = [regex]::Replace($s, '[|,;-]+\s*$', ' ')
    $s = ([regex]::Replace($s, '\s+', ' ')).Trim()
    if ($s) { $s } else { $fallback }
}

# every livery of the base aircraft in the Community folder
function Find-Liveries([string]$community) {
    $found = New-Object System.Collections.ArrayList
    foreach ($pkg in Get-ChildItem $community -Directory) {
        $root = Join-Path $pkg.FullName 'SimObjects\Airplanes'
        if (-not (Test-Path $root)) { continue }
        foreach ($sim in Get-ChildItem $root -Directory) {
            if ($sim.Name -ieq $baseSim -or $sim.Name -ieq $simName) { continue }                 # the aircraft itself and this add-on
            $cfgFile = Get-ChildItem $sim.FullName -File | Where-Object { $_.Name -ieq 'aircraft.cfg' } | Select-Object -First 1
            if (-not $cfgFile) { continue }
            $cfg = Read-Cfg $cfgFile.FullName
            $base = if ($cfg.Contains('VARIATION')) { [string]$cfg['VARIATION']['base_container'] } else { '' }
            if (-not $base -or ($base.TrimEnd('\', '/') -split '[\\/]')[-1] -ine $baseSim) { continue }   # not a livery of this aircraft
            foreach ($name in @($cfg.Keys)) {
                if ($name -notmatch '^FLTSIM\.\d+$') { continue }
                $b = $cfg[$name]
                if (-not $b['texture']) { continue }
                $texDir = Get-ChildItem $sim.FullName -Directory | Where-Object { $_.Name -ieq "texture.$($b['texture'])" } | Select-Object -First 1
                if (-not $texDir) { continue }                                                     # names a paint it does not have
                if (-not (Get-ChildItem $texDir.FullName -File | Where-Object { $_.Name -match '_albd\.' })) { continue }   # no paint in it
                $atc = [string]$b['atc_id']
                $ui = if ($b['ui_variation']) { $b['ui_variation'] } elseif ($b['title']) { $b['title'] } else { $b['texture'] }
                $airline = if ($b['atc_airline']) { $b['atc_airline'] } else { Get-AirlineName $ui $atc $b['texture'] }
                $by = if ($b['ui_createdby']) { $b['ui_createdby'] } else { 'unknown' }
                [void]$found.Add([pscustomobject]@{
                    Package = $pkg.Name; SimObject = $sim.Name; Texture = $texDir.Name.Substring('texture.'.Length); TextureDir = $texDir.FullName
                    AtcId = $atc; Airline = $airline; UiVariation = $ui; CreatedBy = $by })
            }
        }
    }
    $sorted = @($found | Sort-Object Package, Texture)
    # two liveries must not end up with the same title ("Fokker F27500 Modernized <airline> <registration>")
    $seen = @{}
    foreach ($l in $sorted) {
        $k = "$($l.Airline) $($l.AtcId)".ToLower()
        $seen[$k] = 1 + [int]$seen[$k]
        if ($seen[$k] -gt 1) { $l.Airline = "$($l.Airline) ($($l.Texture))" }
    }
    $sorted
}

function Set-CfgField([string[]]$lines, [string]$key, [string]$value) {
    $safe = $value.Replace('$', '$$')
    foreach ($l in $lines) { if ($l -match "^\s*$key\s*=") { [regex]::Replace($l, '^(\s*' + $key + '\s*=\s*)"[^"]*"(.*)$', '${1}"' + $safe + '"${2}') } else { $l } }
}

# ---------------------------------------------------------------------------------------------------------------- go
if (-not $Community) { $Community = Find-Community }
if (-not $Community -or -not (Test-Path $Community)) { throw 'Community folder not found: give it with -Community "<path>"' }
$pkgDir = Join-Path $Community $pkgName
$sim    = Join-Path $pkgDir "SimObjects\Airplanes\$simName"
if (-not (Test-Path "$sim\aircraft.cfg")) { throw "The Modernized add-on is not installed in $Community ($pkgName). Install it first, then run this again." }
if (-not (Test-Path "$pkgDir\layout.json") -or -not (Test-Path "$pkgDir\manifest.json")) { throw "$pkgDir has no layout.json / manifest.json: reinstall the add-on." }
if (-not (Get-ChildItem $Community -Directory | Where-Object { Test-Path (Join-Path $_.FullName "SimObjects\Airplanes\$baseSim") })) {
    Write-Warning "The base aircraft ($baseSim) is not in ${Community}: the add-on needs it, and so do the liveries."
}

$liveries = if ($Remove) { @() } else { @(Find-Liveries $Community) }

# --- read the current aircraft.cfg: what shipped, and what an earlier run (or an older build) added
$cfgPath = Join-Path $sim 'aircraft.cfg'
$header  = New-Object System.Collections.ArrayList
$blocks  = New-Object System.Collections.ArrayList
$cur = $null; $afterMarker = $false
foreach ($l in [System.IO.File]::ReadAllLines($cfgPath)) {
    if ($l.TrimStart().StartsWith(';===================== LIVERIES')) { $afterMarker = $true; continue }
    if ($l -match '^\[FLTSIM\.(\d+)\]') {
        $cur = [pscustomobject]@{ Index = [int]$Matches[1]; Lines = New-Object System.Collections.ArrayList; Generated = $afterMarker; Texture = '' }
        [void]$blocks.Add($cur)
    }
    if ($null -eq $cur) { [void]$header.Add($l); continue }
    [void]$cur.Lines.Add($l)
    if ($l -match '^\s*texture\s*=\s*"([^"]*)"') { $cur.Texture = $Matches[1] }
}
# A livery whose folder name has characters beyond letters, digits, space, dot, dash and underscore (brackets, ampersand, accents...) is not
# reached through a path in texture.cfg: the first NLM variation, whose package folder is "NLM (PH-KFL)", came out with no paint at all in
# the sim, and not one of 596 texture.cfg in a real Community folder had a parenthesis in a fallback path. Those liveries get HARD LINKS
# (the same file under a second name: no extra space) to their paint inside the add-on's own texture folder instead.
function Test-PlainName([string]$name) { $name -match '^[A-Za-z0-9 _.\-]+$' }
$linkMarker = 'Add-Liveries.source.txt'
if (-not ('Native.HardLink' -as [type])) {
    Add-Type -Namespace Native -Name HardLink -MemberDefinition '[System.Runtime.InteropServices.DllImport("kernel32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode, SetLastError = true)] public static extern bool CreateHardLink(string newFile, string existingFile, System.IntPtr security);'
}
# makes $dest the same file as $src; a hard link needs the same drive, so if it cannot be made the file is copied. Returns 'kept' / 'linked' / 'copied'.
function Set-LinkedFile([string]$dest, [string]$src) {
    $s = Get-Item -LiteralPath $src
    if (Test-Path -LiteralPath $dest) {
        $d = Get-Item -LiteralPath $dest
        if ($d.Length -eq $s.Length -and $d.LastWriteTimeUtc -eq $s.LastWriteTimeUtc) { return 'kept' }
        Remove-Item -LiteralPath $dest -Force
    }
    if ([Native.HardLink]::CreateHardLink($dest, $src, [System.IntPtr]::Zero)) { return 'linked' }
    Copy-Item -LiteralPath $src -Destination $dest
    (Get-Item -LiteralPath $dest).LastWriteTimeUtc = $s.LastWriteTimeUtc
    'copied'
}

# a texture folder made by this script (or by an older build that baked the liveries in) takes the paint from a LIVERY package: its first
# fallback goes to the SimObject of another package that is not the base aircraft (the add-on's own folders go across to the base aircraft),
# or it holds the marker of a linked livery
function Test-LiveryFolder([string]$dir) {
    if (Test-Path -LiteralPath (Join-Path $dir $linkMarker)) { return $true }
    $cfg = Join-Path $dir 'texture.cfg'
    if (-not (Test-Path $cfg)) { return $false }
    $first = Get-Content $cfg | Where-Object { $_ -match '^fallback\.1\s*=' } | Select-Object -First 1
    if (-not $first) { return $false }
    $m = [regex]::Match($first.Split('=', 2)[1].Trim(), '^\.\.\\\.\.\\([^\\]+)\\')
    [bool]($m.Success -and $m.Groups[1].Value -ine $baseSim)
}
foreach ($b in $blocks) { if (-not $b.Generated -and $b.Texture -and (Test-LiveryFolder (Join-Path $sim "texture.$($b.Texture)"))) { $b.Generated = $true } }
$shipped = @($blocks | Where-Object { -not $_.Generated })
if ($shipped.Count -eq 0) { throw 'aircraft.cfg has no shipped [FLTSIM.n] variation: reinstall the add-on.' }
$template = $shipped[0]
$oldFolders = @(Get-ChildItem $sim -Directory | Where-Object { $_.Name -like 'texture.*' -and (Test-LiveryFolder $_.FullName) } | ForEach-Object { $_.Name })

# --- what it will be
$shippedTextures = @($shipped | ForEach-Object { $_.Texture.ToLower() })
$newFolders = @{}                # texture folder name -> livery
foreach ($l in $liveries) {
    $folder = $l.Texture
    if ($shippedTextures -contains $folder.ToLower() -or ($oldFolders -notcontains "texture.$folder" -and (Test-Path (Join-Path $sim "texture.$folder")))) { $folder = "$($l.Texture)-livery" }   # never over something shipped
    $l | Add-Member -NotePropertyName Folder -NotePropertyValue $folder -Force
    $l | Add-Member -NotePropertyName Linked -NotePropertyValue (-not ((Test-PlainName $l.SimObject) -and (Test-PlainName $l.Texture))) -Force
    $newFolders["texture.$folder"] = $l
}
$titleOf = { param($l) "Fokker F27500 Modernized $($l.Airline) $($l.AtcId)".Trim() }
$existingTitles = @($blocks | Where-Object { $_.Generated } | ForEach-Object { ($_.Lines | Where-Object { $_ -match '^\s*title\s*=\s*"([^"]*)"' } | ForEach-Object { $Matches[1] }) })
$addedNow   = @($liveries | Where-Object { $existingTitles -notcontains (& $titleOf $_) })
$droppedNow = @($existingTitles | Where-Object { $t = $_; -not ($liveries | Where-Object { (& $titleOf $_) -eq $t }) })

"Community : $Community"
"Add-on    : $pkgName ($($shipped.Count) shipped variation(s), $(@($blocks | Where-Object { $_.Generated }).Count) livery variation(s) now)"
"Liveries of the base F27-500 found: $($liveries.Count)"
foreach ($l in $liveries) { "  {0,-8} {1,-12} {2,-28} by {3}  [{4}]{5}" -f $l.AtcId, $l.Airline, $l.UiVariation, $l.CreatedBy, $l.Package, $(if ($l.Linked) { '  (linked: unusual folder name)' } else { '' }) }
if ($addedNow.Count)   { "  new in the add-on : " + (($addedNow | ForEach-Object { "$($_.Airline) $($_.AtcId)" }) -join ', ') }
if ($droppedNow.Count) { "  to be taken out   : " + ($droppedNow -join ', ') + ' (livery no longer installed)' }
if ($List) { 'List only: nothing was changed.'; return }

# --- aircraft.cfg
$out = New-Object System.Collections.ArrayList
[void]$out.AddRange($header)
function Add-Trimmed($list, $lines) {
    $arr = @($lines)
    $n = $arr.Count; while ($n -gt 0 -and -not $arr[$n - 1].Trim()) { $n-- }
    for ($i = 0; $i -lt $n; $i++) { [void]$list.Add($arr[$i]) }
    [void]$list.Add('')
}
foreach ($b in $shipped) { Add-Trimmed $out $b.Lines }
if ($liveries.Count) {
    [void]$out.Add($marker); [void]$out.Add('')
    $baseDescription = (($template.Lines | Where-Object { $_ -match '^\s*description\s*=\s*"([^"]*)"' } | Select-Object -First 1) -replace '^\s*description\s*=\s*"([^"]*)".*$', '$1')
    $index = ($shipped | Measure-Object Index -Maximum).Maximum + 1
    foreach ($l in $liveries) {
        $b = @($template.Lines)
        $b[0] = "[FLTSIM.$index]"
        $b = Set-CfgField $b 'title'        (& $titleOf $l)
        $b = Set-CfgField $b 'texture'      $l.Folder
        # ui_createdby (and ui_manufacturer / ui_type / ui_typerole) stay the shipped variation's: MSFS 2024 makes one aircraft in the
        # selector per icao_model + ui_createdby (Asobo on DevSupport), so a livery maker's name there made one aircraft per maker.
        # Only ui_variation names the livery; its maker is credited in the description.
        $b = Set-CfgField $b 'description'  "$baseDescription Livery by $($l.CreatedBy) (needs the $($l.Package) livery package installed)."
        $b = Set-CfgField $b 'ui_variation' "$($l.UiVariation) - Modernized"
        $b = Set-CfgField $b 'atc_id'       $l.AtcId
        $b = Set-CfgField $b 'atc_airline'  $l.Airline
        Add-Trimmed $out $b
        $index++
    }
}
$cfgText = ($out -join "`r`n").TrimEnd() + "`r`n"
$changedFiles = New-Object System.Collections.ArrayList        # files of the package created or rewritten, for layout.json

# --- texture folders: the stale ones out, the current ones in (a file already right is left alone: a second run changes nothing)
function Write-IfDifferent([string]$path, [byte[]]$bytes) {
    if ((Test-Path $path) -and [System.IO.File]::ReadAllBytes($path).Length -eq $bytes.Length) {
        $same = $true; $old = [System.IO.File]::ReadAllBytes($path)
        for ($i = 0; $i -lt $bytes.Length; $i++) { if ($old[$i] -ne $bytes[$i]) { $same = $false; break } }
        if ($same) { return }
    }
    [System.IO.File]::WriteAllBytes($path, $bytes)
}
$linkStats = @{ linked = 0; copied = 0; kept = 0 }
foreach ($f in $oldFolders) { if (-not $newFolders.ContainsKey($f)) { Remove-Item (Join-Path $sim $f) -Recurse -Force } }
foreach ($key in $newFolders.Keys) {
    $l = $newFolders[$key]
    $dir = Join-Path $sim $key
    New-Item -ItemType Directory -Force $dir | Out-Null
    $keep = @('texture.cfg')
    if ($l.Linked) {
        # the paint is in this folder (hard links), so the chain only needs ours and the base aircraft's folders
        $chain = @('..\texture.common', "..\..\$baseSim\texture.vcen", "..\..\$baseSim\texture", "..\..\$baseSim\texture.common")
        Write-IfDifferent (Join-Path $dir $linkMarker) ($utf8.GetBytes("Hard links to the files of $($l.TextureDir)`r`nMade by Add-Liveries.ps1 (the folder name has characters a texture.cfg path may not take). Run it again to refresh.`r`n"))
        $keep += $linkMarker
        foreach ($f in Get-ChildItem -LiteralPath $l.TextureDir -File | Where-Object { $_.Name -notlike 'thumbnail*' -and $_.Name -ine 'texture.cfg' }) {
            $linkStats[(Set-LinkedFile (Join-Path $dir $f.Name) $f.FullName)]++
            $keep += $f.Name
        }
    } else {
        $chain = @("..\..\$($l.SimObject)\texture.$($l.Texture)", '..\texture.common', "..\..\$baseSim\texture.vcen", "..\..\$baseSim\texture", "..\..\$baseSim\texture.common")
    }
    $cfgLines = @('[fltsim]') + @(for ($i = 0; $i -lt $chain.Count; $i++) { "fallback.$($i + 1)=$($chain[$i])" })
    Write-IfDifferent (Join-Path $dir 'texture.cfg') ($utf8.GetBytes(($cfgLines -join "`r`n") + "`r`n"))
    foreach ($t in Get-ChildItem -LiteralPath $l.TextureDir -File | Where-Object { $_.Name -like 'thumbnail*' }) {
        Write-IfDifferent (Join-Path $dir $t.Name) ([System.IO.File]::ReadAllBytes($t.FullName))
        $keep += $t.Name
    }
    # a thumbnail (or, for a linked livery, a texture) the livery no longer has
    foreach ($x in Get-ChildItem -LiteralPath $dir -File | Where-Object { $keep -notcontains $_.Name }) { Remove-Item -LiteralPath $x.FullName -Force }
}
Write-IfDifferent $cfgPath ($utf8.GetBytes($cfgText))

# --- layout.json (sorted, lower-case paths, FILETIME dates) and manifest.json (total size): only this package's livery entries change
$layoutPath = Join-Path $pkgDir 'layout.json'
$layoutText = [System.IO.File]::ReadAllText($layoutPath)
$entries = New-Object System.Collections.ArrayList
foreach ($m in [regex]::Matches($layoutText, '"path"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"size"\s*:\s*(\d+)\s*,\s*"date"\s*:\s*(\d+)')) {
    [void]$entries.Add([pscustomobject]@{ Path = $m.Groups[1].Value; Size = [long]$m.Groups[2].Value; Date = [long]$m.Groups[3].Value })
}
$simRel = "simobjects/airplanes/$($simName.ToLower())"
$managed = @($oldFolders + @($newFolders.Keys) | ForEach-Object { "$simRel/$($_.ToLower())/" })
$kept = @($entries | Where-Object { $p = $_.Path; -not ($managed | Where-Object { $p.StartsWith($_) }) -and $p -ne "$simRel/aircraft.cfg" })
$fresh = New-Object System.Collections.ArrayList
foreach ($f in @(Get-Item $cfgPath) + @($newFolders.Keys | ForEach-Object { Get-ChildItem (Join-Path $sim $_) -File })) {
    $rel = $f.FullName.Substring($pkgDir.Length + 1).Replace('\', '/').ToLower()
    [void]$fresh.Add([pscustomobject]@{ Path = $rel; Size = $f.Length; Date = $f.LastWriteTimeUtc.ToFileTimeUtc() })
}
$byPath = New-Object 'System.Collections.Generic.SortedDictionary[string,object]' ([StringComparer]::Ordinal)   # the way the file ships: by code point, not by culture rules
foreach ($e in (@($kept) + @($fresh))) { $byPath[$e.Path] = $e }
$all = @($byPath.Values)
$sb = New-Object System.Text.StringBuilder
[void]$sb.Append("{`n  `"content`": [`n")
for ($i = 0; $i -lt $all.Count; $i++) {
    $e = $all[$i]
    [void]$sb.Append("    {`n      `"path`": `"$($e.Path)`",`n      `"size`": $($e.Size),`n      `"date`": $($e.Date)`n    }" + $(if ($i -lt $all.Count - 1) { ',' } else { '' }) + "`n")
}
[void]$sb.Append("  ]`n}`n")
Write-IfDifferent $layoutPath ($utf8.GetBytes($sb.ToString()))
$total = ($all | Measure-Object Size -Sum).Sum
$manifestPath = Join-Path $pkgDir 'manifest.json'
$mf = [System.IO.File]::ReadAllText($manifestPath)
$mf2 = [regex]::Replace($mf, '("total_package_size"\s*:\s*")\d+(")', '${1}' + $total + '${2}')
Write-IfDifferent $manifestPath ($utf8.GetBytes($mf2))

''
if ($linkStats.linked + $linkStats.copied + $linkStats.kept) {
    "Liveries with an unusual folder name: $($linkStats.linked) file(s) hard-linked, $($linkStats.kept) already in place, $($linkStats.copied) copied."
    if ($linkStats.copied) { 'NOTE: copied files take disk space; a hard link needs the livery package on the same drive as the add-on.' }
}
if ($Remove) { 'Livery variations removed: the add-on is as it was shipped.' }
else { "Done: $($liveries.Count) livery variation(s) in the add-on. Restart the simulator to see them in the aircraft selector." }
if (Get-Process -Name 'FlightSimulator2024' -ErrorAction SilentlyContinue) { 'NOTE: the simulator is running; restart it to load the change.' }
