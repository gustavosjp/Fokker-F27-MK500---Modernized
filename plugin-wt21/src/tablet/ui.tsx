import { ComponentProps, DisplayComponent, FSComponent, Subscribable, VNode } from '@microsoft/msfs-sdk';

import { I18n, StringKey } from './i18n';
import { TabletModel } from './model';

/**
 * Calls `fn` on a tap: the element looks pressed while the button is held and fires on release over it. In the sim a mouse click on
 * the 3D screen arrives as these DOM events (the instrument declares itself interactive). `own`: the tap is not also one on the
 * tappable element around it (a button inside a tappable card).
 */
export function onTap(el: Element, fn: () => void, own = false): void {
  let down = false;
  el.addEventListener('mousedown', (e) => {
    down = true;
    el.classList.add('pressed');
    if (own) {
      e.stopPropagation();
    }
  });
  el.addEventListener('mouseleave', () => { down = false; el.classList.remove('pressed'); });
  el.addEventListener('mouseup', (e) => {
    if (own) {
      e.stopPropagation();
    }
    if (down) {
      down = false;
      el.classList.remove('pressed');
      fn();
    }
  });
}

/** Props shared by every part of the tablet. */
export interface TabletProps extends ComponentProps {
  model: TabletModel;
  i18n: I18n;
}

/** Opens the on-screen keyboard: its title, the starting text, what to do with the text on OK, capitals (ICAO codes) or not. */
export type KeyboardFn = (title: StringKey, value: string, done: (v: string) => void, upper?: boolean) => void;

/** The apps of the Home page (v10.5: icons instead of a tab bar, so more fit; v10.6: Systems). */
export type AppId = 'flight' | 'charts' | 'checklist' | 'ground' | 'weights' | 'systems' | 'settings';

/** A titled panel. */
export class Card extends DisplayComponent<ComponentProps & { title: Subscribable<string>; class?: string }> {
  /** @inheritdoc */
  public render(): VNode {
    return (
      <div class={`card ${this.props.class ?? ''}`}>
        <div class="card-title">{this.props.title}</div>
        {this.props.children}
      </div>
    );
  }
}

/** "hh:mm" of a time of day in seconds. */
export const hhmm = (s: number): string => {
  const m = Math.floor(((s % 86400) + 86400) % 86400 / 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
