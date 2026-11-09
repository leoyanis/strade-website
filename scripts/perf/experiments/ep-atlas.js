// Measurement-only: emulate drawing EP's star sprites from one atlas texture (same draws, same order, same
// alpha) by redirecting drawImage calls on the EP star canvas. Tells whether texture switches (draw calls) are
// what keeps Endless Pursuit at 60 fps before the source is changed.
(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  const slots = new Map();
  let atlas = null;
  let ax = 0;
  const slotFor = (src) => {
    let s = slots.get(src);
    if (s) return s;
    if (!atlas) {
      atlas = document.createElement('canvas');
      atlas.width = 512;
      atlas.height = 80;
    }
    s = { x: ax + 2, y: 2, w: src.width, h: src.height };
    ax += src.width + 4;
    orig.call(atlas.getContext('2d'), src, s.x, s.y);
    slots.set(src, s);
    return s;
  };
  proto.drawImage = function (src, ...a) {
    if (a.length === 4 && src instanceof HTMLCanvasElement && (src.width === 16 || src.width === 64) && this.canvas && this.canvas.classList && this.canvas.classList.contains('ep3-sky__stars')) {
      const s = slotFor(src);
      return orig.call(this, atlas, s.x, s.y, s.w, s.h, a[0], a[1], a[2], a[3]);
    }
    return orig.call(this, src, ...a);
  };
})();
