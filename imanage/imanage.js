/* Imanage: JPEG, PNG y WebP en el navegador. Sin backend ni dependencias de compresión externas. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const elements = {
    input: $('file-input'), drop: $('dropzone'), quality: $('quality'), qualityValue: $('quality-value'),
    maxSize: $('max-size'), optimize: $('optimize'), cancel: $('cancel'), clear: $('clear'),
    list: $('file-list'), empty: $('empty-state'), count: $('files-count'),
    progress: $('progress-block'), progressLabel: $('progress-label'), progressPercent: $('progress-percent'),
    progressTrack: $('progress-track'), progressFill: $('progress-fill'),
    downloadArea: $('download-area'), downloadHeading: $('download-heading'),
    downloadCaption: $('download-caption'), downloadAll: $('download-all'), toast: $('toast')
  };
  const accepted = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const downloadIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
  const removeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>';

  let items = [];
  let serial = 0;
  let processing = false;
  let archiving = false;
  let cancelRequested = false;
  let toastTimeout;

  const isReady = item => item.status === 'ready' || item.status === 'original';
  const niceSize = bytes => {
    if (!Number.isFinite(bytes)) return '—';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB'];
    let n = bytes / 1024, i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)} ${units[i]}`;
  };
  const pct = (before, after) => before ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;

  function notice(message, error = false) {
    clearTimeout(toastTimeout);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-error', error);
    elements.toast.classList.add('is-visible');
    toastTimeout = setTimeout(() => elements.toast.classList.remove('is-visible'), 4700);
  }

  function setBusy() {
    const busy = processing || archiving;
    const canDownload = items.some(isReady) && !busy;
    elements.input.disabled = busy;
    elements.quality.disabled = busy;
    elements.maxSize.disabled = busy;
    elements.drop.classList.toggle('is-disabled', busy);
    elements.drop.setAttribute('aria-disabled', String(busy));
    elements.optimize.disabled = busy || !items.some(item => item.status === 'pending');
    elements.clear.disabled = busy || !items.length;
    elements.cancel.hidden = !processing;
    elements.downloadAll.disabled = !canDownload;
  }

  function progress(done, count, label) {
    elements.progress.hidden = false;
    const percentage = count > 0 ? Math.round(done / count * 100) : 0;
    elements.progressLabel.textContent = label;
    elements.progressPercent.textContent = `${percentage}%`;
    elements.progressFill.style.width = `${percentage}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(percentage));
  }

  function render() {
    elements.list.replaceChildren();
    elements.empty.hidden = items.length > 0;
    elements.count.textContent = String(items.length);
    const finished = items.filter(isReady);

    for (const item of items) {
      const row = document.createElement('article');
      row.className = 'im-file';
      const thumbnail = document.createElement('img');
      thumbnail.className = 'im-thumb'; thumbnail.src = item.preview;
      thumbnail.alt = ''; thumbnail.loading = 'lazy';
      const detail = document.createElement('div'); detail.className = 'im-file-detail';
      const name = document.createElement('div'); name.className = 'im-file-name';
      name.textContent = item.file.name; name.title = item.file.name;
      const metadata = document.createElement('div'); metadata.className = 'im-file-meta';
      metadata.textContent = `${item.ext.toUpperCase()} · ${niceSize(item.file.size)}`;
      detail.append(name, metadata);
      const result = document.createElement('div'); result.className = 'im-file-status';
      const size = document.createElement('span'); size.className = 'im-file-size';
      const status = document.createElement('span'); status.className = 'im-file-status-text';
      if (isReady(item)) {
        size.append(document.createTextNode(niceSize(item.file.size)));
        const arrow = document.createElement('span'); arrow.className = 'im-arrow'; arrow.textContent = '→';
        size.append(arrow, document.createTextNode(niceSize(item.output.size)));
        if (item.status === 'ready') {
          status.textContent = `−${pct(item.file.size, item.output.size)}% de peso`;
          status.classList.add('is-saved');
        } else {
          status.textContent = 'Original conservado · no pesaba menos';
        }
      } else if (item.status === 'working') {
        size.textContent = niceSize(item.file.size); status.textContent = 'Optimizando…';
      } else if (item.status === 'error') {
        size.textContent = niceSize(item.file.size); status.textContent = item.error || 'Error al procesar';
        status.classList.add('is-error'); status.title = status.textContent;
      } else {
        size.textContent = niceSize(item.file.size); status.textContent = 'Pendiente de optimizar';
      }
      result.append(size, status);
      const download = document.createElement('button');
      download.type = 'button'; download.className = 'im-file-action download';
      download.title = 'Descargar imagen'; download.setAttribute('aria-label', `Descargar ${item.file.name}`);
      download.innerHTML = downloadIcon; download.disabled = !isReady(item) || processing || archiving;
      download.addEventListener('click', () => saveBlob(item.output, item.file.name));
      const remove = document.createElement('button'); remove.type = 'button';
      remove.className = 'im-file-action remove'; remove.innerHTML = removeIcon;
      remove.title = 'Quitar imagen'; remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
      remove.disabled = processing || archiving;
      remove.addEventListener('click', () => removeItem(item.id));
      row.append(thumbnail, detail, result, download, remove);
      elements.list.append(row);
    }

    elements.downloadArea.hidden = !finished.length;
    if (finished.length) {
      const allCount = items.length;
      const count = finished.length;
      elements.downloadHeading.textContent = `${count} ${count === 1 ? 'imagen lista' : 'imágenes listas'}`;
      elements.downloadCaption.textContent = count < allCount
        ? `${allCount - count} sin procesar o con error · no se incluyen`
        : 'Nombres y formatos originales';
      elements.downloadAll.textContent = allCount === 1 ? 'Descargar imagen' : 'Descargar ZIP';
    }
    setBusy();
  }

  function removeItem(id) {
    if (processing || archiving) return;
    const target = items.find(item => item.id === id);
    if (!target) return;
    URL.revokeObjectURL(target.preview);
    items = items.filter(item => item.id !== id);
    elements.progress.hidden = true;
    render();
  }

  function clearAll() {
    if (processing || archiving) return;
    items.forEach(item => URL.revokeObjectURL(item.preview));
    items = [];
    elements.progress.hidden = true;
    render();
  }

  function addFiles(fileList) {
    if (processing || archiving) return;
    const files = [...fileList];
    let added = 0, rejected = 0;
    for (const file of files) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (!file.size || !Object.hasOwn(accepted, ext) || (file.type && file.type !== accepted[ext])) {
        rejected++;
        continue;
      }
      items.push({id: ++serial, file, ext, preview: URL.createObjectURL(file), output: null,
        status: 'pending', error: ''});
      added++;
    }
    if (added) {
      elements.progress.hidden = true;
      render();
    }
    if (rejected) notice(`${rejected} archivo(s) omitido(s). Aceptamos JPG, PNG y WebP.`, true);
    else if (added) notice(`${added} ${added === 1 ? 'imagen agregada' : 'imágenes agregadas'}. Listas para optimizar.`);
  }

  function updateQuality() {
    elements.qualityValue.value = `${elements.quality.value}%`;
    const ratio = (Number(elements.quality.value) - 35) / (95 - 35) * 100;
    elements.quality.style.setProperty('--fill', `${ratio}%`);
  }

  function settingsChanged() {
    if (processing || archiving) return;
    // Resultados existentes dejan de ser válidos al cambiar la configuración.
    let changed = false;
    for (const item of items) {
      if (item.status !== 'pending') {
        item.output = null; item.error = ''; item.status = 'pending'; changed = true;
      }
    }
    if (changed) {
      elements.progress.hidden = true;
      render();
    }
  }

  async function decode(file) {
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, {imageOrientation: 'from-image'}); }
      catch (_) { /* Fallback de navegadores con compatibilidad incompleta. */ }
    }
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.decoding = 'async';
      await new Promise((resolve, reject) => {
        image.onload = resolve;
        image.onerror = () => reject(new Error('No se pudo leer la imagen'));
        image.src = url;
      });
      return image;
    } finally { URL.revokeObjectURL(url); }
  }

  async function optimizeImage(item) {
    const image = await decode(item.file);
    try {
      const width = image.width || image.naturalWidth;
      const height = image.height || image.naturalHeight;
      if (!width || !height || width * height > 80_000_000) {
        throw new Error('Resolución demasiado grande para procesar');
      }
      const limit = Number(elements.maxSize.value);
      const ratio = limit && Math.max(width, height) > limit ? limit / Math.max(width, height) : 1;
      const targetWidth = Math.max(1, Math.round(width * ratio));
      const targetHeight = Math.max(1, Math.round(height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth; canvas.height = targetHeight;
      const ctx = canvas.getContext('2d', {alpha: item.ext !== 'jpg' && item.ext !== 'jpeg'});
      if (!ctx) throw new Error('Canvas no disponible');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      // JPEG no admite transparencia; para JPG original el fondo es opaco.
      if (item.ext === 'jpg' || item.ext === 'jpeg') {
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, targetWidth, targetHeight);
      }
      ctx.drawImage(image, 0, 0, targetWidth, targetHeight);
      const mimetype = accepted[item.ext];
      const compressed = await new Promise((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('El navegador no pudo codificar esta imagen')),
        mimetype, Number(elements.quality.value) / 100
      ));
      // Algunos navegadores convierten silenciosamente a PNG si no soportan el encoder.
      if (compressed.type !== mimetype) throw new Error('Este navegador no permite exportar este formato');
      return compressed.size < item.file.size ? compressed : item.file;
    } finally {
      if (typeof image.close === 'function') image.close();
    }
  }

  async function optimizeAll() {
    if (processing || archiving) return;
    const pending = items.filter(item => item.status === 'pending');
    if (!pending.length) return;
    processing = true;
    cancelRequested = false;
    elements.cancel.disabled = false;
    setBusy();
    let done = 0, failures = 0;
    progress(0, pending.length, 'Preparando archivos…');
    for (const item of pending) {
      if (cancelRequested) break;
      item.status = 'working';
      progress(done, pending.length, `Optimizando ${item.file.name}`);
      render();
      // Permite actualizar el estado antes de bloquear la decodificación.
      await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
      if (cancelRequested) { item.status = 'pending'; break; }
      try {
        const output = await optimizeImage(item);
        if (cancelRequested) { item.status = 'pending'; break; }
        item.output = output;
        item.status = output === item.file ? 'original' : 'ready';
      } catch (error) {
        if (cancelRequested) { item.status = 'pending'; break; }
        item.error = error?.message || 'No se pudo procesar';
        item.status = 'error';
        failures++;
      }
      done++;
      progress(done, pending.length, `Procesadas ${done} de ${pending.length}`);
      render();
    }
    processing = false;
    elements.progress.hidden = true;
    render();
    if (cancelRequested) notice('Procesamiento cancelado. Puedes continuar con los archivos pendientes.');
    else if (failures) notice(`${failures} ${failures === 1 ? 'archivo no pudo' : 'archivos no pudieron'} procesarse. Revisa la lista.`, true);
    else notice('¡Listo! Tus imágenes están preparadas para descargar.');
  }

  function saveBlob(blob, filename) {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url; link.download = filename;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();

  async function crcOf(blob) {
    let crc = 0xffffffff;
    if (typeof blob.stream === 'function') {
      const reader = blob.stream().getReader();
      try {
        while (true) {
          const {value, done} = await reader.read();
          if (done) break;
          for (let i = 0; i < value.length; i++) crc = crcTable[(crc ^ value[i]) & 0xff] ^ (crc >>> 8);
        }
      } finally { reader.releaseLock(); }
    } else {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function zipName(name, names) {
    const base = name.replace(/[\\/\u0000-\u001f]/g, '_').trim() || 'imagen';
    const index = base.lastIndexOf('.');
    const title = index > 0 ? base.slice(0, index) : base;
    const ext = index > 0 ? base.slice(index) : '';
    let candidate = base, number = 2;
    while (names.has(candidate.toLowerCase())) candidate = `${title} (${number++})${ext}`;
    names.add(candidate.toLowerCase());
    return candidate;
  }

  // ZIP clásico (STORE): las imágenes ya están comprimidas; no es útil comprimirlas otra vez.
  // Guarda los bytes exactos de cada imagen con su nombre y extensión originales.
  async function createZip(files) {
    if (files.length > 65535) throw new Error('Demasiados archivos para un solo ZIP');
    const encoder = new TextEncoder();
    const parts = [], central = [], names = new Set();
    let offset = 0, directorySize = 0;
    for (let i = 0; i < files.length; i++) {
      const {file, output} = files[i];
      const filename = zipName(file.name, names);
      const name = encoder.encode(filename);
      if (name.length > 65535 || output.size > 0xffffffff) throw new Error('Archivo demasiado grande para ZIP');
      const checksum = await crcOf(output);
      const date = new Date(file.lastModified || Date.now());
      const year = Math.min(2107, Math.max(1980, date.getFullYear()));
      const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >>> 1);
      const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
      const local = new Uint8Array(30 + name.length), view = new DataView(local.buffer);
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true);
      view.setUint16(6, 0x0800, true); view.setUint16(8, 0, true);
      view.setUint16(10, dosTime, true); view.setUint16(12, dosDate, true);
      view.setUint32(14, checksum, true); view.setUint32(18, output.size, true);
      view.setUint32(22, output.size, true); view.setUint16(26, name.length, true);
      local.set(name, 30);
      const entry = new Uint8Array(46 + name.length), cv = new DataView(entry.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true); cv.setUint16(12, dosTime, true);
      cv.setUint16(14, dosDate, true); cv.setUint32(16, checksum, true);
      cv.setUint32(20, output.size, true); cv.setUint32(24, output.size, true);
      cv.setUint16(28, name.length, true); cv.setUint32(42, offset, true);
      entry.set(name, 46);
      central.push(entry); directorySize += entry.length;
      parts.push(local, output);
      offset += local.length + output.size;
      if (offset + directorySize + 22 > 0xffffffff) throw new Error('ZIP demasiado grande (límite 4 GB)');
      progress(i + 1, files.length, `Empaquetando ${i + 1} de ${files.length}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const footer = new Uint8Array(22), fv = new DataView(footer.buffer);
    fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, files.length, true);
    fv.setUint16(10, files.length, true); fv.setUint32(12, directorySize, true);
    fv.setUint32(16, offset, true);
    return new Blob([...parts, ...central, footer], {type:'application/zip'});
  }

  async function downloadResults() {
    if (processing || archiving) return;
    const files = items.filter(isReady);
    if (!files.length) return;
    if (items.length === 1) { saveBlob(files[0].output, files[0].file.name); return; }
    archiving = true;
    elements.downloadAll.textContent = 'Creando ZIP…';
    setBusy();
    progress(0, files.length, 'Preparando ZIP…');
    try {
      const zip = await createZip(files);
      const date = new Date();
      const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      saveBlob(zip, `Imanage-${stamp}.zip`);
      notice('ZIP creado con tus archivos originales o sus versiones optimizadas.');
    } catch (error) {
      notice(error?.message || 'No se pudo crear el ZIP', true);
    } finally {
      archiving = false;
      elements.progress.hidden = true;
      render();
    }
  }

  elements.drop.addEventListener('click', () => { if (!processing && !archiving) elements.input.click(); });
  elements.drop.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); elements.drop.click(); }
  });
  elements.input.addEventListener('change', event => { addFiles(event.target.files); event.target.value = ''; });
  for (const eventName of ['dragenter','dragover']) {
    elements.drop.addEventListener(eventName, event => {
      event.preventDefault();
      if (!processing && !archiving) elements.drop.classList.add('is-over');
    });
  }
  for (const eventName of ['dragleave','drop']) {
    elements.drop.addEventListener(eventName, event => {
      event.preventDefault(); elements.drop.classList.remove('is-over');
      if (eventName === 'drop') addFiles(event.dataTransfer.files);
    });
  }
  // Evita que soltar una imagen fuera de la zona navegue fuera de la herramienta.
  document.addEventListener('dragover', event => event.preventDefault());
  document.addEventListener('drop', event => event.preventDefault());
  elements.quality.addEventListener('input', updateQuality);
  elements.quality.addEventListener('change', settingsChanged);
  elements.maxSize.addEventListener('change', settingsChanged);
  elements.optimize.addEventListener('click', optimizeAll);
  elements.cancel.addEventListener('click', () => { cancelRequested = true; elements.cancel.disabled = true; });
  elements.clear.addEventListener('click', clearAll);
  elements.downloadAll.addEventListener('click', downloadResults);
  updateQuality();
  render();
})();
