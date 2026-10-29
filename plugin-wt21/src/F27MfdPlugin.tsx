import { FSComponent, registerPlugin, VNode } from '@microsoft/msfs-sdk';
import { WT21AvionicsPlugin } from '@microsoft/msfs-wt21-shared';

import { F27Eis, injectEisCss } from './F27Eis';

/**
 * WT21 MFD plugin for the Fokker F27-500. The WT21 MFD asks every plugin for an engine indication via renderEis() and draws the
 * first one it gets in the band at the top of the screen (see WT21_MFD_Instrument.tsx). It is loaded through a <Plugin> tag under
 * the WT21_MFD_1 instrument in panel.WT21\panel.xml.
 *
 * The WT21MfdAvionicsPlugin base class of the CJ4 plugin is not needed: the plugin system calls these methods by name, so extending
 * the shared WT21AvionicsPlugin and defining renderEis() is the same contract without a runtime dependency on the MFD bundle.
 */
export class F27MfdPlugin extends WT21AvionicsPlugin {
  /** @inheritdoc */
  public onInstalled(): void {
    injectEisCss();
    // v9-v10.8 held the author's L:GPS_isVisible at 0 here to keep the empty GPS 530 housing hidden. v10.9: the housing is switched with
    // the cockpit (tools\make-cockpit-switch.mjs), so in the Classic cockpit the variable is his again.
  }

  /** Engine indication of the two Dart turboprops. */
  public renderEis(): VNode {
    return <F27Eis />;
  }
}

registerPlugin(F27MfdPlugin);
