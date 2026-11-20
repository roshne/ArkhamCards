// Web stand-in for @shopify/react-native-skia and victory-native: every export renders nothing,
// so deck charts and campaign location maps are blank on web.
// shortcut: Skia's web build needs CanvasKit loaded before first render; wire LoadSkiaWeb() in if
// the charts are wanted on web.
const Null = () => null;

module.exports = new Proxy({}, {
  get: (_target, prop) => (prop === '__esModule' ? false : Null),
});
