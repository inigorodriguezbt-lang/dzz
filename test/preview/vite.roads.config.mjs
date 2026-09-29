// Vite config for the roads preview runs: no HMR, so editing the module doesn't reload a page mid-screenshot.
export default { root: new URL( '../..', import.meta.url ).pathname, server: { hmr: false, watch: null } };
