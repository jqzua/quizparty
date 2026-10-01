# Revisión inicial de QuizParty

**Estado posterior:** las mejoras técnicas compatibles con la arquitectura estática se han implementado. Consulta [MEJORAS_TECNICAS.md](MEJORAS_TECNICAS.md) para ver el alcance, la validación y los límites actuales. Las observaciones siguientes describen el código anterior a esas correcciones.

Fecha: 1 de octubre de 2026. Alcance: revisión del HTML, CSS y los seis archivos JavaScript del repositorio. Se han aplicado la traducción de la interfaz al castellano y la eliminación del footer solicitado. Las mejoras de este informe son propuestas pendientes, no correcciones implementadas.

## Traducción aplicada

Pantallas de inicio, biblioteca, editor, anfitrión y participante; botones, ayudas, confirmaciones, validaciones, errores, metadatos, puestos ordinales y cuestionario de ejemplo. Se conserva la marca QuizParty y el formato JSON existente, incluidas sus claves y valores técnicos. Los cuestionarios ya guardados o importados son contenido del usuario y no se modifican. El ejemplo en castellano aparece en navegadores sin biblioteca previa. Se ha aclarado que se elige una sola respuesta aunque haya varias opciones válidas y que la pregunta de continentes usa el modelo de siete continentes.

## Mejoras técnicas

| Prioridad | Evidencia | Mejora propuesta |
| --- | --- | --- |
| Alta | `js/host.js`, `renderLobby`: el evento `open` siempre restablece la fase a `lobby`; `disconnected` ejecuta `reconnect`. | Separar apertura inicial y reconexión de señalización. Evitar reiniciar una partida al reconectar; probar cortes durante una pregunta. |
| Alta | `js/host.js`, `onConnection`: al desconectar se elimina al participante y su puntuación. Todo el estado de partida vive en memoria. | Recuperación con identificador y token de sesión, periodo de gracia y resincronización. Avisar antes de abandonar la pestaña del anfitrión. |
| Alta | `js/player.js`: `gameOver` se activa al terminar y no se reinicia al recibir una nueva pregunta; `hp-again` del anfitrión vuelve al vestíbulo sin notificarlo a los móviles. | Mensaje explícito de nueva partida que restablezca estado, puntuación y pantalla de espera. Restablecer también mensajes de espera y desconexión al entrar en otra sala. |
| Alta | `js/store.js`, `getQuizzes`/`saveQuizzes`: JSON sin validar; errores de lectura provocan regeneración y escritura del ejemplo; no se controla cuota ni bloqueo de almacenamiento. | Validar y versionar datos, recuperar sin sobrescribir una biblioteca corrupta, mostrar errores de guardado y ofrecer exportación de respaldo. |
| Media | `js/host.js`, `handleAnswer`/`startQuestion`: el cierre depende de un intervalo; `Date.now()` no es monotónico. | Comprobar el plazo en cada respuesta con un reloj monotónico. Medir latencia y aclarar cómo afecta a los puntos. |
| Media | `js/app.js`, `route`: un fragmento con codificación inválida puede hacer fallar `decodeURIComponent`. | Validar rutas y ofrecer una salida a inicio ante fragmentos malformados. |
| Media | Variables globales, manejadores HTML inline, ausencia de configuración de pruebas. | Separar protocolo, almacenamiento, puntuación e interfaz; introducir módulos, análisis estático y pruebas de partidas con varios participantes, desconexiones e importaciones. |
| Media | `index.html`: campos sin etiquetas asociadas y zoom desactivado; actualizaciones sin regiones vivas. | Permitir ampliar, añadir etiquetas accesibles, anuncios de resultados, control de foco, navegación con teclado y revisión de contraste. |
| Media | `new Peer(...)` usa configuración por defecto; el anfitrión mantiene una conexión por participante. | Configurar señalización e ICE/TURN explícitamente, probar redes de centros educativos y carga antes de anunciar aforos. TURN supone infraestructura y coste. |
| Baja | Textos repartidos entre HTML y JS; `exportQuiz` elimina caracteres acentuados del nombre del archivo. | Centralizar mensajes si se prevén más idiomas; normalizar nombres de descarga preservando su legibilidad. |

