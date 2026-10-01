# Mejoras técnicas implementadas

Se mantiene la arquitectura estática y P2P, sin backend nuevo, servicios de pago ni proceso de compilación. Los módulos ES organizan el código dentro del mismo navegador.

| Hallazgo de la revisión inicial | Implementación |
| --- | --- |
| Reconectar señalización reinicia la partida | `HostGame.openRoom` distingue la primera apertura. Las siguientes conservan fase, plazo, respuestas y puntos. Reintentos de señalización y aviso visible; tiempo máximo para la apertura inicial. |
| Desconexión elimina al participante | Identificador y token aleatorios de 128 bits, estado retenido durante 60 s tras detectar el corte, reconexión automática, recuperación al recargar la misma pestaña y resincronización por fase. El token no se difunde a otros participantes. Se rechazan tokens falsos y caducados. |
| Cierre accidental del anfitrión | Aviso nativo `beforeunload` y confirmación para navegación interna; los manejadores y temporizadores se eliminan al abandonar la sala. Los avisos de cierre dependen del navegador y no garantizan protección frente al cierre forzado. |
| «Volver a jugar» deja al móvil en el podio | Mensaje `lobby` explícito; limpia respuesta pendiente, resultado, mensajes y estado final. Se mantiene la conexión para futuras partidas y se detectan cortes también después del podio. |
| Biblioteca no validada o sobrescrita al fallar | Esquemas estrictos, envoltorio de versión 2, lectura de la versión antigua y migración al guardar. Errores de lectura preservan el original; errores de escritura conservan cambios en memoria. Descarga de biblioteca y original, aviso persistente y detección de modificaciones en otra pestaña. |
| Plazo dependiente del intervalo | `performance.now()` en ambos extremos; el anfitrión comprueba el plazo al recibir y al resincronizar, rechaza respuestas tardías y confirma las aceptadas. La puntuación es una función independiente. |
| Latencia invisible | Heartbeat con RTT medido en el participante, detección de canales silenciosos y explicación visible de cómo la latencia afecta a los puntos. No se confía en tiempos declarados por el cliente. |
| Rutas malformadas | Analizador de rutas con captura de errores de decodificación, patrones completos y retorno a inicio para rutas desconocidas. |
| Globales, HTML inline y falta de pruebas | Módulos nativos con imports explícitos, sin funciones de aplicación globales ni eventos inline en HTML. ESLint, chequeos de enlaces y sintaxis, pruebas de Node y Chromium, dependencias fijadas y lockfile. PeerJS y el generador QR siguen siendo bibliotecas externas. |
| Accesibilidad | Zoom habilitado, nombres accesibles de campos, casillas y controles; expulsión mediante botones de teclado; foco al cambiar de pantalla; avisos y resultados anunciados; mayor contraste, opción de movimiento reducido y adaptación a pantallas estrechas. |
| Configuración implícita de red | Señalización TLS e ICE/STUN explícitos y comunes a ambos extremos. Sin TURN. Límites preventivos de conexiones, altas, mensajes, preguntas y archivos. |
| Descargas con nombres poco legibles | Normalización de tildes y nombre de reserva al exportar. |

## Verificación automatizada

- `npm run check`: análisis estático, sintaxis, imports y referencias a recursos locales.
- `npm test`: migración y corrupción de biblioteca, cuota, bloqueo y conflicto entre pestañas, importaciones inválidas, rutas, puntuación, mensajes inválidos, reconexión de señalización durante pregunta, recuperación de respuestas y puntos, tokens falsos y caducados, respuestas tardías y duplicadas, entradas tardías, nueva partida y grupo simulado de 50 participantes con rechazo del participante adicional.
- `npm run test:browser`: interfaz real en Chromium con anfitrión y dos participantes; reconexión de señalización, recarga y recuperación de respuesta, corte del canal, repetición de partida, cancelación de navegación del anfitrión, biblioteca corrupta y descarga de respaldo, importación válida e inválida, etiquetas, conservación del foco de teclado y editor sin desbordamiento a 390 y 320 px. El transporte y el QR se simulan para hacer la prueba reproducible y no depender de servicios externos.

Estas pruebas no acreditan la capacidad de 50 conexiones WebRTC reales, conformidad completa con WCAG ni compatibilidad con todos los navegadores. No se ha tenido acceso a redes de centros educativos para validarlas.

## Validación pendiente en una red real

1. Servir la aplicación por HTTPS y probar anfitrión y móviles en el wifi del centro; repetir con un móvil en datos y con los navegadores que utilice el centro.
2. Entrar por PIN y QR, jugar varias preguntas, desconectar temporalmente el wifi de un participante y recuperarlo antes de 60 segundos. Comprobar que conserva identidad y puntos y no responde dos veces.
3. Interrumpir solo la señalización y comprobar que las conexiones de datos existentes siguen jugando; restaurarla y verificar nuevas entradas sin reiniciar la pregunta.
4. Probar recarga de un participante, expiración del periodo de gracia, repetición de partida y cierre del anfitrión.
5. Aumentar gradualmente el grupo, observando tiempo de entrada, RTT, CPU/memoria del anfitrión y mensajes perdidos. Definir el aforo operativo a partir de esas mediciones, no del límite configurado.
6. Si la red bloquea ICE/WebRTC, registrar el fallo. La configuración actual no lo soluciona mediante TURN; añadir un relay queda fuera del alcance sin infraestructura ni coste.

## Límites que se mantienen

- Al cerrar o recargar la pestaña del anfitrión se pierde la sala. La migración del anfitrión y la recuperación tras su cierre exigirían un mecanismo adicional de persistencia o coordinación.
- Sin disponibilidad garantizada de señalización/STUN y sin TURN no se puede prometer conexión desde cualquier red.
- El navegador puede suspender pestañas y retrasar temporizadores. Se comprueba el plazo al procesar mensajes, pero no se garantiza ejecución en segundo plano en todos los móviles.
- El PIN sigue siendo acceso informal: no hay autenticación de usuarios ni evaluación de alta confianza. Los límites mitigan el abuso, pero no constituyen protección completa frente a ataques distribuidos.
- Las copias se añaden al importar; no hay sincronización en la nube. Ante corrupción, el usuario debe reparar el original o recuperar su copia. Los cambios temporales requieren descargarse antes de cerrar.
- La centralización completa de traducciones queda para cuando se necesite más de un idioma; la interfaz actual sigue en castellano.
- Las mejoras funcionales frente a Kahoot y los riesgos de seguridad no cubiertos por estas correcciones siguen siendo propuestas de la revisión inicial.
