# DaTools

Herramientas personales en HTML, CSS y JavaScript, sin compilación.

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
