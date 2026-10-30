# DaTools

Herramientas personales en HTML, CSS y JavaScript, sin compilación.

## Filer · Video a GIF

El tab **Video → GIF** convierte videos desde el navegador, con ajustes generales de lado máximo, FPS, cantidad de colores, tramado y repetición. Cada archivo permite definir inicio y final; sin final, convierte hasta diez segundos desde el inicio. Incluye vista previa del video y del GIF, descarga individual o ZIP del lote, restablecer, quitar y cancelar.

Reutiliza el motor FFmpeg local que ya usa el audio, cargándolo solo cuando conviertes. Usa HTTP/HTTPS (localhost o el dominio servido por Nginx). Admite archivos de hasta 200 MB, hasta 20 videos y 500 MB en la lista; los recortes se limitan a 60 segundos y se comprueba el trabajo de memoria según duración, resolución y FPS. Si una combinación resulta demasiado grande, reduce esos ajustes. Un GIF no incluye audio.

`tests/imanage-video.cjs` comprueba MP4 y WebM reales, GIFs con múltiples fotogramas, recorte, tamaño, FPS, repetición, cancelación, errores, ZIP y responsive.

## Proyectos de Animotion

El espacio de trabajo se organiza en **Crear**, **Editar** y **Exportar**. Crear muestra tres contenedores a la vez, de izquierda a derecha: Pegar guion → Ajustes y copiar prompt → Pegar JSON. En tabletas y móviles se acomodan en menos columnas conservando el orden. También permite empezar en blanco. Aplicar escenas abre Editar, con vista previa, escenas, línea de tiempo plegable y un inspector con pestañas Apariencia, Objeto y JSON de escena. Exportar muestra la revisión, formato, FPS y descarga del video. La etapa se conserva en `?step=` y las preferencias del flujo se guardan localmente.

Abrir, Guardar, Deshacer y Rehacer permanecen en la barra superior. El menú **··· → Vista libre** recupera todos los paneles, su reordenación y redimensionado. Las pruebas anteriores usan `?step=free`; `tests/animotion-workflow.cjs` verifica el flujo guiado completo, incluida una descarga de video real.

En el tab Exportar, el progreso, tiempos y botón Cancelar aparecen debajo de Descargar video; la vista previa muestra los fotogramas mientras se graban. Los controles que modificarían la grabación quedan bloqueados temporalmente. Escape también cancela. Al exportar desde las otras vistas se conserva el diálogo de progreso.

Usa **Guardar** (Ctrl+S) y **Abrir** (Ctrl+O) en la barra superior para descargar y recuperar un proyecto completo en JSON. Incluye escenas, guion, dibujos, objetos ocultos, estilos individuales, paleta, fuente, fondo y borradores pendientes. Abrir pide confirmación antes de reemplazar el trabajo actual y comienza un historial nuevo.

El JSON de escenas para trabajar con IA sigue disponible en la bandeja JSON y en el editor de cada escena. Abrir también acepta los archivos anteriores que solo contienen escenas.

En Apariencia, sin objetos seleccionados, el fondo ofrece sólido, degradado, cuadrícula, diagonales, puntos, ondas, anillos, partículas, aurora y haces de luz. Cada fondo con efecto tiene dos movimientos propios y modo Estático, velocidad de 20 a 200 %, dos colores y opacidad. La animación usa el tiempo del proyecto: coincide al mover el fader, reproducir y exportar. Los ajustes se conservan al recargar, guardar/abrir y deshacer/rehacer.

Animotion incluye el mismo catálogo de fuentes que Submotion, para texto global o individual. Las fuentes de Google necesitan conexión y Gotham usa la instalación local. La exportación espera la carga de las familias y pesos utilizados. Los selectores de color agrupan la vista previa por fotograma y guardan al confirmar o pausar; los colores del fondo conservan los borradores JSON sin aplicar.

