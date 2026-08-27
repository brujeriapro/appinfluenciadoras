#!/usr/bin/env bash
# Genera los íconos de la marca a partir de Martian Mono ExtraBold.
#
# La fuente va versionada en assets/ a propósito: el handoff pide que el logo
# no dependa de que alguien la tenga instalada, y sin ella estos íconos salen
# con otra tipografía sin que nadie lo note hasta verlos.
set -e
cd "$(dirname "$0")/.."

FF="node_modules/ffmpeg-static/ffmpeg.exe"
[ -x "$FF" ] || FF="node_modules/ffmpeg-static/ffmpeg"
FUENTE=$(pwd)/assets/MartianMono-ExtraBold.ttf
# ffmpeg necesita los dos puntos de la unidad escapados en Windows.
FE=$(echo "$FUENTE" | sed 's/:/\\:/')

mkdir -p public/icono

for T in 1024 180 64 32; do
  "$FF" -y -f lavfi -i "color=c=0xD6FF00:s=${T}x${T}" \
    -vf "drawtext=fontfile='${FE}':text='[C]':fontcolor=0x0E0E0E:fontsize=$((T*38/100)):x=(w-text_w)/2:y=(h-text_h)/2-th*0.06" \
    -frames:v 1 "public/icono/icono-${T}.png" 2>/dev/null
  echo "  icono-${T}.png"
done

# A 16 px los corchetes se empastan contra la C: solo la C.
"$FF" -y -f lavfi -i "color=c=0xD6FF00:s=16x16" \
  -vf "drawtext=fontfile='${FE}':text='C':fontcolor=0x0E0E0E:fontsize=12:x=(w-text_w)/2:y=(h-text_h)/2-1" \
  -frames:v 1 "public/icono/icono-16.png" 2>/dev/null
echo "  icono-16.png (solo la C)"
