# Checks Add-Liveries.ps1 on a made-up Community folder (invented liveries with one-byte "paints": nothing of anyone's work).
# Usage: powershell -ExecutionPolicy Bypass -File tools\check-add-liveries.ps1
$ErrorActionPreference = 'Stop'
$script = Join-Path (Split-Path $PSScriptRoot -Parent) 'Add-Liveries.ps1'
$utf8   = New-Object System.Text.UTF8Encoding($false)
$root   = Join-Path ([System.IO.Path]::GetTempPath()) ("f27-addliv-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$fail = 0; $pass = 0
function Check([string]$what, [bool]$ok, [string]$detail = '') { if ($ok) { $script:pass++ } else { "  FAIL $what $detail"; $script:fail++ } }
function Put([string]$path, [string]$text) { New-Item -ItemType Directory -Force (Split-Path $path) | Out-Null; [System.IO.File]::WriteAllText($path, $text, $utf8) }
function Tree([string]$dir) { Get-ChildItem $dir -Recurse -File | Sort-Object FullName | ForEach-Object { "$($_.FullName.Substring($dir.Length))|$($_.Length)|$($_.LastWriteTimeUtc.Ticks)|$((Get-FileHash $_.FullName -Algorithm MD5).Hash)" } }
function Run([hashtable]$switches = @{}) { $o = & $script -Community $root @switches *>&1 | Out-String; $o }

# ---------------------------------------------------------------- an installed add-on as it ships, plus one livery an older build baked in
$pkg = "$root\bgt-f27500-modernized"
$sim = "$pkg\SimObjects\Airplanes\Bgt_F27500v2_Modernized"
$shippedCfg = @'
[VERSION]
major = 1
minor = 0

[VARIATION]
base_container = "..\Bgt_F27500v2"

;===================== FLTSIM =====================

[FLTSIM.0]
title = "Fokker F27500 Modernized it80" ; Variation name
model = "wt21" ; model folder
panel = "WT21" ; panel folder
texture = "it80" ; texture folder
description = "Fokker F27-500, modernized." ; Variation description.
ui_variation = "Air Inter 1980 - Modernized" ; e.g. World Air, IFR Panel
ui_createdby = "Bgt (Modernized)" ; e.g. Asobo Studio
atc_id = "F-BPNA" ; tail number
atc_airline = "Air Inter" ; airline name
'@.Replace("`r`n", "`n").Replace("`n", "`r`n") + "`r`n"
$baked = @'

[FLTSIM.1]
title = "Fokker F27500 Modernized Old Baked PT-OLD" ; Variation name
model = "wt21" ; model folder
panel = "WT21" ; panel folder
texture = "OLD-BAKED" ; texture folder
description = "baked in by an older build" ; Variation description.
ui_variation = "Old Baked" ; x
ui_createdby = "x" ; x
atc_id = "PT-OLD" ; tail number
atc_airline = "Old" ; airline name
'@.Replace("`r`n", "`n").Replace("`n", "`r`n") + "`r`n"
Put "$sim\aircraft.cfg" ($shippedCfg + $baked)
# like the real add-on: its own folders fall back ACROSS to the base aircraft, which must not be mistaken for a livery's
$shippedTexCfg = "[fltsim]`r`nfallback.1=..\..\Bgt_F27500v2\texture.it80`r`nfallback.2=..\texture.common`r`nfallback.3=..\..\Bgt_F27500v2\texture`r`n"
Put "$sim\texture.it80\texture.cfg" $shippedTexCfg
Put "$sim\texture.it80\thumbnail.jpg" 'it80 thumb'
Put "$sim\texture.common\x.dds" 'common'
Put "$sim\texture.OLD-BAKED\texture.cfg" "[fltsim]`r`nfallback.1=..\..\Gone-Package\texture.old`r`nfallback.2=..\texture.common`r`n"
Put "$sim\texture.OLD-BAKED\thumbnail.jpg" 'old'
Put "$pkg\SimObjects\Airplanes\readme.txt" 'shipped file'
Put "$root\bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2\aircraft.cfg" '[VERSION]'      # the base aircraft (so there is no warning)

function Write-Layout([string]$pkgDir, [bool]$withBaked) {
    $files = Get-ChildItem $pkgDir -Recurse -File | Where-Object { $_.Name -notin 'layout.json', 'manifest.json' -and ($withBaked -or $_.FullName -notmatch 'OLD-BAKED') }
    $e = @($files | ForEach-Object { [pscustomobject]@{ P = $_.FullName.Substring($pkgDir.Length + 1).Replace('\', '/').ToLower(); S = $_.Length; D = $_.LastWriteTimeUtc.ToFileTimeUtc() } })
    $d = New-Object 'System.Collections.Generic.SortedDictionary[string,object]' ([StringComparer]::Ordinal); foreach ($x in $e) { $d[$x.P] = $x }; $a = @($d.Values)
    $t = "{`n  `"content`": [`n" + (($a | ForEach-Object { "    {`n      `"path`": `"$($_.P)`",`n      `"size`": $($_.S),`n      `"date`": $($_.D)`n    }" }) -join ",`n") + "`n  ]`n}`n"
    [System.IO.File]::WriteAllText("$pkgDir\layout.json", $t, $utf8)
    $sum = ($e | Measure-Object S -Sum).Sum
    Put "$pkgDir\manifest.json" "{`n  `"content_type`": `"AIRCRAFT`",`n  `"title`": `"Fokker F27-500 Modernized`",`n  `"total_package_size`": `"$sum`"`n}`n"
}
Write-Layout $pkg $true

# ---------------------------------------------------------------- liveries of the base aircraft and things that are not
function Livery([string]$package, [string]$simObject, [string]$cfgBody, [hashtable]$textures) {
    Put "$root\$package\SimObjects\Airplanes\$simObject\aircraft.cfg" $cfgBody
    foreach ($t in $textures.Keys) { foreach ($f in $textures[$t]) { Put "$root\$package\SimObjects\Airplanes\$simObject\texture.$t\$f" "x:$package/$t/$f" } }
}
function Fltsim([int]$n, [string]$texture, [string]$id, [string]$airline, [string]$ui, [string]$by = 'Some Studio') {
    "[FLTSIM.$n]`r`ntitle = `"T$n`" ; v`r`ntexture = `"$texture`" ; t`r`nui_variation = `"$ui`" ; u`r`nui_createdby = `"$by`" ; c`r`natc_id = `"$id`" ; a`r`natc_airline = `"$airline`" ; l`r`n`r`n"
}
$hd = { param($base) "[VERSION]`r`nmajor = 1`r`n`r`n[VARIATION]`r`nbase_container = `"$base`"`r`n`r`n" }
$paint = @('F275BGT_T2_ALBD.PNG.DDS', 'texture.cfg', 'thumbnail.JPG', 'thumbnail_small.JPG')
Livery 'Livery-A' 'A' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'aa' 'XA-AAA' 'Alpha Air' 'Alpha Air (XA-AAA)' 'Studio A')) @{ aa = $paint }
Livery 'Livery-B' 'B' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'bb' 'XB-BBB' '' 'Beta Lines PT-BBB 1986')) @{ bb = $paint }
Livery 'Livery-C' 'C' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'c1' 'XC-001' 'Gamma' 'Gamma 1') + (Fltsim 1 'c2' 'XC-002' 'Gamma' 'Gamma 2')) @{ c1 = $paint; c2 = $paint }
Livery 'Wrong-Case-Slashes' 'W' ((& $hd '../bgt_f27500v2/') + (Fltsim 0 'WW' 'XW-WWW' 'Omega' 'Omega')) @{ ww = $paint }
Livery 'Clash' 'K' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'it80' 'XK-KKK' 'Kappa' 'Kappa')) @{ it80 = $paint }          # its texture is called like one of ours
Livery 'Other-Aircraft' 'Z' ((& $hd '..\Some_Other_Plane') + (Fltsim 0 'zz' 'XZ-ZZZ' 'Zed' 'Zed')) @{ zz = $paint }
Livery 'No-Texture-Folder' 'N' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'missing' 'XN-NNN' 'N' 'N')) @{}
Livery 'Empty-Paint' 'E' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'ee' 'XE-EEE' 'E' 'E')) @{ ee = @('texture.cfg') }
New-Item -ItemType Directory -Force "$root\Not-A-Livery\html_ui" | Out-Null

$others = Tree $root | Where-Object { $_ -notlike '\bgt-f27500-modernized\*' }          # everything outside the add-on
$addonBefore = Tree $pkg

# ---------------------------------------------------------------- 1) -List changes nothing
$out = Run @{ List = $true }
Check '-List changes nothing' (((Tree $pkg) -join "`n") -eq ($addonBefore -join "`n"))
Check '-List says what it found' ($out -match 'Liveries of the base F27-500 found: 6' -and $out -match 'XA-AAA' -and $out -match 'List only')
Check '-List says an older build''s livery would be taken out' ($out -match 'to be taken out' -and $out -match 'Fokker F27500 Modernized Old Baked PT-OLD')

# ---------------------------------------------------------------- 2) apply
$out = Run
$cfg = [System.IO.File]::ReadAllText("$sim\aircraft.cfg")
Check 'aircraft.cfg: the shipped part is untouched, byte for byte' ($cfg.StartsWith($shippedCfg.TrimEnd() ))
Check 'aircraft.cfg: the LIVERIES line is there once' (([regex]::Matches($cfg, ';===================== LIVERIES')).Count -eq 1)
Check 'aircraft.cfg: the baked livery of an older build is gone' ($cfg -notmatch 'Old Baked|OLD-BAKED|PT-OLD')
$titles = @([regex]::Matches($cfg, '(?m)^title\s*=\s*"([^"]*)"') | ForEach-Object { $_.Groups[1].Value })
$expected = @('Fokker F27500 Modernized it80', 'Fokker F27500 Modernized Kappa XK-KKK', 'Fokker F27500 Modernized Alpha Air XA-AAA', 'Fokker F27500 Modernized Beta Lines XB-BBB',
              'Fokker F27500 Modernized Gamma XC-001', 'Fokker F27500 Modernized Gamma XC-002', 'Fokker F27500 Modernized Omega XW-WWW')   # by package name: Clash, Livery-A, -B, -C, Wrong-Case-Slashes
Check 'titles: shipped one, then one per livery, by package name' (($titles -join '|') -eq ($expected -join '|')) ($titles -join ' | ')
Check 'variations are numbered 0..6 with no gap' ((@([regex]::Matches($cfg, '(?m)^\[FLTSIM\.(\d+)\]') | ForEach-Object { [int]$_.Groups[1].Value }) -join ',') -eq '0,1,2,3,4,5,6')
$blockA = [regex]::Match($cfg, '(?s)\[FLTSIM\.2\].*?(?=\[FLTSIM\.3\])').Value
Check 'a livery block: texture, registration, airline, selector text, author, description' (
    $blockA -match 'texture = "aa"' -and $blockA -match 'atc_id = "XA-AAA"' -and $blockA -match 'atc_airline = "Alpha Air"' -and $blockA -match 'ui_variation = "Alpha Air \(XA-AAA\) - Modernized"' -and
    $blockA -match 'ui_createdby = "Bgt \(Modernized\), livery Studio A"' -and $blockA -match 'Livery by Studio A \(needs the Livery-A livery package installed\)')
Check 'a livery block keeps the add-on''s own model and panel (the WT21 ones)' ($blockA -match 'model = "wt21"' -and $blockA -match 'panel = "WT21"')
Check 'an airline missing in the livery''s cfg is taken from its selector text' ($cfg -match 'atc_airline = "Beta Lines"')
Check 'a texture called like a shipped folder gets its own name' ($cfg -match 'texture = "it80-livery"' -and (Test-Path "$sim\texture.it80-livery\texture.cfg"))
Check 'texture folder case follows the disk, not the cfg (texture "WW" -> folder ww)' ($cfg -match 'texture = "ww"' -and (Test-Path "$sim\texture.ww\texture.cfg"))
$tcfg = [System.IO.File]::ReadAllText("$sim\texture.aa\texture.cfg")
Check 'texture.cfg: the livery first, then ours, then the base aircraft''s' (
    $tcfg -eq "[fltsim]`r`nfallback.1=..\..\A\texture.aa`r`nfallback.2=..\texture.common`r`nfallback.3=..\..\Bgt_F27500v2\texture.vcen`r`nfallback.4=..\..\Bgt_F27500v2\texture`r`nfallback.5=..\..\Bgt_F27500v2\texture.common`r`n") $tcfg
Check 'only the thumbnails are copied (and texture.cfg): no paint' ((@(Get-ChildItem "$sim\texture.aa" -File | ForEach-Object { $_.Name } | Sort-Object) -join ',') -eq 'texture.cfg,thumbnail.JPG,thumbnail_small.JPG')
Check 'the baked livery''s texture folder is gone' (-not (Test-Path "$sim\texture.OLD-BAKED"))
Check 'what is not a livery of the base aircraft is not added' ($cfg -notmatch 'XZ-ZZZ|XN-NNN|XE-EEE')
Check 'shipped texture folders are untouched (they fall back across packages too, to the base aircraft)' ((Get-Content "$sim\texture.it80\texture.cfg" -Raw) -eq $shippedTexCfg -and (Get-Content "$sim\texture.it80\thumbnail.jpg" -Raw) -eq 'it80 thumb')
Check 'nothing outside the add-on changed' (((Tree $root | Where-Object { $_ -notlike '\bgt-f27500-modernized\*' }) -join "`n") -eq ($others -join "`n"))

# layout.json and manifest.json
$lay = [System.IO.File]::ReadAllText("$pkg\layout.json")
$ent = @([regex]::Matches($lay, '"path":\s*"([^"]+)",\s*"size":\s*(\d+),\s*"date":\s*(\d+)') | ForEach-Object { [pscustomobject]@{ P = $_.Groups[1].Value; S = [long]$_.Groups[2].Value; D = [long]$_.Groups[3].Value } })
$files = @(Get-ChildItem $pkg -Recurse -File | Where-Object { $_.Name -notin 'layout.json', 'manifest.json' })
Check "layout lists every file ($($ent.Count) entries / $($files.Count) files)" ($ent.Count -eq $files.Count)
$sortedP = [string[]]@($ent | ForEach-Object { $_.P }); $copy = $sortedP.Clone(); [Array]::Sort($copy, [StringComparer]::Ordinal)
$firstDiff = (0..($sortedP.Count - 1) | Where-Object { $sortedP[$_] -cne $copy[$_] } | Select-Object -First 1)
Check 'layout is sorted by path (ordinal) and lower case' (($sortedP -join '|') -ceq ($copy -join '|') -and ($sortedP | Where-Object { $_ -cne $_.ToLower() }).Count -eq 0) $(if ($null -ne $firstDiff) { "first difference at ${firstDiff}: file has '$($sortedP[$firstDiff])', ordinal order wants '$($copy[$firstDiff])'" })
Check 'layout sizes and dates are the files'' own' (@($files | Where-Object { $f = $_; $rel = $f.FullName.Substring($pkg.Length + 1).Replace('\', '/').ToLower(); -not ($ent | Where-Object { $_.P -eq $rel -and $_.S -eq $f.Length -and $_.D -eq $f.LastWriteTimeUtc.ToFileTimeUtc() }) }).Count -eq 0)
Check 'layout has no entry for the baked livery and one for each new thumbnail' (-not ($lay -match 'old-baked') -and $lay -match 'texture\.aa/thumbnail_small\.jpg' -and $lay -match 'texture\.c2/texture\.cfg')
$mf = [System.IO.File]::ReadAllText("$pkg\manifest.json")
Check 'manifest total_package_size = sum of the layout' ($mf -match "`"total_package_size`": `"$(($ent | Measure-Object S -Sum).Sum)`"") $mf

# ---------------------------------------------------------------- 3) a second run changes nothing
$once = Tree $pkg
Start-Sleep -Milliseconds 1200
$out2 = Run
Check 'a second run changes nothing (same files, sizes, dates, bytes)' (((Tree $pkg) -join "`n") -eq ($once -join "`n"))
Check 'a second run reports nothing new' ($out2 -notmatch 'new in the add-on' -and $out2 -notmatch 'to be taken out')

# ---------------------------------------------------------------- 4) a livery uninstalled, one installed
Remove-Item "$root\Livery-B" -Recurse -Force
Livery 'Livery-D' 'D' ((& $hd '..\Bgt_F27500v2') + (Fltsim 0 'dd' 'XD-DDD' 'Delta' 'Delta')) @{ dd = $paint }
$out3 = Run
$cfg3 = [System.IO.File]::ReadAllText("$sim\aircraft.cfg")
Check 'the uninstalled livery is taken out (variation, folder, layout)' ($cfg3 -notmatch 'XB-BBB' -and -not (Test-Path "$sim\texture.bb") -and ([System.IO.File]::ReadAllText("$pkg\layout.json") -notmatch 'texture\.bb/'))
Check 'the new one is in, numbering still has no gap' ($cfg3 -match 'XD-DDD' -and (Test-Path "$sim\texture.dd\texture.cfg") -and ((@([regex]::Matches($cfg3, '(?m)^\[FLTSIM\.(\d+)\]') | ForEach-Object { [int]$_.Groups[1].Value }) -join ',') -eq '0,1,2,3,4,5,6'))
Check 'the run said what changed' ($out3 -match 'new in the add-on : Delta XD-DDD' -and $out3 -match 'to be taken out')

# ---------------------------------------------------------------- 5) -Remove: as shipped
$out4 = Run @{ Remove = $true }
$cfg4 = [System.IO.File]::ReadAllText("$sim\aircraft.cfg")
Check '-Remove: aircraft.cfg is the shipped one (no livery, no LIVERIES line)' ($cfg4.TrimEnd() -eq $shippedCfg.TrimEnd())
Check '-Remove: no livery folder is left' ((@(Get-ChildItem $sim -Directory | ForEach-Object { $_.Name } | Sort-Object) -join ',') -eq 'texture.common,texture.it80')
$lay4 = [System.IO.File]::ReadAllText("$pkg\layout.json")
$ent4 = @([regex]::Matches($lay4, '"path"'))
$files4 = @(Get-ChildItem $pkg -Recurse -File | Where-Object { $_.Name -notin 'layout.json', 'manifest.json' })
Check '-Remove: layout lists exactly the files that are left' ($ent4.Count -eq $files4.Count)
Check '-Remove: the livery packages were not touched' (((Tree $root | Where-Object { $_ -notlike '\bgt-f27500-modernized\*' -and $_ -notlike '\Livery-B*' -and $_ -notlike '\Livery-D*' }) -join "`n") -eq (($others | Where-Object { $_ -notlike '\Livery-B*' -and $_ -notlike '\Livery-D*' }) -join "`n"))

# ---------------------------------------------------------------- 6) the add-on is not installed
Remove-Item $pkg -Recurse -Force
$msg = ''
try { Run | Out-Null } catch { $msg = $_.Exception.Message }
Check 'without the add-on it stops with a clear message' ($msg -match 'not installed')

Remove-Item $root -Recurse -Force
"{0} passed, {1} failed" -f $pass, $fail
exit $(if ($fail) { 1 } else { 0 })
