# ARCHIVED 2026-10-16: diagnostic only. It served its purpose (results: CTRL2 works; CTRL1, CTRL3, CTRL4 and the original gated
# variation stayed black; see README). The default tree now uses the CTRL2 recipe, so this script is kept only as a record and is
# not meant to be run again on the current tree.
#
# One-shot: adds diagnostic CONTROL variations to the G1000 package to find out why the 3D screens stay black while the G1000
# pages themselves run fine (they work in the sim's pop-out window). Each variation changes one suspect:
#
#   CTRL1  model g1000n   gltf A (GPS-material clone)  NO components          panel G1000     -> are our two XML components the cause?
#   CTRL2  model g1000m   gltf B (emissive-only mat.)  ASOBO_GT_Material_Emissive_Code=1 (the FSS 727 pattern)  panel G1000
#   CTRL3  model g1000bn  gltf B, NO components        panel G1000t1 (WT530 page in the PFD slot, G1000 MFD in the MFD slot)
#   CTRL4  base model + panel GPS + texture it80gps    -> the author's own GPS530 mechanism, inside this package
#
# gltf B uses { name, emissiveFactor [1,1,1] } with a default WHITE base colour, so a screen whose dynamic texture is not bound
# at all shows bright white, a bound-but-blank one stays black, a working one shows the page.
#
# Idempotent guard: refuses to run if model.g1000n already exists (the tree is hand-edited source of truth).
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\add-control-variants.ps1
$ErrorActionPreference = 'Stop'
$proj    = 'C:\Projetos\f27-g1000'
$orig    = 'C:\Projetos\bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2'
$sim     = "$proj\PackageSources\bgt-f27500-g1000\SimObjects\Airplanes\Bgt_F27500v2_G1000"
$oldWasm = 'WASM_F27500bgtv2.wasm'
$newWasm = 'WASM_F27G1000base.wasm'
$utf8    = New-Object System.Text.UTF8Encoding($false)

if (Test-Path "$sim\model.g1000n") { throw 'control variants already added (model.g1000n exists)' }

function Write-Text([string]$path, [string]$text) { [System.IO.File]::WriteAllText($path, $text, $utf8) }

# --- 1. assets taken from the author's package (read-only source) ---------------------------------------------------------
robocopy "$orig\panel.GPS" "$sim\panel.GPS" /E /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy "$orig\texture.it80gps" "$sim\texture.it80gps" /E /NFL /NDL /NJH /NJS /NP | Out-Null
$global:LASTEXITCODE = 0
$gpsCfg = [System.IO.File]::ReadAllText("$sim\panel.GPS\panel.cfg").Replace($oldWasm, $newWasm)
Write-Text "$sim\panel.GPS\panel.cfg" $gpsCfg

# --- 2. glTF B (emissive-only material form) --------------------------------------------------------------------------------
node "$proj\tools\make-g1000-interior.mjs" "$sim\model\F27500v2bgt_INTERIOR.gltf" "$sim\model\F27500v2bgt_INTERIOR_g1000b.gltf" emissive-only
if ($LASTEXITCODE -ne 0) { throw 'make-g1000-interior (B) failed' }

# --- 3. interior XML variants + model folders --------------------------------------------------------------------------------
function New-InteriorXml([string]$gltf, [string]$components) {
@"
<?xml version="1.0" encoding="utf-8"?>
<ModelInfo>
	<LODS>
		<LOD minSize="0" ModelFile="$gltf"/>
	</LODS>

	<Behaviors>
		<IncludeBase RelativeFile="F27500v2bgt_INTERIOR.xml"/>
$components
	</Behaviors>
</ModelInfo>
"@
}
$materialEmissive = @'

		<!-- FSS 727 pattern: ASOBO_GT_Material_Emissive_Code with a constant (no electrical gating, no visibility template) -->
		<Component ID="F27G1000PfdScreen" Node="G1000_PFD_screen">
			<UseTemplate Name="ASOBO_GT_Material_Emissive_Code">
				<EMISSIVE_CODE>1</EMISSIVE_CODE>
			</UseTemplate>
		</Component>
		<Component ID="F27G1000MfdScreen" Node="G1000_MFD_screen">
			<UseTemplate Name="ASOBO_GT_Material_Emissive_Code">
				<EMISSIVE_CODE>1</EMISSIVE_CODE>
			</UseTemplate>
		</Component>
'@
$variants = @(
    @{ Name = 'g1000n';  Gltf = 'F27500v2bgt_INTERIOR_g1000.gltf';  Components = '' },
    @{ Name = 'g1000m';  Gltf = 'F27500v2bgt_INTERIOR_g1000b.gltf'; Components = $materialEmissive },
    @{ Name = 'g1000bn'; Gltf = 'F27500v2bgt_INTERIOR_g1000b.gltf'; Components = '' }
)
foreach ($v in $variants) {
    Write-Text "$sim\model\F27500v2bgt_INTERIOR_$($v.Name).xml" (New-InteriorXml $v.Gltf $v.Components)
    New-Item -ItemType Directory -Force "$sim\model.$($v.Name)" | Out-Null
    $cfg = [System.IO.File]::ReadAllText("$sim\model.g1000\model.CFG").Replace('F27500v2bgt_INTERIOR_g1000.xml', "F27500v2bgt_INTERIOR_$($v.Name).xml")
    Write-Text "$sim\model.$($v.Name)\model.CFG" $cfg
}

