# Kuco, avatar de FocusBuddy

`owl-shimeji-provisional.png` es la hoja de sprites de **Kuco**, el búho que
acompaña por defecto las sesiones de FocusBuddy. Fue creada expresamente para
Konea mediante la herramienta de generación de imágenes de OpenAI el 23 de
septiembre de 2026. No reutiliza un personaje ni una hoja de sprites de
terceros.

## Contrato visual

- imagen PNG con transparencia, de `1402 x 1122` píxeles;
- cuadrícula lógica de cuatro columnas y cuatro filas;
- cuatro fotogramas por estado;
- filas, en orden: `idle`, `focus`, `paused` y `completed`;
- punto de apoyo visual consistente en la parte inferior de cada celda.

El prompt solicitó una mascota estudiantil original tipo acompañante de
escritorio: un búho violeta y crema, con birrete, sin texto, logotipos ni marcas
de agua. La misma cuadrícula se empaqueta en `apps/focusbuddy/electron/`. El
chibi oficial se conserva como alternativa seleccionable en el cliente de
escritorio; Kuco permanece como personaje predeterminado porque cubre los cuatro
estados completos y mantiene el mismo contrato visual en web y escritorio.

La interfaz mantiene texto alternativo por estado y detiene la animación cuando
el sistema solicita movimiento reducido.
