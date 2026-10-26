'use strict';

function updateProjectTray() {
  const text = $('jsonText').value.trim();
  let candidate = null;
  let error = '';
  if (text) {
    try { candidate = !jsonDraftDirty && sizeBaseProject ? project : validate(JSON.parse(extractJsonText(text))); }
    catch (problem) { error = problem.message; }
  }
  const active = !text && project.scenes.length > 0;
  const applied = active || (candidate && !jsonDraftDirty);
  const display = candidate || (active ? project : null);
  $('jsonProject').dataset.state = error ? 'error' : applied ? 'applied' : candidate ? 'ready' : 'empty';
  $('jsonStatus').textContent = error ? 'Revisar JSON' : applied ? 'Proyecto aplicado' : candidate ? 'Listo para aplicar' : 'Sin proyecto';
  $('jsonProjectTitle').textContent = display ? `${display.scenes.length} ${display.scenes.length === 1 ? 'escena' : 'escenas'}` : error ? 'Hay un detalle por corregir' : 'Tu próxima animación';
  const end = display?.scenes.reduce((maximum, scene) => Math.max(maximum, scene.end), 0) || 0;
  $('jsonProjectMeta').textContent = display ? `${end.toFixed(1)} s · ${display.resolution.join(' × ')} · ${display.fps} FPS` : error ? error : 'Pega o importa el JSON de ChatGPT.';
  $('applyJson').disabled = exporting || !candidate;
  $('applyJson').textContent = applied && candidate ? 'Volver a aplicar' : 'Aplicar escenas';
  $('downloadJson').disabled = exporting || !display;
  $('clearJson').disabled = exporting || !text;
  $('pasteJson').textContent = text || active ? 'Pegar otro JSON' : 'Pegar JSON';
  if (error) $('jsonInfo').textContent = `⚠ ${error}`;
  else if (jsonDraftDirty && $('jsonInfo').textContent.startsWith('⚠')) $('jsonInfo').textContent = '';
}

(() => {
  const panel = document.querySelector('.dock-json');
  const drop = $('jsonDrop');
  const openEditor = message => {
    $('jsonCode').open = true;
    $('jsonText').focus();
    $('jsonInfo').textContent = message;
  };
  const receiveText = text => {
    if (!text.trim()) { openEditor('El portapapeles está vacío. Pega el JSON en el editor.'); return; }
    if (new Blob([text]).size > 5 * 1024 * 1024) {
      $('jsonInfo').textContent = 'El JSON supera 5 MB.';return;
    }
    $('jsonText').value = text;
    jsonDraftDirty = true;
    $('jsonInfo').textContent = '';
    persistUiState();
  };
  $('pasteJson').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard?.readText) throw Error('Clipboard unavailable');
      receiveText(await navigator.clipboard.readText());
    } catch (_) { openEditor('Pega aquí con Ctrl+V (o ⌘V) para importar el JSON.'); }
  });
  panel.addEventListener('paste', event => {
    if (event.target === $('jsonText') || exporting) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text) { event.preventDefault();receiveText(text); }
  });
  drop.addEventListener('click', () => $('jsonFile').click());
  for (const name of ['dragenter','dragover']) drop.addEventListener(name, event => {
    event.preventDefault();drop.classList.add('is-over');
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  drop.addEventListener('dragleave', event => {
    if (!drop.contains(event.relatedTarget)) drop.classList.remove('is-over');
  });
  drop.addEventListener('drop', async event => {
    event.preventDefault();drop.classList.remove('is-over');
    if (exporting) return;
    const files = event.dataTransfer?.files;
    if (files?.length !== 1) { $('jsonInfo').textContent = 'Importa un solo proyecto JSON a la vez.';return; }
    $('jsonInfo').textContent = '';
    await importJsonFile(files[0]);
  });
  $('jsonText').addEventListener('input', () => {
    if (!jsonDraftDirty || !$('jsonText').value.trim()) $('jsonInfo').textContent = '';
  });
  updateProjectTray();
})();
