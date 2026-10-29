# Offline consistency checks on the BUILT package (f27-g1000\out\Packages\bgt-f27500-modernized). These catch broken references
# before the simulator has to; they do not replace loading the aircraft in the sim.
#
# Usage: powershell -ExecutionPolicy Bypass -File C:\Projetos\f27-g1000\verify-package.ps1 [-Source]
#   -Source checks PackageSources\bgt-f27500-modernized instead of the built package (no manifest/layout checks); useful while the
#   package tool cannot run (it did not run while the simulator was open).
param([switch]$Source)
$ErrorActionPreference = 'Stop'
$root = if ($Source) { 'C:\Projetos\f27-g1000\PackageSources\bgt-f27500-modernized' } else { 'C:\Projetos\f27-g1000\out\Packages\bgt-f27500-modernized' }
$sim  = "$root\SimObjects\Airplanes\Bgt_F27500v2_Modernized"
$fail = 0
function Check([string]$what, [bool]$ok, [string]$detail = '') {
    if ($ok) { "  ok   $what" } else { "  FAIL $what $detail"; $script:fail++ }
}

if (-not $Source) {
    "manifest / layout"
    $manifest = Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json
    Check 'manifest has non-empty package_order_hint' ([bool]$manifest.package_order_hint)
    $layout = Get-Content "$root\layout.json" -Raw | ConvertFrom-Json
    $files = Get-ChildItem $root -Recurse -File | Where-Object { $_.Name -notin 'layout.json', 'manifest.json' }
    Check "layout lists every file ($($layout.content.Count) entries / $($files.Count) files)" ($layout.content.Count -eq $files.Count)
}

"aircraft.cfg variations"
$cfg = Get-Content "$sim\aircraft.cfg"
$cur = $null; $v = @{}
foreach ($l in $cfg) {
    if ($l -match '^\[FLTSIM\.(\d+)\]') { $cur = $Matches[1]; $v[$cur] = @{} }
    elseif ($cur -ne $null -and $l -match '^(model|panel|texture|sound)\s*=\s*"([^"]*)"') { $v[$cur][$Matches[1]] = $Matches[2] }
}
$titles = @($cfg | Where-Object { $_ -match '^title\s*=' })
Check 'variation titles are unique' (($titles | Group-Object | Where-Object { $_.Count -gt 1 }).Count -eq 0)
foreach ($k in $v.Keys | Sort-Object { [int]$_ }) {
    $e = $v[$k]
    $suffix = { param($n) if ($e[$n]) { ".$($e[$n])" } else { '' } }
    Check "FLTSIM.$k model folder"   (Test-Path ("$sim\model" + (& $suffix 'model')))
    Check "FLTSIM.$k panel folder"   (Test-Path ("$sim\panel" + (& $suffix 'panel')))
    Check "FLTSIM.$k texture folder" (Test-Path ("$sim\texture" + (& $suffix 'texture')))
}
# v11.1: no livery is baked into the build any more (Add-Liveries.ps1 writes them on each machine). A variation whose texture folder takes
# its paint from ANOTHER package's SimObject that is not the base aircraft is a third-party livery: it must not be in a build to publish.
$foreign = @()
foreach ($k in $v.Keys) {
    $tex = $v[$k].texture
    if (-not $tex) { continue }
    $first = Get-Content "$sim\texture.$tex\texture.cfg" -ErrorAction SilentlyContinue | Where-Object { $_ -match '^fallback\.1\s*=' } | Select-Object -First 1
    if ($first -and $first.Split('=', 2)[1].Trim() -match '^\.\.\\\.\.\\([^\\]+)\\' -and $Matches[1] -ne 'Bgt_F27500v2') { $foreign += "FLTSIM.$k ($tex)" }
}
Check 'no third-party livery variation in the build (Add-Liveries.ps1 adds them on each machine)' ($foreign.Count -eq 0) ($foreign -join ', ')

"model folders -> interior xml -> gltf -> bin"
foreach ($m in Get-ChildItem $sim -Directory -Filter 'model*') {
    $mcfg = Get-ChildItem $m.FullName -Filter 'model.cfg' | Select-Object -First 1
    if (-not $mcfg) { Check "$($m.Name) has model.CFG" $false; continue }
    foreach ($l in Get-Content $mcfg.FullName) {
        if ($l -match '^(interior|exterior|normal)\s*=\s*(\S+)') {
            $xml = Join-Path $m.FullName $Matches[2]
            Check "$($m.Name): $($Matches[1]) xml exists ($($Matches[2]))" (Test-Path $xml)
            if (Test-Path $xml) {
                $lod = Select-String -Path $xml -Pattern 'ModelFile="([^"]+)"' | Select-Object -First 1
                if ($lod) {
                    $g = Join-Path (Split-Path $xml) $lod.Matches[0].Groups[1].Value
                    Check "$($m.Name): gltf exists ($($lod.Matches[0].Groups[1].Value))" (Test-Path $g)
                    if (Test-Path $g) {
                        $gj = Get-Content $g -Raw | ConvertFrom-Json
                        Check "$($m.Name): buffer file exists" (Test-Path (Join-Path (Split-Path $g) $gj.buffers[0].uri))
                        $names = $gj.nodes | ForEach-Object { $_.name }
                        Check "$($m.Name): node names unique" (($names | Group-Object | Where-Object { $_.Count -gt 1 }).Count -eq 0)
                    }
                }
                $inc = Select-String -Path $xml -Pattern 'IncludeBase RelativeFile="([^"]+)"' | Select-Object -First 1
                if ($inc) { Check "$($m.Name): IncludeBase target exists" (Test-Path (Join-Path (Split-Path $xml) $inc.Matches[0].Groups[1].Value)) }
            }
        }
    }
}

"panel folders -> wasm / html gauges / textures"
foreach ($p in Get-ChildItem $sim -Directory -Filter 'panel*') {
    $pcfg = Join-Path $p.FullName 'panel.cfg'
    if (-not (Test-Path $pcfg)) { Check "$($p.Name) has panel.cfg" $false; continue }
    foreach ($l in Get-Content $pcfg) {
        if ($l -match 'wasm_module=([^&]+)&') { Check "$($p.Name): wasm $($Matches[1])" (Test-Path "$root\$($Matches[1])") }
        if ($l -match '^\s*htmlgauge\d+\s*=\s*([^,?]+\.html)') {
            $rel = $Matches[1]
            if ($rel -notmatch '^WasmInstrument') {
                $native = $rel -match '^NavSystems/GPS/'
                if ($native) { "  --   $($p.Name): $rel is a simulator-native instrument (not in this package, not checked)" }
                else { Check "$($p.Name): html gauge $rel" (Test-Path "$root\html_ui\Pages\VCockpit\Instruments\$($rel -replace '/', '\')") }
            }
        }
    }
    $pxml = Join-Path $p.FullName 'panel.xml'
    if (Test-Path $pxml) {
        try {
            $doc = [xml](Get-Content $pxml -Raw -Encoding UTF8); Check "$($p.Name): panel.xml is well-formed" $true
            $ed = $doc.SelectSingleNode('//EngineDisplay')
            if ($ed) {
                # tags the G1000's XMLGaugeConfigFactory (sdk XMLGaugeAdapter.ts) actually reads
                $allowed = 'EnginePage','LeanPage','SystemPage','Gauge','Text','Left','Center','Right','Content','Color','ColumnGroup','Column','Type','Title','Unit',
                           'Minimum','Maximum','Value','Value2','ColorZone','ColorLine','Begin','End','Position','ReferenceBug','DisplayLogic','Style','SizePercent',
                           'Margins','Top','Bottom','ForceTextColor','TextIncrement','BeginAngle','EndAngle','CursorType','ValuePos','ValuePrecision','CursorColor',
                           'Width','ReverseY','PointerStyle','Height','ShowRedline','ShowPeak','Columns','Rows','TempOrder','GraduationLength','BeginText','EndText',
                           'CursorText','CursorText2','ID','RedBlink','SmoothFactor','Function'
                $types = 'Circular','Horizontal','DoubleHorizontal','Vertical','DoubleVertical','Cylinder','TwinCylinder'
                $unknown = @($ed.SelectNodes('.//*') | Where-Object { $_.Name -notin $allowed } | ForEach-Object { $_.Name } | Sort-Object -Unique)
                Check "$($p.Name): EngineDisplay uses only tags the G1000 parser reads" ($unknown.Count -eq 0) ($unknown -join ',')
                $gauges = @($ed.SelectNodes('.//Gauge'))
                Check "$($p.Name): EngineDisplay has gauges ($($gauges.Count))" ($gauges.Count -gt 0)
                foreach ($g in $gauges) {
                    $t = $g.SelectSingleNode('Type').InnerText
                    $label = "$($p.Name): gauge $($g.SelectSingleNode('Title').InnerText)"
                    Check "$label type '$t' is supported" ($t -in $types)
                    Check "$label has Minimum/Maximum/Value" (($g.SelectSingleNode('Minimum') -ne $null) -and ($g.SelectSingleNode('Maximum') -ne $null) -and ($g.SelectSingleNode('Value') -ne $null))
                    if ($t -like 'Double*') { Check "$label has Value2" ($g.SelectSingleNode('Value2') -ne $null) }
                    foreach ($ve in @($g.SelectNodes('Value | Value2 | Minimum | Maximum'))) {
                        $s = $ve.InnerText
                        Check "$label $($ve.Name) parentheses balanced" (($s.ToCharArray() | Where-Object { $_ -eq '(' }).Count -eq ($s.ToCharArray() | Where-Object { $_ -eq ')' }).Count)
                    }
                }
            }
        } catch { Check "$($p.Name): panel.xml is well-formed" $false $_.Exception.Message }
    }
}
# v10.11 (user: "Não é G1000, podia mudar isso"): the package and SimObject say Modernized and nothing of phase 1's G1000 NXi is left
"no G1000 NXi"
$g1000Left = @('model.g1000', 'panel.G1000', 'panel' | Where-Object { Test-Path "$sim\$_" }) + @(Get-ChildItem "$sim\model" -Filter '*_g1000*' | ForEach-Object { $_.Name }) +
    @('html_ui\Pages\VCockpit\Instruments\NavSystems\F27G1000', 'wasm\WASM_F27G1000base.wasm' | Where-Object { Test-Path "$root\$_" }) + @($cfg | Where-Object { $_ -match 'G1000' })