# --- 4. panel variant G1000t1: WT530 page in the PFD slot, G1000 MFD in the MFD slot -------------------------------------------
New-Item -ItemType Directory -Force "$sim\panel.G1000t1" | Out-Null
$basePanel = [System.IO.File]::ReadAllText("$sim\panel\panel.cfg").TrimEnd()
Write-Text "$sim\panel.G1000t1\panel.cfg" ($basePanel + @'


// CTRL3: the author's proven WT530 GPS page in the PFD slot (same size/emissive keys as the author's panel.GPS),
// the G1000 MFD in the MFD slot. If the WT530 shows and the MFD does not, the problem is specific to the G1000 page.
[Vcockpit04]
size_mm=320,234
pixel_size=320,234
texture=$gaugesF27g1000pfd
emissive=1
htmlgauge00=NavSystems/GPS/WT530/WT530.html, 0, 0, 320,234

[Vcockpit05]
size_mm=1024,768
pixel_size=1024,768
texture=$gaugesF27g1000mfd
emissive=1
htmlgauge00=NavSystems/F27G1000/MFD/WTG1000_MFD.html, 0,0,1024,768

'@)
Write-Text "$sim\panel.G1000t1\panel.xml" @'
<PlaneHTMLConfig>
	<Instrument>
		<Name>WT530</Name>
		<NavIndex>1</NavIndex>
		<ComIndex>1</ComIndex>
		<Electric>
			<Simvar name="CIRCUIT ON:40" unit="Boolean"/>
		</Electric>
	</Instrument>
	<Instrument>
		<Name>AS1000_MFD</Name>
		<Electric>
			<Simvar name="CIRCUIT ON:41" unit="Bool"/>
		</Electric>
	</Instrument>
</PlaneHTMLConfig>
'@

# --- 5. aircraft.cfg: four more variations (cloned from the existing it80 variation block) ---------------------------------
$lines = [System.IO.File]::ReadAllLines("$sim\aircraft.cfg")
$start = ($lines | Select-String -Pattern '^\[FLTSIM\.0\]' | Select-Object -First 1).LineNumber - 1
$end = $lines.Count - 1
for ($i = $start + 1; $i -lt $lines.Count; $i++) { if ($lines[$i] -match '^\[FLTSIM\.\d+\]') { $end = $i - 1; break } }
$block = $lines[$start..$end]

function New-Variation([int]$index, [string]$title, [string]$uiVariation, [string]$model, [string]$panel, [string]$texture) {
    $out = foreach ($l in $block) {
        switch -Regex ($l) {
            '^\[FLTSIM\.\d+\]'  { "[FLTSIM.$index]"; break }
            '^title\s*='        { "title = `"$title`" ; Variation name"; break }
            '^model\s*='        { "model = `"$model`" ; model folder"; break }
            '^panel\s*='        { "panel = `"$panel`" ; panel folder"; break }
            '^texture\s*='      { "texture = `"$texture`" ; texture folder"; break }
            '^ui_variation\s*=' { "ui_variation = `"$uiVariation`" ; e.g. World Air, IFR Panel"; break }
            '^description\s*='  { 'description = "Diagnostic control variation: see f27-g1000 README." ; Variation description.'; break }
            default             { $l }
        }
    }
    ,$out
}
$new = @()
$new += ,(New-Variation 2 'Fokker F27500 G1000 CTRL1 sem componentes'      'CTRL 1 - sem componentes XML (material A)'            'g1000n'  'G1000'   'it80')
$new += ,(New-Variation 3 'Fokker F27500 G1000 CTRL2 Material_Emissive_Code' 'CTRL 2 - Material_Emissive_Code (material B)'          'g1000m'  'G1000'   'it80')
$new += ,(New-Variation 4 'Fokker F27500 G1000 CTRL3 WT530 no PFD'          'CTRL 3 - WT530 no slot do PFD, MFD G1000 (material B)' 'g1000bn' 'G1000t1' 'it80')
$new += ,(New-Variation 5 'Fokker F27500 G1000 CTRL4 GPS530 do autor'       'CTRL 4 - GPS530 do autor (mecanismo original)'        ''        'GPS'     'it80gps')
$all = @($lines) + @('')
foreach ($b in $new) { $all += @($b) + @('', '') }
[System.IO.File]::WriteAllLines("$sim\aircraft.cfg", $all, $utf8)

"done. variations: " + (($all | Select-String '^\[FLTSIM\.\d+\]').Count)
