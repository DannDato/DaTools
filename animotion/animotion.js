"use strict";

const $ = id => document.getElementById(id);
const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const stage = $("stage");

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = x => {
  x = clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};

let project = {version: 1, scenes: []};
let sizeBaseProject = null;
let cues = [];
let duration = 0;
let position = 0;
let playing = false;
let frameId = 0;
let startStamp = 0;
let exporting = false;
const STORAGE_KEY = "animotion.ui.v1";
let storedUiState = null;
let selectedSceneIndex = -1;
try {
  storedUiState = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
} catch (_) {
  storedUiState = null;
}

function persistUiState(event) {
  try {
    const controls = {};
    document.querySelectorAll("input[id], select[id], textarea[id]").forEach(control => {
      if (control.type === "file" || control.id === "seek") return;
      controls[control.id] = control.value;
    });
    const state = {
      controls,
      baseJsonText: event?.target?.id === "jsonText"
        ? null
        : (sizeBaseProject ? JSON.stringify(sizeBaseProject) : null),
      selectedSceneIndex
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // El almacenamiento puede estar deshabilitado o lleno; la herramienta debe seguir funcionando.
  }
}

function restoreUiState() {
  if (!storedUiState || !storedUiState.controls) return false;
  for (const [id, value] of Object.entries(storedUiState.controls)) {
    const control = $(id);
    if (!control || control.type === "file" || id === "seek") continue;
    control.value = value;
  }
  if (storedUiState.baseJsonText && $("jsonText")) {
    $("jsonText").value = storedUiState.baseJsonText;
  }
  selectedSceneIndex = Number.isInteger(storedUiState.selectedSceneIndex) ? storedUiState.selectedSceneIndex : -1;
  return true;
}

const EXAMPLE = {
  version: 1,
  resolution: [2560, 1440],
  fps: 60,
  background: "#000000",
  scenes: [
    {
      start: 0.5,
      end: 3.5,
      objects: [
        {type: "text", text: "LAS IDEAS COBRAN VIDA", x: 0.5, y: 0.42, size: 88, color: "#FFFFFF", weight: 800, enter: "bounce", idle: "breathe", lineHeight: 1.08, maxWidth: 0.68},
        {type: "line", x: 0.5, y: 0.56, width: 0.5, color: "#AA98FF", enter: "wipe"}
      ]
    },
    {
      start: 3.6,
      end: 7.5,
      objects: [
        {type: "circle", x: 0.37, y: 0.48, size: 205, color: "#AA98FF", enter: "pop", idle: "float"},
        {type: "icon", name: "sparkles", x: 0.37, y: 0.48, size: 132, color: "#15101F", enter: "elastic", idle: "spin"},
        {type: "text", text: "TODO SE MUEVE", x: 0.69, y: 0.48, size: 72, weight: 700, color: "#FFFFFF", enter: "slide", idle: "breathe", lineHeight: 1.05, maxWidth: 0.42}
      ]
    },
    {
      start: 7.6,
      end: 11.5,
      objects: [
        {type: "rect", x: 0.5, y: 0.5, width: 0.62, height: 0.3, color: "#262135", radius: 35, enter: "zoom", idle: "float"},
        {type: "text", text: "ANIMOTION", x: 0.5, y: 0.5, size: 118, color: "#FFFFFF", weight: 800, enter: "punch", idle: "breathe", lineHeight: 1, maxWidth: 0.7}
      ]
    }
  ]
};

const allowedTypes = new Set(["text", "rect", "circle", "line", "icon", "vector"]);
const allowedEnter = new Set(["none", "fade", "pop", "zoom", "slide", "bounce", "elastic", "punch", "wipe", "slam", "spin", "drop", "drift", "overshoot", "flip", "draw", "type", "whip"]);
const allowedIdle = new Set(["none", "float", "breathe", "pulse", "spin", "wiggle", "orbit", "shake", "sway", "drift"]);
const legacyIcons = ["sparkles", "play", "heart", "star", "bolt", "check", "arrow", "gear", "bulb", "chart", "monitor", "brain", "camera", "music", "clock"];
const iconData = window.ANIMOTION_ICONS || {};
const iconGroups = window.ANIMOTION_ICON_GROUPS || {};
const allowedIcons = new Set([...legacyIcons, ...Object.keys(iconData)]);
const iconPaths = new Map();
function vectorIcon(name, size) {
  const data = iconData[name];
  if (!data || typeof Path2D === "undefined") return false;
  let paths = iconPaths.get(name);
  if (!paths) {
    paths = data[2].map(d => new Path2D(d));
    iconPaths.set(name, paths);
  }
  const [width, height] = data;
  const scale = size / Math.max(width, height);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(-width / 2, -height / 2);
  for (const path of paths) ctx.fill(path);
  ctx.restore();
  return true;
}
const allowedAlign = new Set(["left", "center", "right"]);

function fmt(seconds) {
  seconds = Math.floor(Math.max(0, seconds));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function stamp(seconds) {
  const ms = Math.round(seconds * 1000);
  const hh = String(Math.floor(ms / 3600000)).padStart(2, "0");
  const mm = String(Math.floor(ms / 60000) % 60).padStart(2, "0");
  const ss = String(Math.floor(ms / 1000) % 60).padStart(2, "0");
  const m = String(ms % 1000).padStart(3, "0");
  return `${hh}:${mm}:${ss},${m}`;
}

function parseSrt(text) {
  const results = [];
  const blocks = text.replace(/\r/g, "").replace(/^\uFEFF/, "").trim().split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n");
    const i = lines.findIndex(line => line.includes("-->"));
    if (i < 0) continue;
    const m = lines[i].match(/(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{1,3})/);
    if (!m) continue;
    const toSeconds = (h, min, s, ms) => Number((h || "0").replace(":", "")) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;
    const start = toSeconds(m[1], m[2], m[3], m[4]);
    const end = toSeconds(m[5], m[6], m[7], m[8]);
    if (end > start) {
      results.push({
        start,
        end,
        text: lines.slice(i + 1).join(" ").replace(/<[^>]+>/g, "").trim()
      });
    }
  }
  return results.sort((a, b) => a.start - b.start);
}

function parsePlainText(text) {
  const raw = text.replace(/\r/g, "").replace(/^\uFEFF/, "").trim();
  if (!raw) return [];

  const sentences = raw
    .split(/\n\s*\n|(?<=[.!?…])\s+(?=[¿¡"“A-ZÁÉÍÓÚÜÑ0-9])/u)
    .map(s => s.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  const chunks = [];
  for (const sentence of sentences) {
    const words = sentence.split(/\s+/);
    let group = [];
    for (const word of words) {
      if (group.length >= 21) {
        chunks.push(group.join(" "));
        group = [];
      }
      group.push(word);
    }
    if (group.length) chunks.push(group.join(" "));
  }

  let cursor = 0;
  return chunks.map(textChunk => {
    const words = textChunk.split(/\s+/).length;
    const readSeconds = clamp(words / 160 * 60 + 0.45, 2.5, 8.5);
    const start = Number(cursor.toFixed(3));
    const end = Number((cursor + readSeconds).toFixed(3));
    cursor = end + 0.25;
    return {start, end, text: textChunk};
  });
}

function prepareCues() {
  const text = $("srtText").value.trim();
  const isTimed = /\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3}\s*-->/.test(text);
  const next = isTimed ? parseSrt(text) : parsePlainText(text);
  cues = next;
  const type = isTimed ? "SRT" : "texto normal";
  $("srtInfo").textContent = next.length
    ? `${next.length} fragmentos (${type}) · duración aproximada ${fmt(next.at(-1).end)}${isTimed ? " · tiempos originales conservados" : " · tiempos estimados a 160 palabras/min"}`
    : (text ? "No se encontraron tiempos SRT válidos. Revisa el formato." : "Pega un SRT o texto para empezar.");
  seek(0);
  persistUiState();
  return {next, isTimed};
}

function cuesToSrt(items) {
  return items.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n");
}

function paletteSettings() {
  return {
    primary: $("fg").value.toUpperCase(),
    accent: $("accent").value.toUpperCase(),
    orientation: $("orientation").value,
    fps: Number($("fps").value),
    lineHeight: Number($("lineHeightPref").value),
    textWidth: Number($("textWidthPref").value),
    safeArea: Number($("safeAreaPref").value),
    layoutStyle: $("layoutStyle").value,
    density: $("density").value,
    textUsage: $("textUsage").value,
    motionBoldness: Number($("motionBoldness")?.value ?? 75),
    artDirection: $("artDirection")?.value ?? "illustrative"
  };
}

function buildPrompt(items) {
  const settings = paletteSettings();
  const res = settings.orientation === "portrait" ? "[1440, 2560]" : "[2560, 1440]";
  const compositionGuidance = {
    centered: "Usa composiciones centradas y limpias cuando refuercen el mensaje. Mantén un foco principal claro, con pocos elementos secundarios y simetría controlada; no centres todo por inercia.",
    balanced: "Equilibra el peso visual entre ambos lados y entre la parte superior e inferior. Combina un foco principal con apoyos secundarios, usando alineaciones y espacios negativos para que la escena respire.",
    editorial: "Crea una composición editorial asimétrica basada en la idea: puede ser una ilustración que invade el espacio, una transformación, tipografía integrada en la escena o una relación espacial. No uses automáticamente la fórmula texto a un lado e icono al otro.",
    dynamic: "Crea composiciones dinámicas con diagonales sugeridas por posiciones, escalas contrastantes y agrupaciones desplazadas. Dirige la mirada hacia un foco claro y evita que el movimiento vuelva confusa la lectura."
  }[settings.layoutStyle];
  const densityGuidance = {
    minimal: "Usa solo los recursos visuales que la idea necesite. Puede ser una metáfora potente, una ilustración protagonista o una composición tipográfica; añade relaciones gráficas únicamente si explican algo que de otro modo no se entendería.",
    balanced: "Combina protagonista, apoyos y relaciones visuales según el significado. Alterna ilustración, tipografía, formas libres, diagramas, comparaciones, escenas espaciales y secuencias; cajas y flechas son opciones, no requisitos.",
    rich: "Permite composiciones visualmente ricas y varias capas de información, pero selecciona la gramática visual según el contenido. No conviertas riqueza en acumular paneles, cajas o conectores: una ilustración detallada, una metáfora espacial, una explosión de piezas o una transformación pueden ser más apropiadas."
  }[settings.density];
  const textGuidance = {
    low: "Reduce las frases a palabras clave o titulares breves; deja que las ilustraciones y las acciones expliquen el resto.",
    balanced: "Usa titulares breves y etiquetas solo cuando ayuden a entender la idea; evita párrafos largos.",
    high: "Puedes incluir más texto, pero divídelo en bloques breves, con alineación consistente, jerarquía clara y suficiente separación."
  }[settings.textUsage];
  const artDirectionGuidance = {
    illustrative: "ILUSTRATIVA (estilo predeterminado): piensa como ilustrador editorial y director de animación explicativa. Construye escenas con personajes sencillos reconocibles (incluidas figuras de palitos cuando encajen), objetos cotidianos, herramientas, máquinas, libros, computadoras y piezas que interactúan. Usa trazos blancos finos y expresivos tipo dibujo a mano/pizarra, con grosor visual ligero y consistente; evita contornos pesados, bloques blancos y líneas que compitan con la forma. Como guía, usa strokeWidth entre 0.025 y 0.06 en la mayoría de shapes, reservando 0.07–0.09 solo para contornos principales puntuales. Prioriza siluetas claras y, cuando ayude, ilustraciones planas de color con pocos tonos vivos. Prefiere escenas completas y narrativas: un personaje usa un objeto, un objeto se abre y revela sus partes, varias piezas se conectan o un sistema transforma una entrada en una salida. Combina iconos del catálogo con vectores originales compuestos por varias shapes. No dibujes detalles decorativos sin función; cada elemento debe contar parte de la explicación.",
    kinetic: "Kinetic: movimiento enérgico y legible, con entradas escalonadas, desplazamientos expresivos e impactos que subrayen relaciones causales. Mantén las ilustraciones y objetos como protagonistas, no conviertas todo en tipografía cinética.",
    cinematic: "Cinematic: usa escala, profundidad sugerida, revelaciones progresivas, pausas y transiciones conectadas. La escena debe sentirse como un plano narrativo, no como una diapositiva corporativa.",
    graphic: "Graphic: lenguaje gráfico limpio con siluetas, geometría, contraste y composición editorial. Alterna ilustraciones, objetos y diagramas según lo que explique mejor la idea.",
    experimental: "Experimental: metáforas visuales audaces, cambios de escala y transformaciones inesperadas, manteniendo reconocibles los objetos y comprensible la explicación."
  }[settings.artDirection] || "Ilustrativa: prioriza escenas dibujadas y narrativas.";

  return `Actúa como director creativo de motion graphics para Animotion v1, una herramienta que renderiza escenas declarativas sobre Canvas.

OBJETIVO: Dirige una pieza de motion graphics con imaginación visual y ritmo narrativo. Cada escena debe convertir la idea en una experiencia visual concreta, no resumirla con una etiqueta y un símbolo. Prioriza la metáfora visual específica, la acción, la transformación, la ilustración compuesta, el espacio y las relaciones que se puedan ver. Los iconos son un recurso secundario, nunca la solución por defecto. No es necesario crear una escena para cada fragmento. Conserva los tiempos absolutos indicados; no reinicies el reloj entre escenas. Los tiempos del texto normal son aproximados, no una transcripción de audio real.

COMPLETAR LA INFORMACIÓN PARA ENRIQUECER LA EXPLICACIÓN (OBLIGATORIO):
- No te limites literalmente al texto proporcionado si le faltan piezas necesarias para que la animación se entienda. Deduce qué contexto, pasos intermedios, componentes, relaciones causa-efecto, definiciones o ejemplos visuales necesita la audiencia y complétalos con conocimiento general fiable.
- Convierte las ideas implícitas en elementos visibles: muestra qué interactúa con qué, qué entra y sale de un sistema, qué cambia entre estados, qué ocurre dentro de un mecanismo y por qué importa cada paso.
- Si el guion menciona un proceso, desarrolla sus pasos intermedios relevantes; si menciona un objeto o sistema, representa sus partes y relaciones; si menciona una comparación, muestra ambos estados con criterios comprensibles.
- Añade etiquetas, leyendas, valores ilustrativos, ejemplos o microexplicaciones solo cuando aporten comprensión. Distingue los ejemplos hipotéticos de los datos reales; no inventes cifras, citas, resultados, especificaciones ni afirmaciones presentadas como hechos. Si un detalle no es seguro, usa una representación conceptual general en vez de fingir precisión.
- Mantén el sentido original del guion y no cambies su tesis. La información añadida debe explicar y contextualizar, no desviar el tema.
- Prefiere una explicación visual completa y bien secuenciada. No confundas legibilidad con escasez de objetos: la claridad se consigue organizando los elementos, no eliminándolos.

DIRECCIÓN VISUAL PREDEFINIDA:
- Resolución: ${res}
- FPS: ${settings.fps}
- Color principal: ${settings.primary}
- Color accent: ${settings.accent}
- Composición: ${settings.layoutStyle}
- Densidad visual: ${settings.density}
- Uso de texto: ${settings.textUsage}
- Interlineado sugerido para objetos de texto: ${settings.lineHeight.toFixed(2)}
- Ancho máximo sugerido para bloques de texto: ${(settings.textWidth).toFixed(0)}% del lienzo
- Zona segura mínima: ${settings.safeArea}% desde cada borde
- Cantidad de objetos: adaptativa; no existe un objetivo ni un máximo fijo. Añade todos los elementos que la explicación necesite.
- Audacia del movimiento: ${settings.motionBoldness}/100
- Dirección artística: ${settings.artDirection}
- Guía de estilo seleccionada: ${artDirectionGuidance}

SISTEMA DE COMPOSICIÓN Y LAYOUT (OBLIGATORIO):
- Antes de colocar objetos, decide qué idea debe captar primero la mirada. Cada escena debe tener una jerarquía visual clara: foco principal, sistemas secundarios y detalles informativos; puede incluir muchos objetos si forman parte de una explicación compleja.
- ${compositionGuidance}
- La composición elegida debe nacer del significado, no de una plantilla de diseño. No uses como patrón base “titular + icono”, “texto a la izquierda + icono a la derecha” ni “una fila de elementos etiquetados”.
- Densidad solicitada: ${densityGuidance}
- Uso de texto solicitado: ${textGuidance}
- Trata x/y como el centro aproximado de cada objeto. Distribuye los elementos con intención; no apiles todo en x=0.5/y=0.5 ni repitas la misma plantilla en todas las escenas.
- Usa una retícula visual consistente: alinea bordes y centros relacionados, mantén distancias regulares entre elementos del mismo grupo y separa claramente los grupos distintos.
- Usa el espacio negativo con intención, pero no dejes grandes zonas vacías si la idea necesita estructura. La legibilidad viene de agrupar y jerarquizar, no de reducir todo a dos o tres elementos. Evita solo los solapamientos accidentales y la decoración sin función.
- Crea contraste de escala: el elemento principal debe ser claramente más importante que los apoyos. No des el mismo tamaño y peso a todos los objetos.
- No uses una plantilla visual universal. Antes de construir cada escena, identifica qué relación o sensación debe entenderse y elige la gramática visual que mejor la expresa. Las cajas, paneles, flechas y contenedores son recursos opcionales: úsalos cuando sus límites o conexiones comuniquen una relación real, nunca como decoración ni por cumplir una cuota.
- Elige libremente entre gramáticas visuales distintas: ilustración protagonista con detalles; metáfora visual narrativa; objeto o mecanismo dibujado por partes; composición tipográfica expresiva; formas geométricas abstractas; mapa o red; flujo con flechas; comparación antes/después; capas o corte transversal; secuencia de etapas; gráfico de datos; transformación de una forma en otra; elementos que entran, chocan, se fragmentan, se ensamblan o se conectan en el espacio.
- Usa cajas solo si el concepto implica límites, agrupación, interfaz, contención, módulos o etapas delimitadas. Usa flechas solo si hay dirección, flujo, causalidad, navegación o transformación. Si no existe esa relación semántica, prefiere composición libre, dibujo, escala, movimiento, proximidad, contraste o continuidad visual.
- Respeta el ancho máximo del texto y el interlineado indicados. Evita frases largas en una sola línea; usa saltos de línea mediante el texto cuando mejoren la lectura y ajusta align a la alineación real del bloque.
- Mantén todos los elementos dentro de la zona segura y deja margen extra para objetos grandes o texto de varias líneas. En formato vertical, organiza preferentemente de arriba abajo; en horizontal, aprovecha el espacio lateral cuando ayude a equilibrar la composición.
- En escenas consecutivas, cambia la gramática visual cuando cambie la idea. No alternes simplemente posiciones de la misma plantilla; cambia qué vemos y cómo se desarrolla: una escena puede ser una ilustración a gran escala, otra un objeto que se desarma, otra una transformación espacial y otra una comparación si el contenido lo justifica.
- Diseña primero una idea visual concreta, no una lista de componentes. Pregúntate: ¿qué debería ver la audiencia si no hubiera texto? Después construye esa imagen con los objetos estrictamente útiles. El número de objetos depende de la idea: puede ser uno, una ilustración compuesta o muchos elementos coordinados; nunca persigas una cuota.
- Evita repetir la misma gramática visual en escenas consecutivas. No conviertas todo en tarjetas, paneles, cuadrículas, diagramas de flujo ni iconos etiquetados. Alterna composiciones abiertas y cerradas, centradas y asimétricas, geométricas y orgánicas, narrativas y analíticas cuando el contenido lo permita. Antes de finalizar, revisa mentalmente las escenas juntas: si varias se reducen a “texto + icono”, rediseña esas escenas desde una metáfora o acción visual distinta, no solo cambiando el icono o la posición.
- Las relaciones deben ser visibles, pero no todas necesitan líneas: usa posición, escala, superposición intencional, dirección de movimiento, continuidad de formas, cambios de estado, ritmo y contraste. Construye un diagrama solo cuando un diagrama sea la mejor explicación.
- El fondo, su color y su preset se controlan exclusivamente en la interfaz de Animotion. No generes ni configures fondos en el JSON; no incluyas el campo "background" en la respuesta. El fondo local se compone por separado detrás de las escenas.

ESTILO ILUSTRATIVO Y NARRATIVO (PRIORIDAD ALTA): el resultado debe parecer una secuencia de ilustraciones explicativas animadas, no una presentación corporativa. Piensa en dibujos de pizarra con líneas blancas y personajes de palitos, combinados con objetos ilustrados de colores cuando sea útil. Usa personajes, accesorios y escenarios mínimos para representar acciones concretas; por ejemplo, alguien estudia junto a una mesa con libros y cuaderno, una computadora recibe código y lo convierte en bits, o las piezas internas de un sistema aparecen y se conectan. Estas son referencias de lenguaje visual, no escenas obligatorias: inventa la metáfora específica para cada guion.
- Construye ilustraciones reconocibles con varios objetos coordinados. Un personaje puede estar compuesto por cabeza, torso, brazos y piernas vectoriales; un objeto puede tener silueta, interior y detalles funcionales. Separa partes en objetos independientes cuando necesiten moverse por separado.
- Combina trazo blanco tipo boceto con rellenos planos vivos para objetos importantes. Mantén paleta reducida, contraste alto y formas legibles a tamaño de vídeo. No fuerces que todos los elementos sean blancos ni que todos sean iconos de colores: elige el tratamiento según la escena.
- Muestra acciones observables: cargar, abrir, escribir, estudiar, señalar, ensamblar, separar, transferir, crecer, fallar, comparar o transformar. La pose, la dirección, la escala y el movimiento deben comunicar la acción sin depender de un título.
- Si una idea es abstracta, conviértela en una situación ilustrada o un mecanismo visual concreto. Añade objetos de apoyo cuando hagan falta para entender contexto, causa y efecto. No rellenes la escena con iconos sueltos sin interacción.
- Los iconos locales son recursos auxiliares. Para personajes, objetos específicos o escenas que no existan en el catálogo, dibuja vectores originales con múltiples shapes coordinadas. Usa únicamente los tipos, campos y efectos admitidos por el esquema del renderer; no inventes imágenes externas, SVG, código ni tipos de objeto.
- Conserva la gramática visual de las referencias: fondo controlado desde la interfaz, trazos de alto contraste, personajes y objetos grandes, composiciones simples pero explicativas, y detalles de color solo donde aporten significado. No configures el fondo en el JSON.
- Integra texto solo si aporta comprensión; no hagas que cada escena necesite un título. Prioriza la ilustración protagonista y su acción. Alterna escenas de pizarra, ilustraciones planas, metáforas narrativas y diagramas cuando el contenido lo requiera.
- Distribuye escenas de 3 a 8 segundos cuando el discurso lo permita. La animación debe hacer que la ilustración se dibuje, entre, se arme, reaccione o se transforme; no te limites a hacer aparecer toda la composición de golpe.

RESPUESTA: entrega el resultado únicamente dentro de un único bloque de código con lenguaje json, listo para copiar. No agregues explicación, introducción ni texto fuera del bloque.

El esquema raíz exacto debe ser:
{"version":1,"resolution":${res},"fps":${settings.fps},"scenes":[{"start":0,"end":3,"objects":[{"type":"vector","x":0.5,"y":0.5,"size":240,"color":"${settings.primary}","enter":"draw","idle":"none","delay":0,"duration":1,"shapes":[{"kind":"circle","x":0,"y":0,"r":0.55,"strokeWidth":5,"fill":false},{"kind":"line","points":[{"x":-0.35,"y":0.1},{"x":0.05,"y":-0.25},{"x":0.32,"y":0.2}],"strokeWidth":6}]}]}]}

Usa los tipos: text, rect, circle, line, icon, vector. Usa vector para ilustraciones originales dibujadas con coordenadas cuando no exista un icono adecuado.
Para objetos normales usa propiedades compatibles: type, text, name, x, y, size, width, height, radius, color, weight, enter, idle, delay, duration, amplitude, speed, lineHeight, maxWidth, align. Para type:"vector", añade shapes:[{kind,points,x,y,r,width,height,strokeWidth,fill,closed}]. Cada punto usa coordenadas locales x/y entre -1 y 1 respecto al centro del objeto; size define el tamaño base del dibujo.

Reglas técnicas:
- x/y son posiciones relativas entre 0 y 1.
- width/height/maxWidth son proporciones relativas del lienzo.
- size es un tamaño de referencia en píxeles.
- align solo puede ser left, center o right.
- Cada escena debe tener start, end y objects.
- No hay límite fijo de objetos por escena. Incluye tantos como sean necesarios para explicar el concepto con integridad. Agrupa mentalmente los objetos en subsistemas y mantén legibles sus relaciones; no sacrifiques contenido por una cuota artificial.
- Mantén el contenido dentro de una zona segura aproximada del ${settings.safeArea}% por lado.
- Usa el interlineado sugerido y el ancho máximo sugerido como guía principal para los textos.

Animaciones enter permitidas: none, fade, pop, zoom, slide, bounce, elastic, punch, wipe, slam, spin, drop, drift, overshoot, flip, draw, type, whip. Prefiere type para textos y draw para vectores; evita none salvo que el objeto ya esté presente desde el inicio.
Movimientos idle permitidos: none, float, breathe, pulse, spin, wiggle, orbit, shake, sway, drift.

DIRECCIÓN DE MOTION — SÉ CREATIVO, NO CONSERVADOR:
- Coreografía semántica: anima la idea, no apliques un efecto por objeto sin propósito. Elige acciones coherentes: trazar, ensamblar, desplegar, girar, crecer, colisionar, fragmentar, fluir, revelar, conectar, transformar, acercarse, alejarse o reaccionar. Anima líneas y flechas cuando existan; no dibujes cajas ni conectores solo para tener algo que animar. Haz que el tiempo y el movimiento revelen la lógica de la idea.
- No uses el icono como sustituto de un mecanismo. Cuando el discurso describa cómo funciona algo, dibuja sus partes y muestra cómo interactúan.
- Diseña coreografías temporales, no diapositivas estáticas. Cada objeto importante debe tener una entrada claramente visible, una permanencia con vida y una salida o transición intencional. No uses fade como solución universal.
- Intensidad por defecto: movimiento perceptible y decidido. Alterna type, draw, slam, whip, overshoot, spin, pop y slide; escalona objetos con delays de 0.08–0.35 s y duraciones de 0.7–1.4 s. Evita que todos entren simultáneamente o con el mismo efecto.
- Audacia ${settings.motionBoldness}/100: ${settings.motionBoldness < 30 ? "movimientos sutiles y elegantes" : settings.motionBoldness < 65 ? "variedad clara de escalas, desplazamientos y stagger" : settings.motionBoldness < 90 ? "movimientos amplios, overshoot, impactos, giros y elementos secundarios" : "coreografías experimentales y muy expresivas, sin sacrificar legibilidad"}.
- Dirección artística: ${settings.artDirection}. Varía la composición, el ritmo, el origen de entrada y la salida entre escenas consecutivas.
- Usa delays distintos para escalonar objetos; combina escala, posición, rotación y movimiento idle cuando ayude a la idea.
- Prioriza metáforas visuales y transiciones conectadas; evita que todo aparezca a la vez, que todo esté centrado o que se repita la misma entrada en escenas consecutivas.
- Para palabras clave, permite entradas contundentes (slam, punch, overshoot, spin); para conceptos fluidos usa drift, float u orbit; para ideas de tensión usa shake con moderación.
CATÁLOGO DE ÍCONOS Y CÓMO USARLO:
- Esta lista se genera directamente desde el catálogo local real de Animotion (animotion/icons.js, expuesto como ANIMOTION_ICON_GROUPS). Es la fuente de verdad de los nombres disponibles; no necesitas buscar ni importar iconos externos.
- ÍCONOS DISPONIBLES POR CATEGORÍA (usa únicamente nombres exactos de esta lista):
${Object.entries(iconGroups).map(([category, names]) => `${category}: ${names.join(", ")}`).join("\n")}
- Para dibujar uno, crea un objeto JSON con type:"icon" y name:"nombre-exacto", por ejemplo: {"type":"icon","name":"database","x":0.5,"y":0.5,"size":100,"color":"${settings.primary}"}. Usa también solo las propiedades permitidas en el esquema.
- Animotion resuelve los iconos disponibles desde sus datos vectoriales locales. No escribas SVG, Path2D, código JavaScript ni imports.
- Si ningún icono disponible representa bien la idea, NO te conformes con un icono aproximado: crea un objeto type:"vector" y dibuja una ilustración original mediante shapes y coordenadas. Úsalo para mecanismos, dispositivos, moléculas, piezas, diagramas, símbolos técnicos, mapas conceptuales y objetos específicos.
- Cada shape puede ser kind:"line" o "path" con points:[{"x":-0.5,"y":-0.5},{"x":0.5,"y":0.5}], kind:"circle" con x/y/r, kind:"rect" con x/y/width/height o kind:"polygon" con points. Coordenadas locales entre -1 y 1. Usa fill:true para rellenar formas cerradas; strokeWidth controla el grosor relativo del trazo. Para un acabado ilustrativo fino, usa normalmente strokeWidth:0.025–0.06; evita valores mayores de 0.08 salvo para acentos excepcionales.
- Construye ilustraciones compuestas con múltiples shapes coordinadas. Prioriza siluetas reconocibles, detalles funcionales, piezas internas, conectores y anotaciones. No uses formas aleatorias como relleno; cada trazo debe ayudar a reconocer o explicar el objeto.
- Usa enter:"draw" para revelar progresivamente un dibujo vectorial de forma secuencial, como si se estuviera trazando. Todo objeto vector debe usar enter:"draw" salvo que exista una razón narrativa clara. Para diagramas complejos, separa las partes en varios objetos vector y escalona sus delays para animar cada parte de forma independiente.
- Nombres heredados compatibles: ${legacyIcons.join(", ")}. Úsalos solo si son apropiados; prioriza los nombres del catálogo por categoría.
- Si ningún icono disponible representa bien la idea, NO te conformes con un icono aproximado: crea un objeto type:"vector" y dibuja una ilustración original mediante shapes y coordenadas. Úsalo para mecanismos, dispositivos, moléculas, piezas, diagramas, símbolos técnicos, mapas conceptuales y objetos específicos.
- Cada shape puede ser kind:"line" o "path" con points:[{"x":-0.5,"y":-0.5},{"x":0.5,"y":0.5}], kind:"circle" con x/y/r, kind:"rect" con x/y/width/height o kind:"polygon" con points. Coordenadas locales entre -1 y 1. Usa fill:true para rellenar formas cerradas; strokeWidth controla el grosor relativo del trazo. Para un acabado ilustrativo fino, usa normalmente strokeWidth:0.025–0.06; evita valores mayores de 0.08 salvo para acentos excepcionales.
- Construye ilustraciones compuestas con múltiples shapes coordinadas. Prioriza siluetas reconocibles, detalles funcionales, piezas internas, conectores y anotaciones. No uses formas aleatorias como relleno; cada trazo debe ayudar a reconocer o explicar el objeto.
- Usa enter:"draw" para revelar progresivamente un dibujo vectorial de forma secuencial, como si se estuviera trazando. Todo objeto vector debe usar enter:"draw" salvo que exista una razón narrativa clara. Para diagramas complejos, separa las partes en varios objetos vector y escalona sus delays para animar cada parte de forma independiente.
No traduzcas cada frase a un icono. Usa iconos solo cuando un símbolo convencional sea la representación más clara. En el resto de los casos, crea una imagen compuesta, una acción o una transformación. Evita repetir el mismo recurso visual constantemente.

Usa valores hexadecimales #RRGGBB, peso entre 100 y 900, y no inventes tipos, propiedades, nombres ni efectos. Evita escenas superpuestas innecesariamente. Límite 1200 escenas en total. Complementa el guion con contexto explicativo fiable cuando sea necesario, siguiendo las reglas de información adicional anteriores; no inventes datos específicos ni afirmes como hechos las suposiciones.

GUION CON TIEMPOS (SRT):
${cuesToSrt(items)}

Si no cabe el resultado completo, entrega primero la mejor tanda de escenas posibles, siempre en JSON válido dentro del bloque de código.`;
}

async function copyPrompt() {
  const {next} = prepareCues();
  if (!next.length) {
    $("srtInfo").textContent = "Pega un SRT o texto normal antes de copiar el prompt.";
    return;
  }

  const prompt = buildPrompt(next);
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(prompt);
    } else {
      const temp = document.createElement("textarea");
      temp.value = prompt;
      temp.style.position = "fixed";
      temp.style.opacity = "0";
      document.body.append(temp);
      temp.select();
      if (!document.execCommand("copy")) throw Error("El navegador bloqueó la copia");
      temp.remove();
    }
    $("copyPrompt").textContent = "✓ Prompt copiado";
    $("promptInfo").textContent = `Prompt copiado · ${next.length} fragmentos · paleta ${$("bg").value.toUpperCase()} / ${$("fg").value.toUpperCase()} / ${$("accent").value.toUpperCase()}. Pégalo en ChatGPT.`;
    setTimeout(() => $("copyPrompt").textContent = "✦ Copiar prompt para ChatGPT", 2200);
  } catch {
    $("promptInfo").textContent = "No se pudo copiar automáticamente. Abre la página desde HTTPS o localhost e inténtalo de nuevo.";
  }
}

function finite(v, fallback, min, max) {
  return typeof v === "number" && Number.isFinite(v) ? clamp(v, min, max) : fallback;
}

function extractJsonText(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const fence = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fence ? fence[1].trim() : trimmed;
}

function validate(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.scenes)) {
    throw Error("Se requiere un objeto con scenes: []");
  }
  if (raw.scenes.length > 1200) throw Error("Demasiadas escenas (máximo 1200)");

  const scenes = raw.scenes.map((scene, index) => {
    const start = finite(scene.start, NaN, 0, 10800);
    const end = finite(scene.end, NaN, 0, 10800);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      throw Error(`Tiempo inválido en escena ${index + 1}`);
    }
    if (!Array.isArray(scene.objects)) {
      throw Error(`La escena ${index + 1} debe incluir objects como arreglo`);
    }

    return {
      start,
      end,
      objects: scene.objects.map(obj => {
        if (!obj || !allowedTypes.has(obj.type)) {
          throw Error(`Tipo de objeto no reconocido en escena ${index + 1}`);
        }
        return {
          type: obj.type,
          text: String(obj.text ?? "").slice(0, 400),
          name: allowedIcons.has(obj.name) ? obj.name : "star",
          x: finite(obj.x, 0.5, -1, 2),
          y: finite(obj.y, 0.5, -1, 2),
          size: finite(obj.size, 88, 1, 1200),
          width: finite(obj.width, 0.3, 0, 3),
          height: finite(obj.height, 0.15, 0, 3),
          radius: finite(obj.radius, 20, 0, 500),
          color: /^#[0-9a-f]{6}$/i.test(obj.color) ? obj.color : "#FFFFFF",
          weight: finite(obj.weight, 700, 100, 900),
          enter: allowedEnter.has(obj.enter) ? obj.enter : (obj.type === "vector" ? "draw" : (obj.type === "text" ? "type" : "pop")),
          idle: allowedIdle.has(obj.idle) ? obj.idle : (obj.type === "text" ? "breathe" : "float"),
          delay: finite(obj.delay, 0, 0, 30),
          duration: finite(obj.duration, 0.9, 0.05, 6),
          amplitude: finite(obj.amplitude, 1, 0, 5),
          speed: finite(obj.speed, 1, 0.1, 5),
          lineHeight: finite(obj.lineHeight, 1.18, 0.7, 2.2),
          maxWidth: finite(obj.maxWidth, 0.85, 0.15, 1.2),
          align: allowedAlign.has(obj.align) ? obj.align : "center",
          shapes: Array.isArray(obj.shapes) ? obj.shapes.map(shape => ({
            kind: ["line", "path", "circle", "rect", "polygon"].includes(shape?.kind) ? shape.kind : "path",
            points: Array.isArray(shape?.points) ? shape.points.map(point => ({
              x: finite(point?.x, 0, -1.5, 1.5),
              y: finite(point?.y, 0, -1.5, 1.5)
            })) : [],
            x: finite(shape?.x, 0, -1.5, 1.5),
            y: finite(shape?.y, 0, -1.5, 1.5),
            r: finite(shape?.r, 0.25, 0, 1.5),
            width: finite(shape?.width, 0.5, 0, 3),
            height: finite(shape?.height, 0.5, 0, 3),
            strokeWidth: finite(shape?.strokeWidth, 0.035, 0.003, 0.25),
            fill: shape?.fill === true,
            closed: shape?.closed === true
          })) : []
        };
      })
    };
  });

  return {
    version: 1,
    resolution: Array.isArray(raw.resolution) ? raw.resolution : [2560, 1440],
    fps: finite(raw.fps, 60, 24, 60),
    background: /^#[0-9a-f]{6}$/i.test(raw.background) ? raw.background : "#000000",
    scenes: scenes.sort((a, b) => a.start - b.start)
  };
}

