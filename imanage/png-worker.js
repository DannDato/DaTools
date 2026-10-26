'use strict';
// UPNG usa window para detectar un deflater opcional; aquí el global es self.
self.window = self;
importScripts('vendor/pako.min.js', 'vendor/UPNG.js');
self.onmessage = event => {
  try {
    const {pixels, width, height, colors} = event.data;
    const buffer = UPNG.encode([pixels], width, height, colors);
    self.postMessage({buffer}, [buffer]);
  } catch (error) {
    self.postMessage({error:error.message || 'No se pudo codificar PNG'});
  }
};
