// Measurement-only: draw EP's star sprites from ImageBitmaps instead of the sprite canvases (same pixels, same
// draws, same order). A canvas source makes every drawImage take a fresh snapshot of that canvas; an ImageBitmap
// is a ready image. Tells how much of the star canvas's per-frame cost is that per-call snapshot.
(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  const bitmaps = new WeakMap();
  proto.drawImage = function (src, ...a) {
    if (a.length === 4 && src instanceof HTMLCanvasElement && (src.width === 16 || src.width === 64) && this.canvas && this.canvas.classList && this.canvas.classList.contains('ep3-sky__stars')) {
      let b = bitmaps.get(src);
      if (b === undefined) {
        bitmaps.set(src, null);
        createImageBitmap(src).then((bm) => bitmaps.set(src, bm));
      } else if (b) return orig.call(this, b, a[0], a[1], a[2], a[3]);
    }
    return orig.call(this, src, ...a);
  };
})();
