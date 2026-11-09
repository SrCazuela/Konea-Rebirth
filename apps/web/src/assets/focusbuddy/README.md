# Personajes de FocusBuddy

El chibi de la artista del equipo es el personaje predeterminado en la web y
en el cliente de escritorio. Ambos usan los mismos **35 sprites originales de
alta resolución**, almacenados en
`apps/focusbuddy/electron/assets/avatar-hq/`. La web los importa desde esa
carpeta; no mantiene una segunda colección de imágenes.

## Sprites oficiales

- PNG con transparencia, de `2136 × 3000` píxeles.
- Copias sin recortes, redimensionado ni modificación de los originales.
- Un viewport común de `1778 × 2065` píxeles, con límites
  `[176, 915, 1954, 2980]`, se aplica mediante CSS para encuadrar al personaje.
- El manifiesto `source-manifest.json` conserva nombres de origen, grupos,
  dimensiones y sumas SHA-256 de las imágenes.
- Solo se precargan los fotogramas de la escena visible. Las escenas y el
  motor de parpadeo se comparten con el cliente de escritorio.

`ChibiSprite` conserva el encuadre y añade la misma flotación suave que el
escritorio: un ciclo de 3,2 segundos y un desplazamiento vertical de 3 píxeles.
El parpadeo usa los dibujos abiertos, intermedios y cerrados de cada pose
cuando están disponibles. Las poses sin cierre propio mantienen sus dibujos;
no saltan a otra pose para simularlo. Las animaciones respetan el movimiento
reducido del sistema.

Los sprites recortados destinados al seguimiento del ratón todavía no se usan
en ejecución. Esa interacción requiere anclajes y máscaras de los ojos para
ubicar los iris de manera correcta.

## Kuco como alternativa

`owl-shimeji-provisional.png` conserva a **Kuco**, el búho violeta y crema,
como opción de personaje. Se creó para Konea con la herramienta de generación
de imágenes de OpenAI el 23 de septiembre de 2026. El chibi oficial procede
del trabajo de la artista del equipo.

La hoja de Kuco es un PNG transparente de `1402 × 1122` píxeles, organizado
en cuatro columnas y cuatro filas. Incluye cuatro fotogramas por estado:
`idle`, `focus`, `paused` y `completed`. Su copia también se empaqueta en el
cliente de escritorio.
