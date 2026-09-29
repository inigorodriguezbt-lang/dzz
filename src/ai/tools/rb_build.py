# Rocketbox avatar -> Deadtide character (run with python3.11 + the `bpy` module, PIL, numpy).
#
#   python3.11 rb_build.py avatar <avatar.fbx> <texdir> <outdir> <name> '<json opts>'
#   python3.11 rb_build.py anims <ref_avatar.fbx> <out.glb> <clip.fbx> [...]
#
# avatar: one GLB (skinned mesh 'skin' + alpha-tested 'cards', decimated 'lod1', the 80-bone Bip01
#   skeleton, no images) and three atlas images next to it:
#     <name>_c.jpg  colour atlas 1024 x (1024 + 512 k): body on top, head / helmet / gear / hair cards in 512 cells below
#     <name>_n.jpg  normal atlas at half resolution
#     <name>_m.png  mask atlas at half resolution: R skin, G eyes, B alpha (cards) / 1 - garment (body cell)
#   opts: { "sc": chroma sigma, "sy": luma sigma (log), "deny": [[u0,v0,u1,v1,cell]], "allow": [...], "aloha": [palette...] }
# anims: the reference avatar's skeleton (no mesh) with every clip retargeted by bone name in world space
#   (Tidewater's tools/characters/convert.py method) and exported as glTF animations (one per clip).
import bpy, sys, os, glob, json, math
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
mode = argv[0]


def import_fbx(path, anim=True):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path, use_anim=anim, automatic_bone_orientation=False, ignore_leaf_bones=False)
    return [o for o in bpy.data.objects if o not in before]


# ---- skin mask ----------------------------------------------------------------------------------------

def ycc(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return 0.299 * r + 0.587 * g + 0.114 * b, 128 - 0.168736 * r - 0.331264 * g + 0.5 * b, 128 + 0.5 * r - 0.418688 * g - 0.081312 * b


def ref_skin(head):
    h, w = head.shape[:2]
    s = []
    for u, v in [(0.5, 0.2), (0.42, 0.33), (0.58, 0.33), (0.5, 0.36)]:
        x, y = int(u * w), int(v * h)
        s.append(head[y - 6:y + 6, x - 6:x + 6].reshape(-1, 3))
    return np.median(np.concatenate(s).astype(np.float32), axis=0)


def skin_mask(img, ref, sc, sy):
    a = img.astype(np.float32)
    y, cb, cr = ycc(a)
    y0, cb0, cr0 = ycc(ref.reshape(1, 1, 3))
    dc = ((cb - cb0) ** 2 + (cr - cr0) ** 2) / (sc * sc)
    ly = np.log((y + 8) / (y0 + 8)) / sy
    m = np.clip((np.exp(-dc - ly * ly) - 0.25) / 0.5, 0, 1)
    im = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1.5))
    return np.asarray(im).astype(np.float32) / 255


def rects(mask, lst, cell, value):
    h, w = mask.shape
    for r in lst:
        if len(r) > 4 and r[4] != cell: continue
        x0, y0, x1, y1 = int(r[0] * w), int(r[1] * h), int(r[2] * w), int(r[3] * h)
        mask[y0:y1, x0:x1] = value


# ---- aloha print ----------------------------------------------------------------------------------------

