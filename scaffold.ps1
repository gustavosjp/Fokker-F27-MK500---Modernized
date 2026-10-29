# One-shot: creates the F27-500 Modernized package SOURCE tree from the pristine author package.
# v10.11 (user: "a pasta do avião tá se chamando bgt-f27500-g1000? Não é G1000, podia mudar isso"): the package is
# bgt-f27500-modernized and the SimObject Bgt_F27500v2_Modernized; the two G1000 NXi (WIP) variations of the first phase, their
# model / panel folders and the G1000 instruments are gone (README has the history).
# The original (C:\Projetos\bgt-f27500-v2) is only read, never modified. After the scaffold, PackageSources\ is the
# hand-edited source of truth: re-running this script refuses to touch an existing tree unless -Force is given
# (which DELETES the tree and loses manual edits).
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\scaffold.ps1 [-Force] [-NoLiveries]
#   -NoLiveries does nothing since v11.1: liveries are no longer baked into the build (run Add-Liveries.ps1 after installing).
#   -ClassicVariation also builds v10.8's separate Classic variation (the author's cockpit with his own WASM, the TAPIR on the sim's
#   autopilot). Since v10.9 the Modernized variation switches to that cockpit in the tablet's Settings, so it is off by default.
param([switch]$Force, [switch]$NoLiveries, [switch]$ClassicVariation)
$ErrorActionPreference = 'Stop'

$orig    = 'C:\Projetos\bgt-f27500-v2'
$proj    = 'C:\Projetos\f27-g1000'
$pkg     = 'bgt-f27500-modernized'
$dst     = "$proj\PackageSources\$pkg"
$oldSim  = 'Bgt_F27500v2'
$newSim  = 'Bgt_F27500v2_Modernized'
$oldWasm = 'WASM_F27500bgtv2.wasm'
$utf8    = New-Object System.Text.UTF8Encoding($false)

if (Test-Path $dst) {
    if (-not $Force) { throw "$dst already exists. It is the hand-edited source of truth; pass -Force only if you want to discard it." }
    if ($dst -notlike "$proj\PackageSources\*") { throw 'refusing to delete outside the project' }
    Remove-Item $dst -Recurse -Force
}

function Copy-Tree([string]$from, [string]$to, [string[]]$excludeDirs = @(), [string[]]$excludeFiles = @()) {
    New-Item -ItemType Directory -Force $to | Out-Null
    $args = @($from, $to, '/E', '/NFL', '/NDL', '/NJH', '/NJS', '/NP')
    if ($excludeDirs.Count)  { $args += '/XD'; $args += $excludeDirs }
    if ($excludeFiles.Count) { $args += '/XF'; $args += $excludeFiles }
    robocopy @args | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE): $from" }
    $global:LASTEXITCODE = 0
}
function Edit-Text([string]$path, [scriptblock]$edit) {
    $t = [System.IO.File]::ReadAllText($path)
    $n = & $edit $t
    [System.IO.File]::WriteAllText($path, $n, $utf8)
}

# --- 1. package-level folders --------------------------------------------------------------------------------------
Copy-Tree "$orig\ContentInfo\bgt-f27500-v2" "$dst\ContentInfo\$pkg"
Copy-Tree "$orig\Data"               "$dst\Data"
Copy-Tree "$orig\Documentation"      "$dst\Documentation"
Copy-Tree "$orig\effects"            "$dst\effects"
Copy-Tree "$orig\VisualEffectLibs"   "$dst\VisualEffectLibs"
# the author's systems WASM is only read: the package holds its patched copies (WT21, Classic), never the module itself
New-Item -ItemType Directory -Force "$dst\wasm" | Out-Null

# --- 2. SimObject (only what the Modernized variation needs; cargo/GPS/KLN variants are left out) ----------------------------
$simSrc = "$orig\SimObjects\Airplanes\$oldSim"
$simDst = "$dst\SimObjects\Airplanes\$newSim"
Copy-Tree $simSrc $simDst `
    -excludeDirs @('model.cargo', 'model.cargokln90b', 'model.kln90b', 'panel.GPS', 'panel.kln90b',
                   'texture.cargo', 'texture.cargogps', 'texture.cargokln90b', 'texture.it68', 'texture.it80gps',
                   'texture.whitegps', 'texture.whitekln90b') `
    -excludeFiles @('F27500v2bgt_cargo.*', 'F27500v2bgt_INTERIOR_kln90b.*')
