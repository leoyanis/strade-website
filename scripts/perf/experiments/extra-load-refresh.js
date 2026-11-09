// Measurement-only: an extra resize event at load (ScrollTrigger refreshes on resize), standing in for the
// ScrollTrigger.refresh() the atmosphere script used to run on load on bare pages (removed by U6). Tells whether
// that refresh is what the phone-4x hero's hand of cards depends on.
addEventListener('load', () => setTimeout(() => dispatchEvent(new Event('resize')), 0));
