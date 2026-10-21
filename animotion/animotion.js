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
let cues = [];
let duration = 0;
let position = 0;
let playing = false;
let frameId = 0;
let startStamp = 0;
let exporting = false;

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

const allowedTypes = new Set(["text", "rect", "circle", "line", "icon"]);
const allowedEnter = new Set(["none", "fade", "pop", "zoom", "slide", "bounce", "elastic", "punch", "wipe"]);
const allowedIdle = new Set(["none", "float", "breathe", "pulse", "spin", "wiggle"]);
const allowedIcons = new Set(["sparkles", "play", "heart", "star", "bolt", "check", "arrow", "gear", "bulb", "chart", "monitor", "brain", "camera", "music", "clock"]);
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
  return {next, isTimed};
}

function cuesToSrt(items) {
  return items.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}`).join("\n\n");
}

function paletteSettings() {
  return {
    background: $("bg").value.toUpperCase(),
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
    maxObjects: Number($("maxObjects").value)
  };
}

function buildPrompt(items) {
  const settings = paletteSettings();
  const res = settings.orientation === "portrait" ? "[1440, 2560]" : "[2560, 1440]";

  return `Actúa como director creativo de motion graphics para Animotion v1, una herramienta que renderiza escenas declarativas sobre Canvas.

OBJETIVO: Crea escenas animadas que ilustren las ideas importantes del siguiente discurso. Prioriza metáforas visuales, diagramas, números, iconos y composiciones elegantes en vez de repetir cada subtítulo. No es necesario crear una escena para cada fragmento. Conserva los tiempos absolutos indicados; no reinicies el reloj entre escenas. Los tiempos del texto normal son aproximados, no una transcripción de audio real.

DIRECCIÓN VISUAL PREDEFINIDA:
- Resolución: ${res}
- FPS: ${settings.fps}
- Fondo: ${settings.background}
- Color principal: ${settings.primary}
- Color accent: ${settings.accent}
- Composición: ${settings.layoutStyle}
- Densidad visual: ${settings.density}
- Uso de texto: ${settings.textUsage}
- Interlineado sugerido para objetos de texto: ${settings.lineHeight.toFixed(2)}
- Ancho máximo sugerido para bloques de texto: ${(settings.textWidth).toFixed(0)}% del lienzo
- Zona segura mínima: ${settings.safeArea}% desde cada borde
- Máximo recomendado de objetos por escena: ${settings.maxObjects}

ESTILO: motion graphics minimalistas premium, fluidos y legibles. Usa la paleta indicada arriba. Respeta el significado del contenido. Distribuye escenas de 3 a 8 segundos cuando el discurso lo permita. Evita saturar la pantalla.

RESPUESTA: entrega el resultado únicamente dentro de un único bloque de código con lenguaje json, listo para copiar. No agregues explicación, introducción ni texto fuera del bloque.

El esquema raíz exacto debe ser:
{"version":1,"resolution":${res},"fps":${settings.fps},"background":"${settings.background}","scenes":[{"start":0,"end":3,"objects":[{"type":"text","text":"EJEMPLO","x":0.5,"y":0.5,"size":90,"color":"${settings.primary}","weight":800,"enter":"bounce","idle":"breathe","delay":0,"duration":0.55,"amplitude":1,"speed":1,"lineHeight":${settings.lineHeight.toFixed(2)},"maxWidth":${(settings.textWidth / 100).toFixed(2)},"align":"center"}]}]}

Usa exclusivamente los tipos: text, rect, circle, line, icon.
Para cada objeto, usa solo propiedades compatibles: type, text, name, x, y, size, width, height, radius, color, weight, enter, idle, delay, duration, amplitude, speed, lineHeight, maxWidth, align.

Reglas técnicas:
- x/y son posiciones relativas entre 0 y 1.
- width/height/maxWidth son proporciones relativas del lienzo.
- size es un tamaño de referencia en píxeles.
- align solo puede ser left, center o right.
- Cada escena debe tener start, end y objects.
- Máximo duro del motor: 50 objetos por escena. Pero intenta no pasar de ${settings.maxObjects} objetos por escena.
- Mantén el contenido dentro de una zona segura aproximada del ${settings.safeArea}% por lado.
- Usa el interlineado sugerido y el ancho máximo sugerido como guía principal para los textos.

Animaciones enter permitidas: none, fade, pop, zoom, slide, bounce, elastic, punch, wipe.
Movimientos idle permitidos: none, float, breathe, pulse, spin, wiggle.
Iconos válidos: sparkles, play, heart, star, bolt, check, arrow, gear, bulb, chart, monitor, brain, camera, music, clock.