# the author's own panel folder is no variation's: panel.WT21 (and panel.Classic) are made from his panel.cfg below
Remove-Item "$simDst\panel" -Recurse -Force

# paths that embed the old SimObject folder name
Edit-Text "$simDst\Checklist\${oldSim}Checklist.xml" { param($t) $t.Replace("Airplanes\\$oldSim\\", "Airplanes\\$newSim\\") }
# v10 (test 12: "o YD não liga"): the author's yaw damper gain is 0, which the sim takes as "no yaw damper", so YAW_DAMPER_TOGGLE never
# turned it on (the original cockpit has no YD switch). Both variations have a YD key now. 1.0 is the usual value.
Edit-Text "$simDst\systems.cfg" {
    param($t)
    if ($t -notmatch '(?m)^yaw_damper_gain = 0\s*$') { throw 'systems.cfg: yaw_damper_gain = 0 not found' }
    $t -replace '(?m)^yaw_damper_gain = 0(\s*)$', 'yaw_damper_gain = 1.0$1'
}

# --- 3. aircraft.cfg: shared header + the Modernized variation (+ one per livery, + Classic on request) ----------------
$cfg = [System.IO.File]::ReadAllLines("$orig\SimObjects\Airplanes\$oldSim\aircraft.cfg")
$firstFlt = ($cfg | Select-String -Pattern '^;=+ FLTSIM =+' | Select-Object -First 1).LineNumber
if (-not $firstFlt) { throw 'FLTSIM marker not found in aircraft.cfg' }
$header = $cfg[0..($firstFlt - 2)]

