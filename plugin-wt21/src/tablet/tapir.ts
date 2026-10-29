import { SimBridge } from './sim';

/** What the TAPIR panel asks of the lateral axis. */
type Lateral = 'turn' | 'hdg' | 'nav' | 'apr' | 'bc' | 'lvl';
/** What it asks of the vertical axis. */
type Vertical = 'alt' | 'ias' | 'pitch';

/** The selected altitudes IAS mode borrows to steer FLC up or down (no altitude preselector on the TAPIR). */
const FLC_UP_FT = 30000;
const FLC_DOWN_FT = 0;

/**
 * v10.9 Classic cockpit (user: "talvez esse AP original, ter uma camada que mandasse para o AP da WT. Para não precisar mexer no código
 * do Working Title"): the author's TAPIR autopilot panel flies through the WT21 autopilot, which keeps running, unseen, in the FMC.
 *
 * His systems WASM copy in this variation no longer sends the TAPIR's own key events (tools\patch-wasm-wt21.py), but it still works
 * the panel: the PA switch is the sim's AP_MASTER, and his code lights a mode button's lamp while that mode may engage (AP on and, for
 * HDG and VOR/APP, the VIRAGE knob centred; VOR/APP also needs a NAV1 signal); a button stays in only while its lamp is lit. This layer
 * reads the panel and sends the WT21 autopilot the standard events its WT21APStateManager takes:
 *   VIRAGE knob off centre  HDG mode on a heading bug kept `knob` degrees ahead, so the bank grows with the knob, as on the TAPIR
 *   VOR/APP in              NAV1 as the source (AP_NAV_SELECT_SET 1), then on a localizer APR (LOC/AR switch up: back course), else NAV
 *   HDG in                  HDG on his heading selector (L:F275bgt_hdg_sel, sent as the sim's heading bug)
 *   none of those           wings level (LVL)
 *   ALT in                  ALT hold
 *   IAS in                  FLC on the speed of the moment, both ways (see updateIas)
 *   neither                 PITCH, on the attitude his pitch wheel sets (wheel / 4 degrees nose up, as his code reads it)
 * Modes are sent when the panel's wish changes, never every frame: the old WASM's every-frame forcing is what fought WT21 (test 10).
 */
export class TapirBridge {
  private lateral: Lateral | null = null;
  private vertical: Vertical | null = null;
  /** The last heading bug sent, and the selector value it came from (-1: send again). */
  private bug = -1;
  private hdgSel = -1;
  /** The selected altitude before IAS mode borrowed it, given back when IAS ends. */
  private savedAltFt: number | null = null;
  private iasTarget = 0;
  private flcClimb = true;
  private flcFlipAt = 0;
  private nudgeAt = 0;

  /**
   * @param sim Where the panel is read and the events go.
   */
  constructor(private readonly sim: SimBridge) {}

  /** Forgets what was sent (the AP went off, or the cockpit changed): the panel's modes are sent again on the next update. */
  public reset(): void {
    this.giveAltitudeBack();
    this.lateral = null;
    this.vertical = null;
    this.bug = -1;
    this.hdgSel = -1;
  }

  /**
   * Reads the panel and sends what changed. Called every frame while the Classic cockpit is in use.
   * @param now The current time, in milliseconds.
   */
  public update(now: number): void {
    const s = this.sim;
    const on = (name: string): boolean => s.get(name, 'bool') !== 0;
    const turn = Math.round(s.get('L:f275_AP_Turn_Rotac', 'number'));
    const heading = s.get('PLANE HEADING DEGREES MAGNETIC', 'degrees');

    // his heading selector is the sim's heading bug, except while the VIRAGE knob steers it
    if (turn === 0) {
      const sel = Math.round(s.get('L:F275bgt_hdg_sel', 'number'));
      if (sel !== this.hdgSel) {
        this.hdgSel = sel;
        this.setBug(sel);
      }
    }

    if (!on('AUTOPILOT MASTER')) {
      if (this.lateral !== null || this.vertical !== null) {
        this.reset();
      }
      return;
    }

    // lateral
    const lit = (mode: string): boolean => on(`L:f275_Btn_AP_${mode}_Pos`) && on(`L:F275bgt_warn_BtnAP_${mode}`);
    let lateral: Lateral = 'lvl';
    if (turn !== 0) {
      lateral = 'turn';
    } else if (lit('vorapp')) {
      lateral = !on('NAV HAS LOCALIZER:1') ? 'nav' : on('L:f275_AP_Sw_LocAr_Pos') ? 'bc' : 'apr';
    } else if (lit('hdg')) {
      lateral = 'hdg';
    }
    if (lateral === 'turn') {
      this.hdgSel = -1;   // the selector goes back on the bug once the knob is centred
      this.setBug(Math.round(heading + turn));
    }
    if (lateral !== this.lateral) {
      this.sendLateral(this.lateral, lateral);
      this.lateral = lateral;
    }

    // vertical: left to the glideslope once it has captured
    const vertical: Vertical = lit('alt') ? 'alt' : lit('ias') ? 'ias' : 'pitch';
    if (lateral === 'apr' && on('AUTOPILOT GLIDESLOPE ACTIVE')) {
      this.vertical = null;
      return;
    }
    if (vertical !== this.vertical) {
      this.sendVertical(this.vertical, vertical);
      this.vertical = vertical;
    }
    if (vertical === 'ias') {
      this.updateIas(now);
    } else if (vertical === 'pitch' && on('AUTOPILOT PITCH HOLD') && now - this.nudgeAt > 50) {
      // the pitch wheel: the WT21 pitch target (sim sign, nose up negative) follows it half a degree per event
      const target = -s.get('L:f275_AP_Pitch_Wheel', 'number') / 4;
      const selected = s.get('AUTOPILOT PITCH HOLD REF', 'degrees');
      if (Math.abs(target - selected) > 0.3) {
        this.nudgeAt = now;
        this.key(target < selected ? 'AP_PITCH_REF_INC_UP' : 'AP_PITCH_REF_INC_DN');
      }
    }
  }

