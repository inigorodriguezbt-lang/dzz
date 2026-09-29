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

export async function launch( extraArgs = [] ) {
	if ( usingLavapipe() ) {
		return chromium.launch( {
			executablePath: LVP_SHELL,
			args: [ '--use-gl=angle', '--use-angle=vulkan', '--enable-features=Vulkan', '--use-vulkan=native', '--disable-gpu-sandbox', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', ...extraArgs ],
			env: { ...process.env, VK_ICD_FILENAMES: ICD },
		} );
	}
	return chromium.launch( { args: [ '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--js-flags=--expose-gc', ...extraArgs ] } );
}

// fewer world workers per page: several test browsers share one memory limit
export async function lean( page, workers = 2 ) {
	await page.addInitScript( ( n ) => Object.defineProperty( navigator, 'hardwareConcurrency', { get: () => n + 1 } ), workers );
}
