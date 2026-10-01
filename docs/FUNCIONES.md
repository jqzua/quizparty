# Funciones de QuizLab

La aplicación mantiene el funcionamiento estático y P2P, sin cuentas ni backend nuevo. El fondo `assets/fondoQuiz.png` es el archivo original proporcionado por el usuario; se utiliza en portada y pantallas de juego, con paneles claros en biblioteca/editor e indicadores de resultado legibles.

## Tipos de pregunta y puntuación

| Tipo | Edición y respuesta | Criterio |
| --- | --- | --- |
| Elección única | 2–4 opciones. Se elige una. | Cualquiera de las opciones marcadas correctas es válida; mantiene los cuestionarios anteriores. |
| Selección múltiple | Marcar varias opciones y pulsar Enviar. | Debe coincidir exactamente con el conjunto correcto: ni omisiones ni opciones incorrectas. Sin puntos parciales. |
| Verdadero / falso | Dos opciones explícitas; una correcta. | Se elige la opción correcta. |
| Ordenar | El autor escribe las opciones en orden correcto. El anfitrión las mezcla antes de mostrarlas. Se ordenan mediante botones de subir/bajar, también con teclado. | La secuencia completa debe coincidir; sin puntos parciales. No se envía el orden correcto antes del cierre. |
| Respuesta escrita | Hasta 10 variantes aceptadas, de 160 caracteres cada una. | Coincidencia con alguna variante, ignorando mayúsculas y espacios repetidos o de los extremos. Unicode se normaliza a NFC; las tildes y la ñ se conservan. No es corrección semántica ni por IA. |
| Encuesta | Elegir una opción. | No tiene respuestas correctas, no da puntos ni modifica la racha. Se excluye del denominador de la tasa de acierto. |

Para los tipos evaluables se conserva la fórmula de rapidez: base de 500–1000 puntos según el tiempo de llegada al anfitrión, multiplicador normal/doble y bonificación de racha de hasta 500 puntos. El modo sin puntos da cero. Una respuesta incorrecta o no enviada rompe la racha; una encuesta la conserva. El anfitrión valida tipo, opciones, pregunta y plazo; no utiliza puntuaciones calculadas por el móvil.

Las respuestas correctas y la explicación (hasta 1000 caracteres) se muestran tras cerrar la pregunta, tanto al anfitrión como a los participantes. Las selecciones de tipo múltiple se cuentan por opción en el gráfico; una persona puede contribuir a varias barras.

## Resultados e historial

Cada pregunta cerrada registra los participantes que la recibieron, su respuesta, tiempo de llegada, acierto y puntos. Quien entra a mitad de pregunta espera a la siguiente y no se incluye en esa evaluación. Las respuestas de participantes expulsados o cuya sesión caduca se conservan en el informe si recibieron esa pregunta.

El informe final y el historial incluyen:

- Resumen por participante: puntos, preguntas respondidas, aciertos y tasa de acierto.
- Resumen por pregunta: participación, tasa de acierto, solución, explicación y respuestas individuales.
- Exportación CSV con detalle y ambos resúmenes; UTF-8 con BOM, separador `;`, campos entrecomillados y neutralización de fórmulas de hoja de cálculo en los textos.

El panel de sala permite descargar un informe parcial de las preguntas ya cerradas. La pregunta que todavía está abierta no se incluye hasta su cierre. Los puntos del informe pueden incluir participantes que ya no aparecen en la clasificación activa.

El historial se guarda únicamente en el navegador del anfitrión, al cerrar cada pregunta y al terminar la partida, hasta 50 partidas o 4 MB. No se eliminan automáticamente las antiguas: si se alcanza el límite o falla el almacenamiento, se avisa para descargar el CSV y liberar espacio. En «Historial de partidas» se pueden consultar, exportar y eliminar informes; también descargar el JSON original para respaldo o recuperación manual. Los datos corruptos no se sobrescriben. El respaldo JSON del historial no se importa desde la biblioteca de cuestionarios.

Los informes incluyen apodos y respuestas, sin tokens de sesión ni archivos multimedia. El anfitrión controla su conservación y los archivos descargados. No se suben a un servicio de informes.

## Control de sala

El panel permanece disponible durante preguntas, resultados y podio:

- **Bloquear nuevas entradas:** rechaza nuevos participantes y solicitudes pendientes. Las sesiones ya admitidas pueden reconectar con su token.
- **Aprobar cada entrada:** los nuevos participantes esperan hasta dos minutos; no ocupan plaza ni reciben preguntas antes de ser admitidos. El anfitrión admite o rechaza cada solicitud. Las solicitudes existentes se resuelven manualmente aunque se desactive este ajuste para nuevas entradas.
- **Aforo:** entre 1 y 50, incluyendo sesiones desconectadas dentro del periodo de recuperación. Bajar el aforo no expulsa a nadie; bloquea nuevas admisiones hasta que haya plazas.
- **Expulsión:** disponible en cualquier fase. Invalida la sesión y conserva lo ya recogido en el informe. Al no existir autenticación, una persona podría intentar volver con una nueva sesión; usar bloqueo o aprobación cuando sea necesario.

El límite de 50 es preventivo: no garantiza capacidad de WebRTC en una red real. El periodo de recuperación sigue siendo de 60 segundos.

## Multimedia

Se pueden adjuntar archivos al enunciado y a cada opción de respuesta:

| Medio | Formatos | Tamaño máximo por archivo |
| --- | --- | --- |
| Imagen | PNG, JPEG, WebP, GIF | 1 MB |
| Audio | MP3, OGG, WAV | 2 MB |
| Vídeo | MP4, WebM | 2 MB |

El máximo combinado es 4 MB de multimedia por cuestionario. El formato base64 aumenta el tamaño del JSON: se admiten cuestionarios de hasta 8 MB y bibliotecas de hasta 20 MB. La cuota real de `localStorage` depende del navegador; si se agota se conserva la edición en memoria y se ofrece exportación.

Cada archivo requiere una alternativa textual antes de iniciar: descripción para imágenes y transcripción o equivalente textual para audio/vídeo (hasta 2000 caracteres). Las opciones mantienen una etiqueta textual para que los informes y la selección sean accesibles. Los reproductores tienen controles nativos, no se reproducen automáticamente y se pausan al cambiar de pantalla. Los formatos y códecs reproducibles dependen del navegador; la alternativa textual se mantiene disponible. No se aceptan SVG, HTML, iframes ni enlaces multimedia remotos.

Los archivos viajan dentro del cuestionario exportado y de la pregunta enviada por WebRTC. El tamaño y la red pueden retrasar la recepción; el reloj sigue siendo el del anfitrión. Conviene usar archivos breves y tiempos suficientes, especialmente en grupos grandes.

## Compatibilidad y verificación

La biblioteca usa versión 3 y sigue leyendo bibliotecas antiguas y de versión 2. Las preguntas sin tipo siguen siendo de elección única. El protocolo de partida pasa a `quizlab-v3-`: todos los dispositivos deben recargar la aplicación.

Pruebas automatizadas: reglas de corrección, encuestas y rachas, ocultación de soluciones, importación y tamaño de multimedia, aprobación/bloqueo/aforo/expulsión, CSV seguro, historial y conservación de datos corruptos. Las pruebas de Chromium recorren los tipos nuevos, archivos multimedia, informes y moderación con varias pestañas. El transporte y el QR se simulan; la conectividad real de redes educativas, los códecs de otros navegadores y los aforos requieren validación en el despliegue.