function endTime() {
  return Math.max(0, ...project.scenes.map(scene => scene.end), ...cues.map(cue => cue.end));
}

function syncDuration() {
  duration = endTime();
  $("seek").max = Math.max(1, Math.ceil(duration * 1000));
  $("seek").value = Math.round(clamp(position, 0, duration) * 1000);
  $("clock").textContent = `${fmt(position)} / ${fmt(duration)}`;
  $("sceneCount").textContent = `${project.scenes.length} escenas`;
  $("previewInfo").textContent = cues.length ? `${cues.length} subtítulos de referencia · ${project.scenes.length} escenas animadas` : `${project.scenes.length} escenas animadas · sin SRT de referencia`;
}

function resize() {
  const portrait = $("orientation").value === "portrait";
  canvas.width = portrait ? 1440 : 2560;
  canvas.height = portrait ? 2560 : 1440;
  stage.classList.toggle("portrait", portrait);
  $("resolution").textContent = `${canvas.width} × ${canvas.height}`;
  render(position);
}

function updateColorChips() {
  const pairs = [["bg", "bgSwatch", "bgValue"], ["fg", "fgSwatch", "fgValue"], ["accent", "accentSwatch", "accentValue"]];
  for (const [inputId, chipId, labelId] of pairs) {
    const value = $(inputId).value.toUpperCase();
    $(chipId).style.background = value;
    $(labelId).textContent = value;
  }
}

