// Web stand-in for @shopify/react-native-skia and victory-native: every export renders nothing,
// so deck charts are blank on web, and campaign location layouts lose their Skia-drawn
// decoration (the location cards themselves still render).
// shortcut: Skia's web build needs CanvasKit loaded before first render; wire LoadSkiaWeb() in if
// the charts are wanted on web.
const Null = () => null;

module.exports = new Proxy({}, {
  get: (_target, prop) => (prop === '__esModule' ? false : Null),
});
