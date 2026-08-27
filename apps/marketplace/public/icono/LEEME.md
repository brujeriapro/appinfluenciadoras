# Los íconos de la marca

Generados con Martian Mono ExtraBold, la fuente que exige el handoff de
identidad. El archivo está en `assets/MartianMono-ExtraBold.ttf` para poder
regenerarlos sin depender de que alguien la tenga instalada.

| Archivo | Uso |
|---|---|
| `icono-16.png` | Favicon chico. **Solo la C**, sin corchetes |
| `icono-32.png` | Favicon normal, ya con corchetes |
| `icono-64.png` | Pestaña en pantallas densas |
| `icono-180.png` | Ícono de app en iOS |
| `icono-1024.png` | Tiendas y material impreso |

⚠️ **A 16 px los corchetes se cierran contra la C y se empastan.** Por eso ese
tamaño lleva solo la C, tal como pide el handoff. Los corchetes vuelven desde
32 px.

Reglas que hay que respetar si se regeneran:

- Martian Mono ExtraBold siempre, nunca otra fuente.
- Negro sobre lima. El lima sobre fondo claro se pierde.
- **Sin esquinas redondeadas**, sin sombra, sin degradado, sin contorno.
- Nunca magenta ni azul en el logo.
- Aire alrededor de al menos la altura de la C.

Para regenerarlos, el comando está en `scripts/generar-iconos.sh`.
