# DaTools

Herramientas personales en HTML, CSS y JavaScript, sin compilación.

## Proyectos de Animotion

Usa **Guardar** (Ctrl+S) y **Abrir** (Ctrl+O) en la barra superior para descargar y recuperar un proyecto completo en JSON. Incluye escenas, guion, dibujos, objetos ocultos, estilos individuales, paleta, fuente, fondo y borradores pendientes. Abrir pide confirmación antes de reemplazar el trabajo actual y comienza un historial nuevo.

El JSON de escenas para trabajar con IA sigue disponible en la bandeja JSON y en el editor de cada escena. Abrir también acepta los archivos anteriores que solo contienen escenas.

La línea de tiempo permite mover escenas y objetos, cambiar sus extremos y ajustar la entrada con la marca interior. `visibleDuration` controla cuánto permanece un objeto a partir de `delay`; vacío o `null` lo mantiene hasta el final de su escena. `duration` sigue siendo la duración de la entrada. Arrastrar cuenta como un paso de historial, Esc cancela y las flechas ajustan 0,1 s (Shift: 1 s). La duración del video sigue el final de las escenas, sin añadir tiempo vacío por un guion de referencia más largo.

Dirección para IA incluye estilo de dibujo, trazo, grosor, extremos, uniones, relleno, detalle, recursos, ritmo, continuidad e indicaciones personales. Estos parámetros generan instrucciones para la IA; no cambian las escenas ya aplicadas. Las shapes vectoriales admiten `lineStyle` (`solid`, `dashed`, `dotted`, `dashdot`), `lineCap`, `lineJoin` y `stroke` junto con `fill`. Los objetos admiten `opacity` de 0 a 1. Bocetos, doble contorno y tramas se construyen con geometría, sin pinceles raster.

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
