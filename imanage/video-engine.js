'use strict';

// Reutiliza el mismo runtime FFmpeg local; cada instancia mantiene sus archivos aislados.
class ImanageVideoGifEngine extends ImanageAudioEngine {
  async convert(file,settings,onProgress){
    const generation=this.generation;this.onProgress=onProgress||(()=>{});
    const ffmpeg=await this.load();this.logs=[];
    const ext=file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,10)||'bin';
    const input=`video-input.${ext}`,output='video-output.gif',probe='video-probe.json';
    try{
      const bytes=new Uint8Array(await file.arrayBuffer());
      if(generation!==this.generation)throw Error('Conversión cancelada.');
      await ffmpeg.writeFile(input,bytes);
      let metadata;
      try{
        await ffmpeg.ffprobe(['-v','error','-show_entries','format=duration:stream=codec_type,width,height,duration','-of','json','-o',probe,input]);
        metadata=JSON.parse(await ffmpeg.readFile(probe,'utf8'));
      }catch(error){if(generation!==this.generation)throw error;throw Error('No se pudo leer el video. Puede estar dañado o usar un formato no compatible.');}
      const video=metadata.streams?.find(stream=>stream.codec_type==='video'&&stream.width>0&&stream.height>0);
      if(!video)throw Error('Este archivo no contiene una pista de video compatible.');
      const duration=Number(metadata.format?.duration??video.duration),start=settings.start;
      let end=settings.end??start+10;
      if(Number.isFinite(duration)&&duration>0){if(start>=duration)throw Error('El inicio del recorte está fuera del video.');end=Math.min(end,duration);}
      const length=end-start;
      if(!Number.isFinite(length)||length<=0)throw Error('El final debe ser posterior al inicio.');
      if(length>60)throw Error('Convierte un fragmento de hasta 60 segundos.');
      const ratio=Math.min(1,settings.max/Math.max(video.width,video.height));
      if(video.width*video.height*ratio*ratio*Math.ceil(length*settings.fps)>90000000)throw Error('Ese GIF requiere demasiada memoria. Reduce duración, tamaño o FPS.');
      const filter=`fps=${settings.fps},scale=w='min(iw,${settings.max})':h='min(ih,${settings.max})':force_original_aspect_ratio=decrease:flags=lanczos,split[a][b];[a]palettegen=max_colors=${settings.colors}:stats_mode=diff[p];[b][p]paletteuse=dither=${settings.dither}${settings.dither==='bayer'?':bayer_scale=3':''}`;
      const frames=Math.max(1,Math.ceil(length*settings.fps-1e-6));
      const code=await ffmpeg.exec(['-ss',String(start),'-t',String(length),'-i',input,'-filter_complex',filter,'-an','-sn','-dn','-frames:v',String(frames),'-loop',String(settings.loop),output]);
      if(generation!==this.generation)throw Error('Conversión cancelada.');
      if(code!==0){if(this.logs.some(line=>/Aborted\(/.test(line)))this.cancel();throw Error('No se pudo convertir el video. Puede estar dañado o usar un códec no compatible.');}
      const result=await ffmpeg.readFile(output);
      if(result.length<14||String.fromCharCode(...result.slice(0,3))!=='GIF')throw Error('El recorte no produjo un GIF válido.');
      const gif=new GifReader(result);let gifDuration=0;
      for(let i=0;i<gif.numFrames();i++)gifDuration+=gif.frameInfo(i).delay/100;
      return {bytes:result,width:gif.width,height:gif.height,duration:gifDuration};
    }catch(error){
      if(generation===this.generation&&/out of memory|memory access|Aborted\(/i.test([error.message,...this.logs].join(' '))){this.cancel();throw Error('Memoria insuficiente. Reduce el tamaño, FPS o duración y vuelve a intentar.');}
      throw error;
    }finally{
      for(const path of [input,output,probe])try{await ffmpeg.deleteFile(path);}catch{}
      this.onProgress=()=>{};
    }
  }
}
window.ImanageVideoGifEngine=ImanageVideoGifEngine;
