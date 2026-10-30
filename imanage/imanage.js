/* Imanage: compresión local; PNG con UPNG y Pako incluidos en vendor/. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const elements = {
    input: $('file-input'), drop: $('dropzone'), quality: $('quality'), qualityValue: $('quality-value'),
    maxSize: $('max-size'), mode: $('compression-mode'), optimize: $('optimize'), cancel: $('cancel'), clear: $('clear'),
    list: $('file-list'), empty: $('empty-state'), count: $('files-count'),
    progress: $('progress-block'), progressLabel: $('progress-label'), progressPercent: $('progress-percent'),
    progressTrack: $('progress-track'), progressFill: $('progress-fill'),
    downloadArea: $('download-area'), downloadHeading: $('download-heading'),
    downloadCaption: $('download-caption'), toast: $('toast')
  };
  const accepted = {jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp'};
  const removeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 3h4m-8 4 1 14h10l1-14M10 11v6m4-6v6"/></svg>';

  let items = [];
  let serial = 0;
  let processing = false;
  let archiving = false;
  let cancelRequested = false;
  let toastTimeout;
  let cancelPngJob = null;
  const pngWorkerUrl = new URL('png-worker.js', document.currentScript.src);

  const isReady = item => item.status === 'ready' || item.status === 'original';
  const outputName = item => item.output && item.output !== item.file && item.output.type === 'image/webp' && item.ext !== 'webp'
    ? item.file.name.replace(/\.[^.]+$/, '.webp') : item.file.name;
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
    elements.input.disabled = busy;
    elements.quality.disabled = busy;
    elements.maxSize.disabled = busy;
    elements.mode.disabled = busy;
    elements.drop.classList.toggle('is-disabled', busy);
    elements.drop.setAttribute('aria-disabled', String(busy));
    const complete = items.length > 0 && items.every(isReady);
    elements.optimize.disabled = busy || !items.length;
    elements.optimize.textContent = archiving ? 'Creando ZIP…' : processing ? 'Comprimiendo…'
      : complete ? (items.length === 1 ? 'Descargar' : 'Descargar todo')
      : (items.length === 1 ? 'Comprimir' : 'Comprimir todo');
    elements.optimize.classList.toggle('is-download', complete);
    if (complete && !busy) window.ImanageFiles.decorateDownload(elements.optimize);
    elements.clear.disabled = busy || !items.length;
    elements.cancel.hidden = !processing;
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
        metadata.textContent += ` → ${item.output === item.file ? item.ext.toUpperCase() : item.output.type.replace('image/', '').toUpperCase()}`;
        if (item.outputWidth) metadata.textContent += ` · ${item.outputWidth} × ${item.outputHeight} px`;
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
      const ready = isReady(item);
      const actionLabel = ready ? 'Descargar' : item.status === 'working' ? 'Comprimiendo…' : item.status === 'error' ? 'Reintentar' : 'Comprimir';
      download.type = 'button'; download.className = 'im-file-action im-item-primary';
      download.classList.toggle('is-download', ready);
      download.title = actionLabel; download.setAttribute('aria-label', `${actionLabel} ${item.file.name}`);
      download.textContent = actionLabel; download.disabled = processing || archiving;
      if (ready) window.ImanageFiles.decorateDownload(download, true);
      download.addEventListener('click', () => ready ? saveBlob(item.output, outputName(item)) : optimizeAll(item.id));
      const reset = document.createElement('button');
      reset.type = 'button'; reset.className = 'im-file-action reset';
      reset.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/></svg>';
      reset.title = 'Restablecer imagen'; reset.setAttribute('aria-label', `Restablecer ${item.file.name}`);
      reset.disabled = processing || archiving || item.status === 'pending';
      reset.addEventListener('click', () => {
        item.output = null; item.outputWidth = null; item.outputHeight = null;
        item.error = ''; item.status = 'pending'; elements.progress.hidden = true; render();
      });
      const remove = document.createElement('button'); remove.type = 'button';
      remove.className = 'im-file-action remove'; remove.innerHTML = removeIcon;
      remove.title = 'Quitar imagen'; remove.setAttribute('aria-label', `Quitar ${item.file.name}`);
      remove.disabled = processing || archiving;
      remove.addEventListener('click', () => removeItem(item.id));
      const actions = document.createElement('div'); actions.className = 'im-row-actions';
      actions.append(reset, download, remove);
      row.append(thumbnail, detail, result, actions);
      elements.list.append(row);
    }

    elements.downloadArea.hidden = !finished.length;
    if (finished.length) {
      const allCount = items.length;
      const count = finished.length;
      elements.downloadHeading.textContent = `${count} ${count === 1 ? 'imagen lista' : 'imágenes listas'}`;
      elements.downloadCaption.textContent = count < allCount
        ? `${allCount - count} sin procesar o con error · no se incluyen`
        : 'La extensión corresponde al formato de cada resultado';
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
      if (!file.size || !Object.hasOwn(accepted, ext)) {
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
    const ratio = (Number(elements.quality.value) - Number(elements.quality.min)) / (Number(elements.quality.max) - Number(elements.quality.min)) * 100;
    elements.quality.style.setProperty('--fill', `${ratio}%`);
  }

  function settingsChanged() {
    if (processing || archiving) return;
    // Resultados existentes dejan de ser válidos al cambiar la configuración.
    let changed = false;
    for (const item of items) {
      if (item.status !== 'pending') {
        item.output = null; item.outputWidth = null; item.outputHeight = null;
        item.error = ''; item.status = 'pending'; changed = true;
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

  function encodePng(pixels, width, height, colors) {
    // Worker cuando se sirve por HTTP; fallback local para abrir el HTML directamente.
    return new Promise((resolve, reject) => {
      let worker;
      let settled = false;
      const finish = (error, result) => {
        if (settled) return;
        settled = true;
        if (worker) worker.terminate();
        cancelPngJob = null;
        if (error) reject(error); else resolve(new Blob([result], {type:'image/png'}));
      };
      const fallback = async () => {
        if (worker) worker.terminate();
        await new Promise(done => setTimeout(done, 0));
        if (settled) return;
        try { finish(null, UPNG.encode([pixels.buffer], width, height, colors)); }
        catch (error) { finish(error); }
      };
      cancelPngJob = () => finish(new Error('Procesamiento cancelado'));
      try {
        worker = new Worker(pngWorkerUrl);
        worker.onmessage = event => event.data.error
          ? finish(new Error(event.data.error)) : finish(null, event.data.buffer);
        worker.onerror = event => { event.preventDefault(); fallback(); };
        // No transferir: conservamos los píxeles para el fallback si el worker no carga.
        worker.postMessage({pixels:pixels.buffer, width, height, colors});
      } catch (_) { fallback(); }
    });
  }

  async function optimizeImage(item) {
    const image = await decode(item.file);
    let canvas;
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
      canvas = document.createElement('canvas');
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
      const formats = [accepted[item.ext]];
      if (elements.mode.value === 'auto' && item.ext !== 'webp') formats.push('image/webp');
      let best = item.file;
      let encoded = false;
      for (const mimetype of formats) {
        if (cancelRequested) return item.file;
        const candidate = await new Promise(resolve => canvas.toBlob(
          resolve, mimetype, Number(elements.quality.value) / 100
        ));
        // Un formato no soportado puede devolver PNG: nunca ponerle extensión WebP.
        if (!candidate || candidate.type !== mimetype) continue;
        encoded = true;
        if (candidate.size < best.size) best = candidate;
      }
      if (item.ext === 'png' && !cancelRequested) {
        const pixels = ctx.getImageData(0, 0, targetWidth, targetHeight).data;
        // 32–256 colores. El porcentaje controla la paleta, no un encoder JPEG.
        const colors = 2 ** Math.round(5 + (Number(elements.quality.value) - 10) / 85 * 3);
        try {
          const candidate = await encodePng(pixels, targetWidth, targetHeight, colors);
          encoded = true;
          if (candidate.size < best.size) best = candidate;
        } catch (error) {
          if (!cancelRequested) throw new Error(`No se pudo comprimir el PNG: ${error.message}`);
        }
      }
      if (!encoded) throw new Error('Este navegador no permite exportar los formatos seleccionados');
      item.outputWidth = best === item.file ? width : targetWidth;
      item.outputHeight = best === item.file ? height : targetHeight;
      return best;
    } finally {
      if (typeof image.close === 'function') image.close();
      if (canvas) { canvas.width = 0; canvas.height = 0; }
    }
  }

  async function optimizeAll(targetId = null) {
    if (processing || archiving) return;
    const pending = items.filter(item => !isReady(item) && (targetId === null || item.id === targetId));
    if (!pending.length) return;
    processing = true;
    cancelRequested = false;
    elements.cancel.disabled = false;
    render();
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

  const saveBlob = window.ImanageFiles.saveBlob;
  const createZip = files => window.ImanageFiles.createZip(files.map(item => ({
    name:outputName(item), blob:item.output, lastModified:item.file.lastModified
  })), progress);
  async function downloadResults() {
    if (processing || archiving) return;
    const files = items.filter(isReady);
    if (!files.length) return;
    if (items.length === 1) { saveBlob(files[0].output, outputName(files[0])); return; }
    archiving = true;
    render();
    progress(0, files.length, 'Preparando ZIP…');
    try {
      const zip = await createZip(files);
      const date = new Date();
      const stamp = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      saveBlob(zip, `Filer-${stamp}.zip`);
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
  elements.mode.addEventListener('change', settingsChanged);
  elements.optimize.addEventListener('click', () => items.length && items.every(isReady) ? downloadResults() : optimizeAll());
  elements.cancel.addEventListener('click', () => {
    cancelRequested = true; elements.cancel.disabled = true;
    if (cancelPngJob) cancelPngJob();
  });
  elements.clear.addEventListener('click', clearAll);
  const tabs = [...document.querySelectorAll('.im-tabs [role="tab"]')];
  const tabValues = {'tab-compression':'compresion','tab-converter':'convertidor','tab-audio':'audio','tab-video':'video'};
  function selectTab(tab, focus = false, writeUrl = true) {
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      $(item.getAttribute('aria-controls')).hidden = !active;
    }
    if (focus) tab.focus();
    document.body.dataset.filerTool = tabValues[tab.id];
    if (writeUrl) {
      const url = new URL(window.location.href);
      const value = tabValues[tab.id];
      if (url.searchParams.get('tab') !== value) {
        url.searchParams.set('tab', value);
        window.history.pushState(null, '', url);
      }
    }
  }
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectTab(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else return;
      event.preventDefault(); selectTab(tabs[next], true);
    });
  });
  const restoreTab = () => selectTab(
    tabs.find(tab=>tabValues[tab.id]===new URL(window.location.href).searchParams.get('tab'))||$('tab-compression'),
    false, false
  );
  window.addEventListener('popstate', restoreTab);
  restoreTab();
  updateQuality();
  render();
})();