function Get-FltBlock([string[]]$lines, [int]$n) {
    $start = ($lines | Select-String -Pattern "^\[FLTSIM\.$n\]" | Select-Object -First 1).LineNumber - 1
    $end = $lines.Count - 1
    for ($i = $start + 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^\[FLTSIM\.\d+\]') { $end = $i - 1; break } }
    ,$lines[$start..$end]
}
function New-Variation([string[]]$block, [int]$index, [string]$title, [string]$uiVariation, [string]$description,
                       [string]$model = 'wt21', [string]$panel = 'WT21', [string]$createdBy = 'Bgt (Modernized)') {
    $out = foreach ($l in $block) {
        switch -Regex ($l) {
            '^\[FLTSIM\.\d+\]'        { "[FLTSIM.$index]"; break }
            '^title\s*='              { "title = `"$title`" ; Variation name"; break }
            '^model\s*='              { "model = `"$model`" ; model folder"; break }
            '^panel\s*='              { "panel = `"$panel`" ; panel folder"; break }
            '^description\s*='        { "description = `"$description`" ; Variation description."; break }
            '^ui_variation\s*='       { "ui_variation = `"$uiVariation`" ; e.g. World Air, IFR Panel"; break }
            '^ui_createdby\s*='       { "ui_createdby = `"$createdBy`" ; e.g. Asobo Studio, Microsoft, FSAddonCompany, etc"; break }
            '^wip_indicator\s*='      { 'wip_indicator = 0 ; know if the variation is good to go or still WIP : -1=Disabled, 0=Rough, 1=1st Pass, 2=Finished'; break }
            default                   { $l }
        }
    }
    ,$out
}
# v10.8 (user: "em vez de fazer relação a WT ou G1000, ser Modernized"): the names the sim shows say Modernized (the folders keep wt21)
$wt21Description = 'Fokker F27-500, modernized: Working Title WT21 (Collins Pro Line style) avionics, PFD and MFD on the captain''s side with the radio altimeter, RMI and OAT beside them, CJ4-style autopilot panel, FMS CDU on the pedestal; original engine gauges and copilot instruments; the F27 tablet, whose Settings switch to the author''s Classic cockpit.'
$wt21 = New-Variation (Get-FltBlock $cfg 1) 0 'Fokker F27500 Modernized it80' 'Air Inter 1980 - Modernized' $wt21Description 'wt21' 'WT21' 'Bgt (Modernized)'
# v10.8 (user: "no modo Clássico, a única coisa nossa que entra é o Tablet", "o AP original controla o avião"): the Classic variation,
# the author's cockpit and TAPIR autopilot as he made them, plus the F27 tablet (and the ground equipment it works on the exterior)
$classicDescription = 'Fokker F27-500 with the author''s original cockpit and TAPIR autopilot, plus the F27 tablet: SimBrief, loading, checklists, charts, ground services (chocks, covers, gear pins), systems.'
$classic = New-Variation (Get-FltBlock $cfg 1) 1 'Fokker F27500 Classic it80' 'Air Inter 1980 - Classic' $classicDescription 'classic' 'Classic' 'Bgt (Classic + F27 tablet)'
$all = @($header) + @(';===================== FLTSIM =====================', '') + $wt21 + @('')
# v10.9: the Modernized variation has the Classic cockpit in its tablet; the separate one only on request
if ($ClassicVariation) { $all += @('') + $classic + @('') }

# v11.1 (user: "quero que o usuario tenha as pinturas dele, mesmo se eu nao tiver elas instaladas"): no livery is baked into the build any
# more. Which liveries exist depends on the computer the add-on is installed on, so Add-Liveries.ps1 writes the variations THERE (on the
# user's machine, and on this one after the deploy). -NoLiveries is still accepted so earlier instructions work; it changes nothing now.
[System.IO.File]::WriteAllLines("$simDst\aircraft.cfg", $all, $utf8)

# --- 6. WT21 (CJ4 style) variation: model.wt21 + panel.WT21 -------------------------------------------------------------------
# Layout (tools\wt21-layout.json, accepted 2026-10-16): captain PFD | central MFD with the Dart EICAS | copilot PFD, plus the FMS
# text screen (CDU) on the front of the old GPS 530 housing. The analogue instruments those screens replace are hidden by visibility
# (ASOBO_GT_Visibility_Code), never deleted from the model. The screen recipe proven in the first tests (2026-10-16, then on the G1000
# NXi of phase 1): minimal material + an ASOBO_GT_Material_Emissive_Code component on every screen node. Behind each screen a 'plate' quad hides the empty instrument pockets;
# it has a TEXTURED dark material (texture.common\F27WT21_PLATE.PNG.DDS, made by tools\make-plate-dds.mjs). History: an untextured
# bezel did not render (test 1); a dark margin drawn inside a bigger screen texture came out smaller and lower than computed (test 2).
New-Item -ItemType Directory -Force "$simDst\model.wt21" | Out-Null
Copy-Item "$simSrc\model.kln90b\model.CFG" "$simDst\model.wt21\model.CFG"
Edit-Text "$simDst\model.wt21\model.CFG" { param($t) if (-not $t.Contains('F27500v2bgt_INTERIOR_kln90b.xml')) { throw 'model.wt21 model.CFG: interior line not found' }; $t.Replace('F27500v2bgt_INTERIOR_kln90b.xml', 'F27500v2bgt_INTERIOR_wt21.xml') }
$hwAtlasMap = "$env:TEMP\f27-hw-atlas.json"   # map of the 3D hardware atlas (kept out of the package), read by make-hw-atlas.py
node "$proj\tools\make-g1000-interior.mjs" "$simDst\model\F27500v2bgt_INTERIOR.gltf" "$simDst\model\F27500v2bgt_INTERIOR_wt21.gltf" emissive-only wt21 $hwAtlasMap
if ($LASTEXITCODE -ne 0) { throw 'make-g1000-interior (wt21) failed' }
# v10.4: the WT21 variation's own exterior = the author's + rubber wheel chocks that the tablet works (the stairs follow them); his
# wooden nose chocks are hidden there. v10.5: + pitot covers, engine covers and the gear ground locks' streamers. Their textures go to
# texture.common (every variation's fallback chain has it).
node "$proj\tools\make-wt21-exterior.mjs" "$simDst\model\F27500v2bgt.gltf" "$simDst\model\F27500v2bgt.xml" "$simDst\model\F27500v2bgt_wt21.gltf" "$simDst\model\F27500v2bgt_wt21.xml" "$simDst\texture.common"
if ($LASTEXITCODE -ne 0) { throw 'make-wt21-exterior failed' }
python "$proj\tools\make-flags-atlas.py" "$simDst\texture.common"
if ($LASTEXITCODE -ne 0) { throw 'make-flags-atlas failed' }
Edit-Text "$simDst\model.wt21\model.CFG" { param($t) if (-not $t.Contains('normal=..\model\F27500v2bgt.xml')) { throw 'model.wt21 model.CFG: exterior line not found' }; $t.Replace('normal=..\model\F27500v2bgt.xml', 'normal=..\model\F27500v2bgt_wt21.xml') }

$layoutFile = "$proj\tools\wt21-layout.json"
$layout = Get-Content $layoutFile -Raw | ConvertFrom-Json
$wt21Screens = @($layout.units | ForEach-Object { $_.node })
$wt21Components = ($wt21Screens | ForEach-Object { @"

		<Component ID="F27$($_.Replace('_screen','').Replace('_',''))" Node="$_">
			<UseTemplate Name="ASOBO_GT_Material_Emissive_Code">
				<EMISSIVE_CODE>1</EMISSIVE_CODE>
			</UseTemplate>
		</Component>
"@ }) -join ''

# the author's parts the WT21 cockpit replaces: exact node names expanded from the prefixes of the layout file (and checked for children)
$hideFile = "$env:TEMP\f27-wt21-hide.json"
node "$proj\tools\expand-hide.mjs" "$simDst\model\F27500v2bgt_INTERIOR.gltf" $layoutFile $hideFile
if ($LASTEXITCODE -ne 0) { throw 'expand-hide failed' }
$hideNames = @((Get-Content $hideFile -Raw | ConvertFrom-Json).all)
# v10.9 (user: "ter opcao de escolha Classic vs Modernized dentro do Tablet"): one cockpit with both faces, L:F27_COCKPIT_CLASSIC
# (0 Modernized, 1 Classic) set in the tablet's Settings. Hiding a node does not stop its knob/switch interaction (test 8: the old CRS
# knobs behind the FCP took clicks), so the side not in use is carried 25 m below the cockpit and shrunk to a thousandth: carrier
# nodes with a two-key translation + scale animation (tools\make-cockpit-switch.mjs), played here. No visibility code on them: a
# parent's visibility overrides its children's in the sim (test 15, v10.9: every autopilot key lamp showed lit). The author's
# instruments the WT21 cockpit placed beside its screens go back home, full size, in Classic. His behaviours are therefore included
# unchanged (until v10.8 the WT21 model had a copy without the interactions of the hidden parts, make-wt21-base-xml.mjs).
$switchFile = "$env:TEMP\f27-cockpit-switch.json"
node "$proj\tools\make-cockpit-switch.mjs" "$simDst\model\F27500v2bgt_INTERIOR_wt21.gltf" $hideFile $switchFile
if ($LASTEXITCODE -ne 0) { throw 'make-cockpit-switch failed' }
$switch = Get-Content $switchFile -Raw | ConvertFrom-Json
$classicVar = '(L:F27_COCKPIT_CLASSIC, Bool)'
$n = 0
$wt21Switch = ''
foreach ($side in @($switch.classic, $switch.modern, $switch.moved)) {
    foreach ($node in @($side | Where-Object { $_ })) {
        $n++
        $wt21Switch += @"

		<Component ID="F27CockpitSwitch$n" Node="$node">
			<UseTemplate Name="ASOBO_GT_Anim_Code">
				<ANIM_NAME>$node</ANIM_NAME>
				<ANIM_LENGTH>100</ANIM_LENGTH>
				<ANIM_LAG>0</ANIM_LAG>
				<ANIM_CODE>$classicVar 100 *</ANIM_CODE>
			</UseTemplate>
		</Component>
"@
    }
}

# interactions of every click zone (bezel keys and knobs, FCP), generated from the controls of the layout file
$wt21Controls = (& node "$proj\tools\controls-xml.mjs" $layoutFile) -join "`r`n"
if ($LASTEXITCODE -ne 0) { throw 'controls-xml failed' }

$wt21Xml = @"
<?xml version="1.0" encoding="utf-8"?>
<ModelInfo>
	<LODS>
		<LOD minSize="0" ModelFile="F27500v2bgt_INTERIOR_wt21.gltf"/>
	</LODS>

	<Behaviors>
		<IncludeBase RelativeFile="F27500v2bgt_INTERIOR.xml"/>

		<!-- WT21 screens. PROVEN in-sim (2026-10-16): each screen node needs a component with ASOBO_GT_Material_Emissive_Code for its
		     page to show on the 3D material (without one it stays black; ASOBO_GT_Component_Emissive_Gauge did not work either). -->$wt21Components

		<!-- Controls (approved mock-up, 2026-10-16): bezel keys around the PFDs (WT21 DCP events) and the MFD (CCP events), and the
		     CJ4-style FCP where the radio/CRS box was (standard autopilot key events, taken by the WT21 autopilot in the FMC). -->$wt21Controls

		<!-- v10.9 cockpit switch, L:F27_COCKPIT_CLASSIC (tablet Settings). Classic: the author's parts the WT21 cockpit replaces ($($hideNames.Count) nodes: the captain's flight instruments the PFD shows, the GPS 530 and its housing, the radio/CRS box, the old autopilot controls) on carriers in place, full size. Modernized: ours (screens, frames, FCP, DCP, CDU, keys, the walls of the moved instruments) on a carrier in place. The side not in use is carried away and shrunk (no visibility code: test 15). The author's instruments placed beside the screens are animated back home in Classic. -->$wt21Switch
	</Behaviors>
</ModelInfo>
"@
[System.IO.File]::WriteAllText("$simDst\model\F27500v2bgt_INTERIOR_wt21.xml", $wt21Xml, $utf8)

# the plates' texture: tiny solid dark-grey DXT1 + sidecar, found through the variations' texture.cfg fallback (texture.common)
$plateRgb = @($layout.plateRgb | ForEach-Object { [string][int]$_ })
node "$proj\tools\make-plate-dds.mjs" "$simDst\texture.common\$($layout.plateTexture)" $plateRgb[0] $plateRgb[1] $plateRgb[2]
if ($LASTEXITCODE -ne 0) { throw 'make-plate-dds failed' }
# the control textures (bezel keys, FCP): drawn from the same rectangles as the click zones, DXT1 + sidecar like the author's textures
# v8: the 3D hardware (frames, inserts, FCP, DCPs, keys, knobs) shares one atlas painted from the map make-g1000-interior.mjs wrote
python "$proj\tools\make-hw-atlas.py" $hwAtlasMap $layoutFile "$simDst\texture.common"
if ($LASTEXITCODE -ne 0) { throw 'make-hw-atlas failed' }

New-Item -ItemType Directory -Force "$simDst\panel.WT21" | Out-Null
# One [VcockpitNN] per unit: a standard texture of the page's own size (1024x768, CDU 1024x1024), the page filling it (proven in tests).
$sections = foreach ($u in $layout.units) {
    $pw = [int]$u.page[0]; $ph = [int]$u.page[1]
    @"
// $($u.id)
[Vcockpit$('{0:D2}' -f [int]$u.vcockpit)]
size_mm=$pw,$ph
pixel_size=$pw,$ph
texture=$($u.material)
background_color=0,0,0
emissive=1
htmlgauge00=$($u.gauge), 0,0,$pw,$ph

"@
}
# v9.3 (test 10): the WT21 variation runs its own copy of the author's systems WASM in which the old TAPIR autopilot's mode handling
# (an ALT ON/OFF pulse every ~2 s while engaged, HDG / wing leveler / NAV / LOC / APR / BC forcing) is replaced by KEY_NULL, so it no
# longer fights the WT21 autopilot; the servo-switch disconnect stays.
$wt21Wasm = 'WASM_F27WT21.wasm'
python "$proj\tools\patch-wasm-wt21.py" "$orig\wasm\$oldWasm" "$dst\wasm\$wt21Wasm"
if ($LASTEXITCODE -ne 0) { throw 'patch-wasm-wt21 failed' }
$wt21Panel = [System.IO.File]::ReadAllText("$simSrc\panel\panel.cfg").TrimEnd().Replace("wasm_module=wasm/$oldWasm", "wasm_module=wasm/$wt21Wasm")
if ($wt21Panel -notmatch [regex]::Escape("wasm/$wt21Wasm")) { throw 'WT21 panel.cfg does not load the WT21 WASM copy' }
$wt21Panel += @'


// --- Working Title WT21 (Collins Pro Line style, as in the CJ4), private copy under Instruments\F27WT21 ---
// The instance is chosen by ?Index=N; the instrument id becomes <templateID>_<index> (WT21_PFD_1, ...), which panel.xml uses.
// Generated from tools\wt21-layout.json by scaffold.ps1.

'@ + ($sections -join "`r`n")
[System.IO.File]::WriteAllText("$simDst\panel.WT21\panel.cfg", $wt21Panel, $utf8)
[System.IO.File]::WriteAllText("$simDst\panel.WT21\panel.xml", @'
<PlaneHTMLConfig>
	<!-- Instrument ids are <templateID>_<Index> (see the sim's BaseInstrument.parseURLAttributes). Power only for now:
	     CIRCUIT ON:17 is the author's CIRC_MAIN_BUS_TO_INSTRU, the circuit all his own instruments use (v10.3: the avionics circuit 40
	     read on in cold and dark, without battery). WT21 reads defaults for everything else. The tablet has no entry: it runs on its
	     own battery, like a real one.
	     v10.9: L:F27_COCKPIT_CLASSIC (tablet Settings) is 1 in the author's Classic cockpit, where the PFD and MFD are carried away
	     with the rest of ours and stay off. The FMC keeps its power: it hosts the WT21 autopilot, which the old autopilot panel drives
	     in Classic (through the tablet instrument). -->
	<Instrument><Name>WT21_PFD_1</Name><Electric><And><Simvar name="CIRCUIT ON:17" unit="Bool"/><Not><Simvar name="L:F27_COCKPIT_CLASSIC" unit="Bool"/></Not></And></Electric></Instrument>
	<!-- The MFD (v10: next to the PFD on the captain's side) loads the F27 plugin (plugin-wt21): the Dart engine indication in the band
	     at the top of the MFD. v10 has no PFD 2: the copilot keeps the original instruments. -->
	<Instrument>
		<Name>WT21_MFD_1</Name>
		<Electric><And><Simvar name="CIRCUIT ON:17" unit="Bool"/><Not><Simvar name="L:F27_COCKPIT_CLASSIC" unit="Bool"/></Not></And></Electric>
		<Plugin>coui://html_ui/Pages/VCockpit/Instruments/F27WT21/Plugins/F27MfdPlugin.js</Plugin>
	</Instrument>
	<Instrument><Name>WT21_FMC_1</Name><Electric><Simvar name="CIRCUIT ON:17" unit="Bool"/></Electric></Instrument>
</PlaneHTMLConfig>
'@, $utf8)

# --- 6b. Classic variation (v10.8): model.classic + panel.Classic --------------------------------------------------------------
# User: "no modo Clássico, a única coisa nossa que entra é o Tablet" and "o AP original controla o avião". The author's cockpit as he made
# it (nothing hidden, moved or added but the tablet; his own behaviours, included as they are), his panel.cfg with his systems WASM in
# a copy where only the stairs rule is blanked (the stairs follow the tablet's chocks, as in the WT21; his TAPIR autopilot is untouched),
# no Working Title instrument at all. The exterior is the WT21's (the chocks, covers and gear pins the tablet works; his stairs on the
# ground). The tablet is told by its panel.cfg line (?variant=classic) that there is no FMS to send routes to.
# v10.9: only with -ClassicVariation (the Modernized variation switches to this cockpit in the tablet).
if ($ClassicVariation) {
    New-Item -ItemType Directory -Force "$simDst\model.classic" | Out-Null
    Copy-Item "$simDst\model.wt21\model.CFG" "$simDst\model.classic\model.CFG"
    Edit-Text "$simDst\model.classic\model.CFG" { param($t) if (-not $t.Contains('F27500v2bgt_INTERIOR_wt21.xml')) { throw 'model.classic model.CFG: interior line not found' }; $t.Replace('F27500v2bgt_INTERIOR_wt21.xml', 'F27500v2bgt_INTERIOR_classic.xml') }
    # the WT21 layout reduced to the tablet; its control sets and colours alone decide the shared hardware atlas, which must come out the same
    $classicLayout = "$env:TEMP\f27-classic-layout.json"
    node "$proj\tools\make-classic-layout.mjs" $layoutFile $classicLayout
    if ($LASTEXITCODE -ne 0) { throw 'make-classic-layout failed' }
    $classicAtlasMap = "$env:TEMP\f27-hw-atlas-classic.json"
    $env:F27_WT21_LAYOUT = $classicLayout
    try {
        node "$proj\tools\make-g1000-interior.mjs" "$simDst\model\F27500v2bgt_INTERIOR.gltf" "$simDst\model\F27500v2bgt_INTERIOR_classic.gltf" emissive-only wt21 $classicAtlasMap
        $code = $LASTEXITCODE
    } finally { Remove-Item Env:F27_WT21_LAYOUT }
    if ($code -ne 0) { throw 'make-g1000-interior (classic) failed' }
    if ([System.IO.File]::ReadAllText($classicAtlasMap) -ne [System.IO.File]::ReadAllText($hwAtlasMap)) { throw 'the Classic tablet atlas differs from the WT21 one (they share F27WT21_HW.PNG.DDS)' }
    $classicUnits = @((Get-Content $classicLayout -Raw | ConvertFrom-Json).units)
    $classicScreens = ($classicUnits | ForEach-Object { $_.node } | ForEach-Object { @"

		<Component ID="F27$($_.Replace('_screen','').Replace('_',''))" Node="$_">
			<UseTemplate Name="ASOBO_GT_Material_Emissive_Code">
				<EMISSIVE_CODE>1</EMISSIVE_CODE>
			</UseTemplate>
		</Component>
"@ }) -join ''
    $classicControls = (& node "$proj\tools\controls-xml.mjs" $classicLayout) -join "`r`n"
    if ($LASTEXITCODE -ne 0) { throw 'controls-xml (classic) failed' }
    $classicXml = @"
<?xml version="1.0" encoding="utf-8"?>
<ModelInfo>
	<LODS>
		<LOD minSize="0" ModelFile="F27500v2bgt_INTERIOR_classic.gltf"/>
	</LODS>

	<Behaviors>
		<IncludeBase RelativeFile="F27500v2bgt_INTERIOR.xml"/>

		<!-- Classic (v10.8): the author's cockpit as he made it; ours is only the F27 tablet, its screen (same recipe as every screen)
		     and its bezel, which folds it against the wall. -->$classicScreens
$classicControls
	</Behaviors>
</ModelInfo>
"@
    [System.IO.File]::WriteAllText("$simDst\model\F27500v2bgt_INTERIOR_classic.xml", $classicXml, $utf8)
    $classicWasm = 'WASM_F27Classic.wasm'
    python "$proj\tools\patch-wasm-wt21.py" "$orig\wasm\$oldWasm" "$dst\wasm\$classicWasm" --stairs-only
    if ($LASTEXITCODE -ne 0) { throw 'patch-wasm-wt21 --stairs-only failed' }
    New-Item -ItemType Directory -Force "$simDst\panel.Classic" | Out-Null
    $classicPanel = [System.IO.File]::ReadAllText("$simSrc\panel\panel.cfg").TrimEnd().Replace("wasm_module=wasm/$oldWasm", "wasm_module=wasm/$classicWasm")
    if ($classicPanel -notmatch [regex]::Escape("wasm/$classicWasm")) { throw 'Classic panel.cfg does not load the Classic WASM copy' }
    foreach ($u in $classicUnits) {
        $pw = [int]$u.page[0]; $ph = [int]$u.page[1]
        $classicPanel += @"


// --- the F27 tablet, the Classic's only addition to the author's cockpit (?variant=classic: no FMS) ---
[Vcockpit$('{0:D2}' -f [int]$u.vcockpit)]
size_mm=$pw,$ph
pixel_size=$pw,$ph
texture=$($u.material)
background_color=0,0,0
emissive=1
htmlgauge00=$($u.gauge)?variant=classic, 0,0,$pw,$ph
"@
    }
    [System.IO.File]::WriteAllText("$simDst\panel.Classic\panel.cfg", $classicPanel + "`r`n", $utf8)
}

# --- 7. the instruments themselves (private copy under Instruments\F27WT21) ------------------------------------------------------
if (Test-Path 'C:\Projetos\msfs-avionics-mirror\src\workingtitle-instruments-wt21\instruments\dist\workingtitle-instruments-wt21-v2') {
    & "$proj\stage-wt21-instrument.ps1"
} else { Write-Warning 'WT21 build not found (run tools\build-wt21.ps1); the WT21 variation will have no instruments' }

$files = Get-ChildItem $dst -Recurse -File
"scaffold done: {0} files, {1:N1} MB in {2}" -f $files.Count, (($files | Measure-Object Length -Sum).Sum / 1MB), $dst
