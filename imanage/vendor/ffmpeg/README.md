# Motor multimedia local

- Wrapper `@ffmpeg/ffmpeg` **0.12.15**, archivos UMD de npm/jsDelivr. Licencia MIT en WRAPPER-LICENSE.txt.
- Core `@ffmpeg/core` **0.12.10**, single-thread, archivos UMD y WASM de npm/jsDelivr. Metadatos originales en core-package.json y licencia GPL-2.0-or-later en CORE-LICENSE.txt.
- Proyecto y fuentes de compilación: https://github.com/ffmpegwasm/ffmpeg.wasm
- Fuentes y licencias de FFmpeg y bibliotecas enlazadas: https://github.com/ffmpegwasm/ffmpeg.wasm/tree/main/build

Estos archivos se cargan desde el propio proyecto al convertir por primera vez. El motor no envía audios a servidores y no necesita SharedArrayBuffer ni cabeceras de aislamiento para multithreading. Debe abrirse mediante HTTP/HTTPS, por ejemplo desde localhost; `file://` no permite cargar normalmente el motor WASM y sus workers.

También se reutiliza para Video → GIF, con recorte previo a la decodificación, reducción de resolución/FPS y filtros `palettegen`/`paletteuse`. El video permanece en el navegador; no se añade otro runtime ni se requieren servicios externos.

El core incluye varios códecs y pesa aproximadamente 31 MB. Para Opus se utiliza el codificador nativo de FFmpeg (`opus`, `-strict -2`) a 48 kHz: el codificador `libopus` de esta compilación abortó durante las pruebas en Edge.