## Comparación funcional con Kahoot

Comparación orientativa con capacidades conocidas de Kahoot; no se ha verificado su catálogo comercial vigente. La disponibilidad de funciones depende del plan y del contexto educativo o empresarial. No se atribuyen precios ni límites concretos.

QuizParty ya cubre el flujo básico: acceso por PIN/QR, editor, tiempo por pregunta, puntos por rapidez, rachas, clasificación y podio. Su ventaja es la sencillez, la ausencia de cuentas y la biblioteca local exportable.

| Área | QuizParty actual | Referencia de Kahoot y oportunidad | Prioridad |
| --- | --- | --- | --- |
| Tipos de pregunta | Texto con 2–4 opciones; se admite una elección entre varias respuestas válidas. | Incorporar selección múltiple real, verdadero/falso explícito, ordenar, respuestas escritas y encuestas. Definir puntuación por tipo. | Alta |
| Resultados y aprendizaje | Clasificación de la sesión; sin historial ni informes exportables. | Resumen por pregunta y participante, tasa de acierto, informe CSV y explicaciones tras responder. | Alta |
| Control de sala | Expulsión solo desde el vestíbulo; se aceptan entradas durante la partida. | Bloqueo de sala, aprobación de entradas, aforo y moderación durante toda la sesión. | Alta |
| Contenido multimedia | Enunciados y respuestas de texto. | Imágenes, audio y vídeo con alternativas accesibles y control de tamaño. | Media |
| Ritmo de aprendizaje | Partida síncrona dirigida por el anfitrión. | Retos a ritmo propio, fechas límite y práctica sin competición. La modalidad asíncrona requiere persistencia accesible sin el anfitrión. | Media |
| Biblioteca | Cuestionarios locales; compartir mediante JSON. | Búsqueda, etiquetas, duplicación completa y banco de preguntas; después, colaboración o enlaces compartidos si se acepta añadir almacenamiento remoto. | Media |
| Dinámica | Competición individual basada en rapidez. | Equipos, preguntas aleatorias y modo centrado en precisión; opciones para personas que necesitan más tiempo. | Media |
| Integraciones | No hay cuentas ni integraciones. | Valorar LMS/SSO solo si existe demanda: implica backend, permisos, operación y tratamiento de datos personales. | Baja |

Orden recomendado: fiabilidad de sesión y moderación; informes y explicación de respuestas; nuevos tipos de pregunta y multimedia; modalidades asíncronas e integraciones.

## Riesgos de seguridad

La severidad es contextual para una aplicación de partidas informales. Esta revisión no es una auditoría de infraestructura ni un análisis de vulnerabilidades de las dependencias.

