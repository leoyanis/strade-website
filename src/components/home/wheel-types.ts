// Shared by WheelCard.astro and the homepage's list of cards.
export type WheelArt =
  | { t: 'video'; src: string; poster: string }
  | { t: 'video-contain'; src: string; poster: string }
  | { t: 'phone'; src: string; pal?: string }
  | { t: 'contain'; src: string }
  | { t: 'window'; src: string }
  | { t: 'crm' }
  | { t: 'stories' }
  | { t: 'reel' }; // the Atlas reel, built in code (src/components/atlas/AtlasReel.astro)
export type WheelItem = {
  slug: string;
  name: string;
  kind: string;
  bg: string;
  ink: string;
  accent: string;
  glow?: string;
  light?: boolean;
  art: WheelArt;
};