function updatePromptControlLabels() {
  $("lineHeightValue").textContent = `${Number($("lineHeightPref").value).toFixed(2)}×`;
  $("textWidthValue").textContent = `${$("textWidthPref").value}%`;
  $("safeAreaValue").textContent = `${$("safeAreaPref").value}%`;
}

function wrapTextLines(text, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (ctx.measureText(trial).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function iconPath(name, size) {
  const s = size / 2;
  ctx.lineWidth = size * 0.09;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();

  if (name === "play") {
    ctx.moveTo(-s * 0.6, -s);
    ctx.lineTo(s, 0);
    ctx.lineTo(-s * 0.6, s);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (name === "check") {
    ctx.moveTo(-s * 0.9, 0);
    ctx.lineTo(-s * 0.2, s * 0.65);
    ctx.lineTo(s, -s * 0.8);
    ctx.stroke();
    return;
  }
  if (name === "arrow") {
    ctx.moveTo(-s, 0);
    ctx.lineTo(s, 0);
    ctx.moveTo(s * 0.2, -s * 0.7);
    ctx.lineTo(s, 0);
    ctx.lineTo(s * 0.2, s * 0.7);
    ctx.stroke();
    return;
  }
  if (name === "sparkles" || name === "star") {
    for (let j = 0; j < 4; j++) {
      const a = j * Math.PI / 2;
      ctx.moveTo(Math.cos(a) * s, Math.sin(a) * s);
      ctx.lineTo(0, 0);
    }
    ctx.stroke();
    return;
  }
  if (name === "bolt") {
    ctx.moveTo(s * 0.12, -s);
    ctx.lineTo(-s * 0.6, s * 0.12);
    ctx.lineTo(0, s * 0.12);
    ctx.lineTo(-s * 0.15, s);
    ctx.lineTo(s * 0.7, -s * 0.2);
    ctx.lineTo(s * 0.07, -s * 0.2);
    ctx.closePath();
    ctx.fill();
    return;
  }
  if (name === "heart") {
    ctx.moveTo(0, s * 0.8);
    ctx.bezierCurveTo(-s * 1.6, 0, -s, -s, 0, -s * 0.3);
    ctx.bezierCurveTo(s, -s, s * 1.6, 0, 0, s * 0.8);
    ctx.fill();
    return;
  }
  if (name === "chart") {
    ctx.moveTo(-s, -s * 0.7);
    ctx.lineTo(-s, s);
    ctx.lineTo(s, s);
    ctx.moveTo(-s * 0.7, s * 0.5);
    ctx.lineTo(-s * 0.1, 0);
    ctx.lineTo(s * 0.3, s * 0.3);
    ctx.lineTo(s, -s * 0.8);
    ctx.stroke();
    return;
  }
  if (name === "clock") {
    ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
    ctx.moveTo(0, -s * 0.55);
    ctx.lineTo(0, 0);
    ctx.lineTo(s * 0.5, s * 0.2);
    ctx.stroke();
    return;
  }
  if (name === "monitor" || name === "camera") {
    ctx.rect(-s, -s * 0.7, s * 2, s * 1.4);
    ctx.stroke();
    return;
  }
  if (name === "music") {
    ctx.moveTo(0, s * 0.5);
    ctx.lineTo(0, -s);
    ctx.lineTo(s * 0.9, -s * 0.7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-s * 0.2, s * 0.55, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (name === "bulb") {
    ctx.arc(0, -s * 0.25, s * 0.65, Math.PI, 0);
    ctx.moveTo(-s * 0.65, -s * 0.25);
    ctx.lineTo(-s * 0.3, s * 0.45);
    ctx.lineTo(s * 0.3, s * 0.45);
    ctx.lineTo(s * 0.65, -s * 0.25);
    ctx.moveTo(-s * 0.25, s * 0.7);
    ctx.lineTo(s * 0.25, s * 0.7);
    ctx.stroke();
    return;
  }

  ctx.arc(0, 0, s * 0.85, 0, Math.PI * 2);
  ctx.stroke();
}

function drawObject(object, t, total, w, h) {
  const time = t - object.delay;
  if (time < 0) return;

  const p = smooth(time / object.duration);
  const amplitude = object.amplitude;
  const phase = (time - object.duration) * object.speed;

  let scale = 1;
  let alpha = object.enter === "draw" ? 1 : p;
  let dx = 0;
  let dy = 0;
  let rot = 0;

  if (object.enter === "none") alpha = 1;
  else if (object.enter === "pop") scale = 0.35 + 0.65 * p + Math.sin(p * Math.PI) * 0.12 * amplitude;
  else if (object.enter === "zoom") scale = 0.08 + 0.92 * p;
  else if (object.enter === "slide") { dy = (1 - p) * 180 * amplitude; dx = Math.sin((1-p) * Math.PI) * 24 * amplitude; }
  else if (object.enter === "bounce") {
    const x = clamp(time / object.duration, 0, 1);
    scale = 1 + (Math.sin(x * Math.PI * 3) * Math.exp(-x * 5)) * 0.24 * amplitude + (x - 1) * 0.4;
    dy = (1 - p) * 60 * amplitude;
  } else if (object.enter === "elastic") {
    const x = clamp(time / object.duration, 0, 1);
    scale = 1 + Math.sin(x * 4 * Math.PI) * Math.exp(-x * 4) * 0.3 * amplitude + (x - 1) * 0.25;
  } else if (object.enter === "punch") {
    scale = 1 + Math.sin(p * Math.PI) * 0.22 * amplitude;
  } else if (object.enter === "wipe") {
    scale = Math.max(0.001, p);
  } else if (object.enter === "slam") {
    const x = clamp(time / object.duration, 0, 1);
    scale = 1 + Math.sin(x * Math.PI) * 0.35 * amplitude - (1 - p) * 0.9;
    dy = (1 - p) * -120 * amplitude;
  } else if (object.enter === "spin") {
    scale = 0.2 + 0.8 * p;
    rot = (1 - p) * -Math.PI * 1.5 * amplitude;
  } else if (object.enter === "drop") {
    dy = (1 - p) * -180 * amplitude;
    scale = 0.75 + 0.25 * p;
  } else if (object.enter === "drift") {
    dx = (1 - p) * -140 * amplitude;
    scale = 0.92 + 0.08 * p;
  } else if (object.enter === "overshoot") {
    const x = clamp(time / object.duration, 0, 1);
    scale = 1 - (1 - p) * 0.35 + Math.sin(x * Math.PI) * 0.22 * amplitude;
    dy = (1 - p) * 45 * amplitude;
  } else if (object.enter === "flip") {
    scale = Math.max(0.02, Math.abs(Math.cos((1 - p) * Math.PI / 2)));
    rot = (1 - p) * Math.PI * 0.7 * amplitude;
  } else if (object.enter === "type") {
    alpha = 1;
  } else if (object.enter === "whip") {
    dx = (1 - p) * -260 * amplitude;
    rot = (1 - p) * -0.22 * amplitude;
    scale = 0.82 + 0.18 * p;
  }

  if (time >= object.duration) {
    const u = Math.max(0, phase);
    if (object.idle === "float") dy += Math.sin(u * 2.4) * 13 * amplitude;
    if (object.idle === "breathe") scale *= 1 + Math.sin(u * 2.6) * 0.035 * amplitude;
    if (object.idle === "pulse") scale *= 1 + Math.pow(Math.max(0, Math.sin(u * 3.6)), 8) * 0.12 * amplitude;
    if (object.idle === "wiggle") rot += Math.sin(u * 6) * 0.065 * amplitude;
    if (object.idle === "spin") rot += u * 0.45 * amplitude;
    if (object.idle === "orbit") { dx += Math.cos(u * 1.8) * 18 * amplitude; dy += Math.sin(u * 1.8) * 18 * amplitude; }
    if (object.idle === "shake") { dx += Math.sin(u * 22) * 5 * amplitude; dy += Math.cos(u * 19) * 3 * amplitude; }
    if (object.idle === "sway") rot += Math.sin(u * 2.4) * 0.12 * amplitude;
    if (object.idle === "drift") { dx += Math.sin(u * 1.1) * 18 * amplitude; dy += Math.cos(u * 1.4) * 10 * amplitude; }
  }

  const ending = smooth((total - t) / Math.min(0.28, total * 0.18));
  alpha *= ending;
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(object.x * w + dx * w / 2560, object.y * h + dy * h / 1440);
  ctx.rotate(rot);
  ctx.scale(scale, scale);
  ctx.fillStyle = object.color;
  ctx.strokeStyle = object.color;

  const factor = w / 2560;
  const size = object.size * factor;

  if (object.type === "text") {
    ctx.font = `${object.weight} ${size}px "${$("fontFamily").value}", sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = object.align;

    const maxWidth = Math.max(40, w * object.maxWidth);
    const visibleText = object.enter === "type" ? object.text.slice(0, Math.max(0, Math.ceil(object.text.length * clamp(time / object.duration, 0, 1)))) : object.text;
    const lines = wrapTextLines(visibleText, maxWidth);
    const lineHeight = size * object.lineHeight;
    const anchorX = object.align === "center" ? 0 : (object.align === "left" ? -maxWidth / 2 : maxWidth / 2);

    lines.forEach((line, index) => {
      const y = (index - (lines.length - 1) / 2) * lineHeight;
      ctx.fillText(line, anchorX, y, maxWidth);
    });
  }

  if (object.type === "rect") {
    const ww = object.width * w;
    const hh = object.height * h;
    ctx.beginPath();
    ctx.roundRect(-ww / 2, -hh / 2, ww, hh, Math.min(object.radius * factor, ww / 2, hh / 2));
    ctx.fill();
  }

  if (object.type === "circle") {
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (object.type === "line") {
    ctx.lineWidth = Math.max(1.25, size * 0.035);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-(object.width * w) / 2, 0);
    ctx.lineTo((object.width * w) / 2, 0);
    ctx.stroke();
  }

  if (object.type === "icon") {
    if (!vectorIcon(object.name, size)) iconPath(object.name, size);
  }

  if (object.type === "vector") {
    const shapes = object.shapes || [];
    const progress = object.enter === "draw" ? clamp(p, 0, 1) : 1;
    const totalShapes = Math.max(1, shapes.length);
    const unit = size / 2;
    shapes.forEach((shape, index) => {
      const localProgress = clamp(progress * totalShapes - index, 0, 1);
      if (localProgress <= 0) return;
      ctx.save();
      ctx.lineWidth = Math.max(0.8, shape.strokeWidth * size * 0.58);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const px = value => value * unit;
      if (shape.kind === "circle") {
        ctx.beginPath();
        ctx.arc(px(shape.x), px(shape.y), Math.max(0, px(shape.r)), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * localProgress);
        if (shape.fill && localProgress >= 1) { ctx.closePath(); ctx.fill(); }
        else ctx.stroke();
      } else if (shape.kind === "rect") {
        const rw = px(shape.width), rh = px(shape.height), rx = px(shape.x), ry = px(shape.y);
        const corners = [[rx-rw/2,ry-rh/2],[rx+rw/2,ry-rh/2],[rx+rw/2,ry+rh/2],[rx-rw/2,ry+rh/2],[rx-rw/2,ry-rh/2]];
        const length = 4, scaled = localProgress * length;
        ctx.beginPath(); ctx.moveTo(corners[0][0], corners[0][1]);
        for (let j=1;j<=Math.floor(scaled);j++) ctx.lineTo(corners[j][0], corners[j][1]);
        if (scaled < length && Math.floor(scaled) < length) {
          const j=Math.floor(scaled), f=scaled-j;
          ctx.lineTo(corners[j][0]+(corners[j+1][0]-corners[j][0])*f,corners[j][1]+(corners[j+1][1]-corners[j][1])*f);
        }
        if (shape.fill && localProgress >= 1) ctx.fill(); else ctx.stroke();
      } else {
        const pts = shape.kind === "line" ? shape.points.slice(0, 2) : shape.points;
        if (!pts.length) { ctx.restore(); return; }
        const segments = Math.max(1, pts.length - 1);
        const visible = localProgress * segments;
        ctx.beginPath(); ctx.moveTo(px(pts[0].x), px(pts[0].y));
        for (let j=1;j<=Math.min(pts.length-1, Math.floor(visible));j++) ctx.lineTo(px(pts[j].x), px(pts[j].y));
        const nextIndex = Math.floor(visible) + 1;
        if (nextIndex < pts.length && visible < segments) {
          const f = visible - Math.floor(visible), a = pts[nextIndex-1], b = pts[nextIndex];
          ctx.lineTo(px(a.x + (b.x-a.x)*f), px(a.y + (b.y-a.y)*f));
        }
        if (shape.closed && localProgress >= 1) ctx.closePath();
        if (shape.fill && localProgress >= 1) ctx.fill(); else ctx.stroke();
      }
      ctx.restore();
    });
  }

  ctx.restore();
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) || 0;
  const g = parseInt(value.slice(2, 4), 16) || 0;
  const b = parseInt(value.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function drawBackground(t, w, h) {
  const base = $("bg").value;
  const preset = $("backgroundPreset").value;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  if (preset === "solid") return;

  // Los controles del fondo son locales e independientes de los colores del JSON.
  const color1 = $("bgEffectColor").value || "#AA98FF";
  const color2 = $("bgEffectColor2").value || "#5A8DFF";
  const opacity = clamp(Number($("bgOpacity").value) / 100, 0, 1);
  if (opacity <= 0) return;

  if (preset === "gradient") {
    const spots = [
      {x: 0.18, y: 0.22, color: color1},
      {x: 0.82, y: 0.3, color: color2},
      {x: 0.52, y: 0.84, color: color1}
    ];
    spots.forEach(({x, y, color}) => {
      const radius = Math.max(w, h) * 0.55;
      const gradient = ctx.createRadialGradient(w * x, h * y, 0, w * x, h * y, radius);
      gradient.addColorStop(0, hexToRgba(color, opacity * 0.8));
      gradient.addColorStop(0.55, hexToRgba(color, opacity * 0.28));
      gradient.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
    });
    return;
  }

  ctx.save();
  ctx.lineWidth = Math.max(1, w / 2560);
  if (preset === "grid") {
    const step = Math.max(42, Math.round(w / 32));
    ctx.strokeStyle = hexToRgba(color1, opacity);
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    ctx.strokeStyle = hexToRgba(color2, opacity);
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  } else if (preset === "diagonal") {
    // Retícula rotada para producir cuadros grandes inclinados, no una cuadrícula recta.
    const step = Math.max(150, Math.round(w / 14));
    const offset = (t * Math.max(18, w * 0.012)) % step;
    const diagonalSpan = Math.ceil((w + h) / step) * step + step * 2;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-w / 2, -h / 2);
    ctx.strokeStyle = hexToRgba(color1, opacity);
    for (let x = -diagonalSpan; x <= w + diagonalSpan; x += step) {
      ctx.beginPath(); ctx.moveTo(x + offset, -diagonalSpan); ctx.lineTo(x + offset, h + diagonalSpan); ctx.stroke();
    }
    ctx.strokeStyle = hexToRgba(color2, opacity);
    for (let y = -diagonalSpan; y <= h + diagonalSpan; y += step) {
      ctx.beginPath(); ctx.moveTo(-diagonalSpan, y + offset); ctx.lineTo(w + diagonalSpan, y + offset); ctx.stroke();
    }
  }
  ctx.restore();
}

function render(t) {
  const w = canvas.width;
  const h = canvas.height;
  drawBackground(t, w, h);

  for (const scene of project.scenes) {
    if (t < scene.start || t >= scene.end) continue;
    for (const object of scene.objects) {
      drawObject(object, t - scene.start, scene.end - scene.start, w, h);
    }
  }
}

function seek(t) {
  position = clamp(t, 0, duration);
  syncDuration();
  render(position);
}

function stop() {
  playing = false;
  cancelAnimationFrame(frameId);
  $("play").textContent = "▶ Reproducir";
}

function tick(now) {
  if (!playing) return;
  position = clamp((now - startStamp) / 1000, 0, duration);
  render(position);
  $("seek").value = Math.round(position * 1000);
  $("clock").textContent = `${fmt(position)} / ${fmt(duration)}`;
  if (position >= duration) {
    stop();
    return;
  }
  frameId = requestAnimationFrame(tick);
}

function sceneList() {
  $("sceneList").replaceChildren();
  if (!project.scenes.length) {
    $("sceneList").innerHTML = '<p class="empty">Sin escenas. Importa un JSON o carga el ejemplo.</p>';
    $("sceneEditor").hidden = true;
    return;
  }

  project.scenes.forEach((scene, index) => {
    const button = document.createElement("button");
    button.className = `sceneItem${index === selectedSceneIndex ? " selected" : ""}`;
    button.type = "button";
    const time = document.createElement("time");
    time.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
    const text = document.createElement("span");
    text.textContent = `${index + 1}. ${scene.objects.map(obj => obj.type === "text" ? obj.text : obj.type === "icon" ? obj.name : obj.type).join(" · ").slice(0, 130)}`;
    button.append(time, text);
    button.addEventListener("click", () => {
      stop();
      selectedSceneIndex = index;
      seek(scene.start + 0.04);
      sceneList();
      renderSceneEditor(index);
      persistUiState();
    });
    $("sceneList").append(button);
  });

  if (selectedSceneIndex >= 0 && selectedSceneIndex < project.scenes.length) {
    renderSceneEditor(selectedSceneIndex);
  } else {
    $("sceneEditor").hidden = true;
  }
}

function renderSceneEditor(index) {
  const editor = $("sceneEditor");
  const scene = project.scenes[index];
  if (!scene) {
    editor.hidden = true;
    return;
  }
  editor.hidden = false;
  editor.replaceChildren();

  const heading = document.createElement("div");
  heading.className = "previewHead";
  const title = document.createElement("h3");
  title.textContent = `Editar escena ${index + 1}`;
  const headingActions = document.createElement("div");
  headingActions.className = "scene-editor-actions";
  const timeTag = document.createElement("span");
  timeTag.className = "tag";
  timeTag.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "scene-editor-close";
  closeButton.textContent = "×";
  closeButton.setAttribute("aria-label", "Cerrar editor de escena");
  closeButton.title = "Cerrar editor";
  closeButton.addEventListener("click", () => {
    selectedSceneIndex = -1;
    editor.hidden = true;
    for (const item of $("sceneList").querySelectorAll(".sceneItem")) item.classList.remove("selected");
    persistUiState();
  });
  headingActions.append(timeTag, closeButton);
  heading.append(title, headingActions);
  editor.append(heading);

  const timing = document.createElement("div");
  timing.className = "two";
  timing.append(
    makeSceneField("Inicio (s)", "number", scene.start, value => {
      scene.start = clamp(Number(value) || 0, 0, Math.max(0, scene.end - 0.05));
    }, {min: 0, max: 10800, step: 0.05}),
    makeSceneField("Fin (s)", "number", scene.end, value => {
      scene.end = clamp(Number(value) || scene.start + 0.05, scene.start + 0.05, 10800);
    }, {min: 0.05, max: 10800, step: 0.05})
  );
  editor.append(timing);
  timing.addEventListener("input", () => {
    if (sizeBaseProject?.scenes[index]) {
      sizeBaseProject.scenes[index].start = scene.start;
      sizeBaseProject.scenes[index].end = scene.end;
    }
    timeTag.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
    $("jsonText").value = JSON.stringify(project, null, 2);
    updateSceneSummary(index);
    render(position);
    persistUiState();
  });

  scene.objects.forEach((object, objectIndex) => {
    const group = document.createElement("div");
    group.className = "scene-object-editor";
    const objectTitle = document.createElement("h4");
    objectTitle.textContent = `Objeto ${objectIndex + 1} · ${object.type}`;
    group.append(objectTitle);

    if (object.type === "text") {
      group.append(makeSceneField("Texto", "text", object.text, value => {
        object.text = String(value).slice(0, 400);
      }));
      group.append(makeSceneField("Peso de fuente", "select", object.weight, value => {
        object.weight = Number(value);
      }, {options: [["400", "Regular"], ["500", "Medium"], ["600", "Semibold"], ["700", "Bold"], ["800", "Extra bold"], ["900", "Black"]]}));
      group.append(makeSceneField("Alineación", "select", object.align, value => {
        object.align = value;
      }, {options: [["left", "Izquierda"], ["center", "Centro"], ["right", "Derecha"]]}));
      group.append(makeSceneField("Ancho máximo", "number", object.maxWidth, value => {
        object.maxWidth = clamp(Number(value) || 0.15, 0.15, 1.2);
      }, {min: 0.15, max: 1.2, step: 0.05}));
      group.append(makeSceneField("Interlineado (× tamaño)", "number", object.lineHeight, value => {
        object.lineHeight = clamp(Number(value) || 1.18, 0.7, 2.2);
      }, {min: 0.7, max: 2.2, step: 0.05}));
    }
    if (object.type === "icon") {
      group.append(makeSceneField("Nombre de icono", "text", object.name, value => {
        if (allowedIcons.has(value)) object.name = value;
      }));
    }

    const positionFields = document.createElement("div");
    positionFields.className = "two";
    positionFields.append(
      makeSceneField("X (0–1)", "number", object.x, value => { object.x = clamp(Number(value) || 0, -1, 2); }, {min: -1, max: 2, step: 0.01}),
      makeSceneField("Y (0–1)", "number", object.y, value => { object.y = clamp(Number(value) || 0, -1, 2); }, {min: -1, max: 2, step: 0.01})
    );
    group.append(positionFields);

    if (object.type === "rect") {
      const dimensions = document.createElement("div");
      dimensions.className = "two";
      dimensions.append(
        makeSceneField("Ancho (0–3× lienzo)", "number", object.width, value => { object.width = clamp(Number(value) || 0.01, 0.01, 3); }, {min: 0.01, max: 3, step: 0.01}),
        makeSceneField("Alto (0–3× lienzo)", "number", object.height, value => { object.height = clamp(Number(value) || 0.01, 0.01, 3); }, {min: 0.01, max: 3, step: 0.01})
      );
      group.append(dimensions);
      group.append(makeSceneField("Radio de esquinas (px)", "number", object.radius, value => { object.radius = clamp(Number(value) || 0, 0, 500); }, {min: 0, max: 500, step: 1}));
    } else if (object.type === "line") {
      group.append(makeSceneField("Longitud (0–3× lienzo)", "number", object.width, value => { object.width = clamp(Number(value) || 0.01, 0.01, 3); }, {min: 0.01, max: 3, step: 0.01}));
    }

    const sizeFields = document.createElement("div");
    sizeFields.className = "two";
    sizeFields.append(
      makeSceneField("Tamaño", "number", object.size, value => {
        const next = clamp(Number(value) || 1, 1, 1200);
        object.size = next;
        const scale = object.type === "text"
          ? Number($("textSizeAdjust").value) / 100
          : object.type === "icon" ? Number($("iconSizeAdjust").value) / 100 : 1;
        if (sizeBaseProject?.scenes[index]?.objects[objectIndex]) {
          sizeBaseProject.scenes[index].objects[objectIndex].size = next / scale;
        }
      }, {min: 1, max: 1200, step: 1}),
      makeSceneField("Color", "color", object.color, value => { object.color = value; }, {})
    );
    group.append(sizeFields);

    const motionFields = document.createElement("div");
    motionFields.className = "two";
    motionFields.append(
      makeSceneField("Entrada", "select", object.enter, value => { object.enter = value; }, {
        options: [["none", "Ninguna"], ["fade", "Fade"], ["pop", "Pop"], ["zoom", "Zoom"], ["slide", "Slide"], ["bounce", "Bounce"], ["elastic", "Elastic"], ["punch", "Punch"], ["wipe", "Wipe"]]
      }),
      makeSceneField("Movimiento", "select", object.idle, value => { object.idle = value; }, {
        options: [["none", "Ninguno"], ["float", "Flotar"], ["breathe", "Respirar"], ["pulse", "Pulso"], ["spin", "Girar"], ["wiggle", "Oscilar"]]
      })
    );
    group.append(motionFields);

    const animationFields = document.createElement("div");
    animationFields.className = "two";
    animationFields.append(
      makeSceneField("Retraso (s)", "number", object.delay, value => { object.delay = clamp(Number(value) || 0, 0, 30); }, {min: 0, max: 30, step: 0.05}),
      makeSceneField("Duración entrada (s)", "number", object.duration, value => { object.duration = clamp(Number(value) || 0.05, 0.05, 6); }, {min: 0.05, max: 6, step: 0.05}),
      makeSceneField("Amplitud", "number", object.amplitude, value => { object.amplitude = clamp(Number(value) || 0, 0, 5); }, {min: 0, max: 5, step: 0.1}),
      makeSceneField("Velocidad", "number", object.speed, value => { object.speed = clamp(Number(value) || 0.1, 0.1, 5); }, {min: 0.1, max: 5, step: 0.1})
    );
    group.append(animationFields);

    const syncBase = () => {
      const baseObject = sizeBaseProject?.scenes[index]?.objects[objectIndex];
      if (baseObject) {
        for (const key of ["text", "name", "x", "y", "width", "height", "radius", "color", "weight", "enter", "idle", "delay", "duration", "amplitude", "speed", "lineHeight", "maxWidth", "align"]) {
          baseObject[key] = object[key];
        }
      }
      if (sizeBaseProject?.scenes[index]) {
        sizeBaseProject.scenes[index].start = scene.start;
        sizeBaseProject.scenes[index].end = scene.end;
      }
      $("jsonText").value = JSON.stringify(project, null, 2);
      timeTag.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
      updateSceneSummary(index);
      render(position);
      persistUiState();
    };
    group.addEventListener("input", syncBase);
    group.addEventListener("change", syncBase);
    editor.append(group);
  });
}

function makeSceneField(labelText, type, value, onValue, options = {}) {
  const wrapper = document.createElement("div");
  wrapper.className = "scene-field";
  const label = document.createElement("label");
  label.textContent = labelText;
  const id = `scene-field-${Math.random().toString(36).slice(2)}`;
  label.htmlFor = id;
  let input;
  if (type === "select") {
    input = document.createElement("select");
    for (const [optionValue, optionLabel] of options.options || []) {
      const option = document.createElement("option");
      option.value = optionValue;
      option.textContent = optionLabel;
      input.append(option);
    }
  } else {
    input = document.createElement("input");
    input.type = type;
  }
  input.id = id;
  input.value = value;
  if (options.min !== undefined) input.min = options.min;
  if (options.max !== undefined) input.max = options.max;
  if (options.step !== undefined) input.step = options.step;
  input.addEventListener("input", () => onValue(input.value));
  wrapper.append(label, input);
  return wrapper;
}

function updateSceneSummary(index) {
  const button = $("sceneList").children[index];
  const scene = project.scenes[index];
  if (!button || !scene) return;
  const time = button.querySelector("time");
  const text = button.querySelector("span");
  if (time) time.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
  if (text) text.textContent = `${index + 1}. ${scene.objects.map(obj => obj.type === "text" ? obj.text : obj.type === "icon" ? obj.name : obj.type).join(" · ").slice(0, 130)}`;
}

function applyGlobalPaletteToScenes() {
  if (!$("applyGlobalPalette").checked || !sizeBaseProject) return;
  const primary = $("fg").value;
  const accent = $("accent").value;
  const recolor = target => {
    for (const scene of target.scenes || []) {
      for (const object of scene.objects || []) {
        object.color = object.type === "text" ? primary : accent;
      }
    }
  };
  recolor(sizeBaseProject);
  recolor(project);
  $("jsonText").value = JSON.stringify(project, null, 2);
  if (selectedSceneIndex >= 0) renderSceneEditor(selectedSceneIndex);
  render(position);
  persistUiState();
}

function updateSizeAdjustments() {
  $("textSizeValue").textContent = `${$("textSizeAdjust").value}%`;
  $("iconSizeValue").textContent = `${$("iconSizeAdjust").value}%`;
  if (!sizeBaseProject) return;

  project = JSON.parse(JSON.stringify(sizeBaseProject));
  const textScale = Number($("textSizeAdjust").value) / 100;
  const iconScale = Number($("iconSizeAdjust").value) / 100;
  for (const scene of project.scenes) {
    for (const object of scene.objects) {
      if (object.type === "text") object.size = clamp(object.size * textScale, 1, 1200);
      if (object.type === "icon") object.size = clamp(object.size * iconScale, 1, 1200);
    }
  }
  $("jsonText").value = JSON.stringify(project, null, 2);
  render(position);
  persistUiState();
}

function apply(preserveSizeControls = false) {
  try {
    const parsed = JSON.parse(extractJsonText($("jsonText").value));
    project = validate(parsed);
    sizeBaseProject = JSON.parse(JSON.stringify(project));
    if ($("applyGlobalPalette").checked) {
      const primary = $("fg").value;
      const accent = $("accent").value;
      for (const scene of sizeBaseProject.scenes) {
        for (const object of scene.objects) object.color = object.type === "text" ? primary : accent;
      }
      project = JSON.parse(JSON.stringify(sizeBaseProject));
    }
    if (!preserveSizeControls) {
      $("textSizeAdjust").value = "200";
      $("iconSizeAdjust").value = "200";
    }
    updateSizeAdjustments();
    if (preserveSizeControls) {
      project.fps = Number($("fps").value);
    } else {
      $("fps").value = String(project.fps);
    }
    // El fondo es una preferencia local y nunca se toma del JSON generado por la IA.
    project.background = $("bg").value;
    $("jsonInfo").textContent = `✓ ${project.scenes.length} escenas válidas. Pulsa una para verla.`;
    updateColorChips();
    if (selectedSceneIndex >= project.scenes.length) selectedSceneIndex = -1;
    sceneList();
    stop();
    seek(0);
    persistUiState();
  } catch (error) {
    $("jsonInfo").textContent = `⚠ ${error.message}`;
  }
}

function preferredMime() {
  const options = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return options.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

$("play").addEventListener("click", () => {
  if (exporting) return;
  if (playing) {
    stop();
    return;
  }
  if (!duration) return;
  if (position >= duration) position = 0;
  playing = true;
  startStamp = performance.now() - position * 1000;
  $("play").textContent = "❚❚ Pausar";
  frameId = requestAnimationFrame(tick);
});

const boldness = $("motionBoldness");
if (boldness) boldness.addEventListener("input", () => { $("motionBoldnessValue").textContent = `${boldness.value}%`; });

$("seek").addEventListener("input", event => {
  if (exporting) return;
  seek(Number(event.target.value) / 1000);
  if (playing) startStamp = performance.now() - position * 1000;
});

$("orientation").addEventListener("change", resize);
$("backgroundPreset").addEventListener("change", () => { render(position); persistUiState(); });
for (const id of ["bgEffectColor", "bgEffectColor2", "bgOpacity"]) {
  $(id).addEventListener("input", () => {
    $("bgOpacityValue").textContent = `${$("bgOpacity").value}%`;
    render(position);
    persistUiState();
  });
}
$("fontFamily").addEventListener("change", async () => { await document.fonts.load(`700 32px "${$("fontFamily").value}"`); render(position); persistUiState(); });
$("fps").addEventListener("change", () => { project.fps = Number($("fps").value); });
$("readSrt").addEventListener("click", prepareCues);
$("copyPrompt").addEventListener("click", copyPrompt);
$("applyJson").addEventListener("click", () => apply(false));
$("textSizeAdjust").addEventListener("input", updateSizeAdjustments);
$("iconSizeAdjust").addEventListener("input", updateSizeAdjustments);
$("resetSizeAdjust").addEventListener("click", () => {
  $("textSizeAdjust").value = "200";
  $("iconSizeAdjust").value = "200";
  updateSizeAdjustments();
});

for (const id of ["bg", "fg", "accent"]) {
  $(id).addEventListener("input", () => {
    updateColorChips();
    if (id === "bg") render(position);
    else if ($("applyGlobalPalette").checked) applyGlobalPaletteToScenes();
    persistUiState();
  });
}
$("applyGlobalPalette").addEventListener("change", () => {
  if ($("applyGlobalPalette").checked) applyGlobalPaletteToScenes();
  persistUiState();
});
for (const id of ["lineHeightPref", "textWidthPref", "safeAreaPref"]) {
  $(id).addEventListener("input", updatePromptControlLabels);
}

$("srtFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (file) {
    $("srtText").value = await file.text();
    prepareCues();
  }
});

$("jsonFile").addEventListener("change", async event => {
  const file = event.target.files?.[0];
  if (file) {
    $("jsonText").value = await file.text();
    persistUiState({target: {id: "jsonText"}});
  }
});

$("srtExample").addEventListener("click", () => {
  const lines = ["Las ideas cobran vida.", "Todo se mueve.", "Esto es Animotion."];
  $("srtText").value = lines.map((text, i) => `${i + 1}\n00:00:${String(i * 4).padStart(2, "0")},000 --> 00:00:${String(i * 4 + 3).padStart(2, "0")},500\n${text}`).join("\n\n");
  $("readSrt").click();
  $("jsonText").value = "```json\n" + JSON.stringify(EXAMPLE, null, 2) + "\n```";
  apply();
});

$("downloadJson").addEventListener("click", () => {
  try {
    const parsed = JSON.parse(extractJsonText($("jsonText").value));
    const validated = validate(parsed);
    const blob = new Blob([JSON.stringify(validated, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "animotion-project.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  } catch (error) {
    $("jsonInfo").textContent = `⚠ Corrige el JSON antes de descargar: ${error.message}`;
  }
});

$("exportVideo").addEventListener("click", async () => {
  if (exporting || !duration) return;
  if (!("MediaRecorder" in window) || !canvas.captureStream) {
    $("exportInfo").textContent = "Tu navegador no admite grabación de Canvas.";
    return;
  }

  stop();
  exporting = true;
  const button = $("exportVideo");
  button.disabled = true;
  $("play").disabled = true;

  const fps = Number($("fps").value);
  const mime = preferredMime();
  if (!mime) {
    $("exportInfo").textContent = "No hay formato de grabación compatible.";
    exporting = false;
    button.disabled = false;
    $("play").disabled = false;
    return;
  }

  let stream;
  let recorder;
  const chunks = [];
  let exportStart;
  let raf;
  let finished = false;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(track => track.stop());
    exporting = false;
    button.disabled = false;
    $("play").disabled = false;
    seek(0);
  };

  try {
    await document.fonts.ready;
    render(0);
    stream = canvas.captureStream(fps);
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: Math.min(24000000, Math.max(8000000, canvas.width * canvas.height * fps * 0.095))
    });

    recorder.ondataavailable = event => {
      if (event.data.size) chunks.push(event.data);
    };
    recorder.onerror = () => {
      $("exportInfo").textContent = "Error al grabar el video.";
      cleanup();
    };
    recorder.onstop = () => {
      if (chunks.length) {
        const actual = recorder.mimeType || mime;
        const ext = actual.includes("mp4") ? "mp4" : "webm";
        const blob = new Blob(chunks, {type: actual});
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `animotion-${canvas.width}x${canvas.height}.${ext}`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        $("exportInfo").textContent = `Video generado: ${ext.toUpperCase()} · ${(blob.size / 1048576).toFixed(1)} MB`;
      } else {
        $("exportInfo").textContent = "No se generaron datos de video.";
      }
      cleanup();
    };

    recorder.start(1000);
    $("exportInfo").textContent = "Grabando en tiempo real: mantén esta pestaña visible.";
    exportStart = performance.now();

    const step = now => {
      if (!exporting) return;
      const t = Math.min((now - exportStart) / 1000, duration);
      render(t);
      $("progressBar").style.width = `${((t / duration) * 100).toFixed(1)}%`;
      if (t >= duration) {
        if (recorder.state === "recording") recorder.stop();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
  } catch (error) {
    $("exportInfo").textContent = `No se pudo exportar: ${error.message}`;
    cleanup();
  }
});

document.querySelectorAll("input[id], select[id], textarea[id]").forEach(control => {
  if (control.type === "file" || control.id === "seek") return;
  control.addEventListener("input", persistUiState);
  control.addEventListener("change", persistUiState);
});

const restoredState = restoreUiState();
updateColorChips();
updatePromptControlLabels();
$("bgOpacityValue").textContent = `${$("bgOpacity").value}%`;
resize();
if (restoredState && $("jsonText").value.trim()) {
  if ($("srtText").value.trim()) prepareCues();
  apply(true);
} else {
  $("jsonText").value = "```json\n" + JSON.stringify(EXAMPLE, null, 2) + "\n```";
  apply(false);
}
persistUiState();
