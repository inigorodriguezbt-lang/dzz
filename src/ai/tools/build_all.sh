#!/bin/sh
# Rebuild every Deadtide character from Microsoft Rocketbox (MIT, https://github.com/microsoft/Microsoft-Rocketbox).
# Needs python3.11 with the `bpy` module (pip install bpy), Pillow and numpy.
#   src/ai/tools/build_all.sh <rocketbox checkout (Assets/...)> [out dir]
# Fetch the listed avatars (Export/*.fbx + Textures/*) and the clips named in rb_pack_anims.py first
# (Tidewater's tools/characters/fetch.sh fetches single repo files through the LFS media URL).
set -e
SRC=${1:?rocketbox dir}; OUT=${2:-$(dirname "$0")/../../../public/models/characters}
HERE=$(cd "$(dirname "$0")" && pwd)
PY=${PY:-python3.11}
# source avatar : output id : build options (JSON)
while IFS=: read -r d id opts; do
	[ -z "$d" ] && continue
	n=$(basename "$d")
	$PY "$HERE/rb_build.py" avatar "$SRC/Assets/Avatars/$d/Export/$n.fbx" "$SRC/Assets/Avatars/$d/Textures" "$OUT" "$id" "${opts:-{\}}"
done <<EOF
Adults/Male_Adult_01:m_casual1:{}
Adults/Female_Adult_17:f_casual2:{}
Professions/Police_Male_03:m_police2:{}
Professions/Military_Male_01:m_army1:{}
Adults/Female_Adult_12:f_casual1:{}
Adults/Female_Adult_13:f_casual3:{}
Adults/Female_Party_01:f_party:{}
Adults/Male_Adult_09:m_casual2:{}
Adults/Male_Adult_11:m_casual3:{}
Adults/Male_Adult_12:m_casual4:{}
Adults/Male_Adult_16:m_tourist1:{}
Professions/Business_Male_07:m_office:{}
Professions/Construction_Male_01:m_worker:{}
Professions/Construction_Male_04:m_overalls:{}
Professions/Delivery_Male_01:m_flannel:{}
Professions/Fire_Male_06:m_fire:{"only": []}
Professions/Medical_Female_01:f_nurse:{}
Professions/Medical_Male_02:m_medic:{}
Professions/Medical_Male_04:m_surgeon:{}
Professions/Military_Female_02:f_army:{}
Professions/Military_Male_04:m_army2:{}
Professions/Pilot_Male_01:m_pilot:{}
Professions/Police_Male_06:m_police1:{}
Professions/Security_Male_01:m_security:{}
Professions/Sports_Female_02:f_sport:{}
Professions/Sports_Male_01:m_swim:{}
Professions/Sports_Male_04:m_sport:{}
EOF
# fill the gaps the face-referenced skin detector leaves in the masks (hands, necks, collars)
python3 "$HERE/rb_fix_masks.py" "$OUT"
[ -n "$SKIP_ANIMS" ] && exit 0
# the clip bank: every clip retargeted onto one reference skeleton, then packed
CLIPS=$(sed -n "s/^\t'[a-z_0-9]*': ('\([a-z_0-9]*\)'.*/\1/p" "$HERE/rb_pack_anims.py" | sort -u)
FILES=""
for c in $CLIPS; do
	f=$(ls "$SRC"/Assets/Animations/*/m_$c.max.fbx "$SRC"/Assets/Animations/*/f_$c.max.fbx 2>/dev/null | head -1)
	FILES="$FILES $f"
done
$PY "$HERE/rb_build.py" anims "$SRC/Assets/Avatars/Adults/Male_Adult_01/Export/Male_Adult_01.fbx" /tmp/all_anims.glb $FILES
$PY "$HERE/rb_pack_anims.py" /tmp/all_anims.glb "$OUT/anims.bin"
