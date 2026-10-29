# Third-party notices

This repository's own code is under the MIT license in [LICENSE](LICENSE). The components below are not ours and keep their own
terms.

## Working Title / Microsoft — msfs-avionics-mirror

The WT21 avionics (PFD, MFD, FMC), the MSFS SDK (`msfssdk.js`) and `wtlinesdk` are built from
[microsoft/msfs-avionics-mirror](https://github.com/microsoft/msfs-avionics-mirror) with their code unchanged. The built package
renames their instrument folder from `WT21v2` to `F27WT21`, so it cannot replace the CJ4's own avionics, and adds the F27 MFD plugin
through the WT21 plugin API.

Their license is MIT with an addendum: the software and any derivative works are licensed **only for usage in Microsoft Flight
Simulator**. Full text: [licenses/WorkingTitle-Microsoft-LICENSE.txt](licenses/WorkingTitle-Microsoft-LICENSE.txt). The built
package carries the same text as `html_ui/Pages/VCockpit/Instruments/F27WT21/LICENSE-WorkingTitle.txt`.

## DejaVu Sans

The tablet uses `DejaVuSans-SemiBold.ttf`: Bitstream Vera copyright, DejaVu changes in the public domain, Arev glyphs by Tavmjong
Bah. Full license, as embedded in the font: [licenses/DejaVu-LICENSE.txt](licenses/DejaVu-LICENSE.txt). The license also travels
with the font as `plugin-wt21/tablet/DejaVu-LICENSE.txt`.

## Fokker F27-500 v2 — bgaurant

Not included. The add-on requires the author's package (`bgt-f27500-v2`) and reads his models, textures, sounds and systems from it.
The files generated from his are listed in the README ("Files derived from the author's aircraft") and ship with his permission.

## Liveries and 4K textures — each author (for example Carlos Peroni, RE Liveries)

Not included. `Add-Liveries.ps1` runs on the user's own computer and writes variations that point to the liveries installed there
(a `texture.cfg` that says "take the paint from that package"); it copies only their two thumbnail images, locally, and distributes nothing.

## GSX Pro — FSDreamTeam

Not included. With GSX running, the tablet opens the GSX menu and reads the pushback state through the variables GSX documents for
add-ons (`L:FSDT_GSX_COUATL_STARTED`, `L:FSDT_GSX_MENU_OPEN`, `L:FSDT_GSX_DEPARTURE_STATE`).

## Services used at run time

- SimBrief (Navigraph): the tablet downloads the user's own OFP through SimBrief's public API.
- Charts and the moving map: provided by the simulator (LIDO and FAA charts, Bing map).