Usa valores hexadecimales #RRGGBB, peso entre 100 y 900, y no inventes tipos, propiedades, nombres ni efectos. Evita escenas superpuestas innecesariamente. Límite 1200 escenas en total. Usa solo la información del guion, sin suponer hechos externos.

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
    if (!Array.isArray(scene.objects) || scene.objects.length > 50) {
      throw Error(`Objetos inválidos (máximo 50) en escena ${index + 1}`);
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
          enter: allowedEnter.has(obj.enter) ? obj.enter : "fade",
          idle: allowedIdle.has(obj.idle) ? obj.idle : "none",
          delay: finite(obj.delay, 0, 0, 30),
          duration: finite(obj.duration, 0.55, 0.05, 6),
          amplitude: finite(obj.amplitude, 1, 0, 5),
          speed: finite(obj.speed, 1, 0.1, 5),
          lineHeight: finite(obj.lineHeight, 1.18, 0.7, 2.2),
          maxWidth: finite(obj.maxWidth, 0.85, 0.15, 1.2),
          align: allowedAlign.has(obj.align) ? obj.align : "center"
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
  let alpha = p;
  let dx = 0;
  let dy = 0;
  let rot = 0;

  if (object.enter === "none") alpha = 1;
  else if (object.enter === "pop") scale = 0.6 + 0.4 * p;
  else if (object.enter === "zoom") scale = 0.25 + 0.75 * p;
  else if (object.enter === "slide") dy = (1 - p) * 90 * amplitude;
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
  }

  if (time >= object.duration) {
    const u = Math.max(0, phase);
    if (object.idle === "float") dy += Math.sin(u * 2.4) * 13 * amplitude;
    if (object.idle === "breathe") scale *= 1 + Math.sin(u * 2.6) * 0.035 * amplitude;
    if (object.idle === "pulse") scale *= 1 + Math.pow(Math.max(0, Math.sin(u * 3.6)), 8) * 0.12 * amplitude;
    if (object.idle === "wiggle") rot += Math.sin(u * 6) * 0.065 * amplitude;
    if (object.idle === "spin") rot += u * 0.45 * amplitude;
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
    ctx.font = `${object.weight} ${size}px Outfit, sans-serif`;
    ctx.textBaseline = "middle";
    ctx.textAlign = object.align;

    const maxWidth = Math.max(40, w * object.maxWidth);
    const lines = wrapTextLines(object.text, maxWidth);
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
    ctx.lineWidth = Math.max(2, size * 0.065);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-(object.width * w) / 2, 0);
    ctx.lineTo((object.width * w) / 2, 0);
    ctx.stroke();
  }

  if (object.type === "icon") {
    iconPath(object.name, size);
  }

  ctx.restore();
}

function render(t) {
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = $("bg").value;
  ctx.fillRect(0, 0, w, h);

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
    return;
  }

  project.scenes.forEach((scene, index) => {
    const button = document.createElement("button");
    button.className = "sceneItem";
    const time = document.createElement("time");
    time.textContent = `${fmt(scene.start)}–${fmt(scene.end)}`;
    const text = document.createElement("span");
    text.textContent = `${index + 1}. ${scene.objects.map(obj => obj.type === "text" ? obj.text : obj.type === "icon" ? obj.name : obj.type).join(" · ").slice(0, 130)}`;
    button.append(time, text);
    button.addEventListener("click", () => {
      stop();
      seek(scene.start + 0.04);
    });
    $("sceneList").append(button);
  });
}

function apply() {
  try {
    const parsed = JSON.parse(extractJsonText($("jsonText").value));
    project = validate(parsed);
    $("bg").value = project.background;
    $("fps").value = String(project.fps);
    $("jsonInfo").textContent = `✓ ${project.scenes.length} escenas válidas. Pulsa una para verla.`;
    updateColorChips();
    sceneList();
    stop();
    seek(0);
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

$("seek").addEventListener("input", event => {
  if (exporting) return;
  seek(Number(event.target.value) / 1000);
  if (playing) startStamp = performance.now() - position * 1000;
});

$("orientation").addEventListener("change", resize);
$("fps").addEventListener("change", () => { project.fps = Number($("fps").value); });
$("readSrt").addEventListener("click", prepareCues);
$("copyPrompt").addEventListener("click", copyPrompt);
$("applyJson").addEventListener("click", apply);

for (const id of ["bg", "fg", "accent"]) {
  $(id).addEventListener("input", () => {
    updateColorChips();
    if (id === "bg") render(position);
  });
}
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
  if (file) $("jsonText").value = await file.text();
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

updateColorChips();
updatePromptControlLabels();
resize();
$("jsonText").value = "```json\n" + JSON.stringify(EXAMPLE, null, 2) + "\n```";
apply();
