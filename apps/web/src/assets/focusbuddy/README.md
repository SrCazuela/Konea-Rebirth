# Avatar provisional de FocusBuddy

`owl-shimeji-provisional.png` es una hoja de sprites provisional creada
expresamente para Konea mediante la herramienta de generación de imágenes de
OpenAI el 23 de septiembre de 2026. No reutiliza un personaje ni una hoja de
sprites de terceros.

## Contrato visual

- imagen PNG con transparencia, de `1402 x 1122` píxeles;
- cuadrícula lógica de cuatro columnas y cuatro filas;
- cuatro fotogramas por estado;
- filas, en orden: `idle`, `focus`, `paused` y `completed`;
- punto de apoyo visual consistente en la parte inferior de cada celda.

El prompt solicitó una mascota estudiantil original tipo acompañante de
escritorio: un búho violeta y crema, con birrete, sin texto, logotipos ni marcas
de agua. El recurso es deliberadamente provisional y debe sustituirse por los
sprites finales del equipo de ilustración conservando la misma cuadrícula. Al
reemplazarlo también se debe sincronizar la copia empaquetada en
`apps/focusbuddy/electron/`; si cambia el contrato visual, deben ajustarse
`FocusAvatar.tsx` y los estilos de ambos clientes.

La interfaz mantiene texto alternativo por estado y detiene la animación cuando
el sistema solicita movimiento reducido.
