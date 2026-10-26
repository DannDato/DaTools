/* Descargas y ZIP compartidos entre Compresión y Convertidor. */
(() => {
'use strict';
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
  // Guarda los bytes exactos y la extensión correspondiente al formato de salida.
  async function createZip(files, onProgress = () => {}) {
    if (files.length > 65535) throw new Error('Demasiados archivos para un solo ZIP');
    const encoder = new TextEncoder();
    const parts = [], central = [], names = new Set();
    let offset = 0, directorySize = 0;
    for (let i = 0; i < files.length; i++) {
      const {name: filenameInput, blob: output, lastModified} = files[i];
      const filename = zipName(filenameInput, names);
      const name = encoder.encode(filename);
      if (name.length > 65535 || output.size > 0xffffffff) throw new Error('Archivo demasiado grande para ZIP');
      const checksum = await crcOf(output);
      const date = new Date(lastModified || Date.now());
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
      onProgress(i + 1, files.length, `Empaquetando ${i + 1} de ${files.length}`);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const footer = new Uint8Array(22), fv = new DataView(footer.buffer);
    fv.setUint32(0, 0x06054b50, true); fv.setUint16(8, files.length, true);
    fv.setUint16(10, files.length, true); fv.setUint32(12, directorySize, true);
    fv.setUint32(16, offset, true);
    return new Blob([...parts, ...central, footer], {type:'application/zip'});
  }

  function decorateDownload(button, iconOnly = false) {
    const label = button.textContent;
    button.innerHTML = '<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/></svg>';
    if (!iconOnly) button.append(document.createTextNode(label));
  }
window.ImanageFiles = {saveBlob, createZip, decorateDownload};
})();
