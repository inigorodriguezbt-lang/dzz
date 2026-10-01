// Headless Chromium for game tests. There is no GPU in the container: WebGL runs on a CPU driver.
// Mesa's lavapipe (ANGLE -> Vulkan -> llvmpipe, multi-threaded) is much faster than SwiftShader and doesn't
// stall or blow the memory limit on the full game, so it is used when available:
//   - the ICD /usr/share/vulkan/icd.d/lvp_icd.json (apt install mesa-vulkan-drivers)
//   - a copy of Playwright's headless shell without libvk_swiftshader.so (else Chrome's bundled SwiftShader
//     Vulkan wins), made by test/lib/make-lvp-shell.sh into $LVP_SHELL (default below)
// Set SWIFTSHADER=1 to force the old path.
import { chromium } from 'playwright';
import fs from 'node:fs';

const ICD = '/usr/share/vulkan/icd.d/lvp_icd.json';
export const LVP_SHELL = process.env.LVP_SHELL || '/tmp/deadtide-hs-lvp/headless_shell';

export function usingLavapipe() {
	return process.env.SWIFTSHADER !== '1' && fs.existsSync( ICD ) && fs.existsSync( LVP_SHELL );
}

// A pretend pointer lock for every page: the game asks for one when a world starts, and a real lock in the headless
// shell makes the browser re-centre the cursor in an endless loop of synthesized mouse moves, queued to the page
// faster than a slow frame loop drains them (the browser and renderer processes grew by ~50 MB/s each, to 1.7 GB in
// the browser alone). The page sees the lock granted (pointerLockElement, pointerlockchange) as before, so no
// "click to resume" hint shows.
export function fakePointerLock() {
	let locked = null;
	const changed = () => document.dispatchEvent( new Event( 'pointerlockchange' ) );
	Object.defineProperty( Document.prototype, 'pointerLockElement', { get: () => locked, configurable: true } );
	Element.prototype.requestPointerLock = function () { if ( locked !== this ) { locked = this; queueMicrotask( changed ); } return Promise.resolve(); };
	Document.prototype.exitPointerLock = function () { if ( locked ) { locked = null; queueMicrotask( changed ); } };
}

// every context (and so every page) of the browser gets fakePointerLock
function withFakeLock( browser ) {
	const newContext = browser.newContext.bind( browser );
	browser.newContext = async ( ...a ) => {
		const ctx = await newContext( ...a );
		await ctx.addInitScript( fakePointerLock );
		return ctx;
	};
	// (Browser.newPage makes its own context; build it through the patched newContext instead)
	browser.newPage = async ( opts ) => {
		const ctx = await browser.newContext( opts );
		const page = await ctx.newPage();
		page.once( 'close', () => ctx.close().catch( () => {} ) );
		return page;
	};
	return browser;
}

export async function launch( extraArgs = [] ) {
	return withFakeLock( await launchRaw( extraArgs ) );
}

async function launchRaw( extraArgs ) {
	if ( usingLavapipe() ) {
		return chromium.launch( {
			executablePath: LVP_SHELL,
			// (no pipeline warm-up at link time: lavapipe keeps every pipeline's shader IR, and the extra warm-up
			// pipeline per program was ~1.3 of its ~4.3 MB in the GPU process.) Chrome's compositor on Vulkan copies
			// each presented WebGL frame through the CPU (ExternalVkImageBacking readback): the "GPU stall due to
			// ReadPixels" console warnings in these tests come from that, not from the page. Dropping
			// --enable-features=Vulkan --use-vulkan=native removes them but costs the GPU process ~250 MB more
			// (lavapipe's buffers for a second context).
			args: [ '--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--use-vulkan=native', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', '--disable-angle-features=warmUpPipelineCacheAtLink', ...extraArgs ],
			env: { ...process.env, VK_ICD_FILENAMES: ICD },
		} );
	}
	return chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', ...extraArgs ] } );
}

// fewer world workers per page: several test browsers share one memory limit. (Also adds the pretend pointer lock,
// for pages from a browser not made by launch().)
export async function lean( page, workers = 2 ) {
	await page.addInitScript( ( n ) => {
		Object.defineProperty( navigator, 'hardwareConcurrency', { get: () => n + 1 } );
	}, workers );
	await page.addInitScript( fakePointerLock );
}
