# 🎉 QuizLab

Cuestionarios en directo, gratuitos y de código abierto. El anfitrión muestra la partida en una pantalla y los participantes entran desde el móvil mediante PIN o QR.

La aplicación es un sitio estático con módulos JavaScript nativos. El navegador del anfitrión mantiene la partida y calcula las puntuaciones. No necesita backend propio, cuentas, compilación ni suscripciones. PeerJS proporciona señalización pública y WebRTC transporta los mensajes entre dispositivos. La señalización, STUN, el CDN y las fuentes son servicios externos; no se garantiza su disponibilidad.

## Ejecutar

```bash
python -m http.server 8080
```

Abre `http://localhost:8080`. Para publicar, sirve el directorio mediante HTTPS en un alojamiento estático. Los módulos necesitan HTTP(S), no `file://`. Las dependencias npm son solo para desarrollo y pruebas; no se necesita `node_modules` para publicar.

## Partidas y reconexiones

- Editor de preguntas de texto con 2–4 respuestas, tiempos de 5–90 segundos y puntos normales, dobles o desactivados. Cada participante elige una opción; varias opciones pueden ser válidas.
- Puntos por rapidez, rachas, clasificación y podio; repetición con la misma sala.
- Un corte de señalización no reinicia la pregunta ni el temporizador.
- Un participante desconectado conserva su estado durante 60 segundos desde que el anfitrión detecta el corte. La reconexión automática y la recarga de la misma pestaña usan un token guardado en `sessionStorage`. Si este almacenamiento está bloqueado, la recuperación solo funciona mientras la página siga abierta. Al expirar, hay que volver a entrar y se comienza sin los puntos anteriores.
- Al reconectar se recuperan la pregunta y el tiempo restante, la respuesta ya registrada o los resultados. Las entradas nuevas a mitad de pregunta esperan a la siguiente.
- El anfitrión debe mantener abierta su pestaña: al cerrarla o recargarla termina la sala. Se solicita confirmación al salir, sujeta a las restricciones del navegador.
- El plazo y la puntuación dependen del reloj monotónico del anfitrión y de la llegada de la respuesta. Se muestra la latencia de ida y vuelta; no se compensa con tiempos enviados por el participante. Una conexión lenta puede reducir los puntos o llegar fuera de plazo.

## Biblioteca y copias

Los cuestionarios se guardan localmente con un formato versionado. Las bibliotecas antiguas se leen y se migran al guardar, conservando sus identificadores. Los datos inválidos nunca se sustituyen automáticamente por el ejemplo.

Si falta espacio, el almacenamiento está bloqueado o otra pestaña ha cambiado la biblioteca, se muestra un aviso y los cambios quedan en memoria. **Descarga una copia antes de cerrar o recargar.** El aviso permite descargar los cambios y, si se pudo leer, el archivo original. La biblioteca ofrece también una copia de seguridad en cualquier momento.

«Importar» admite cuestionarios individuales (hasta 2 MB y 200 preguntas) y copias de biblioteca (hasta 20 MB). Las copias se añaden a la biblioteca con identificadores nuevos; no reemplazan los cuestionarios existentes. Los borradores sin completar se pueden importar y editar, pero no iniciar hasta corregirlos. Las descargas de datos corruptos se conservan para su reparación manual.

Formato de cuestionario individual:

```json
{
  "title": "Mi cuestionario",
  "questions": [{
    "text": "¿Cuánto es 2 + 2?",
    "answers": [
      { "text": "3", "correct": false },
      { "text": "4", "correct": true }
    ],
    "time": 20,
    "points": "standard"
  }]
}
```

Una copia de biblioteca usa `{ "version": 2, "quizzes": [...] }` y conserva los IDs en su contenido.

## Configuración de red y límites

El protocolo de partida usa el prefijo `quizparty-v2-`; todos los dispositivos deben cargar esta versión de la aplicación.

`js/config.js` centraliza el servidor de señalización, ICE, los plazos y los límites. Por defecto:

- Señalización TLS: `0.peerjs.com:443`, ruta `/`.
- STUN: `stun:stun.l.google.com:19302`.
- Sin TURN, sin credenciales ni servicios de pago. Redes con NAT o cortafuegos restrictivos pueden impedir la conexión.
- Límite preventivo de 50 participantes retenidos, 100 conexiones simultáneas, 30 mensajes por segundo y conexión, y 8 segundos para completar el alta.

**50 es un límite de protección, no un aforo garantizado.** La capacidad real depende de los dispositivos y la red. No pongas credenciales TURN permanentes en un fichero público. El procedimiento de comprobación en redes reales está en [Mejoras técnicas](docs/MEJORAS_TECNICAS.md).

## Desarrollo y pruebas

Requiere Node.js 22.15 o posterior para las herramientas de desarrollo.

```bash
npm ci
npm run check
npm test
npx playwright install chromium
npm run test:browser
```

Para utilizar un Chromium ya instalado:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

`check` ejecuta ESLint, comprueba sintaxis, enlaces entre módulos, recursos locales y ausencia de manejadores HTML inline. Las pruebas de Node cubren almacenamiento, importación, protocolo, puntuación y el ciclo de partida. Las de Chromium recorren la interfaz con varias pestañas y un transporte simulado; no prueban señalización ni ICE reales.

Distribución del código: `config` (configuración), `protocol` (mensajes), `scoring` (puntuación), `schema`/`storage`/`store` (datos), `navigation` (rutas y limpieza), `util` (interfaz compartida), `editor`, `host`, `player` y `app` (pantallas y coordinación).

Consulta el [estado de las mejoras](docs/MEJORAS_TECNICAS.md) y la [revisión inicial](docs/REVISION.md).

## Licencia

[MIT](LICENSE). QuizLab no está afiliado a Kahoot.
