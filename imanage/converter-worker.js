'use strict';
self.window=self;
importScripts('vendor/pako.min.js','vendor/UPNG.js','vendor/UTIF.js','vendor/omggif.js','image-codecs.js');
self.onmessage=event=>{
  try {
    const buffer=ImanageCodecs.encode(event.data);
    self.postMessage({buffer},[buffer]);
  } catch(error){self.postMessage({error:error.message||'No se pudo codificar la imagen'});}
};