Check "no G1000 variation, model, panel, instrument or module, and no unused author panel folder" ($g1000Left.Count -eq 0) ($g1000Left -join ', ')
Check 'package and SimObject named Modernized' (((Split-Path $root -Leaf) -eq 'bgt-f27500-modernized') -and (Test-Path "$root\SimObjects\Airplanes\Bgt_F27500v2_Modernized\aircraft.cfg"))

"WT21 variation"
if (Test-Path "$sim\panel.WT21") {
    foreach ($f in 'PFD\PFD.js', 'PFD\WT21_PFD.html', 'MFD\MFD.js', 'MFD\WT21_MFD.html', 'FMC\FMC.js', 'FMC\WT21_FMC.html', 'Libraries\msfssdk.js', 'Libraries\wtlinesdk.js', 'Libraries\wt21shared.js', 'Libraries\wt21shared.css', 'Plugins\F27MfdPlugin.js') {
        Check "WT21 $f" (Test-Path "$root\html_ui\Pages\VCockpit\Instruments\F27WT21\$f")
    }
    $staleWt = Get-ChildItem "$root\html_ui\Pages\VCockpit\Instruments\F27WT21" -Recurse -File | Select-String -Pattern 'WT21v2' -SimpleMatch -List
    Check 'no leftover WT21v2 path' (($staleWt | Measure-Object).Count -eq 0)
    $pluginText = Get-Content "$root\html_ui\Pages\VCockpit\Instruments\F27WT21\Plugins\F27MfdPlugin.js" -Raw
    Check 'plugin registers itself and renders the EIS' (($pluginText -match 'registerPlugin') -and ($pluginText -match 'renderEis'))
    Check 'plugin script is ASCII only' (-not ($pluginText -match '[^\x00-\x7F]'))
    # v10.6: the engine band in the F27 gauges' own variables (torque psi, rpm, TGT) and coloured by the Dart's limits from the manual
    Check "plugin's EIS reads the author's torque / rpm / TGT and the Dart's limits" (($pluginText -match 'f275_xengtorq_') -and ($pluginText -match 'f275_RpmF27_0') -and ($pluginText -match 'f275_dart_egt_0') -and ($pluginText -match 'tgtBands'))
    # v10.9: the GPS 530 housing is switched with the cockpit, so the plugin no longer holds the author's L:GPS_isVisible at 0
    Check "plugin leaves the author's L:GPS_isVisible alone (the Classic cockpit needs it)" ($pluginText -notmatch "SetSimVarValue\('L:GPS_isVisible'")

    $layout = Get-Content 'C:\Projetos\f27-g1000\tools\wt21-layout.json' -Raw | ConvertFrom-Json
    $wtGltf = "$sim\model\F27500v2bgt_INTERIOR_wt21.gltf"
    Check 'WT21 interior gltf exists' (Test-Path $wtGltf)
    $wtNodeNames = @()
    if (Test-Path $wtGltf) {
        $wj = Get-Content $wtGltf -Raw | ConvertFrom-Json
        $wm = $wj.materials | ForEach-Object { $_.name }
        $wtNodeNames = @($wj.nodes | ForEach-Object { $_.name })
        # the layout's screens (WT21 pages, v10.2 also the tablet), not the author's own $gaugesF27x textures kept in the same panel.cfg
        $unitMaterials = @($layout.units | ForEach-Object { $_.material })
        $wtTextures = @(Select-String -Path "$sim\panel.WT21\panel.cfg" -Pattern '^texture=(\$gauges\w+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Where-Object { $unitMaterials -contains $_ })
        Check "WT21 panel uses one texture per screen ($($wtTextures.Count) of $(@($layout.units).Count))" ($wtTextures.Count -eq @($layout.units).Count)
        foreach ($t in $wtTextures) { Check "WT21 gltf: material $t" ($wm -contains $t) }
        $pm = $wj.materials | Where-Object { $_.name -eq $layout.plateMaterial } | Select-Object -First 1
        Check "WT21 gltf: plate material $($layout.plateMaterial) is textured" ($pm -and $pm.pbrMetallicRoughness.baseColorTexture -ne $null)
        if ($pm) {
            $src = $wj.textures[[int]$pm.pbrMetallicRoughness.baseColorTexture.index].extensions.MSFT_texture_dds.source
            Check "WT21 gltf: plate texture is $($layout.plateTexture)" ($wj.images[[int]$src].uri -eq $layout.plateTexture)
        }
        Check "plate texture file in texture.common" ((Test-Path "$sim\texture.common\$($layout.plateTexture)") -and (Test-Path "$sim\texture.common\$($layout.plateTexture).json"))
        foreach ($u in $layout.units) {
            Check "WT21 gltf: screen node $($u.node)" ($wtNodeNames -contains $u.node)
            $plateName = $u.node.Replace('_screen', '_plate')
            if ($u.frame -or $u.tablet) {
                Check "WT21 gltf: 3D unit node WT21_$($u.id)_hw (insert + frame)" ($wtNodeNames -contains "WT21_$($u.id)_hw")
                $pairs = @(, @($u.node, $u.screen.size, ($(if ($u.screenZ) { $u.screenZ } else { $layout.screenZ }))))
            } else {
                Check "WT21 gltf: plate node $plateName" ($wtNodeNames -contains $plateName)
                $pairs = @(@($u.node, $u.screen.size, ($(if ($u.screenZ) { $u.screenZ } else { $layout.screenZ }))), @($plateName, $u.plate.size, ($(if ($u.plateZ) { $u.plateZ } else { $layout.plateZ }))))
            }
            foreach ($pair in $pairs) {
                $nd = $wj.nodes | Where-Object { $_.name -eq $pair[0] } | Select-Object -First 1
                if ($nd) {
                    if ($nd.scale) { $w = [double]$nd.scale[0] * 0.10888692736625671; $h = [double]$nd.scale[1] * 0.07962357997894287 }
                    else {   # v9.1: exact-size generated quad, read its size from the POSITION bounds
                        $pa = $wj.accessors[[int]$wj.meshes[[int]$nd.mesh].primitives[0].attributes.POSITION]
                        $w = [double]$pa.max[0] - [double]$pa.min[0]; $h = [double]$pa.max[1] - [double]$pa.min[1]
                    }
                    $okDepth = $u.mount -or ([math]::Abs([double]$nd.translation[2] - [double]$pair[2]) -lt 0.00001)   # a mounted unit is turned as a whole
                    Check "WT21 gltf: $($pair[0]) quad size and depth" (([math]::Abs($w - [double]$pair[1][0]) -lt 0.0005) -and ([math]::Abs($h - [double]$pair[1][1]) -lt 0.0005) -and $okDepth)
                }
            }
            if ($u.mount -and $u.tablet) {
                # v10.3: a tablet's nodes (screen, body, bezel strips) hang on its arm's joint, all with the mount's rotation; the body sits
                # on mount.origin once the joint and the swing (at the wall base) are added back
                $ji = [array]::IndexOf($wtNodeNames, "F27_WT21_$($u.id)_joint"); $si = [array]::IndexOf($wtNodeNames, "F27_WT21_$($u.id)_swing")
                $kids = @(if ($ji -ge 0) { $wj.nodes[$ji].children | ForEach-Object { $wj.nodes[[int]$_] } })
                $kidNames = @($kids | ForEach-Object { $_.name })
                $hwN = $kids | Where-Object { $_.name -eq "WT21_$($u.id)_hw" } | Select-Object -First 1
                $sameRot = [bool]($hwN -and $hwN.rotation)
                if ($sameRot) {
                    foreach ($kn in $kids) {
                        if (-not $kn.rotation) { $sameRot = $false; continue }
                        for ($k = 0; $k -lt 4; $k++) { if ([math]::Abs([double]$kn.rotation[$k] - [double]$hwN.rotation[$k]) -gt 1e-9) { $sameRot = $false } }
                    }
                }
                $atOrigin = $false
                if ($hwN -and $si -ge 0) {
                    $p = @(0..2 | ForEach-Object { [double]$wj.nodes[$si].translation[$_] + [double]$wj.nodes[$ji].translation[$_] + [double]$hwN.translation[$_] })
                    $atOrigin = (@(0..2 | Where-Object { [math]::Abs($p[$_] - [double]$u.mount.origin[$_]) -gt 1e-5 }).Count -eq 0)
                }
                $okTree = ($si -ge 0) -and (@($wj.scenes[0].nodes) -contains $si) -and (@($wj.nodes[$si].children) -contains $ji) -and ($kidNames -contains $u.node) -and (@($kidNames | Where-Object { $_ -like "F27WT21_$($u.id)_EDGE_*" }).Count -eq 4)
                Check "WT21 $($u.id): tablet on its folding arm (swing -> joint -> screen, body, 4 bezel strips; same rotation; body on the mount point)" ($okTree -and $sameRot -and $atOrigin)
            } elseif ($u.mount) {
                # every node of a mounted unit carries the same rotation, and the body (whose origin is the pivot) sits on mount.origin
                # (top-level nodes only: v10's key lamps are children of their caps and turn with them; v10.9: ours hang on the
                # Modernized cockpit's carrier F27SW_modern, which is a scene root)
                $modernCarrier = $wj.nodes | Where-Object { $_.name -eq 'F27SW_modern' } | Select-Object -First 1
                $roots = @(@($wj.scenes[0].nodes) + @($modernCarrier.children) | Where-Object { $_ -ne $null } | ForEach-Object { $wj.nodes[[int]$_] })
                $own = @($roots | Where-Object { $_.name -eq $u.node -or $_.name -like "WT21_$($u.id)_*" -or $_.name -like "F27WT21_$($u.id)_*" })
                $q0 = $own[0].rotation
                $sameRot = [bool]$q0
                foreach ($nn in $own) {
                    if (-not $nn.rotation) { $sameRot = $false; continue }
                    for ($k = 0; $k -lt 4; $k++) { if ([math]::Abs([double]$nn.rotation[$k] - [double]$q0[$k]) -gt 1e-9) { $sameRot = $false } }
                }
                $hwN = $wj.nodes | Where-Object { $_.name -eq "WT21_$($u.id)_hw" } | Select-Object -First 1
                $atOrigin = $hwN -and ((0..2 | Where-Object { [math]::Abs([double]$hwN.translation[$_] - [double]$u.mount.origin[$_]) -gt 1e-6 }).Count -eq 0)
                $minOwn = $(if ($u.controls) { 4 } else { 2 })   # a unit without controls (the tablet) is its screen and its body
                Check "WT21 $($u.id): mounted as one piece ($($own.Count) nodes, same rotation, body on the mount point)" ($sameRot -and $atOrigin -and $own.Count -ge $minOwn)
            }
            $sz = [double]$(if ($u.screenZ) { $u.screenZ } else { $layout.screenZ }); $pz = [double]$(if ($u.plateZ) { $u.plateZ } else { $layout.plateZ })
            Check "WT21 layout: $($u.id) screen is in front of its plate" ($sz -lt $pz)
            Check "WT21 layout: $($u.id) screen texture is in panel.cfg" ($wtTextures -contains $u.material)
        }
    }
    $wtXmlText = Get-Content "$sim\model\F27500v2bgt_INTERIOR_wt21.xml" -Raw
    $wtDoc = [xml]$wtXmlText
    $screenNodes = @($layout.units | ForEach-Object { $_.node })
    $emissive = @($wtDoc.SelectNodes('//Component[UseTemplate/@Name="ASOBO_GT_Material_Emissive_Code"]') | Where-Object { $screenNodes -contains $_.Node })
    Check "WT21 interior xml has one Material_Emissive_Code component per screen ($($emissive.Count))" ($emissive.Count -eq @($layout.units).Count)
    foreach ($c in @($wtDoc.SelectNodes('//Component[UseTemplate/@Name="ASOBO_GT_Material_Emissive_Code"]'))) { Check "WT21 emissive component targets an existing node ($($c.Node))" ($wtNodeNames -contains $c.Node) }
    # each screen quad has its page's shape (v8.2: a 4:3 landscape page/quad stretched the WT21's 768x1024 portrait layout sideways)
    $wtCfg = Get-Content "$sim\panel.WT21\panel.cfg" -Raw
    # v9.3: WT21 runs the copy of the author's systems WASM without the TAPIR autopilot mode handling (it fought the WT21 autopilot)
    $wasmRefs = @([regex]::Matches($wtCfg, 'wasm_module=wasm/([^&]+)&') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    Check "WT21 panel.cfg loads only the WT21 systems WASM copy ($($wasmRefs -join ','))" (($wasmRefs.Count -eq 1) -and ($wasmRefs[0] -eq 'WASM_F27WT21.wasm') -and (Test-Path "$root\wasm\WASM_F27WT21.wasm"))
    if (Test-Path "$root\wasm\WASM_F27WT21.wasm") {
        $chk = python 'C:\Projetos\f27-g1000\tools\patch-wasm-wt21.py' 'C:\Projetos\bgt-f27500-v2\wasm\WASM_F27500bgtv2.wasm' "$root\wasm\WASM_F27WT21.wasm" --check
        Check "WT21 WASM copy is exactly the patch of the author's module: TAPIR modes off, stairs no longer tied to the GPU ($chk)" ($LASTEXITCODE -eq 0)
    }
    $wasmFiles = @(Get-ChildItem "$root\wasm" -File | ForEach-Object { $_.Name } | Sort-Object)
    Check "wasm folder holds only the patched copies of the author's module ($($wasmFiles -join ','))" (@($wasmFiles | Where-Object { $_ -notin 'WASM_F27WT21.wasm', 'WASM_F27Classic.wasm' }).Count -eq 0)
    foreach ($u in $layout.units) {
        $pw = [double]$u.page[0]; $ph = [double]$u.page[1]
        Check ("WT21 $($u.id): screen shape matches its {0}x{1} page" -f $pw, $ph) ([math]::Abs(([double]$u.screen.size[0] / [double]$u.screen.size[1]) / ($pw / $ph) - 1) -lt 0.01)
        $sec = [regex]::Match($wtCfg, "\[Vcockpit$('{0:D2}' -f [int]$u.vcockpit)\][^\[]*").Value
        Check "WT21 $($u.id): panel.cfg page is $($pw)x$($ph)" (($sec -match "pixel_size=$pw,$ph") -and ($sec -match "size_mm=$pw,$ph") -and ($sec -match ", 0,0,$pw,$ph"))
    }
    # v10.9: one cockpit with both faces, L:F27_COCKPIT_CLASSIC (tablet Settings): the author's parts the WT21 cockpit replaces hang under
    # carriers F27SW_classic*, ours under F27SW_modern (tools\make-cockpit-switch.mjs). $hide = what the Modernized cockpit carries away.
    $parentOf = @{}
    for ($i = 0; $i -lt $wj.nodes.Count; $i++) { foreach ($c in @($wj.nodes[$i].children | Where-Object { $_ -ne $null })) { $parentOf[[int]$c] = $i } }
    $hide = @(for ($i = 0; $i -lt $wj.nodes.Count; $i++) {
        $p = $i; $onClassic = $false
        while ($parentOf.ContainsKey($p)) { $p = $parentOf[$p]; if ($wj.nodes[$p].name -like 'F27SW_classic*') { $onClassic = $true; break } }
        if ($onClassic) { [pscustomobject]@{ Node = $wj.nodes[$i].name } }
    })
    Check "WT21 interior: the author's parts the WT21 cockpit replaces hang on the Classic carriers ($($hide.Count) nodes)" ($hide.Count -gt 100)
    $sw = node 'C:\Projetos\f27-g1000\tools\panelmap\check_switch.mjs' $wtGltf "$sim\model\F27500v2bgt_INTERIOR.gltf" 'C:\Projetos\f27-g1000\tools\wt21-layout.json' | ConvertFrom-Json
    Check ("cockpit switch posed at both ends: Classic {0} author's nodes home only at frame 100, Modernized {1} of ours home only at frame 0, {2} moved groups home at full size in Classic, the tablet in both" -f $sw.classicNodes, $sw.modernNodes, $sw.movers) $sw.ok ($sw.problems -join ' | ')
    $classicVar = '(L:F27_COCKPIT_CLASSIC, Bool)'
    $swComps = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.ID -like 'F27CockpitSwitch*' })
    foreach ($cn in @($wj.nodes | Where-Object { $_.name -like 'F27SW_*' -or ($_.name -like 'F27_WT21_move_*' -and $_.name -notlike '*_box_*') })) {
        # v10.9.1: no visibility code on a carrier (test 15: a parent's visibility overrides its children's, every FCP lamp showed lit)
        $comp = @($swComps | Where-Object { $_.Node -eq $cn.name })
        $okC = ($comp.Count -eq 1) -and (@($wj.animations | Where-Object { $_.name -eq $cn.name }).Count -eq 1)
        if ($okC) {
            $okC = ($comp[0].SelectSingleNode('.//ANIM_NAME').InnerText -eq $cn.name) -and ($comp[0].SelectSingleNode('.//ANIM_CODE').InnerText -eq "$classicVar 100 *") -and
                -not $comp[0].SelectSingleNode('.//VISIBILITY_CODE')
        }
        Check "cockpit switch: $($cn.name) played by L:F27_COCKPIT_CLASSIC, no visibility code" $okC
    }
    $missing = @($hide | Where-Object { $wtNodeNames -notcontains $_.Node } | ForEach-Object { $_.Node })
    Check 'every hidden node exists in the gltf' ($missing.Count -eq 0) ($missing -join ',')
    $ids = @($wtDoc.SelectNodes('//Component') | ForEach-Object { $_.ID })
    Check 'WT21 component ids are unique' ((@($ids | Group-Object | Where-Object { $_.Count -gt 1 })).Count -eq 0)
    $new = @($layout.units | ForEach-Object { $_.node })
    Check 'no screen node is hidden' (@($hide | Where-Object { $new -contains $_.Node }).Count -eq 0)
    foreach ($m in @($layout.move)) {
        if (-not $m) { continue }
        $movedHidden = @($hide | Where-Object { $n = $_.Node; @($m.nodes | Where-Object { $n.StartsWith($_) }).Count -gt 0 } | ForEach-Object { $_.Node })
        Check "moved instrument '$($m.id)' is not hidden" ($movedHidden.Count -eq 0) ($movedHidden -join ',')
        # each moved group hangs under a carrier node whose transform is the move (see make-g1000-interior.mjs)
        $carrier = $wj.nodes | Where-Object { $_.name -eq "F27_WT21_move_$($m.id)" } | Select-Object -First 1
        Check "moved instrument '$($m.id)': carrier node exists" ($carrier -ne $null)
        if ($carrier) {
            $s = [double]$m.scale; $sz = [double]$(if ($m.scaleZ) { $m.scaleZ } else { $m.scale })
            $okT = ([math]::Abs([double]$carrier.translation[0] - ([double]$m.to[0] - $s * [double]$m.from[0])) -lt 1e-6) -and ([math]::Abs([double]$carrier.translation[1] - ([double]$m.to[1] - $s * [double]$m.from[1])) -lt 1e-6) -and ([math]::Abs([double]$carrier.scale[2] - $sz) -lt 1e-9)
            Check "moved instrument '$($m.id)': carrier transform matches the layout" $okT
            $kids = @($carrier.children | ForEach-Object { $wj.nodes[[int]$_].name })
            $allPrefixed = @($kids | Where-Object { $k = $_; @($m.nodes | Where-Object { $k.StartsWith($_) }).Count -eq 0 }).Count -eq 0
            Check "moved instrument '$($m.id)': carrier holds $($kids.Count) of its nodes" ($kids.Count -gt 0 -and $allPrefixed)
            $sceneRoots = @($wj.scenes[0].nodes | ForEach-Object { [int]$_ })
            $carrierIndex = [array]::IndexOf(@($wj.nodes | ForEach-Object { $_.name }), $carrier.name)
            Check "moved instrument '$($m.id)': carrier is a scene root and its children are not" (($sceneRoots -contains $carrierIndex) -and (@($carrier.children | Where-Object { $sceneRoots -contains [int]$_ }).Count -eq 0))
        }
    }
    # controls: every control has a click zone with the Collision material and exactly one interaction component; textures exist
    $collision = [array]::IndexOf(@($wj.materials | ForEach-Object { $_.name }), 'Collision')
    $owners = @($layout.units | Where-Object { $_.controls } | ForEach-Object { @{ id = $_.id; set = $_.controls } }) + @($layout.panels | ForEach-Object { @{ id = $_.id; set = $_.controls } })
    $ctlComps = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.ID -like 'F27WT21Ctl_*' })
    $expected = 0
    foreach ($o in $owners) {
        $cs = $layout.controlSets.($o.set)
        $tex = $(if ($cs.style -eq '3d') { 'F27WT21_HW.PNG.DDS' } else { $cs.texture })
        Check "control texture $tex in texture.common" ((Test-Path "$sim\texture.common\$tex") -and (Test-Path "$sim\texture.common\$tex.json"))
        foreach ($c in $cs.controls) {
            $expected++
            $zn = "F27WT21_$($o.id)_$($c.name)"
            $zi = [array]::IndexOf($wtNodeNames, $zn)
            $okZone = $zi -ge 0 -and [int]$wj.meshes[[int]$wj.nodes[$zi].mesh].primitives[0].material -eq $collision
            $comp = @($ctlComps | Where-Object { $_.Node -eq $zn })
            if (-not ($okZone -and $comp.Count -eq 1)) { Check "control $($zn) - invisible zone + one interaction" $false }
        }
    }
    Check "controls: $expected click zones, each invisible (Collision) with one interaction ($($ctlComps.Count) components)" ($ctlComps.Count -eq $expected)
    foreach ($pnl in @($layout.panels)) { Check "3D module node WT21_$($pnl.id)_hw" ($wtNodeNames -contains "WT21_$($pnl.id)_hw") }
    # 3D hardware: own .bin (author's data + new meshes), new meshes in the author's vertex format, atlas material
    $binUri = $wj.buffers[0].uri
    Check "WT21 gltf uses its own buffer ($binUri)" (($binUri -eq 'F27500v2bgt_INTERIOR_wt21.bin') -and (Test-Path "$sim\model\$binUri") -and ((Get-Item "$sim\model\$binUri").Length -eq [long]$wj.buffers[0].byteLength))
    $hwNodes = @($wj.nodes | Where-Object { $_.name -like 'WT21_*_hw' })
    foreach ($hn in $hwNodes) {
        $prim = $wj.meshes[[int]$hn.mesh].primitives[0]
        $okFmt = ($prim.extras.ASOBO_primitive.VertexType -eq 'VTX') -and ($wj.accessors[[int]$prim.attributes.NORMAL].componentType -eq 5120) -and ($wj.accessors[[int]$prim.attributes.TEXCOORD_0].componentType -eq 5122) -and ($wj.materials[[int]$prim.material].name -eq 'F27_WT21_hw')
        Check "3D mesh $($hn.name): author's vertex format, hardware atlas material ($($prim.extras.ASOBO_primitive.PrimitiveCount) triangles)" $okFmt
    }
    # lit lamp bars: one node per key with a lamp expression, emissive atlas material, shown by that expression
    $lampMat = [array]::IndexOf(@($wj.materials | ForEach-Object { $_.name }), 'F27_WT21_lamp')
    Check 'lamp material F27_WT21_lamp emits the atlas' (($lampMat -ge 0) -and ($wj.materials[$lampMat].emissiveTexture -ne $null))
    foreach ($o in $owners) {
        foreach ($c in @($layout.controlSets.($o.set).controls | Where-Object { $_.lamp })) {
            $ln = "WT21_$($o.id)_lamp_$($c.name)"
            $li = [array]::IndexOf($wtNodeNames, $ln)
            $comp = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.Node -eq $ln })
            $okLamp = ($li -ge 0) -and ([int]$wj.meshes[[int]$wj.nodes[$li].mesh].primitives[0].material -eq $lampMat) -and ($comp.Count -eq 1) -and
                ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Visibility_Code"]/VISIBILITY_CODE').InnerText -eq $c.lamp) -and
                ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Material_Emissive_Code"]') -ne $null)
            Check "lamp $($ln): emissive bar shown by '$($c.lamp)'" $okLamp
        }
    }
    # v9.3: every knob turns: own node + a 5-key rotation animation of the same name + an ASOBO_GT_Anim_Code component on its position
    $animNames = @($wj.animations | ForEach-Object { $_.name })
    $knobBad = @()
    $knobN = 0
    foreach ($o in $owners) {
        foreach ($c in @($layout.controlSets.($o.set).controls | Where-Object { $_.type -eq 'knob' })) {
            $knobN++
            $kn = "WT21_$($o.id)_knob_$($c.name)"
            $ki = [array]::IndexOf($wtNodeNames, $kn)
            $an = @($wj.animations | Where-Object { $_.name -eq $kn })
            $okA = ($an.Count -eq 1) -and ([int]$an[0].channels[0].target.node -eq $ki) -and ($an[0].channels[0].target.path -eq 'rotation') -and ($wj.accessors[[int]$an[0].samplers[0].input].count -eq 5)
            $comp = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.Node -eq $kn })
            $okC = ($comp.Count -eq 1) -and ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Anim_Code"]/ANIM_NAME').InnerText -eq $kn)
            if (-not (($ki -ge 0) -and $okA -and $okC)) { $knobBad += $kn }
        }
    }
    Check "knobs turn: node + rotation animation + anim component each ($knobN knobs)" ($knobBad.Count -eq 0 -and $knobN -gt 0) ($knobBad -join ',')
    # v10.10 (user: "falta apertar/puxar como no CJ4", "não tem onde girar para selecionar essa velocidade"): the FCP's SPD knob (turn = the
    # FLC/IAS target, push = the speed now), the CRS knobs' push centres the course on the station, the MFD's MENU and DATA are one dual
    # knob whose push selects (the separate DATA knob is gone); knob events never take the keys' Push_ prefix (test 16)
    $ctlCode = { param($node, $tag) $cc = @($ctlComps | Where-Object { $_.Node -eq $node }); if ($cc.Count -eq 1) { "$($cc[0].SelectSingleNode("UseTemplate/$tag").InnerText)" } else { '' } }
    Check 'FCP SPD knob: turns the selected speed (AP_SPD_VAR_INC/DEC), its push takes the speed now (AP_SPD_VAR_SET)' (((& $ctlCode 'F27WT21_FCP_SPD' 'CLOCKWISE_CODE') -match '>K:AP_SPD_VAR_INC\)') -and ((& $ctlCode 'F27WT21_FCP_SPD' 'ANTICLOCKWISE_CODE') -match '>K:AP_SPD_VAR_DEC\)') -and ((& $ctlCode 'F27WT21_FCP_SPD' 'LEFT_SINGLE_CODE') -match 'AIRSPEED INDICATED.*>K:AP_SPD_VAR_SET\)'))
    Check 'FCP CRS knobs: push centres the course on the station (VORn_SET from the radial)' (((& $ctlCode 'F27WT21_FCP_CRS1' 'LEFT_SINGLE_CODE') -match 'NAV RADIAL:1.*>K:VOR1_SET\)') -and ((& $ctlCode 'F27WT21_FCP_CRS2' 'LEFT_SINGLE_CODE') -match 'NAV RADIAL:2.*>K:VOR2_SET\)'))
    $mfdSet = $layout.controlSets.(@($layout.units | Where-Object { $_.id -eq 'MFD1' })[0].controls).controls
    $mfdMenu = @($mfdSet | Where-Object { $_.name -eq 'MENU_ADV' }); $mfdData = @($mfdSet | Where-Object { $_.name -eq 'DATA' })
    $okDual = ($mfdMenu.Count -eq 1) -and ($mfdData.Count -eq 1) -and ($mfdMenu[0].concentric -eq 'outer') -and ($mfdData[0].concentric -eq 'inner') -and (($mfdMenu[0].rect -join ',') -eq ($mfdData[0].rect -join ',')) -and
        ((& $ctlCode 'F27WT21_MFD1_DATA' 'LEFT_SINGLE_CODE') -match '>H:Generic_Lwr_\d_DATA_PUSH\)') -and ((& $ctlCode 'F27WT21_MFD1_MENU_ADV' 'CLOCKWISE_CODE') -match '>H:Generic_Lwr_\d_MENU_ADV_INC\)')
    Check 'MFD: MENU (outer ring) and DATA (centre, push = select) are one dual knob' $okDual
    $knobPush = @($ctlComps | Where-Object { $_.SelectSingleNode('UseTemplate[@Name!="ASOBO_GT_Interaction_LeftSingle_Code"]') -and $_.InnerText -match '_Push_' } | ForEach-Object { $_.ID })
    Check 'knob events without the keys'' Push_ prefix' ($knobPush.Count -eq 0) ($knobPush -join ',')
    # v10 (test 12: "efeito nos botões do FMC ao clicar"): every key sinks when clicked: its cap is its own node with a translation
    # animation of the same name, an ASOBO_GT_Anim_Code component on the click time its zone stamps first, and its lamp bar as a child
    $keyBad = @()
    $keyN = 0
    foreach ($o in $owners) {
        foreach ($c in @($layout.controlSets.($o.set).controls | Where-Object { $_.type -eq 'key' })) {
            $keyN++
            $kn = "WT21_$($o.id)_key_$($c.name)"
            $stamp = "L:F27WT21_$($o.id)_$($c.name)_T"
            $ki = [array]::IndexOf($wtNodeNames, $kn)
            $an = @($wj.animations | Where-Object { $_.name -eq $kn })
            $okA = ($ki -ge 0) -and ($an.Count -eq 1) -and ([int]$an[0].channels[0].target.node -eq $ki) -and ($an[0].channels[0].target.path -eq 'translation')
            $comp = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.Node -eq $kn })
            $okC = ($comp.Count -eq 1) -and ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Anim_Code"]/ANIM_NAME').InnerText -eq $kn) -and
                ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Anim_Code"]/ANIM_CODE').InnerText -like "*($stamp, number)*")
            $zone = @($ctlComps | Where-Object { $_.Node -eq "F27WT21_$($o.id)_$($c.name)" })
            $okZ = ($zone.Count -eq 1) -and ($zone[0].SelectSingleNode('.//LEFT_SINGLE_CODE').InnerText.StartsWith("(E:SIMULATION TIME, second) (>$stamp, number) "))
            $okL = (-not $c.lamp) -or (($ki -ge 0) -and (@($wj.nodes[$ki].children | Where-Object { $wj.nodes[[int]$_].name -eq "WT21_$($o.id)_lamp_$($c.name)" }).Count -eq 1))
            if (-not ($okA -and $okC -and $okZ -and $okL)) { $keyBad += $kn }
        }
    }
    Check "keys sink when clicked: cap node + press animation + anim component + click stamp, lamp on the cap ($keyN keys)" ($keyBad.Count -eq 0 -and $keyN -gt 0) ($keyBad -join ',')
    $press = node 'C:\Projetos\f27-g1000\tools\check-key-press.mjs' "$sim\model\F27500v2bgt_INTERIOR_wt21.gltf" | ConvertFrom-Json
    Check ("key press travel {0}..{1} mm into each key's own panel, from the rest position ({2} animations)" -f $press.travelMm[0], $press.travelMm[1], $press.keys) (($press.keys -eq $keyN) -and (@($press.bad).Count -eq 0)) (@($press.bad) -join ',')
    # v9.3: the original servo-panel art copied next to its switches (face on the author's int_VC30_Front, nuts and light posts)
    foreach ($cp in @($layout.copies)) {
        if (-not $cp) { continue }
        if ($cp.type -eq 'face') {
            $fn = $wj.nodes | Where-Object { $_.name -eq "F27_WT21_copy_$($cp.id)" } | Select-Object -First 1
            $okF = $fn -and ($wj.materials[[int]$wj.meshes[[int]$fn.mesh].primitives[0].material].name -eq $cp.material)
            Check "copied art $($cp.id): face quad on $($cp.material)" $okF
        } else {
            foreach ($sn in $cp.nodes) {
                $cn = $wj.nodes | Where-Object { $_.name -eq "F27_WT21_copy_$($cp.id)_$sn" } | Select-Object -First 1
                Check "copied art $($cp.id): triangles of $sn" ($cn -and @($wj.meshes[[int]$cn.mesh].primitives).Count -gt 0)
            }
        }
    }
    # v10.9: the author's behaviours are included unchanged: the side not in use is carried 25 m away, out of the mouse's reach (test 8:
    # hidden CRS knobs took the FCP's clicks; until v10.8 a filtered copy without the hidden parts' interactions was included instead)
    Check "WT21 interior xml includes the author's behaviours unchanged (F27500v2bgt_INTERIOR.xml, no filtered copy left)" (($wtDoc.ModelInfo.Behaviors.IncludeBase.RelativeFile -eq 'F27500v2bgt_INTERIOR.xml') -and -not (Test-Path "$sim\model\F27500v2bgt_INTERIOR_wt21base.xml"))
    Check "the author's original interior xml is untouched" ((Get-FileHash "$sim\model\F27500v2bgt_INTERIOR.xml").Hash -eq (Get-FileHash 'C:\Projetos\bgt-f27500-v2\SimObjects\Airplanes\Bgt_F27500v2\model\F27500v2bgt_INTERIOR.xml').Hash)
    # the sim turns a non-uniform node scale into a uniform one (test 9: screens and click zones came out the wrong size)
    $added = @($wj.nodes | Where-Object { $_.name -match '^(WT21_|F27WT21_|F27_WT21_)' })
    $nonUni = @($added | Where-Object { $_.scale -and ((([double[]]$_.scale | Measure-Object -Maximum).Maximum / ([double[]]$_.scale | Measure-Object -Minimum).Minimum) -gt 1.001) } | ForEach-Object { $_.name })
    Check "no added node has a non-uniform scale ($($added.Count) nodes)" ($nonUni.Count -eq 0) ($nonUni -join ',')
    # the sim only draws the clockwise side (v8 test: counter-clockwise meshes showed only their back faces)
    $wind = node 'C:\Projetos\f27-g1000\tools\check-winding.mjs' "$sim\model\F27500v2bgt_INTERIOR_wt21.gltf" '^(WT21_|F27WT21_|F27_WT21_)' | ConvertFrom-Json
    Check ("author's meshes wound clockwise ({0:P1})" -f $wind.author) ($wind.author -gt 0.99)
    foreach ($hn in @($hwNodes) + @($wj.nodes | Where-Object { $_.name -like 'WT21_*_lamp_*' })) {
        $share = $wind.meshes.($hn.name)
        Check ("3D mesh $($hn.name): wound clockwise like the author's ({0:P1})" -f $share) ($share -gt 0.99)
    }
    $badWind = @($wind.meshes.PSObject.Properties | Where-Object { $_.Value -le 0.99 } | ForEach-Object { $_.Name })
    Check "every added mesh (screens, click zones, walls) wound clockwise ($(@($wind.meshes.PSObject.Properties).Count) meshes)" ($badWind.Count -eq 0) ($badWind -join ',')
    Check 'hardware atlas F27WT21_HW.PNG.DDS in texture.common' (Test-Path "$sim\texture.common\F27WT21_HW.PNG.DDS")
    $apStrips = @($hide | Where-Object { $_.Node -like 'x0_Pan_ApWarn_0*' } | ForEach-Object { $_.Node })
    Check "old autopilot annunciator strip hidden under the captain's DCP only ($($apStrips -join ','))" (($apStrips.Count -eq 1) -and ($apStrips[0] -like 'x0_Pan_ApWarn_01*'))
    $crsHidden = @($hide | Where-Object { $_.Node -like 'x0_CRS_*' }).Count
    Check "radio/CRS box hidden ($crsHidden nodes)" ($crsHidden -gt 0)
    # closed boxes: four walls behind every plate and panel, and around moved groups that ask for one; carriers keep a uniform scale
    $boxOwners = @($layout.units | Where-Object { -not $_.frame -and -not $_.tablet } | ForEach-Object { $_.node.Replace('_screen', '_plate') })   # 3D units/modules carry their own walls
    foreach ($bo in $boxOwners) {
        $walls = @('top', 'bottom', 'left', 'right' | Where-Object { $wtNodeNames -contains "$($bo)_wall_$_" })
        Check "box walls behind $bo ($($walls.Count) of 4)" ($walls.Count -eq 4)
    }
    foreach ($m in @($layout.move | Where-Object { $_.box })) {
        $walls = @('top', 'bottom', 'left', 'right' | Where-Object { $wtNodeNames -contains "F27_WT21_move_$($m.id)_box_$_" })
        Check "box walls around moved '$($m.id)' ($($walls.Count) of 4)" ($walls.Count -eq 4)
    }
    $nonUniform = @($wj.nodes | Where-Object { $_.name -like 'F27_WT21_move_*' -and $_.children -and $_.scale -and -not (($_.scale[0] -eq $_.scale[1]) -and ($_.scale[1] -eq $_.scale[2])) } | ForEach-Object { $_.name })
    Check 'move carriers use a uniform scale (a depth-only scale hid the horizon in test 6)' ($nonUniform.Count -eq 0) ($nonUniform -join ',')
    # v10.9: the GPS 530 housing goes with the Classic cockpit (until v10.8 the MFD plugin held L:GPS_isVisible at 0); the engine panel stays
    $gpsSwitched = @($hide | Where-Object { $_.Node -in 'x0_GPS_base01', 'x0_GPS_base02' }).Count
    Check 'GPS 530 housing switched with the Classic cockpit, engine panel plate in both' (($gpsSwitched -eq 2) -and (@($hide | Where-Object { $_.Node -eq 'x0_Pan_Eng' }).Count -eq 0))
    # v10: the copilot's flight instruments and the engine gauges are back (layout keepVisible), and so is the copilot's AP strip
    foreach ($kv in $layout.keepVisible.PSObject.Properties) {
        $back = @($hide | Where-Object { $n = $_.Node; @($kv.Value | Where-Object { $n.StartsWith($_) }).Count -gt 0 } | ForEach-Object { $_.Node })
        $exist = @($wtNodeNames | Where-Object { $n = $_; @($kv.Value | Where-Object { $n.StartsWith($_) }).Count -gt 0 }).Count
        Check "v10: $($kv.Name) visible again ($exist nodes, none hidden)" (($back.Count -eq 0) -and ($exist -gt 0)) ($back -join ',')
    }

    $wcfg = Get-Content "$sim\panel.WT21\panel.cfg" -Raw
    foreach ($u in $layout.units) {
        # standard texture: the page's own size, the page filling it
        $pw = [int]$u.page[0]; $ph = [int]$u.page[1]
        $sec = '[Vcockpit{0:D2}]' -f [int]$u.vcockpit
        $i = $wcfg.IndexOf($sec)
        Check "WT21 panel.cfg: $sec exists for $($u.id)" ($i -ge 0)
        if ($i -ge 0) {
            $body = $wcfg.Substring($i, [math]::Min(400, $wcfg.Length - $i))
            Check "WT21 panel.cfg: $sec texture $($u.material)" ($body -match [regex]::Escape("texture=$($u.material)"))
            Check "WT21 panel.cfg: $sec pixel_size $pw,$ph" ($body -match "pixel_size=$pw,$ph")
            Check "WT21 panel.cfg: $sec gauge fills the texture" ($body -match [regex]::Escape("htmlgauge00=$($u.gauge), 0,0,$pw,$ph"))
        }
    }
    $pxml = [xml](Get-Content "$sim\panel.WT21\panel.xml" -Raw)
    # v10.2: the tablet: a touchscreen (Collision tag on its screen material, an interactive instrument registered as f27-tablet), its
    # files next to its html, and its arm to the side wall
    foreach ($u in @($layout.units | Where-Object { $_.tablet })) {
        $tm = $wj.materials | Where-Object { $_.name -eq $u.material } | Select-Object -First 1
        Check "tablet $($u.id): screen material $($u.material) is a touch surface (Collision tag)" ($tm -and (@($tm.extensions.ASOBO_tags.tags) -contains 'Collision'))
        $tdir = "$root\html_ui\Pages\VCockpit\Instruments\F27WT21\Tablet"
        $missingT = @('F27Tablet.html', 'F27Tablet.css', 'F27Tablet.js', 'DejaVuSans-SemiBold.ttf' | Where-Object { -not (Test-Path "$tdir\$_") })
        Check "tablet $($u.id): instrument files in F27WT21\Tablet" ($missingT.Count -eq 0) ($missingT -join ',')
        if (Test-Path "$tdir\F27Tablet.js") {
            $tjs = Get-Content "$tdir\F27Tablet.js" -Raw
            Check "tablet $($u.id): F27Tablet.js registers the interactive f27-tablet instrument" (($tjs -match "registerInstrument\('f27-tablet'") -and ($tjs -match 'get isInteractive\(\) \{\s*return true;'))
            # v10.6: the Systems app (engines, fuel, electrical, air) and the engines' limits on the checklist's Limitations page
            Check "tablet $($u.id): Systems app and engine limitations in F27Tablet.js" (($tjs -match 'class SystemsPage') -and ($tjs -match 'readSystems') -and ($tjs -match 'ENGINE_LIMITATIONS'))
            # v10.9: Settings switches the cockpit (kept across flights, on the ground only), and in Classic the old TAPIR panel flies WT21
            Check "tablet $($u.id): Settings picks the cockpit (F27TAB_cockpit -> L:F27_COCKPIT_CLASSIC, on the ground only, both languages)" (($tjs -match "'F27TAB_cockpit'") -and ($tjs -match "'L:F27_COCKPIT_CLASSIC'") -and ($tjs -match 'groundWorkAllowed\(\)') -and ([regex]::Matches($tjs, 'cockpitGround:').Count -eq 2))
            Check "tablet $($u.id): the TAPIR layer reads the old panel and sends the WT21 autopilot its standard events" (($tjs -match 'class TapirBridge') -and ($tjs -match 'L:f275_Btn_AP_') -and ($tjs -match 'L:F275bgt_hdg_sel') -and ($tjs -match "'AP_NAV_SELECT_SET'") -and ($tjs -match "'AP_PITCH_REF_INC_UP'") -and ($tjs -match "'FLIGHT_LEVEL_CHANGE_ON'"))
            # v10.10 (user: "no tablet, ground, opção para fazer o pushback"): the author's own pushback (his WASM steers the tug from
            # L:f275_PushbackStraight/Left/Right), stopped with TUG_DISABLE; and (user: "um mapa na parte de cartas, também aparecer o avião
            # nas cartas") the Charts app's Bing map, and the aircraft on charts with a georeferenced area
            # v10.11 (test 17, "aparece Tug off, mas não tem botão pra chamar"): his WASM reads the arrows only in his pushback mode
            # (L:f275_PushbackToggle), so the tablet's Call tug turns it on; Stop turns it off
            # v10.11.1 (test 18, GSX): the sim's tug is called (TOGGLE_PUSHBACK) before his WASM steers it; with GSX running, GSX's menu
            Check "tablet $($u.id): Ground page hands the pushback to GSX when it runs (its menu, its departure state; both languages)" (($tjs -match "'L:FSDT_GSX_COUATL_STARTED'") -and ($tjs -match "'L:FSDT_GSX_MENU_OPEN'") -and ($tjs -match "'L:FSDT_GSX_DEPARTURE_STATE'") -and ([regex]::Matches($tjs, 'gsxMenu:').Count -eq 2))
            Check "tablet $($u.id): Ground page calls the author's tug in his pushback mode (call, tail left/right, stop; both languages)" (($tjs -match "'K:TOGGLE_PUSHBACK'") -and ($tjs -match "'L:f275_PushbackToggle'") -and ($tjs -match "'L:f275_PushbackStraight'") -and ($tjs -match "'L:f275_PushbackLeft'") -and ($tjs -match "'L:f275_PushbackRight'") -and ($tjs -match "'K:TUG_DISABLE'") -and ($tjs -match "'L:f275_PushHdg'") -and ([regex]::Matches($tjs, 'pushCall:').Count -eq 2) -and ([regex]::Matches($tjs, 'pushTailLeft:').Count -eq 2))
            # v10.11 (user: "ajustar também o F27 para 52 passageiros"): 13 rows of four; the chart says why no aircraft is drawn
            # v10.12 (user: "teria como colocar uma opção além de empurrar, puxar o avião?"): the tablet pulls the aircraft forward itself
            Check "tablet $($u.id): Pull mode drives the aircraft forward (VELOCITY BODY Z, ROTATION VELOCITY BODY Y; both languages)" (($tjs -match 'class PullTug') -and ($tjs -match "'VELOCITY BODY Z'") -and ($tjs -match "'ROTATION VELOCITY BODY Y'") -and ([regex]::Matches($tjs, 'pullStart:').Count -eq 2))
            Check "tablet $($u.id): cabin of 52 seats (13 rows of four)" ($tjs -match 'SEAT_ROWS = \[\s*(\[\d+, 4\],\s*){13}\]')
            Check "tablet $($u.id): chart header tells a page without georeference or with the aircraft outside it (both languages)" (([regex]::Matches($tjs, 'chNoGeo:').Count -eq 2) -and ([regex]::Matches($tjs, 'chOutside:').Count -eq 2))
            Check "tablet $($u.id): Charts app has the sim's Bing map (MapSystem, its own Bing id) and puts the aircraft on georeferenced charts" (($tjs -match "'f27-tablet-map'") -and ($tjs -match 'MapSystemBuilder') -and ($tjs -match 'setGeoProjectionFromChartArea') -and ($tjs -match 'geoReferenced') -and ([regex]::Matches($tjs, 'chMap:').Count -eq 2))
            Check "tablet $($u.id): F27Tablet.html loads the sim's Bing map script" ((Get-Content "$tdir\F27Tablet.html" -Raw) -match 'import-script="/JS/NetBingMap\.js"')
        }
        $tapirJs = 'C:\Projetos\f27-g1000\plugin-wt21\build\tablet\tapir.js'
        if (Test-Path $tapirJs) {
            $tp = node 'C:\Projetos\f27-g1000\tools\panelmap\check_tapir.mjs' $tapirJs | ConvertFrom-Json
            Check "TAPIR layer: $($tp.passed) offline scenarios (HDG, VIRAGE knob, VOR/APP on a localizer, glideslope, IAS both ways, ALT, pitch wheel)" $tp.ok ($tp.failed -join ' | ')
        }
        Check "tablet $($u.id): arm and wall base nodes" (($wtNodeNames -contains "F27_WT21_$($u.id)_arm") -and ($wtNodeNames -contains "F27_WT21_$($u.id)_arm_base"))
        # v10.3: the fold: two rotation animations played by L:F27TAB_Stowed, toggled by the four bezel strips (Collision), clear of the wall
        $okFold = $true
        foreach ($part in 'swing', 'joint') {
            $an = @($wj.animations | Where-Object { $_.name -eq "F27_WT21_$($u.id)_$part" })
            $comp = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.Node -eq "F27_WT21_$($u.id)_$part" })
            $okFold = $okFold -and ($an.Count -eq 1) -and ($an[0].channels[0].target.path -eq 'rotation') -and ($comp.Count -eq 1) -and
                ($comp[0].SelectSingleNode('UseTemplate[@Name="ASOBO_GT_Anim_Code"]/ANIM_CODE').InnerText -like '*L:F27TAB_Stowed*')
        }
        foreach ($side in 'T', 'B', 'L', 'R') {
            $zn = "F27WT21_$($u.id)_EDGE_$side"; $zi = [array]::IndexOf($wtNodeNames, $zn)
            $comp = @($wtDoc.SelectNodes('//Component') | Where-Object { $_.Node -eq $zn })
            $okFold = $okFold -and ($zi -ge 0) -and ([int]$wj.meshes[[int]$wj.nodes[$zi].mesh].primitives[0].material -eq $collision) -and ($comp.Count -eq 1) -and
                ($comp[0].SelectSingleNode('.//LEFT_SINGLE_CODE').InnerText -like '*>L:F27TAB_Stowed*')
        }
        Check "tablet $($u.id): folds away (swing + joint animations on L:F27TAB_Stowed, 4 bezel click strips)" $okFold
        $fold = node 'C:\Projetos\f27-g1000\tools\panelmap\check_tablet_fold.mjs' "$sim\model\F27500v2bgt_INTERIOR_wt21.gltf" $u.id 'C:\Projetos\f27-g1000\tools\wt21-layout.json' | ConvertFrom-Json
        Check ("tablet $($u.id): every fold pose clear of the side wall (closest {0} mm) and of the seat (x >= {1})" -f $fold.worstMarginMm, $fold.mostInboardX) (($fold.worstMarginMm -ge 20) -and ($fold.mostInboardX -ge 0.69))
    }
    # v10.3 (user: "os aviônicos novos estão ligados com a bateria desligada"): every screen is powered by the author's instrument circuit
    # v10.9: the WT21 PFD and MFD also need the Modernized cockpit; the FMC (it hosts the autopilot the Classic's TAPIR flies) only the circuit
    $elecOf = { param($name) $e = $pxml.SelectSingleNode("//Instrument[Name='$name']/Electric"); if ($e) { $e.InnerXml -replace '\s', '' } else { '' } }
    $circuit = '<Simvarname="CIRCUITON:17"unit="Bool"/>'
    $modernOnly = "<And>$circuit<Not><Simvarname=`"L:F27_COCKPIT_CLASSIC`"unit=`"Bool`"/></Not></And>"
    Check "screens on the author's instrument circuit (CIRCUIT ON:17): the PFD and MFD only in the Modernized cockpit, the FMC always" ((& $elecOf 'WT21_PFD_1') -eq $modernOnly -and (& $elecOf 'WT21_MFD_1') -eq $modernOnly -and (& $elecOf 'WT21_FMC_1') -eq $circuit)
    $pxmlIds = @($pxml.SelectNodes('//Instrument/Name') | ForEach-Object { $_.InnerText })
    Check "WT21 panel.xml instruments are PFD 1, MFD 1 and FMC 1 (v10: no PFD 2) ($($pxmlIds -join ','))" (($pxmlIds -join ',') -eq 'WT21_PFD_1,WT21_MFD_1,WT21_FMC_1')
    # v10 (test 12: "o YD não liga"): a yaw damper gain of 0 means no yaw damper to the sim
    $ydGain = [regex]::Match((Get-Content "$sim\systems.cfg" -Raw), '(?m)^yaw_damper_gain\s*=\s*([0-9.]+)')
    Check "systems.cfg has a working yaw damper (yaw_damper_gain = $($ydGain.Groups[1].Value))" ($ydGain.Success -and ([double]$ydGain.Groups[1].Value -gt 0))
    $pl = @($pxml.SelectNodes('//Instrument[Name="WT21_MFD_1"]/Plugin') | ForEach-Object { $_.InnerText })
    Check 'WT21_MFD_1 has the F27 plugin tag' ($pl.Count -eq 1 -and $pl[0] -eq 'coui://html_ui/Pages/VCockpit/Instruments/F27WT21/Plugins/F27MfdPlugin.js') ($pl -join ',')
    # v10.4 (user: wheel chocks, "assim as escadas sairiam ao remover os calços"): the WT21 variation's own exterior with chocks
    Check 'WT21 model.CFG uses its own exterior (F27500v2bgt_wt21.xml)' ((Get-Content "$sim\model.wt21\model.CFG" -Raw) -match 'normal=\.\.\\model\\F27500v2bgt_wt21\.xml')
    $exGltf = "$sim\model\F27500v2bgt_wt21.gltf"
    if (Test-Path $exGltf) {
        $ej = Get-Content $exGltf -Raw | ConvertFrom-Json
        $exNames = @($ej.nodes | ForEach-Object { $_.name })
        # v10.7 (user: "os calços não tão no solo"): parked, the gear stands at frame 100 of its 200-frame animations, struts fully out;
        # the chocks hang under each main gear's strut (it carries the axle, it does not spin) and the author's stairs come down to the
        # tyres' ground through a node of ours under x0_Services
        $okStrut = $true
        foreach ($pair in @(@('F27WT21_CHOCKS_L', 'x0_GEAR_LeftSupportV3'), @('F27WT21_CHOCKS_R', 'x0_GEAR_RightSupportV3'))) {
            $ci = [array]::IndexOf($exNames, $pair[0]); $si = [array]::IndexOf($exNames, $pair[1])
            $okStrut = $okStrut -and ($ci -ge 0) -and ($si -ge 0) -and (@($ej.nodes[$si].children) -contains $ci)
        }
        Check 'WT21 exterior: each main gear''s chocks under its strut (x0_GEAR_Left/RightSupportV3)' $okStrut
        $svi = [array]::IndexOf($exNames, 'x0_Services'); $dri = [array]::IndexOf($exNames, 'F27WT21_STAIRS_DROP')
        $stairKids = @(@($ej.nodes[$dri].children) | ForEach-Object { $exNames[$_] })
        Check 'WT21 exterior: the author''s stairs under F27WT21_STAIRS_DROP, under x0_Services' (($svi -ge 0) -and ($dri -ge 0) -and (@($ej.nodes[$svi].children) -contains $dri) -and ($stairKids -contains 'x0_STAIRS_Fwd') -and ($stairKids -contains 'x0_STAIRS_Aft'))
        $exDoc = [xml](Get-Content "$sim\model\F27500v2bgt_wt21.xml" -Raw)
        $lodFile = $exDoc.SelectSingleNode('//LOD').ModelFile
        $chockVis = @('F27WT21_CHOCKS_L', 'F27WT21_CHOCKS_R' | ForEach-Object { $exDoc.SelectSingleNode("//Component[@Node=""$_""]//VISIBILITY_CODE") } | Where-Object { $_ -and ($_.InnerText.Trim() -eq '(L:F27WT21_Chocks, Bool)') })
        $shockVis = $exDoc.SelectSingleNode('//Component[@Node="x0_SHOCKS"]//VISIBILITY_CODE')
        Check "WT21 exterior xml: its own glTF ($lodFile), both chock nodes on L:F27WT21_Chocks, the author's wooden chocks hidden" (($lodFile -eq 'F27500v2bgt_wt21.gltf') -and ($chockVis.Count -eq 2) -and $shockVis -and ($shockVis.InnerText.Trim() -eq '0'))
        Check 'WT21 exterior: chocks texture F27WT21_CHOCK.PNG.DDS (+ sidecar) in texture.common' ((Test-Path "$sim\texture.common\F27WT21_CHOCK.PNG.DDS") -and (Test-Path "$sim\texture.common\F27WT21_CHOCK.PNG.DDS.json"))
        $chocks = node 'C:\Projetos\f27-g1000\tools\panelmap\check_chocks.mjs' $exGltf | ConvertFrom-Json
        Check ("WT21 exterior, gear down as parked: chocks on the tyres' ground (gap {0} mm), clear of the tyres (closest {1} mm), at the four main wheels ({2}) and not the nose ({3}); the stairs on that ground ({4} mm)" -f $chocks.groundGapMm, $chocks.minClearanceMm, $chocks.mainsChocked, $chocks.noseChocked, $chocks.stairsGapMm) ($chocks.ok -eq $true)
        $ewind = node 'C:\Projetos\f27-g1000\tools\check-winding.mjs' $exGltf '^F27WT21_' | ConvertFrom-Json
        $ground = @('F27WT21_CHOCKS_L', 'F27WT21_CHOCKS_R', 'F27WT21_PITOTCOVERS', 'F27WT21_ENGINECOVERS', 'F27WT21_GEARPINS')
        $badW = @($ground | Where-Object { -not ($ewind.meshes.$_ -gt 0.99) })
        Check "WT21 exterior: chocks, covers and gear pins wound clockwise like the author's meshes" ($badW.Count -eq 0) ($badW -join ',')
        # v10.5 (user: "serviços de solo com capas e pinos"): covers and ground-lock streamers on the airframe, each on its own L:var
        $roots = @($ej.scenes[0].nodes)
        $okCovers = $true
        foreach ($pair in @(@('F27WT21_PITOTCOVERS', 'L:F27WT21_PitotCovers'), @('F27WT21_ENGINECOVERS', 'L:F27WT21_EngineCovers'), @('F27WT21_GEARPINS', 'L:F27WT21_GearPins'))) {
            $ni = [array]::IndexOf($exNames, $pair[0])
            $vis = $exDoc.SelectSingleNode("//Component[@Node=""$($pair[0])""]//VISIBILITY_CODE")
            $okCovers = $okCovers -and ($ni -ge 0) -and ($roots -contains $ni) -and $vis -and ($vis.InnerText.Trim() -eq "($($pair[1]), Bool)")
        }
        Check 'WT21 exterior: pitot covers, engine covers and gear pins on the airframe, shown by their L:vars' $okCovers
        Check 'WT21 exterior: covers texture F27WT21_FLAGS.PNG.DDS (+ sidecar) in texture.common' ((Test-Path "$sim\texture.common\F27WT21_FLAGS.PNG.DDS") -and (Test-Path "$sim\texture.common\F27WT21_FLAGS.PNG.DDS.json"))
    } else {
        Check 'WT21 exterior glTF exists' $false
    }
}

