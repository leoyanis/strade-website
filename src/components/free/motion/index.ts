// Runs the motion for a free resource page. Every animated block carries data-fx="<name>";
// they're set up in page order so pinned sections measure correctly.
import { loadMotion, type Motion } from './core';
import { hero } from './hero';
import { cards, callout, chips, end, more, steps, works } from './sections';
import { shipPreview } from './ship-preview';
import { shipScan } from './ship-scan';
import { dsPreview } from './ds-preview';
import { styleMorph, styleMorphBasic } from './style-morph';
import { ssot } from './ssot';
import { beautifier } from './beautifier';

const FX: Record<string, (el: HTMLElement, m: Motion) => void> = {
  hero,
  'ship-preview': shipPreview,
  'ship-scan': shipScan,
  'ds-preview': dsPreview,
  'style-morph': styleMorph,
  ssot,
  beautifier,
  steps,
  cards,
  chips,
  works,
  callout,
  end,
  more,
};

export async function initFreePage() {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-fx]'));
  // The style chips work with or without motion.
  blocks.filter((el) => el.dataset.fx === 'style-morph').forEach(styleMorphBasic);

  const m = await loadMotion();
  if (!m) {
    document.documentElement.classList.remove('sk-intro');
    return;
  }
  for (const el of blocks) {
    try {
      FX[el.dataset.fx ?? '']?.(el, m);
    } catch (err) {
      // one broken effect must never take the page down with it
      if (import.meta.env.DEV) console.error(`[free] ${el.dataset.fx}`, err);
    }
  }
  m.refresh();
}
