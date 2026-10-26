/* Codificación de formatos que Canvas no exporta de forma nativa. */
(() => {
  'use strict';
  function bmp(pixels, width, height, background) {
    const stride = (width * 3 + 3) & ~3;
    const bytes = new Uint8Array(54 + stride * height), view = new DataView(bytes.buffer);
    view.setUint16(0, 0x4d42, true); view.setUint32(2, bytes.length, true);
    view.setUint32(10, 54, true); view.setUint32(14, 40, true);
    view.setInt32(18, width, true); view.setInt32(22, height, true);
    view.setUint16(26, 1, true); view.setUint16(28, 24, true);
    view.setUint32(34, stride * height, true);
    const bg = [1,3,5].map(i => parseInt(background.slice(i, i+2),16));
    for (let y=0; y<height; y++) for (let x=0; x<width; x++) {
      const src=(y*width+x)*4, dst=54+(height-1-y)*stride+x*3, alpha=pixels[src+3]/255;
      for (let c=0;c<3;c++) bytes[dst+2-c]=Math.round(pixels[src+c]*alpha+bg[c]*(1-alpha));
    }
    return bytes.buffer;
  }
  function gif(pixels, width, height, quality, background) {
    // GIF solo admite transparencia binaria: los semitransparentes se componen sobre el fondo.
    const data = new Uint8Array(pixels), transparent = new Uint8Array(width*height);
    const bg=[1,3,5].map(i=>parseInt(background.slice(i,i+2),16));
    for(let i=0;i<data.length;i+=4){
      transparent[i/4]=data[i+3]<128 ? 1 : 0;
      const alpha=data[i+3]/255;
      for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*alpha+bg[c]*(1-alpha));
      data[i+3]=255;
    }
    const colorCount=Math.min(255,Math.round(32+(quality/100)*223));
    const quantized=UPNG.quantize(data.buffer,colorCount);
    const palette=[0,...quantized.plte.map(entry=>{
      const rgba=entry.est.rgba; return ((rgba&255)<<16)|(((rgba>>>8)&255)<<8)|((rgba>>>16)&255);
    })];
    let paletteSize=2;while(paletteSize<palette.length)paletteSize*=2;
    while(palette.length<paletteSize)palette.push(0);
    const indices=new Uint8Array(width*height);
    for(let i=0;i<indices.length;i++)indices[i]=transparent[i] ? 0 : quantized.inds[i]+1;
    const bytes=new Uint8Array(width*height*2+4096);
    const writer=new GifWriter(bytes,width,height,{palette});
    writer.addFrame(0,0,width,height,indices,{transparent:0});
    return bytes.slice(0,writer.end()).buffer;
  }
  function encode({pixels,width,height,format,quality,background}) {
    const data=new Uint8Array(pixels);
    if(format==='bmp')return bmp(data,width,height,background);
    if(format==='gif')return gif(data,width,height,quality,background);
    // Canvas entrega RGB sin premultiplicar; ExtraSamples=2 identifica ese alpha.
    if(format==='tiff')return UTIF.encodeImage(pixels,width,height,{t338:[2]});
    throw new Error('Formato no reconocido');
  }
  globalThis.ImanageCodecs={encode};
})();