La línea de tiempo permite mover escenas y objetos, cambiar sus extremos y ajustar la entrada con la marca interior. `visibleDuration` controla cuánto permanece un objeto a partir de `delay`; vacío o `null` lo mantiene hasta el final de su escena. `duration` sigue siendo la duración de la entrada. Arrastrar cuenta como un paso de historial, Esc cancela y las flechas ajustan 0,1 s (Shift: 1 s). La duración del video sigue el final de las escenas, sin añadir tiempo vacío por un guion de referencia más largo.

Dirección para IA incluye estilo de dibujo, trazo, grosor, extremos, uniones, relleno, detalle, recursos, ritmo, continuidad e indicaciones personales. Estos parámetros generan instrucciones para la IA; no cambian las escenas ya aplicadas. Las shapes vectoriales admiten `lineStyle` (`solid`, `dashed`, `dotted`, `dashdot`), `lineCap`, `lineJoin` y `stroke` junto con `fill`. Los objetos admiten `opacity` de 0 a 1. Bocetos, doble contorno y tramas se construyen con geometría, sin pinceles raster.

## Submotion

Submotion se organiza en **Importar / Editar / Exportar**, con la vista previa ajustada al alto disponible. El inspector reúne Apariencia, Animación y Fragmento. El menú **··· → Vista libre** recupera los paneles reorganizables.

Seleccionar un fragmento conecta sus controles; Shift + clic permite seleccionar varios. Arrastrar el texto mueve la selección y el tirador de la esquina cambia el tamaño. Doble clic abre la edición de texto. Las flechas sobre el canvas mueven un píxel (Shift: diez). Sin selección, los estilos globales afectan a los fragmentos que aún no tienen ajustes individuales; **Usar estilo global** elimina esa protección.

La línea de tiempo plegable permite mover grupos y arrastrar los extremos de cada fragmento. Sus flechas ajustan 0,1 s (Shift: 1 s; Alt ajusta el final). Alt durante un arrastre desactiva el ajuste a 0,05 s; Escape cancela un arrastre. El fader y los fragmentos se seleccionan mutuamente.

**Guardar/Abrir** (Ctrl+S / Ctrl+O) usa un JSON de proyecto con textos, tiempos, estilos individuales, ajustes, borrador SRT y posición. Abrir valida antes de reemplazar y pide confirmación. Los estilos personales se guardan por separado en el navegador. Gotham cargada desde archivo permanece disponible solo en esa sesión.

El historial conserva 20 pasos: Ctrl+Z deshace y Ctrl+Shift+Z o Ctrl+Y rehace. Los colores agrupan el dibujo por fotograma y guardan al confirmar o pausar. Exportar conserva la vista previa, muestra progreso y tiempo restante, permite cancelar y mantiene la descarga del SRT con los tiempos actuales.

`tests/submotion-studio.cjs` verifica el flujo completo, incluido video real. `tests/submotion-edge-cases.cjs` cubre historial, cancelaciones, validación de proyectos, borradores, almacenamiento no disponible y rendimiento de colores con 1000 fragmentos.

## Desarrollo local

Abre `index.html` con Live Server o sirve la carpeta con un servidor estático, por ejemplo:

```sh
python -m http.server 8000
```

Visita `http://localhost:8000`. `js/local-routes.js` adapta los enlaces a `.html` en localhost, direcciones IPv4 privadas y nombres `.local`. También permite navegar al abrir `index.html` directamente, aunque algunas herramientas necesitan HTTP/HTTPS para sus APIs del navegador.

No requiere `.env`. Las URLs sin extensión que escribas directamente en un servidor local básico no tendrán resolución automática: entra desde el inicio o agrega `.html`.

## Nginx

En el dominio público se mantienen los enlaces sin extensión. Conserva los archivos `.html` y esta regla dentro de `server`:

```nginx
index index.html;
location / {
    try_files $uri $uri.html $uri/ =404;
}
```
