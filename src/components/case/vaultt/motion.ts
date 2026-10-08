// Motion for /work/vaultt. Everything is visible without JS; hidden states are only ever set here.
// Desktop (≥1024 wide, normal heights): the rebrand, the AI brief demo and the product tour pin.
// Smaller screens: no pinning, simple reveals.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export async function initVaultt() {
  const root = document.getElementById('vt');
  if (!root) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) {
    root.querySelectorAll('video').forEach((v) => { v.removeAttribute('autoplay'); (v as HTMLVideoElement).pause(); });
    return;
  }

  let gsap: Any, ScrollTrigger: Any;
  try {
    ({ gsap } = await import('gsap'));
    ({ ScrollTrigger } = await import('gsap/ScrollTrigger'));
  } catch {
    return;
  }
  gsap.registerPlugin(ScrollTrigger);

  const $ = (s: string, el: ParentNode = root): Any => el.querySelector(s);
  const $$ = (s: string, el: ParentNode = root): Any[] => Array.from(el.querySelectorAll(s));

  /* ------------------------------------------------------------------ helpers */
  function splitWords(el: HTMLElement) {
    const out: HTMLElement[] = [];
    const walk = (node: Node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const parts = (n.textContent || '').split(/(\s+)/);
          const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) frag.appendChild(document.createTextNode(p));
            else { const s = document.createElement('span'); s.className = 'vt-w'; s.textContent = p; frag.appendChild(s); out.push(s); }
          });
          node.replaceChild(frag, n);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    walk(el);
    return out;
  }

  // layout offset of el inside ancestor (ignores transforms, unlike getBoundingClientRect)
  function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
    let y = 0; let n: Any = el;
    while (n && n !== ancestor) { y += n.offsetTop; n = n.offsetParent; }
    return y;
  }

  /* ------------------------------------------------------------------ hero */
  function hero() {
    const sec = $('#vt-hero');
    if (!sec) return;
    // The inline script in Hero.astro hides the intro elements until we get here (with a timeout
    // fallback). Removing the class and applying the from-states happen in the same tick: no flash.
    sec.classList.remove('is-intro');
    const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
    tl.from($$('.vt-hero__ch'), { yPercent: 105, rotate: 6, opacity: 0, duration: 1.2, stagger: 0.055 }, 0.05)
      .from('.vt-hero__icon', { scale: 0.3, rotate: -40, opacity: 0, duration: 1.1, ease: 'back.out(1.6)' }, 0.45)
      .from(['.vt-hero__eyebrow', '.vt-hero__line', '.vt-hero__sub'], { y: 26, opacity: 0, duration: 0.9, stagger: 0.08 }, 0.3)
      .from($$('.vt-hero__chips li'), { y: 14, opacity: 0, duration: 0.7, stagger: 0.05 }, 0.55)
      .from($$('.vt-hero__cta > *'), { y: 16, opacity: 0, duration: 0.8, stagger: 0.08 }, 0.65)
      .from($$('.vt-hero__card'), { y: 150, opacity: 0, rotate: (i: number) => [-7, 6, 5, -6][i] || 0, duration: 1.4, stagger: 0.09 }, 0.2)
      .from($$('.vt-gchip'), { opacity: 0, filter: 'blur(8px)', duration: 0.8, stagger: 0.15, ease: 'power2.out' }, 1.05)
      .from('.vt-marquee', { opacity: 0, duration: 1.2, ease: 'power2.out' }, 0.8);

    const cols = $$('.vt-hero__col');
    const st = () => ({ trigger: sec, start: 'top top', end: 'bottom top', scrub: true });
    if (cols[0]) gsap.to(cols[0], { y: -50, ease: 'none', scrollTrigger: st() });
    if (cols[1]) gsap.to(cols[1], { y: -120, ease: 'none', scrollTrigger: st() });
    gsap.to('.vt-hero__word', { y: 60, ease: 'none', scrollTrigger: st() });

    if (window.matchMedia('(pointer: fine)').matches) {
      const cards = $('.vt-hero__cards');
      const rx = gsap.quickTo(cards, 'rotationX', { duration: 0.9, ease: 'power3' });
      const ry = gsap.quickTo(cards, 'rotationY', { duration: 0.9, ease: 'power3' });
      sec.addEventListener('pointermove', (e: PointerEvent) => {
        const r = sec.getBoundingClientRect();
        ry(((e.clientX - r.left) / r.width - 0.5) * 12);
        rx(-((e.clientY - r.top) / r.height - 0.5) * 9);
      });
      sec.addEventListener('pointerleave', () => { rx(0); ry(0); });
    }

    // only spend CPU on the hero videos while they can be seen
    const vids = $$('video', sec);
    if (vids.length) {
      ScrollTrigger.create({
        trigger: sec, start: 'top bottom', end: 'bottom top',
        onToggle: (self: Any) => vids.forEach((v: HTMLVideoElement) => (self.isActive ? v.play().catch(() => {}) : v.pause())),
      });
    }
  }

  /* ------------------------------------------------------------------ counters */
  function counters() {
    $$('[data-count]').forEach((el: HTMLElement) => {
      const end = parseFloat(el.dataset.count || '0');
      const dec = parseInt(el.dataset.dec || '0', 10);
      const obj = { v: 0 };
      el.textContent = (0).toFixed(dec);
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: () => gsap.to(obj, { v: end, duration: 1.9, ease: 'power3.out', onUpdate: () => { el.textContent = obj.v.toFixed(dec); } }),
      });
    });
  }

  /* ------------------------------------------------------------------ belief */
  function belief() {
    const el = $('#vt-belief-text');
    if (!el) return;
    const words = splitWords(el);
    const hl = $('.hl', el);
    gsap.set(words, { opacity: 0.13 });
    if (hl) gsap.set(hl, { '--hl': 0 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 80%', end: 'bottom 45%', scrub: 0.5 } });
    tl.to(words, { opacity: 1, duration: 0.3, stagger: 0.12, ease: 'none' });
    if (hl) tl.to(hl, { '--hl': 1, duration: 0.5, ease: 'power2.out' });
  }

  /* ------------------------------------------------------------------ journey */
  function journey() {
    const track = $('.vt-journey__track');
    if (!track) return;
    gsap.fromTo('.vt-journey__fill', { '--p': 0 }, { '--p': 1, ease: 'none', scrollTrigger: { trigger: track, start: 'top 82%', end: 'bottom 58%', scrub: 0.6 } });
    const tl = gsap.timeline({ scrollTrigger: { trigger: track, start: 'top 84%', once: true } });
    tl.from($$('.vt-journey__step'), { y: 34, opacity: 0, duration: 0.9, stagger: 0.11, ease: 'power3.out' })
      .from($$('.vt-journey__node'), { scale: 0, duration: 0.6, stagger: 0.11, ease: 'back.out(3)' }, 0.15);
  }

  /* ------------------------------------------------------------------ rebrand: the name morph */
  function buildMorph(el: HTMLElement) {
    el.classList.add('is-morph');
    const from = $$('.vt-morph__from .ch', el);
    const to = $$('.vt-morph__to .ch', el);
    const icon = $('.vt-morph__icon', el);
    // StudentVenture → Vaultt: keep V, u, t, t (glide into place), drop the rest, grow a + l.
    const keep: Record<number, number> = { 7: 0, 11: 2, 6: 4, 10: 5 };
    const arc: Record<number, number> = { 7: -0.2, 11: -0.34, 6: 0.18, 10: -0.08 };
    const fs = () => parseFloat(getComputedStyle(el).fontSize) || 100;
    gsap.set(to, { opacity: 0 });
    gsap.set(icon, { opacity: 0, scale: 0.4, rotate: -30 });

    const tl = gsap.timeline({ defaults: { ease: 'power3.inOut' } });
    const dropped = from.filter((_, i) => !(i in keep));
    tl.to(dropped, {
      yPercent: 75, rotate: (i: number) => (i % 2 ? 16 : -14), opacity: 0, filter: 'blur(6px)',
      duration: 0.38, ease: 'power2.in', stagger: { each: 0.02, from: 'center' },
    }, 0);
    Object.entries(keep).forEach(([k, ti]) => {
      const fi = +k; const f = from[fi]; const t = to[ti];
      tl.to(f, { x: () => t.offsetLeft - f.offsetLeft, duration: 0.56 }, 0.22);
      tl.to(f, { y: () => arc[fi] * fs(), duration: 0.28, ease: 'sine.out' }, 0.22);
      tl.to(f, { y: 0, duration: 0.28, ease: 'sine.in' }, 0.5);
    });
    [1, 3].forEach((ti, k) => {
      tl.fromTo(to[ti], { opacity: 0, yPercent: -60 }, { opacity: 1, yPercent: 0, duration: 0.3, ease: 'power3.out' }, 0.6 + k * 0.08);
    });
    tl.set(Object.values(keep).map((i) => to[i]), { opacity: 1 }, 0.8);
    tl.set(Object.keys(keep).map((i) => from[+i]), { opacity: 0 }, 0.8);
    tl.to(icon, { opacity: 1, scale: 1, rotate: 0, duration: 0.26, ease: 'back.out(2)' }, 0.78);
    return tl;
  }

  function rebrandPinned() {
    const sec = $('#vt-rebrand');
    if (!sec) return;
    sec.classList.add('is-pinned');
    const stage = $('.vt-rb__stage', sec);
    const inner = $('.vt-rb__inner', sec);
    const mid = $('.vt-rb__mid', sec);
    const ba = $('.vt-ba', sec);
    const frames = $('.vt-ba__frames', sec);
    const yFrom = $('.vt-rb__y.is-from', sec);
    const yTo = $('.vt-rb__y.is-to', sec);
    const tag = $('.vt-rb__tag', sec);
    const after = $('.vt-ba__frame.is-after', sec);
    const handle = $('.vt-ba__handle', sec);
    const morph = buildMorph($('#vt-morph'));

    gsap.set(yTo, { opacity: 0, y: 10 });
    gsap.set(tag, { color: '#19D83A' });
    void frames;

    const centreY = () => stage.clientHeight / 2 - (offsetWithin(mid, stage) + mid.offsetHeight / 2);

    const tl = gsap.timeline({
      defaults: { ease: 'none' },
      scrollTrigger: {
        trigger: sec, start: 'top top', end: '+=2600', pin: true, scrub: 0.7,
        anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 3,
      },
    });
    tl.fromTo(mid, { y: centreY }, { y: centreY, duration: 0.15 }, 0);
    tl.add(morph, 0.15);
    tl.to(sec, { backgroundColor: '#0C2748', duration: 0.9, ease: 'power1.inOut' }, 0.2);
    tl.to(tag, { color: '#6FA8FF', duration: 0.5 }, 0.5);
    tl.to(yFrom, { opacity: 0, y: -10, duration: 0.2 }, 0.55);
    tl.to(yTo, { opacity: 1, y: 0, duration: 0.2 }, 0.65);
    // phase 2: the screens rise in under the new name
    tl.to(mid, { y: 0, duration: 0.55, ease: 'power2.inOut' }, 1.25);
    tl.fromTo(ba, { y: () => window.innerHeight * 0.7, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, ease: 'power2.out' }, 1.3);
    // phase 3: wipe v1 into today
    tl.fromTo(handle, { opacity: 0 }, { opacity: 1, duration: 0.06 }, 1.95);
    tl.fromTo(after, { clipPath: 'inset(0% 0% 0% 100% round 14px)' }, { clipPath: 'inset(0% 0% 0% 0% round 14px)', duration: 0.75, ease: 'power1.inOut' }, 2.0);
    tl.fromTo(handle, { left: '100%' }, { left: '0%', duration: 0.75, ease: 'power1.inOut' }, 2.0);
    tl.to(handle, { opacity: 0, duration: 0.08 }, 2.75);
    tl.to({}, { duration: 0.3 }, 2.83);
    void inner;
  }

  function rebrandSimple() {
    const sec = $('#vt-rebrand');
    if (!sec) return;
    const el = $('#vt-morph');
    const morph = buildMorph(el);
    const tl = gsap.timeline({ scrollTrigger: { trigger: el, start: 'top 72%', once: true } });
    tl.add(morph, 0.1);
    // the short name has room to grow once the long one is gone (drop the old word from layout first)
    tl.set($('.vt-morph__from', el), { display: 'none' }, 0.98);
    tl.to(el, { fontSize: () => parseFloat(getComputedStyle(el).fontSize) * 1.6, duration: 0.45, ease: 'power3.out' }, 1.0);
    tl.timeScale(0.5);
    gsap.from($$('.vt-ba__frame', sec), {
      y: 50, opacity: 0, duration: 1, stagger: 0.15, ease: 'power3.out',
      scrollTrigger: { trigger: $('.vt-ba', sec), start: 'top 85%', once: true },
    });
  }

  /* ------------------------------------------------------------------ AI brief demo */
  const field = $('#vt-field');
  const typed = $('#vt-typed');
  const fullText: string = field?.dataset.text || '';
  const words = fullText.split(' ');

  function resetDemoText() {
    if (typed) typed.textContent = '';
    field?.classList.remove('has-text', 'is-typing');
    const c = $('#vt-count'); if (c) c.textContent = '3';
  }

  function renderTyping(n: number) {
    if (!typed || !field) return;
    const k = Math.round(n);
    if (k <= 0 || k > words.length) { typed.textContent = ''; field.classList.remove('has-text', 'is-typing'); }
    else { typed.textContent = words.slice(0, k).join(' '); field.classList.add('has-text', 'is-typing'); }
  }

  // Each builder adds its tweens to tl starting at `at`. Units are seconds in simple mode, scroll units when pinned.
  function buildChat(tl: Any, at: number) {
    const p = { n: 0 };
    tl.to(p, { n: words.length, duration: 1.5, ease: 'none', onUpdate: () => renderTyping(p.n) }, at + 0.2);
    tl.to(p, { n: words.length + 1, duration: 0.05, ease: 'none', onUpdate: () => renderTyping(p.n) }, at + 1.85);
    tl.fromTo('#vt-msg-user', { opacity: 0, y: 14, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.3, ease: 'power3.out' }, at + 1.9);
    tl.fromTo('#vt-ai-1', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, at + 2.3);
    tl.fromTo($$('#vt-chips-1 .vt-chip'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.05 }, at + 2.55);
    tl.fromTo('#vt-chips-1 .is-picked .vt-chip__sel', { opacity: 0 }, { opacity: 1, duration: 0.15 }, at + 2.95);
    tl.fromTo('#vt-ai-2', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, at + 3.2);
    tl.fromTo($$('#vt-chips-2 .vt-chip'), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.05 }, at + 3.45);
    tl.fromTo('#vt-chips-2 .is-picked .vt-chip__sel', { opacity: 0 }, { opacity: 1, duration: 0.15 }, at + 3.85);
    return at + 4.0;
  }

  function buildBrief(tl: Any, at: number) {
    tl.fromTo('#vt-brief-card', { x: 70, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5, ease: 'power3.out' }, at);
    tl.fromTo(['#vt-bt', '#vt-bo', '#vt-bsl'], { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.18 }, at + 0.45);
    tl.fromTo($$('.vt-sig'), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.25, stagger: 0.18 }, at + 1.0);
    tl.fromTo('#vt-cal', { height: 0, marginTop: 0 }, { height: 'auto', marginTop: 8, duration: 0.3, ease: 'power2.inOut' }, at + 1.75);
    tl.fromTo($$('.vt-cal__row'), { opacity: 0, x: -8 }, { opacity: 1, x: 0, duration: 0.2, stagger: 0.14 }, at + 1.85);
    return at + 2.45;
  }

  function buildResults(tl: Any, at: number) {
    const c = $('#vt-count');
    const p = { n: 0 };
    tl.fromTo('.vt-results__bar', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, at);
    tl.fromTo($$('.vt-rcard'), { opacity: 0, y: 26 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.3, ease: 'power3.out' }, at + 0.3);
    tl.fromTo(p, { n: 0 }, { n: 3, duration: 0.9, ease: 'none', onUpdate: () => { if (c) c.textContent = String(Math.round(p.n)); } }, at + 0.3);
    tl.fromTo('#vt-reason', { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, at + 1.4);
    return at + 1.8;
  }

  function demoPinned() {
    const sec = $('#vt-demo');
    if (!sec || !field) return;
    sec.classList.add('is-pinned');
    const pin = $('#vt-demo-pin');
    const steps = $$('.vt-demo__step', sec);
    const prog = $('.vt-demo__prog', sec);
    const chat = $('.vt-chat', sec);
    const brief = $('.vt-brief', sec);
    let cur = -1;
    const setStep = (i: number) => { if (i === cur) return; cur = i; steps.forEach((s: Any, k: number) => s.classList.toggle('is-on', k === i)); };

    const tl = gsap.timeline({
      defaults: { ease: 'power2.out' },
      onUpdate: function (this: Any) { const t = this.time(); setStep(t < 4.1 ? 0 : t < 7.0 ? 1 : 2); },
      scrollTrigger: {
        trigger: pin, start: 'top top', end: '+=3000', pin: true, scrub: 0.6,
        anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 2,
      },
    });
    setStep(0);
    buildChat(tl, 0);
    tl.to(chat, { opacity: 0.3, duration: 0.4 }, 4.1);
    tl.to('.vt-brief__ghost', { opacity: 0, duration: 0.3 }, 4.1);
    buildBrief(tl, 4.2);
    tl.to([chat, brief], { opacity: 0, y: -18, duration: 0.4, ease: 'power2.in' }, 7.0);
    tl.fromTo('.vt-results', { opacity: 0 }, { opacity: 1, duration: 0.05 }, 7.3);
    buildResults(tl, 7.3);
    tl.to({}, { duration: 0.8 }, 9.1);
    tl.fromTo(prog, { '--p': 0 }, { '--p': 1, duration: tl.duration(), ease: 'none' }, 0);
  }

  function demoSimple() {
    const sec = $('#vt-demo');
    if (!sec || !field) return;
    const t1 = gsap.timeline({ scrollTrigger: { trigger: $('.vt-chat', sec), start: 'top 72%', once: true } });
    buildChat(t1, 0);
    const t2 = gsap.timeline({ scrollTrigger: { trigger: $('.vt-brief', sec), start: 'top 75%', once: true } });
    buildBrief(t2, 0);
    const t3 = gsap.timeline({ scrollTrigger: { trigger: $('.vt-results', sec), start: 'top 75%', once: true } });
    buildResults(t3, 0);
  }

  /* ------------------------------------------------------------------ product tour */
  function panelLoops(container?: Any) {
    const watch = (panel: Element | null, tl: Any) => {
      if (!panel) return;
      ScrollTrigger.create({
        trigger: panel,
        ...(container ? { containerAnimation: container, start: 'left 92%', end: 'right 8%' } : { start: 'top 90%', end: 'bottom 10%' }),
        onToggle: (self: Any) => (self.isActive ? tl.play() : tl.pause()),
      });
    };

    // task pipeline: the candidate walks from Applied to Hired
    const pipe = $('#vt-pipe');
    if (pipe) {
      const stepsEls = $$('.vt-pipe__step', pipe);
      const rail = $('.vt-pipe__rail', pipe);
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4, paused: true });
      tl.call(() => { stepsEls.forEach((s: Any, i: number) => s.classList.toggle('is-dim', i > 0)); });
      tl.set(rail, { '--pp': 0 });
      stepsEls.forEach((s: Any, i: number) => {
        if (!i) return;
        tl.to(rail, { '--pp': i / (stepsEls.length - 1), duration: 0.45, ease: 'power2.inOut' }, '+=0.4');
        tl.call(() => s.classList.remove('is-dim'));
      });
      watch(pipe.closest('.vt-panel'), tl);
    }

    // console: feed-rule sliders drift, the preview feed reshuffles
    const rules = $$('.vt-con__rule');
    if (rules.length) {
      const targets = [0.34, 0.74, 0.5, 0.66, 0.16];
      const tl = gsap.timeline({ repeat: -1, yoyo: true, paused: true, defaults: { duration: 1.8, ease: 'sine.inOut' } });
      rules.forEach((r: Any, i: number) => tl.to(r, { '--v': targets[i] ?? 0.5 }, i * 0.12));
      const tiles = $$('.vt-con__tile');
      const patterns = [[0, 3, 6], [1, 4, 7], [0, 2, 5], [2, 4, 6], [1, 3, 7]];
      let k = 0;
      const shuffle = gsap.timeline({ repeat: -1, paused: true });
      shuffle.call(() => {
        k = (k + 1) % patterns.length;
        tiles.forEach((t: Any, i: number) => t.classList.toggle('is-new', patterns[k].includes(i)));
        gsap.fromTo(tiles, { y: 4, opacity: 0.6 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.03, ease: 'power2.out' });
      }).to({}, { duration: 1.5 });
      const both = { play: () => { tl.play(); shuffle.play(); }, pause: () => { tl.pause(); shuffle.pause(); } };
      watch($('.vt-panel--con'), both);
    }

    // accelerator form: types itself, submits, account created
    const form = $('#vt-form');
    if (form) {
      const fields = $$('.vt-form__f b', form);
      const btn = $('.vt-form__btn', form);
      const done = $('.vt-form__done', form);
      const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.6, paused: true });
      tl.call(() => fields.forEach((f: Any) => { f.textContent = ' '; }));
      tl.set(done, { opacity: 0, y: 24, scale: 0.94 });
      fields.forEach((f: Any) => {
        const txt: string = f.dataset.type || '';
        const p = { n: 0 };
        tl.fromTo(p, { n: 0 }, { n: txt.length, duration: Math.min(1.4, txt.length * 0.04), ease: 'none', onUpdate: () => { f.textContent = txt.slice(0, Math.round(p.n)) || ' '; } }, '+=0.25');
      });
      tl.to(btn, { scale: 0.95, duration: 0.12, yoyo: true, repeat: 1, ease: 'power2.inOut' }, '+=0.3');
      tl.to(done, { opacity: 1, y: 0, scale: 1, duration: 0.55, ease: 'back.out(1.7)' }, '+=0.05');
      tl.to({}, { duration: 2 });
      watch(form.closest('.vt-panel'), tl);
    }
  }

  function fanSpread(container?: Any) {
    const cards = $$('.vt-fan__card');
    if (!cards.length) return;
    gsap.from(cards, {
      '--x': '0%', '--r': '0deg', '--y': '0%', duration: 1.1, stagger: 0.06, ease: 'power3.out',
      scrollTrigger: container
        ? { trigger: $('.vt-panel--chal'), containerAnimation: container, start: 'left 70%', toggleActions: 'play none none reverse' }
        : { trigger: $('.vt-fan'), start: 'top 80%', once: true },
    });
  }

  function tourPinned() {
    const sec = $('#vt-tour');
    if (!sec) return;
    sec.classList.add('is-pinned');
    const vp = $('#vt-tour-vp');
    const track = $('#vt-tour-track');
    const prog = $('.vt-tour__progress', sec);
    const dist = () => Math.max(0, track.scrollWidth - document.documentElement.clientWidth);
    const tween = gsap.to(track, {
      x: () => -dist(), ease: 'none',
      scrollTrigger: {
        trigger: vp, start: 'top top', end: () => '+=' + dist(), pin: true, scrub: 0.6,
        anticipatePin: 1, invalidateOnRefresh: true, refreshPriority: 1,
        onUpdate: (self: Any) => prog?.style.setProperty('--p', self.progress.toFixed(4)),
      },
    });
    $$('.vt-panel', sec).forEach((panel: Any, i: number) => {
      if (i === 0) return;
      gsap.from($('.vt-panel__vis', panel), {
        x: 140, opacity: 0, ease: 'power2.out',
        scrollTrigger: { trigger: panel, containerAnimation: tween, start: 'left 95%', end: 'left 40%', scrub: 0.6 },
      });
      gsap.from($$('.vt-panel__text > *', panel), {
        y: 34, opacity: 0, stagger: 0.07, ease: 'power2.out',
        scrollTrigger: { trigger: panel, containerAnimation: tween, start: 'left 85%', end: 'left 45%', scrub: 0.6 },
      });
    });
    panelLoops(tween);
    fanSpread(tween);
  }

  function tourSimple() {
    const sec = $('#vt-tour');
    if (!sec) return;
    $$('.vt-panel', sec).forEach((panel: Any) => {
      gsap.from(panel, { y: 60, opacity: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: panel, start: 'top 90%', once: true } });
    });
    panelLoops();
    fanSpread();
  }

  /* ------------------------------------------------------------------ compare */
  function compare() {
    const grid = $('.vt-cmp__grid');
    if (!grid) return;
    const strikes = $$('.vt-cmp__strike');
    gsap.set(strikes, { '--s': 0 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: grid, start: 'top 72%', once: true } });
    tl.to(strikes, { '--s': 1, duration: 0.45, stagger: 0.2, ease: 'power2.inOut' }, 0.1)
      .to($$('.vt-cmp__no'), { opacity: 0.5, duration: 0.35, stagger: 0.2 }, 0.3)
      .from($$('.vt-cmp__yes'), { x: 34, opacity: 0, duration: 0.7, stagger: 0.15, ease: 'power3.out' }, 0.5)
      .from($$('.vt-cmp__ok'), { scale: 0, duration: 0.5, stagger: 0.15, ease: 'back.out(3)' }, 0.65);
  }

  /* ------------------------------------------------------------------ under the hood */
  function stack() {
    const shift = $('#vt-shift');
    if (shift) {
      const tl = gsap.timeline({ scrollTrigger: { trigger: shift, start: 'top 75%', once: true } });
      tl.fromTo($$('.vt-shift__strike'), { '--s': 0 }, { '--s': 1, duration: 0.4, stagger: 0.12, ease: 'power2.inOut' }, 0.1)
        .to($$('.is-v1 .vt-shift__chip'), { opacity: 0.5, duration: 0.3 }, 0.35)
        .from('.vt-shift__arrow', { y: -10, opacity: 0, duration: 0.4 }, 0.4)
        .from($$('.is-now .vt-shift__chip'), { y: 12, opacity: 0, scale: 0.9, duration: 0.5, stagger: 0.07, ease: 'back.out(2)' }, 0.5);
    }
    const arch = $('#vt-arch');
    if (arch) {
      const a = gsap.timeline({ scrollTrigger: { trigger: arch, start: 'top 72%', once: true } });
      a.from($$('.vt-arch__row.is-clients .vt-node'), { y: 30, opacity: 0, duration: 0.6, stagger: 0.1, ease: 'power3.out' })
        .from($$('.vt-arch__wires.is-top .vt-wire'), { scaleY: 0, duration: 0.5, stagger: 0.08, ease: 'power2.out' }, 0.35)
        .from('.vt-arch__core', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, 0.6)
        .from($$('.vt-cell'), { y: 20, opacity: 0, duration: 0.5, stagger: 0.08 }, 0.8)
        .from('.vt-arch__wires.is-bottom .vt-wire', { scaleY: 0, duration: 0.5 }, 1.1)
        .from('.vt-node.is-ai', { y: 30, opacity: 0, duration: 0.7, ease: 'power3.out' }, 1.3);
    }
  }

  /* ------------------------------------------------------------------ working + quote */
  function working() {
    const calls = $$('.vt-call__tiles');
    calls.forEach((row: Any) => {
      gsap.from(row.children, { y: 10, opacity: 0, duration: 0.4, stagger: 0.04, ease: 'power2.out', scrollTrigger: { trigger: row, start: 'top 88%', once: true } });
    });
    const photo = $('.vt-work__photo');
    if (photo) gsap.from(photo, { rotate: 12, y: 60, opacity: 0, duration: 1.2, ease: 'expo.out', scrollTrigger: { trigger: photo, start: 'top 88%', once: true } });
  }

  function quote() {
    const fig = $('.vt-quote__fig');
    if (!fig) return;
    const mark = $('mark', fig);
    if (mark) gsap.set(mark, { '--m': 0 });
    const tl = gsap.timeline({ scrollTrigger: { trigger: fig, start: 'top 78%', once: true } });
    tl.from('.vt-quote__mark', { scale: 0.5, rotate: -12, opacity: 0, duration: 1.2, ease: 'expo.out' }, 0)
      .from('.vt-quote__text p', { y: 40, opacity: 0, duration: 1.1, ease: 'power3.out' }, 0.1)
      .from('.vt-quote__by', { y: 20, opacity: 0, duration: 0.8, ease: 'power3.out' }, 0.5);
    if (mark) tl.to(mark, { '--m': 1, duration: 1.1, ease: 'power2.inOut' }, 0.7);
  }

  function rises() {
    const els = $$('[data-rise]');
    if (!els.length) return;
    gsap.set(els, { y: 40, opacity: 0 });
    ScrollTrigger.batch(els, {
      start: 'top 90%', once: true,
      onEnter: (batch: Any) => gsap.to(batch, { y: 0, opacity: 1, duration: 0.95, stagger: 0.1, ease: 'power3.out', overwrite: true }),
    });
  }

  /* ------------------------------------------------------------------ run */
  hero();
  counters();
  belief();
  journey();

  // Glyph widths drive the name morph and the pinned layouts, so wait for the fonts (never for long).
  try {
    await Promise.race([(document as Any).fonts?.ready, new Promise((r) => setTimeout(r, 1800))]);
  } catch { /* ignore */ }

  const mm = gsap.matchMedia();
  mm.add(
    {
      desk: '(min-width: 1024px) and (min-height: 620px) and (max-height: 1400px)',
      small: '(max-width: 1023px), (max-height: 619px), (min-height: 1401px)',
    },
    (ctx: Any) => {
      if (ctx.conditions.desk) { rebrandPinned(); demoPinned(); tourPinned(); }
      else { rebrandSimple(); demoSimple(); tourSimple(); }
      ScrollTrigger.sort();
      return () => {
        ['vt-rebrand', 'vt-demo', 'vt-tour'].forEach((id) => document.getElementById(id)?.classList.remove('is-pinned'));
        $('#vt-morph')?.classList.remove('is-morph');
        resetDemoText();
      };
    },
  );

  compare();
  stack();
  working();
  quote();
  rises();

  ScrollTrigger.sort();
  ScrollTrigger.refresh();
  window.addEventListener('load', () => ScrollTrigger.refresh());
}