def aloha_tile(S, pal, seed):
    rnd = np.random.RandomState(seed)
    base, leaf, petal, center = [tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in pal]
    im = Image.new('RGB', (S, S), base)
    d = ImageDraw.Draw(im)
    def wrap(fn, x, y):
        for ox in (-S, 0, S):
            for oy in (-S, 0, S): fn(x + ox, y + oy)
    for k in range(26):
        x, y, a, L = rnd.rand() * S, rnd.rand() * S, rnd.rand() * math.pi, S * (0.06 + rnd.rand() * 0.07)
        def lf(x, y):
            pts = []
            for t in np.linspace(0, math.pi * 2, 24):
                px, py = math.cos(t) * L, math.sin(t) * L * 0.32
                pts.append((x + px * math.cos(a) - py * math.sin(a), y + px * math.sin(a) + py * math.cos(a)))
            d.polygon(pts, fill=leaf)
            d.line([(x - math.cos(a) * L, y - math.sin(a) * L), (x + math.cos(a) * L, y + math.sin(a) * L)], fill=base, width=max(1, S // 256))
        wrap(lf, x, y)
    for k in range(9):
        x, y, R, a0 = rnd.rand() * S, rnd.rand() * S, S * (0.045 + rnd.rand() * 0.035), rnd.rand() * 6.28
        def fl(x, y):
            for p in range(5):
                a = a0 + p / 5 * math.pi * 2
                cx, cy = x + math.cos(a) * R * 0.62, y + math.sin(a) * R * 0.62
                d.ellipse([cx - R * 0.55, cy - R * 0.55, cx + R * 0.55, cy + R * 0.55], fill=petal)
            d.ellipse([x - R * 0.22, y - R * 0.22, x + R * 0.22, y + R * 0.22], fill=center)
            d.line([(x, y), (x + math.cos(a0 + 0.6) * R * 0.9, y + math.sin(a0 + 0.6) * R * 0.9)], fill=center, width=max(1, S // 200))
        wrap(fl, x, y)
    return im.filter(ImageFilter.GaussianBlur(0.6))


def make_aloha(body, skin, opts):
    # the shirt: listed rects, minus skin; its folds come from the blurred luminance (drops the old print)
    H, W = body.shape[:2]
    m = np.zeros((H, W), np.float32)
    for r in opts['shirt']:
        m[int(r[1] * H):int(r[3] * H), int(r[0] * W):int(r[2] * W)] = 1
    m *= 1 - np.clip(skin * 1.6, 0, 1)
    # stay off the background (black)
    lum = body.astype(np.float32).mean(axis=2)
    m *= np.clip((lum - 12) / 20, 0, 1)
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    L = Image.fromarray(lum.astype(np.uint8)).filter(ImageFilter.GaussianBlur(W / 150))
    L = np.asarray(L).astype(np.float32)
    ref = np.percentile(L[m > 0.5], 80) if (m > 0.5).any() else 128
    shade = np.clip(L / max(ref, 1), 0.35, 1.25)[..., None]
    tile = np.asarray(aloha_tile(W // 2, opts['aloha'], opts.get('seed', 3))).astype(np.float32)
    pat = np.tile(tile, (2, 2, 1))[:H, :W]
    out = body.astype(np.float32) * (1 - m[..., None]) + pat * shade * m[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


# ---- avatar ------------------------------------------------------------------------------------------------

def build_avatar(fbx, texdir, outdir, name, opts):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = import_fbx(fbx, anim=False)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    mesh = next(o for o in objs if o.type == 'MESH')
    for o in objs:
        if o.type == 'EMPTY': bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    arm.name = 'Avatar'
    mesh.name = 'skin'
    me = mesh.data

    # texture per material
    cells = []  # [ kind, color path, normal path ]
    tex = {}
    for m in me.materials:
        pre, kind = m.name.split('_', 1)
        kind2 = {'equpiment': 'equipment'}.get(kind, kind)
        c = sorted(glob.glob(f'{texdir}/{pre}_{kind2}_color*.tga')) or sorted(glob.glob(f'{texdir}/*_{kind2}_color*.tga'))
        n = sorted(glob.glob(f'{texdir}/{pre}_{kind2}_normal*.tga')) or sorted(glob.glob(f'{texdir}/*_{kind2}_normal*.tga'))
        tex[m.name] = (kind2, c[0] if c else None, n[0] if n else None)
    # cell layout: body = top 1024², the rest 512² cells two per row below (head first)
    order = [k for k in me.materials.keys() if tex[k][0] == 'body'] + [k for k in me.materials.keys() if tex[k][0] == 'head'] + \
        [k for k in me.materials.keys() if tex[k][0] not in ('body', 'head')]
    nsmall = len(order) - 1
    rows = (nsmall + 1) // 2
    W, H = 1024, 1024 + 512 * rows
    place = {}
    for i, k in enumerate(order):
        if i == 0: place[k] = (0, 0, 1024)
        else:
            j = i - 1
            place[k] = ((j % 2) * 512, 1024 + (j // 2) * 512, 512)
    col = Image.new('RGB', (W, H), (0, 0, 0))
    nor = Image.new('RGB', (W // 2, H // 2), (128, 128, 255))
    msk = np.zeros((H // 2, W // 2, 3), np.float32)
    msk[..., 2] = 1
    alpha_mats = set()
    head_img = None
    for k in order:
        kind, cp, np_ = tex[k]
        if kind == 'head': head_img = np.asarray(Image.open(cp).convert('RGB').resize((256, 256)))
    ref = ref_skin(head_img) if head_img is not None else np.array([200, 150, 120], np.float32)
    y0 = ycc(ref.reshape(1, 1, 3))[0].item()
    sc = opts.get('sc', 11.0 if y0 > 110 else 14.0)
    sy = opts.get('sy', 0.42 if y0 > 110 else 0.8)
    print('ref skin', ref, 'y0', round(y0), 'sc', sc, 'sy', sy)
    for k in order:
        kind, cp, np_ = tex[k]
        x, y, S = place[k]
        src = Image.open(cp) if cp else Image.new('RGB', (S, S), (128, 128, 128))
        has_a = src.mode == 'RGBA' and np.asarray(src)[..., 3].min() < 250
        rgb = src.convert('RGB').resize((S, S), Image.LANCZOS)
        a_img = None
        if has_a:
            alpha_mats.add(k)
            a_img = src.split()[-1].resize((S, S), Image.LANCZOS)
            # bleed the colour into the transparent texels so mips don't halo dark
            A = np.asarray(a_img).astype(np.float32) / 255
            C = np.asarray(rgb).astype(np.float32)
            avg = (C * A[..., None]).sum((0, 1)) / max(1, A.sum())
            ca = Image.fromarray(np.clip(C * A[..., None], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(10))
            ca = np.asarray(ca).astype(np.float32)
            wa = np.asarray(a_img.filter(ImageFilter.GaussianBlur(10))).astype(np.float32)[..., None] / 255
            fill = np.where(wa > 0.03, ca / np.maximum(wa, 0.03), avg)
            C = C * A[..., None] + fill * (1 - A[..., None])
            rgb = Image.fromarray(np.clip(C, 0, 255).astype(np.uint8))
        arr = np.asarray(rgb)
        if kind == 'body' and opts.get('aloha'):
            sk = skin_mask(arr, ref, sc, sy)
            arr = make_aloha(arr, sk, opts)
            rgb = Image.fromarray(arr)
        col.paste(rgb, (x, y))
        if np_:
            nor.paste(Image.open(np_).convert('RGB').resize((S // 2, S // 2), Image.LANCZOS), (x // 2, y // 2))
        half = np.asarray(rgb.resize((S // 2, S // 2), Image.LANCZOS))
        if kind in ('body', 'head'):
            sk = skin_mask(half, ref, sc, sy)
            if kind == 'head':
                # the eyeball / mouth-interior patches of the shared head layout are never skin
                hh, ww = sk.shape
                sk[int(0.56 * hh):, :int(0.4 * ww)] = 0
            rects(sk, opts.get('deny', []), kind, 0)
            for r in opts.get('allow', []):
                if len(r) > 4 and r[4] != kind: continue
                hh, ww = sk.shape
                sub = skin_mask(half, ref, sc * 1.6, sy * 1.6)
                x0, y0_, x1, y1 = int(r[0] * ww), int(r[1] * hh), int(r[2] * ww), int(r[3] * hh)
                sk[y0_:y1, x0:x1] = np.maximum(sk[y0_:y1, x0:x1], sub[y0_:y1, x0:x1])
            if 'only' in opts and kind == 'body':
                keep = np.zeros_like(sk)
                rects(keep, opts['only'], 'body', 1)
                sk *= keep
            msk[y // 2:(y + S) // 2, x // 2:(x + S) // 2, 0] = sk
        if kind == 'head':
            # milky eyes: the eyeball patch of the shared head layout
            hh = S // 2
            yy, xx = np.mgrid[0:hh, 0:hh] / hh
            d = np.hypot(xx - 0.264, yy - 0.932)
            msk[y // 2:(y + S) // 2, x // 2:(x + S) // 2, 1] = np.clip((0.05 - d) / 0.012, 0, 1)
        if a_img is not None:
            msk[y // 2:(y + S) // 2, x // 2:(x + S) // 2, 2] = np.asarray(a_img.resize((S // 2, S // 2), Image.LANCZOS)).astype(np.float32) / 255
    os.makedirs(outdir, exist_ok=True)
    col.save(f'{outdir}/{name}_c.jpg', quality=84, optimize=True, progressive=True)
    nor.save(f'{outdir}/{name}_n.jpg', quality=86, optimize=True)

    # UVs into the atlas (Blender UV origin is bottom-left; atlas rows count from the top)
    uv = me.uv_layers.active.data
    mats = list(me.materials.keys())
    for p in me.polygons:
        k = mats[p.material_index]
        x, y, S = place[k]
        for li in p.loop_indices:
            u, v = uv[li].uv
            uu = (x + u * S) / W
            vv = 1 - (y + (1 - v) * S) / H
            uv[li].uv = (uu, vv)
    # garment mask (the game prints aloha patterns there): faces of the body texture skinned mostly to the
    # spine, clavicles and upper arms, minus skin. Stored as 1 - shirt in the mask's B channel of the body
    # cell, which the opaque material never reads as alpha (card alpha lives in the other cells).
    if opts.get('shirt', True):
        SH = {'Bip01 Spine', 'Bip01 Spine1', 'Bip01 Spine2', 'Bip01 L Clavicle', 'Bip01 R Clavicle', 'Bip01 L UpperArm', 'Bip01 R UpperArm'}
        gname = {vg.index: vg.name for vg in mesh.vertex_groups}
        vw = np.zeros(len(me.vertices), np.float32)
        for v in me.vertices:
            tot = sum(g.weight for g in v.groups)
            sh = sum(g.weight for g in v.groups if gname.get(g.group) in SH)
            vw[v.index] = sh / tot if tot > 0 else 0
        body_key = order[0]
        sm = Image.new('L', (W // 2, H // 2), 0)
        dr = ImageDraw.Draw(sm)
        nf = 0
        for p in me.polygons:
            if mats[p.material_index] != body_key: continue
            if float(np.mean([vw[i] for i in p.vertices])) < opts.get('shirtW', 0.55): continue
            dr.polygon([(uv[li].uv[0] * W / 2, (1 - uv[li].uv[1]) * H / 2) for li in p.loop_indices], fill=255)
            nf += 1
        sm = sm.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.0))
        shirt = np.asarray(sm).astype(np.float32)[:512, :512] / 255
        shirt *= 1 - np.clip(msk[:512, :512, 0] * 1.5, 0, 1)
        msk[:512, :512, 2] = 1 - shirt
        print('shirt faces', nf, 'coverage', round(float(shirt.mean()), 3))
    Image.fromarray((msk * 255).astype(np.uint8)).save(f'{outdir}/{name}_m.png', optimize=True)
    # two materials: opaque skin and alpha-tested cards
    skin_m = bpy.data.materials.new('skin')
    card_m = bpy.data.materials.new('cards')
    idx = [1 if mats[p.material_index] in alpha_mats else 0 for p in me.polygons]
    me.materials.clear()
    me.materials.append(skin_m)
    me.materials.append(card_m)
    for p, i in zip(me.polygons, idx): p.material_index = i
    # LOD1: no cards, decimated
    lod = mesh.copy(); lod.data = me.copy(); lod.name = 'lod1'
    bpy.context.collection.objects.link(lod)
    import bmesh
    bm = bmesh.new(); bm.from_mesh(lod.data)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.material_index == 1], context='FACES')
    bm.to_mesh(lod.data); bm.free()
    lod.data.materials.pop(index=1)
    ntri = sum(len(p.vertices) - 2 for p in lod.data.polygons)
    dm = lod.modifiers.new('dec', 'DECIMATE')
    dm.ratio = min(1.0, opts.get('lodTris', 2200) / max(1, ntri))
    bpy.context.view_layer.objects.active = lod
    for o in bpy.context.view_layer.objects: o.select_set(o == lod)
    # the armature modifier must stay after the decimation
    bpy.ops.object.modifier_move_to_index(modifier='dec', index=0)
    bpy.ops.object.modifier_apply(modifier='dec')
    lod.data.calc_loop_triangles()
    print('lod1 tris', len(lod.data.loop_triangles), 'from', ntri)
    for o in bpy.context.view_layer.objects: o.select_set(False)
    out = f'{outdir}/{name}.glb'
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_image_format='NONE', export_materials='EXPORT',
        export_skins=True, export_animations=False, export_def_bones=False, export_morph=False,
        export_yup=True, export_apply=False, export_cameras=False, export_lights=False, export_tangents=False,
        export_texcoords=True, export_normals=True,
    )
    print('EXPORTED', out, os.path.getsize(out), 'atlas', W, H, 'alpha', sorted(alpha_mats))


# ---- clips ----------------------------------------------------------------------------------------------------

def build_anims(ref, out, clips):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.render.fps = 30
    objs = import_fbx(ref, anim=False)
    arm = next(o for o in objs if o.type == 'ARMATURE')
    for o in objs:
        if o.type != 'ARMATURE': bpy.data.objects.remove(o, do_unlink=True)
    for a in list(bpy.data.actions): bpy.data.actions.remove(a)
    arm.name = 'Avatar'
    arm.animation_data_create()
    vl = bpy.context.view_layer
    for path in clips:
        clip = os.path.basename(path).split('.')[0]
        clip = clip[2:] if clip[:2] in ('m_', 'f_') else clip
        new = import_fbx(path)
        a_arm = next((o for o in new if o.type == 'ARMATURE'), None)
        act = a_arm.animation_data.action if a_arm and a_arm.animation_data else None
        if act is None:
            print('NO ACTION', path); continue
        f0, f1 = int(act.frame_range[0]), int(act.frame_range[1])
        for pb in arm.pose.bones:
            if pb.name not in a_arm.pose.bones: continue
            c = pb.constraints.new('COPY_ROTATION'); c.target = a_arm; c.subtarget = pb.name
            c.owner_space = 'WORLD'; c.target_space = 'WORLD'
            if pb.name == 'Bip01 Pelvis':
                c2 = pb.constraints.new('COPY_LOCATION'); c2.target = a_arm; c2.subtarget = pb.name
                c2.owner_space = 'WORLD'; c2.target_space = 'WORLD'
        for o in vl.objects: o.select_set(False)
        arm.select_set(True); vl.objects.active = arm
        bpy.ops.object.mode_set(mode='POSE')
        bpy.ops.pose.select_all(action='SELECT')
        arm.animation_data.action = None
        bpy.ops.nla.bake(frame_start=f0, frame_end=f1, only_selected=True, visual_keying=True, clear_constraints=True,
                         use_current_action=False, bake_types={'POSE'})
        bpy.ops.object.mode_set(mode='OBJECT')
        baked = arm.animation_data.action
        baked.name = clip
        baked.use_fake_user = True
        arm.animation_data.action = None
        for o in new:
            data = o.data
            bpy.data.objects.remove(o, do_unlink=True)
            if isinstance(data, bpy.types.Armature): bpy.data.armatures.remove(data)
        bpy.data.actions.remove(act)
        tr = arm.animation_data.nla_tracks.new(); tr.name = clip
        st = tr.strips.new(clip, f0, baked)
        if hasattr(st, 'action_slot') and baked.slots: st.action_slot = baked.slots[0]
        tr.mute = True
        print('BAKED', clip, f0, f1)
    for a in list(bpy.data.actions):
        if not a.use_fake_user: bpy.data.actions.remove(a)
    arm.animation_data.action = None
    bpy.ops.export_scene.gltf(
        filepath=out, export_format='GLB', export_skins=False, export_animations=True, export_animation_mode='NLA_TRACKS',
        export_force_sampling=True, export_optimize_animation_size=True, export_def_bones=False, export_morph=False,
        export_yup=True, export_apply=False, export_cameras=False, export_lights=False, export_frame_step=1,
    )
    print('EXPORTED', out, os.path.getsize(out))


if mode == 'avatar':
    build_avatar(argv[1], argv[2], argv[3], argv[4], json.loads(argv[5]) if len(argv) > 5 else {})
elif mode == 'anims':
    build_anims(argv[1], argv[2], argv[3:])
