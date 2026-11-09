// Measurement-only: skip EP's glow stamps (the 64px sprites), to see how much of the star canvas's GPU cost
// they carry. Changes the look; never shipped.
(() => {
  const proto = CanvasRenderingContext2D.prototype;
  const orig = proto.drawImage;
  proto.drawImage = function (src, ...a) {
    if (a.length === 4 && src instanceof HTMLCanvasElement && src.width === 64 && this.canvas && this.canvas.classList && this.canvas.classList.contains('ep3-sky__stars')) return;
    return orig.call(this, src, ...a);
  };
})();