# v10.8 (user: "no modo Clássico, a única coisa nossa que entra é o Tablet", "o AP original controla o avião")
"Classic variation"
if (Test-Path "$sim\panel.Classic") {
    $cm = Get-Content "$sim\model.classic\model.CFG" -Raw
    Check 'Classic model.CFG: the WT21 exterior (chocks, covers, gear pins, stairs on the ground) and its own interior' (($cm -match 'normal=\.\.\\model\\F27500v2bgt_wt21\.xml') -and ($cm -match 'interior=\.\.\\model\\F27500v2bgt_INTERIOR_classic\.xml'))
    $cDoc = [xml](Get-Content "$sim\model\F27500v2bgt_INTERIOR_classic.xml" -Raw)
    $cBase = @($cDoc.SelectNodes('//IncludeBase') | ForEach-Object { $_.RelativeFile })
    $cHide = @($cDoc.SelectNodes('//Component[UseTemplate/@Name="ASOBO_GT_Visibility_Code"]'))
    $cEmis = @($cDoc.SelectNodes('//Component[UseTemplate/@Name="ASOBO_GT_Material_Emissive_Code"]') | ForEach-Object { $_.Node })
    Check "Classic interior xml: the author's behaviours as they are, nothing hidden, one screen (the tablet's: $($cEmis -join ','))" (($cDoc.SelectSingleNode('//LOD').ModelFile -eq 'F27500v2bgt_INTERIOR_classic.gltf') -and (($cBase -join ',') -eq 'F27500v2bgt_INTERIOR.xml') -and ($cHide.Count -eq 0) -and (($cEmis -join ',') -eq 'WT21_TAB1_screen'))
    $cj = Get-Content "$sim\model\F27500v2bgt_INTERIOR_classic.gltf" -Raw | ConvertFrom-Json
    $cNames = @($cj.nodes | ForEach-Object { $_.name })
    $aNames = @((Get-Content "$sim\model\F27500v2bgt_INTERIOR.gltf" -Raw | ConvertFrom-Json).nodes | ForEach-Object { $_.name })
    $added = @($cNames | Where-Object { $aNames -notcontains $_ })
    $notTablet = @($added | Where-Object { $_ -notmatch '^(WT21_TAB1|F27WT21_TAB1|F27_WT21_TAB1)' })
    Check "Classic interior glTF: the author's nodes + the tablet's only ($($added.Count) added)" (($added -contains 'WT21_TAB1_screen') -and ($added -contains 'F27_WT21_TAB1_swing') -and ($notTablet.Count -eq 0)) ($notTablet -join ',')
    $cw = node 'C:\Projetos\f27-g1000\tools\check-winding.mjs' "$sim\model\F27500v2bgt_INTERIOR_classic.gltf" '^(WT21_TAB1|F27WT21_TAB1|F27_WT21_TAB1)' | ConvertFrom-Json
    $cBad = @($cw.meshes.PSObject.Properties | Where-Object { $_.Value -le 0.99 } | ForEach-Object { $_.Name })
    Check "Classic interior: the tablet's meshes wound clockwise like the author's ($(@($cw.meshes.PSObject.Properties).Count) meshes)" ($cBad.Count -eq 0) ($cBad -join ',')
    $cCfg = Get-Content "$sim\panel.Classic\panel.cfg" -Raw
    $cWasm = @([regex]::Matches($cCfg, 'wasm_module=wasm/([^&]+)&') | ForEach-Object { $_.Groups[1].Value } | Sort-Object -Unique)
    $cGauges = @([regex]::Matches($cCfg, '(?m)^htmlgauge\d+=([^,]+),') | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notmatch '^WasmInstrument/' })
    Check "Classic panel.cfg: the author's systems in the Classic WASM copy ($($cWasm -join ',')), the tablet alone besides ($($cGauges -join ','))" ((($cWasm -join ',') -eq 'WASM_F27Classic.wasm') -and (($cGauges -join ',') -eq 'F27WT21/Tablet/F27Tablet.html?variant=classic'))
    if (Test-Path "$root\wasm\WASM_F27Classic.wasm") {
        $chk = python 'C:\Projetos\f27-g1000\tools\patch-wasm-wt21.py' 'C:\Projetos\bgt-f27500-v2\wasm\WASM_F27500bgtv2.wasm' "$root\wasm\WASM_F27Classic.wasm" --stairs-only --check
        Check "Classic WASM copy: the author's module with only the stairs rule blanked, his TAPIR autopilot untouched ($chk)" ($LASTEXITCODE -eq 0)
    } else { Check 'Classic WASM copy exists' $false }
    $tjsC = Get-Content "$root\html_ui\Pages\VCockpit\Instruments\F27WT21\Tablet\F27Tablet.js" -Raw
    Check 'tablet: told by its panel.cfg line that it is in the Classic (no FMS)' ($tjsC -match 'variant=classic')
} else {
    "  --   no separate Classic variation (v10.9: the Modernized variation's tablet switches to the Classic cockpit; scaffold.ps1 -ClassicVariation builds one)"
}

"result: $fail failure(s)"
exit $fail
