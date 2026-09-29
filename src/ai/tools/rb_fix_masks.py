# Fill the gaps in the avatars' skin masks (R channel of <id>_m.png) that rb_build.py's face-referenced skin
# detector leaves: hands and feet redder than the face, the neck and chest inside collars, shins under shorts.
#   python3 rb_fix_masks.py <characters dir> [id ...] [--preview <dir>]
# Seeds are body-cell pixels that look like skin by colour (reddish rather than yellowish, moderate saturation,
# a luminance near the avatar's own face) and are close in chroma to the face or the already-masked skin; they grow
# over neighbouring skin-coloured pixels. Shirts (B = 0 in the body cell) are never skin. Only ever adds skin.
import sys, os, glob
import numpy as np
from PIL import Image, ImageFilter

args = sys.argv[1:]
preview = None
if '--preview' in args:
	i = args.index('--preview'); preview = args[i + 1]; del args[i:i + 2]
root = args[0]
ids = args[1:] or sorted(os.path.basename(p)[:-6] for p in glob.glob(os.path.join(root, '*_m.png')))
# the firefighter's tan turnout gear reads as skin and his skin is all under it
SKIP = { 'm_fire' }
ids = [ i for i in ids if i not in SKIP ]


def ycc(a):
	r, g, b = a[..., 0], a[..., 1], a[..., 2]
	return 0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b


def dilate(m, r=1):
	return np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(r * 2 + 1))) > 127


for id in ids:
	mp = os.path.join(root, id + '_m.png')
	mask = np.asarray(Image.open(mp).convert('RGB')).astype(np.float32) / 255
	H, W = mask.shape[:2]
	col = np.asarray(Image.open(os.path.join(root, id + '_c.jpg')).convert('RGB').resize((W, H), Image.BILINEAR)).astype(np.float32)
	body = np.zeros((H, W), bool); body[:int(H * 1024 / 1536)] = True
	R, B = mask[..., 0], mask[..., 2]
	y, cb, cr = ycc(col)
	# references: the face (head cell, strongly masked) and the skin already masked in the body cell
	refs = []
	for sel in (~body & (R > 0.8) & (y > 25), body & (R > 0.8) & (y > 25)):
		if sel.sum() > 150: refs.append((np.median(y[sel]), np.median(cb[sel]), np.median(cr[sel])))
	if not refs: print(id, 'no reference'); continue
	mx, mn = col.max(axis=2), col.min(axis=2)
	sat = (mx - mn) / np.maximum(mx, 1)
	rg, gb = col[..., 0] - col[..., 1], col[..., 1] - col[..., 2]
	# skin is reddish (R-G against G-B), moderately saturated; khaki, tan canvas and blond hair are yellowish
	generic = (rg > 10) & (rg > gb) & (sat > 0.12) & (sat < 0.62) & (col[..., 0] > col[..., 2])
	def like(sc, sy):
		best = np.zeros((H, W), np.float32)
		for y0, cb0, cr0 in refs:
			d = ((cb - cb0) ** 2 + (cr - cr0) ** 2) / (sc * sc)
			ly = np.log((y + 8) / (y0 + 8)) / sy
			best = np.maximum(best, np.exp(-d - ly * ly))
		return best
	strict, loose = like(11, 0.45), like(20, 0.9)
	shirt = body & (B < 0.5)
	allowed = body & ~shirt & (y > 18) & generic
	seed = allowed & (strict > 0.55)
	grown = seed | (body & (R > 0.5))
	cand = allowed & (loose > 0.22)
	for it in range(40):
		nxt = grown | (dilate(grown) & cand)
		if (nxt == grown).all(): break
		grown = nxt
	# the head cell: the neck and shoulders around the small eye / teeth cells packed into its corner were cut out
	# of the skin with a rectangle; grow the face's skin back over them
	head = ~body; head[:, W // 2:] = False
	# (tighter on luminance than on the body: brown hair meets the face here)
	candH = head & (y > 18) & generic & (mask[..., 1] < 0.3) & (like(14, 0.35) > 0.3)
	gh = head & (R > 0.5)
	for it in range(60):
		nxt = gh | (dilate(gh) & candH)
		if (nxt == gh).all(): break
		gh = nxt
	add = (grown & body & ~shirt) | (gh & head)
	soft = np.asarray(Image.fromarray((add * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
	newR = np.maximum(R, np.minimum(soft, np.clip(loose * 1.6, 0, 1) * 0.5 + 0.5 * soft))
	gain = float(((newR - R) > 0.3).sum())
	print(id, 'refs', [tuple(round(float(v)) for v in r) for r in refs], 'added px', int(gain))
	if preview:
		# the colour atlas with the added skin in green, the old skin in magenta
		out = col.copy()
		out[(newR - R) > 0.3] = out[(newR - R) > 0.3] * 0.3 + np.array([0, 255, 0]) * 0.7
		out[R > 0.5] = out[R > 0.5] * 0.6 + np.array([255, 0, 255]) * 0.4
		Image.fromarray(out.astype(np.uint8)).save(os.path.join(preview, id + '_fix.png'))
	else:
		m2 = mask.copy(); m2[..., 0] = newR
		Image.fromarray((m2 * 255 + 0.5).astype(np.uint8)).save(mp, optimize=True)