  /** Sends the WT21 lateral mode `to`, leaving `from` (which may stay armed otherwise). */
  private sendLateral(from: Lateral | null, to: Lateral): void {
    if (from === 'apr') {
      this.key('AP_APR_HOLD_OFF');
    } else if (from === 'nav') {
      this.key('AP_NAV1_HOLD_OFF');
    } else if (from === 'bc') {
      this.key('AP_BC_HOLD_OFF');
    }
    if (to === 'nav' || to === 'apr' || to === 'bc') {
      this.key('AP_NAV_SELECT_SET', 1);
    }
    switch (to) {
      case 'turn':
      case 'hdg':
        this.key('AP_HDG_HOLD_ON');
        break;
      case 'nav':
        this.key('AP_NAV1_HOLD_ON');
        break;
      case 'apr':
        this.key('AP_APR_HOLD_ON');
        break;
      case 'bc':
        this.key('AP_BC_HOLD_ON');
        break;
      default:
        this.key('AP_WING_LEVELER_ON');
    }
  }

  /** Sends the WT21 vertical mode `to`, leaving `from`. */
  private sendVertical(from: Vertical | null, to: Vertical): void {
    if (from === 'ias') {
      this.key('FLIGHT_LEVEL_CHANGE_OFF');
      this.giveAltitudeBack();
    } else if (from === 'alt' && to === 'pitch') {
      this.key('AP_ALT_HOLD_OFF');
    }
    if (to === 'alt') {
      this.key('AP_ALT_HOLD_ON');
    } else if (to === 'ias') {
      this.savedAltFt = this.sim.get('AUTOPILOT ALTITUDE LOCK VAR', 'feet');
      this.iasTarget = Math.round(this.sim.get('AIRSPEED INDICATED', 'knots'));
      this.key('AP_SPD_VAR_SET', this.iasTarget);
      this.setFlcClimb(this.sim.get('VERTICAL SPEED', 'feet per minute') >= 0);
      this.key('FLIGHT_LEVEL_CHANGE_ON');
    }
  }

  /**
   * IAS holds the speed by pitch whatever the power, up or down. WT21's FLC only climbs when the selected altitude is above and only
   * descends when it is below, so IAS keeps one far up or far down and swaps them when the speed runs away the way FLC may not follow
   * (in a climb with too little power the speed decays below the target: go down; in a descent with too much it builds: go up).
   * @param now The current time, in milliseconds.
   */
  private updateIas(now: number): void {
    if (now - this.flcFlipAt < 5000) {
      return;
    }
    const ias = this.sim.get('AIRSPEED INDICATED', 'knots');
    if (this.flcClimb ? ias < this.iasTarget - 5 : ias > this.iasTarget + 5) {
      this.flcFlipAt = now;
      this.setFlcClimb(!this.flcClimb);
    }
  }

  private setFlcClimb(climb: boolean): void {
    this.flcClimb = climb;
    this.key('AP_ALT_VAR_SET_ENGLISH', climb ? FLC_UP_FT : FLC_DOWN_FT);
  }

  /** Puts back the selected altitude IAS mode borrowed (the Modernized cockpit's preselector shows it). */
  private giveAltitudeBack(): void {
    if (this.savedAltFt !== null) {
      this.key('AP_ALT_VAR_SET_ENGLISH', Math.round(this.savedAltFt));
      this.savedAltFt = null;
    }
  }

  private setBug(deg: number): void {
    const bug = ((deg % 360) + 360) % 360;
    if (bug !== this.bug) {
      this.bug = bug;
      this.key('HEADING_BUG_SET', bug);
    }
  }

  private key(name: string, value = 0): void {
    this.sim.set(`K:${name}`, 'number', value);
  }
}
