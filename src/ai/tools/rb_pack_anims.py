# all_anims.glb (rb_build.py anims) -> anims.bin: the clip bank the game samples itself.
#   python3.11 rb_pack_anims.py <all_anims.glb> <out.bin>
# Layout: u32 json length, json header, padding to 4, then per clip: int16 quaternions [frames][bones][4]
# (x32767) followed by float32 pelvis offsets [frames][3] (armature cm, the forward drift of the walk cycles removed).
import json, struct, sys
import numpy as np

src, out = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read()
L = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + L])
binoff = 20 + L + 8

BONES = ['Bip01 Pelvis', 'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 Neck', 'Bip01 Head',
         'Bip01 L Clavicle', 'Bip01 L UpperArm', 'Bip01 L Forearm', 'Bip01 L Hand',
         'Bip01 R Clavicle', 'Bip01 R UpperArm', 'Bip01 R Forearm', 'Bip01 R Hand',
         'Bip01 L Thigh', 'Bip01 L Calf', 'Bip01 L Foot', 'Bip01 L Toe0',
         'Bip01 R Thigh', 'Bip01 R Calf', 'Bip01 R Foot', 'Bip01 R Toe0']
# name: (source clip, keep seconds (None = all), fps, loop crossfade seconds, cyclic locomotion)
CLIPS = {
	'walk_drunk': ('walk_drunk', None, 30, 0, True),
	'walk_bruised': ('walk_bruised', None, 30, 0, True),
	'walk_injured': ('walk_injured', None, 30, 0, True),
	'walk_slow': ('walk_slow_01', None, 30, 0, True),
	'walk': ('walk_neutral_01', None, 30, 0, True),
	'run_injured': ('run_injured', None, 30, 0, True),
	'run_fast': ('run_fast_01', None, 30, 0, True),
	'run': ('run_neutral_01', None, 30, 0, True),
	'run_slow': ('run_slow_01', None, 30, 0, True),
	'idle_drunk': ('idle_drunk_01', 14, 15, 1.2, False),
	'idle_drunk2': ('idle_drunk_02', 14, 15, 1.2, False),
	'idle': ('idle_neutral_01', None, 15, 0, False),
	'look_around': ('idle_look_around_01', None, 15, 0, False),
	'roll_head': ('idle_roll_head_01', None, 15, 0, False),
	'cough': ('idle_cough_01', None, 15, 0, False),
	'angry': ('idle_angry_01', 12, 15, 1.0, False),
	'crouch_idle': ('crouch_idle', None, 15, 0, False),
	'knock_door': ('knock_door', None, 30, 0, False),
	'crouch_in': ('crouch_in', None, 30, 0, False),
}

nodes = j['nodes']
nidx = {n['name']: i for i, n in enumerate(nodes)}
anims = {a['name']: a for a in j['animations']}


def acc(i):
	a = j['accessors'][i]
	bv = j['bufferViews'][a['bufferView']]
	n = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
	return np.frombuffer(b, np.float32, a['count'] * n, binoff + bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(a['count'], n).copy()


def nlerp(a, b, t):
	# per frame / bone quaternion blend with hemisphere fix
	d = (a * b).sum(-1, keepdims=True)
	b = np.where(d < 0, -b, b)
	q = a * (1 - t) + b * t
	return q / np.linalg.norm(q, axis=-1, keepdims=True)


header = {'bones': [n.replace(' ', '_') for n in BONES], 'clips': [], 'rest': {}}
# rest local rotations of the reference skeleton (the game's avatars use the same Biped frames)
for n in BONES:
	header['rest'][n.replace(' ', '_')] = nodes[nidx[n]].get('rotation', [0, 0, 0, 1])
blobs = []
offset = 0
for name, (srcn, keep, fps, xfade, cyc) in CLIPS.items():
	a = anims[srcn]
	rot = {}; pel = None; times = None
	for c in a['channels']:
		node = nodes[c['target']['node']]['name']
		s = a['samplers'][c['sampler']]
		tt = acc(s['input'])[:, 0]
		if times is None or len(tt) > len(times): times = tt
		if c['target']['path'] == 'rotation' and node in BONES: rot[node] = (tt, acc(s['output']))
		if c['target']['path'] == 'translation' and node == 'Bip01 Pelvis': pel = (tt, acc(s['output']))
	F = len(times)
	def res(tv):
		# resample a (possibly optimised) track onto the clip's frame times
		tt, v = tv
		if len(tt) == F: return v
		return np.stack([np.interp(times, tt, v[:, k]) for k in range(v.shape[1])], 1)
	Q = np.stack([res(rot[n]) if n in rot else np.tile(np.array(nodes[nidx[n]].get('rotation', [0, 0, 0, 1]), np.float32), (F, 1)) for n in BONES], axis=1)  # [F, B, 4]
	Q /= np.linalg.norm(Q, axis=-1, keepdims=True)
	P = res(pel).copy() if pel else np.zeros((F, 3), np.float32)
	# hemisphere-continuous quaternions (the int16 packing and nlerp both want neighbours close)
	for f in range(1, F):
		d = (Q[f] * Q[f - 1]).sum(-1)
		Q[f][d < 0] *= -1
	dur = times[-1] - times[0]
	speed = 0.0
	if cyc:
		# in-place: remove the forward drift over the cycle (x forward, z sideways in the armature frame)
		drift = P[-1] - P[0]
		speed = float(np.hypot(drift[0], drift[2])) * 0.01 / dur
		t = (times - times[0]) / dur
		P[:, 0] -= drift[0] * t; P[:, 2] -= drift[2] * t
		# the last frame repeats the first: drop it, the sampler wraps
		Q = Q[:-1]; P = P[:-1]; F -= 1
	if keep and dur > keep + xfade:
		n = int(round((keep + xfade) * 30)) + 1
		Q = Q[:n]; P = P[:n]; F = n
	if xfade > 0:
		# seamless loop: the head becomes a blend from the tail into the start
		k = int(round(xfade * 30))
		body = F - k
		w = (np.arange(k) / k)[:, None, None]
		head = nlerp(Q[body:body + k], Q[:k], w)
		Q = np.concatenate([head, Q[k:body]], 0)
		ph = P[body:body + k] * (1 - w[:, :, 0]) + P[:k] * w[:, :, 0]
		P = np.concatenate([ph, P[k:body]], 0)
		F = len(Q)
	step = 30 // fps
	if step > 1:
		Q = Q[::step]; P = P[::step]; F = len(Q)
	qi = np.round(np.clip(Q, -1, 1) * 32767).astype('<i2')
	blob = qi.tobytes() + P.astype('<f4').tobytes()
	header['clips'].append({'name': name, 'frames': F, 'fps': fps, 'offset': offset, 'loop': True, 'speed': round(speed, 4),
		'dur': round(F / fps, 4)})
	blobs.append(blob)
	offset += len(blob)
	print(f'{name:14s} frames {F:4d} @{fps} dur {F / fps:5.2f}s speed {speed:.2f} m/s bytes {len(blob)}')
hj = json.dumps(header, separators=(',', ':')).encode()
pad = (4 - (4 + len(hj)) % 4) % 4
hj += b' ' * pad
with open(out, 'wb') as f:
	f.write(struct.pack('<I', len(hj)))
	f.write(hj)
	for bl in blobs: f.write(bl)
print('total', 4 + len(hj) + offset)
