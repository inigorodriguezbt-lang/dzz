// Vite config for the roads preview runs: no HMR push, so editing the module doesn't reload a page mid-screenshot
// (the watcher stays on so the next page load gets the new code).
export default { root: new URL( '../..', import.meta.url ).pathname, server: { hmr: false } };
