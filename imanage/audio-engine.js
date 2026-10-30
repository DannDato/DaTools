/* FFmpeg single-thread: ejecución local, carga diferida y cancelación del worker. */
(() => {
  'use strict';
  const base=new URL('vendor/ffmpeg/',document.currentScript.src);
  let scriptPromise;
  function loadScript(){
    if(window.FFmpegWASM)return Promise.resolve();
    if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src=new URL('ffmpeg.js',base).href;
      const fail=()=>{clearTimeout(timeout);script.remove();scriptPromise=null;reject(Error('No se pudo cargar el motor multimedia.'));};
      const timeout=setTimeout(fail,30000);
      script.onload=()=>{clearTimeout(timeout);resolve();};script.onerror=fail;document.head.append(script);
    });
    return scriptPromise;
  }
  class AudioEngine {
    constructor(){this.ffmpeg=null;this.loading=null;this.abortLoad=null;this.generation=0;this.logs=[];this.onProgress=()=>{};}
    async load(){
      if(location.protocol==='file:')throw Error('Abre DaTools mediante localhost o HTTPS para usar el motor multimedia.');
      if(this.ffmpeg?.loaded)return this.ffmpeg;
      if(this.loading)return this.loading;
      const generation=this.generation;
      let abortLoad;
      const aborted=new Promise((_,reject)=>{abortLoad=()=>reject(Error('Conversión cancelada.'));});
      this.abortLoad=abortLoad;
      const loading=Promise.race([(async()=>{
        await loadScript();if(generation!==this.generation)throw Error('Conversión cancelada.');
        const ffmpeg=new FFmpegWASM.FFmpeg();this.ffmpeg=ffmpeg;
        ffmpeg.on('log',({message})=>{this.logs.push(message);if(this.logs.length>80)this.logs.shift();});
        ffmpeg.on('progress',({progress})=>this.onProgress(Math.min(.99,Math.max(0,progress))));
        const timeout=setTimeout(()=>{if(this.ffmpeg===ffmpeg)ffmpeg.terminate();},60000);
        try{await ffmpeg.load({coreURL:new URL('ffmpeg-core.js',base).href,wasmURL:new URL('ffmpeg-core.wasm',base).href});}
        catch(error){ffmpeg.terminate();if(this.ffmpeg===ffmpeg)this.ffmpeg=null;throw Error('No se pudo iniciar el motor multimedia. Reintenta la conversión.');}
        finally{clearTimeout(timeout);}
        if(generation!==this.generation)throw Error('Conversión cancelada.');return ffmpeg;
      })(),aborted]);
      this.loading=loading;
      try{return await loading;}finally{if(this.loading===loading)this.loading=null;if(this.abortLoad===abortLoad)this.abortLoad=null;}
    }
    cancel(){this.generation++;this.abortLoad?.();this.abortLoad=null;this.ffmpeg?.terminate();this.ffmpeg=null;this.loading=null;}
    async inspect(ffmpeg,input){
      const probe='audio-probe.json';
      try{
        // Este core puede devolver -1 aunque ffprobe haya escrito un JSON válido.
        await ffmpeg.ffprobe(['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate,channels','-of','json','-o',probe,input]);
        const metadata=JSON.parse(await ffmpeg.readFile(probe,'utf8'));
        return Array.isArray(metadata.streams)?metadata:null;
      }catch(_){return null;}finally{try{await ffmpeg.deleteFile(probe);}catch(_){/* No se creó. */}}
    }
    async convert(file,settings,onProgress){
      const generation=this.generation;this.onProgress=onProgress||(()=>{});
      const ffmpeg=await this.load();this.logs=[];
      if(generation!==this.generation)throw Error('Conversión cancelada.');
      const ext=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)||'bin';
      const input=`audio-input.${ext}`,output=`audio-output.${settings.format}`;
      try{
        const bytes=new Uint8Array(await file.arrayBuffer());
        if(generation!==this.generation)throw Error('Conversión cancelada.');
        await ffmpeg.writeFile(input,bytes);
        const info=await this.inspect(ffmpeg,input);
        if(info&& !info.streams?.some(stream=>stream.codec_type==='audio'))throw Error('Este archivo no contiene una pista de audio.');
        const duration=Number(info?.format?.duration);
        if(Number.isFinite(duration)&&settings.start>=duration)throw Error('El inicio del recorte está fuera de la duración del audio.');
        const args=['-i',input,'-map','0:a:0','-vn','-sn','-dn','-map_metadata','-1'];
        if(settings.start>0)args.push('-ss',String(settings.start));
        if(settings.end!==null)args.push('-t',String(settings.end-settings.start));
        const codecs={mp3:['-c:a','libmp3lame'],wav:['-c:a','pcm_s16le'],flac:['-c:a','flac'],ogg:['-c:a','libvorbis'],opus:['-c:a','opus','-strict','-2'],m4a:['-c:a','aac','-movflags','+faststart']};
        args.push(...codecs[settings.format]);
        // Vorbis rechaza ciertos bitrates fijos con mono o frecuencias bajas.
        // VBR mantiene una calidad coherente sin ofrecer combinaciones imposibles.
        if(settings.format==='ogg'){
          const qualities={64:0,96:2,128:4,192:6,256:8,320:10};
          args.push('-q:a',String(qualities[settings.bitrate]??6));
        }else if(['mp3','opus','m4a'].includes(settings.format))args.push('-b:a',`${settings.bitrate}k`);
        if(settings.format==='opus')args.push('-ar','48000');else if(settings.sampleRate)args.push('-ar',String(settings.sampleRate));
        if(settings.channels)args.push('-ac',String(settings.channels));
        args.push(output);
        const code=await ffmpeg.exec(args);
        if(generation!==this.generation)throw Error('Conversión cancelada.');
        if(code!==0){
          if(this.logs.some(log=>/Aborted\(/.test(log)))this.cancel();
          if(this.logs.some(log=>/matches no streams|does not contain any stream/i.test(log)))throw Error('No se encontró una pista de audio compatible.');
          throw Error('No se pudo convertir este archivo. Puede estar dañado o usar un formato no compatible.');
        }
        const result=await ffmpeg.readFile(output);if(!result.length)throw Error('El recorte no produjo audio.');
        const metadata=await this.inspect(ffmpeg,output);
        if(metadata&&!metadata.streams.some(stream=>stream.codec_type==='audio'))throw Error('El recorte no produjo audio.');
        if(metadata?.format?.duration!==undefined&&Number(metadata.format.duration)<=0)throw Error('El recorte no produjo audio.');
        return {bytes:result,metadata};
      }finally{
        for(const path of [input,output]){try{await ffmpeg.deleteFile(path);}catch(_){/* Cancelación o archivo inexistente. */}}
        this.onProgress=()=>{};
      }
    }
  }
  window.ImanageAudioEngine=AudioEngine;
})();
