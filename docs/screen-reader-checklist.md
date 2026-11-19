# Prueba de uso con lectores de pantalla

Este guion permite completar la evaluación de uso con NVDA y TalkBack. La
inspección de nombres accesibles, roles y foco ayuda a encontrar errores, pero
no acredita la experiencia auditiva. Los casos siguientes conservan estado
**NE — no ejecutado** hasta realizar y registrar la prueba con el lector activo.

## Preparación y evidencia

Registrar fecha, ejecutor, versión de código, sistema operativo, navegador,
versión del lector y ajustes utilizados. Usar una cuenta ficticia exclusiva y
datos de prueba. Grabar solamente el recorrido autorizado; no incluir cookies,
credenciales reales, notificaciones personales ni conversaciones del alumnado.

En Windows, activar NVDA con Edge o Chrome. En Android, activar TalkBack en un
dispositivo real y registrar su modelo y versión. La emulación de un viewport
Android en PC comprueba la disposición visual, no el funcionamiento de TalkBack.

## Casos de aceptación

| Caso  | Acción                                                               | Resultado esperado                                                                                                             | Estado | Evidencia |
| ----- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------ | --------- |
| LP-01 | Recorrer la portada por encabezados, regiones y enlaces.             | Se identifica Konea, el contenido principal y los accesos a ingreso y registro en un orden comprensible.                       | NE     | Pendiente |
| LP-02 | Abrir el diálogo de ingreso con teclado.                             | Se anuncia el diálogo y su propósito; el foco comienza dentro y permanece en él al usar Tab y Shift+Tab.                       | NE     | Pendiente |
| LP-03 | Recorrer usuario, contraseña, visibilidad y envío.                   | Cada control anuncia nombre y estado; mostrar contraseña comunica el cambio sin revelar credenciales reales en la evidencia.   | NE     | Pendiente |
| LP-04 | Enviar una clave ficticia incorrecta y corregirla.                   | El error se comunica de forma comprensible y puede localizarse; el foco permite corregir los campos.                           | NE     | Pendiente |
| LP-05 | Cerrar con Escape y cambiar a registro.                              | El foco vuelve al acceso de origen; se distinguen los modos y sus campos sin conservar errores ajenos.                         | NE     | Pendiente |
| LP-06 | Ingresar y recorrer navegación principal y contenido.                | Se reconoce la sección activa y cada acción tiene un nombre; los cambios de pantalla no pierden el contexto de navegación.     | NE     | Pendiente |
| LP-07 | Abrir Configuración de cuenta y cambiar datos de la cuenta ficticia. | Los campos, instrucciones, validaciones y confirmación de guardado pueden comprenderse con el lector.                          | NE     | Pendiente |
| LP-08 | Cambiar la contraseña de la cuenta ficticia.                         | Se distinguen clave actual, nueva y confirmación; errores y éxito se comunican y no se leen valores ocultos como texto normal. | NE     | Pendiente |
| LP-09 | Cerrar sesión y volver a una ruta privada.                           | Se reconoce el retorno al estado sin sesión y se puede volver a ingresar; no queda contenido privado accesible.                | NE     | Pendiente |
| LP-10 | Repetir ingreso, navegación, cuenta y salida con TalkBack.           | El foco táctil tiene un orden comprensible y permite completar las operaciones en el dispositivo real.                         | NE     | Pendiente |

## Registro del resultado

Usar AP cuando se cumpla el criterio y exista evidencia; FA si se observa un
defecto; BL si una precondición impide comenzar; NE si no se ejecutó. Registrar
el texto anunciado, el paso del problema, la versión y la evidencia. Después de
corregir un defecto se repite el caso; una comprobación estática no cambia el
resultado de la prueba de uso.

La aceptación con estudiantes y la comprobación de compatibilidad con otros
lectores se documentan por separado. Este guion no constituye una certificación
global de conformidad WCAG.