| Riesgo | Evidencia y alcance | Mitigación propuesta |
| --- | --- | --- |
| Alta: saturación del navegador anfitrión | `js/host.js`, `onConnection`/`handleJoin`: sin aforo, límites de frecuencia, plazo para completar el alta ni cierre de conexiones rechazadas. Muchas conexiones o altas repetidas consumen memoria, CPU y renderizado. | Limitar conexiones y mensajes, cerrar conexiones inválidas, limitar tamaño de mensajes y admitir una sola alta por conexión. |
| Media: entrada no autorizada y retorno tras expulsión | `openRoom` genera un PIN de seis cifras con `Math.random`; `handleJoin` acepta a cualquiera que llegue a la sala. La expulsión no impide reconectar. El PIN es un mecanismo de acceso informal, no autenticación. | Bloquear entradas cuando proceda, aprobación del anfitrión, tokens de invitación de alta entropía y límites de intentos en infraestructura controlada. Usar aleatoriedad criptográfica sin presentar seis cifras como un secreto fuerte. |
| Media: mensajes de protocolo malformados | `js/player.js`, `playerOnMessage`: presupone `d.answers.map`, números y tamaños correctos. El anfitrión solo valida parcialmente las entradas; `Number(d.c)` acepta coerciones como `null` a cero. | Esquemas estrictos por mensaje, tamaños máximos, comprobación de fase y tipos, rechazo y cierre ante abuso. Un anfitrión malicioso puede bloquear la interfaz de sus participantes. |
| Media: integridad de puntuación | `handleAnswer` acepta mientras la fase siga siendo `question`, aunque haya vencido el plazo y el intervalo aún no se haya ejecutado. `handleJoin` permite reemplazar el estado de una conexión registrada. | Verificar plazo al recibir, hacer el alta idempotente y usar transiciones explícitas. El anfitrión controla el código y los resultados: no sirve como evaluación de alta confianza sin autoridad independiente. |
| Media: archivos importados o almacenamiento desmesurados | `js/app.js` lee el archivo entero; `importQuizJson` no limita número de preguntas ni valida elementos nulos. Puede causar bloqueo, errores o agotar la cuota local. | Límite de bytes antes de leer, esquema completo, máximos de preguntas y mensajes de recuperación. |
| Media: cadena de suministro y scripts externos | `index.html` carga PeerJS y qrcode-generator de CDN con versiones fijadas, pero sin SRI; también usa fuentes de Google. Un script comprometido ejecutaría código con acceso a los cuestionarios del origen. | Autoalojar dependencias o añadir SRI y `crossorigin`, revisar actualizaciones y configurar CSP. Retirar manejadores inline para una CSP estricta. No se ha confirmado ninguna vulnerabilidad de esas versiones. |
| Media: metadatos y privacidad de red | WebRTC puede revelar direcciones de red entre pares según ICE y la política del navegador; señalización, CDN y fuentes implican terceros. `localStorage` no está cifrado por la aplicación. | Documentar terceros y retención, evitar datos sensibles, ofrecer borrado local y valorar TURN con política relay si es necesario ocultar direcciones a otros participantes. Verificar la configuración real del despliegue. |
| Baja, defensa adicional: interpolación de identificadores | `renderLibrary` inserta `q.id` y `renderPlayerChips` inserta `connectionId` en atributos HTML sin `esc`. Los IDs importados se regeneran, por lo que no se ha demostrado XSS mediante el importador normal. | Crear nodos y asignar `dataset`, o escapar los atributos; validar datos recuperados del almacenamiento. |

Controles positivos: los textos de preguntas, respuestas y nombres se escapan con `esc` o se asignan mediante `textContent`; el anfitrión calcula puntos, comprueba el índice de pregunta y rechaza respuestas duplicadas; no envía las marcas de respuesta correcta antes del cierre. WebRTC cifra el transporte, pero no acredita la identidad del anfitrión ni garantiza juego limpio.

Pendiente en el despliegue real: comprobar HTTPS, cabeceras CSP y de seguridad, dependencias efectivas, configuración ICE y disponibilidad de señalización. La ausencia de estos controles no se puede afirmar únicamente a partir del repositorio.

## Validación realizada

- Comprobación de sintaxis con `node --check` en los seis archivos JavaScript y revisión con `git diff --check`.
- Prueba local con Playwright y Chromium: idioma del documento, ausencia del footer, navegación a biblioteca y editor, ejemplo traducido, persistencia tras recargar, validaciones en castellano, resultados y ordinales, cierre de pregunta del anfitrión y ausencia de desbordamiento horizontal en la portada a 390 px.
- Sin errores JavaScript en los flujos comprobados. Las peticiones externas se interceptaron: no se ha validado la conexión real PeerJS/WebRTC, el QR ni una partida entre dispositivos. La revisión de seguridad es estática; no se han realizado pruebas de carga ni ataques a servicios externos.
