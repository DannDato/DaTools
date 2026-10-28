'use strict';

// Geometría acotada y tiempo absoluto: scrub, reproducción y exportación dibujan lo mismo.
var backgroundRenderer = (() => {
  const tau=Math.PI*2,mod=(value,limit)=>((value%limit)+limit)%limit;
  const noise=seed=>mod(Math.sin(seed*127.1+311.7)*43758.5453,1);
  const rgba=(hex,alpha)=>{const value=parseInt(hex.slice(1),16);return `rgba(${value>>16&255},${value>>8&255},${value&255},${alpha})`;};
  const motions={
    gradient:['Deriva suave','Respirar'],grid:['Desplazar retícula','Pulsar líneas'],diagonal:['Deslizar diagonales','Balancear'],
    dots:['Flotar','Ondulación de puntos'],waves:['Ondas viajeras','Oleaje suave'],rings:['Expandir anillos','Respirar anillos'],
    particles:['Ascender','Órbitas'],aurora:['Fluir','Oscilar cortinas'],beams:['Barrer luz','Girar haces']
  };
  function draw(ctx,preset,w,h,{time=0,mode='flow',speed=1,color1,color2,opacity}){
    const t=mode==='still'?0:time*speed,pulse=mode==='pulse',unit=Math.min(w,h);
    ctx.save();
    try{
      ctx.setLineDash([]);ctx.lineWidth=Math.max(1,unit/1100);ctx.lineCap='round';ctx.lineJoin='round';
      if(preset==='gradient'){
        [[.18,.22,color1],[.82,.3,color2],[.52,.84,color1]].forEach(([x,y,color],i)=>{
          const radius=Math.max(w,h)*.55*(pulse?1+.12*Math.sin(t*.6+i):1);
          if(!pulse){x+=.08*Math.sin(t*.22+i);y+=.07*Math.cos(t*.18+i);}
          const gradient=ctx.createRadialGradient(w*x,h*y,0,w*x,h*y,radius);
          gradient.addColorStop(0,rgba(color,opacity*.8));gradient.addColorStop(.55,rgba(color,opacity*.28));gradient.addColorStop(1,rgba(color,0));
          ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);
        });
      }else if(preset==='grid'||preset==='diagonal'){
        const step=unit/(preset==='grid'?18:7),offset=mod(t*unit*.016,step);
        const span=Math.hypot(w,h),alpha=pulse?opacity*(.65+.35*Math.cos(t*.9)):opacity;
        ctx.translate(w/2,h/2);
        if(preset==='diagonal')ctx.rotate(Math.PI/4+(pulse?.08*Math.sin(t*.5):0));
        for(let axis=0;axis<2;axis++){
          ctx.strokeStyle=rgba(axis?color2:color1,alpha);ctx.beginPath();
          for(let p=-Math.ceil(span/step)*step;p<=span;p+=step){const v=p+(pulse?0:offset);if(axis){ctx.moveTo(-span,v);ctx.lineTo(span,v);}else{ctx.moveTo(v,-span);ctx.lineTo(v,span);}}
          ctx.stroke();
        }
      }else if(preset==='dots'){
        const step=unit/17,offset=mod(t*unit*.012,step*2),offsetY=mod(t*unit*.008,step*2);
        for(let row=-2;row<=Math.ceil(h/step);row++)for(let col=-2;col<=Math.ceil(w/step);col++){
          const radius=unit*.002*(pulse?1+.55*Math.sin(col*.5+row*.4-t):1);
          ctx.fillStyle=rgba((row+col)%2?color1:color2,opacity);ctx.beginPath();
          ctx.arc(col*step+(pulse?0:offset),row*step+(pulse?0:offsetY),radius,0,tau);ctx.fill();
        }
      }else if(preset==='waves'){
        ctx.lineWidth=Math.max(1,unit*.0015);
        for(let i=0;i<15;i++){
          ctx.strokeStyle=rgba(i%2?color1:color2,opacity*.8);ctx.beginPath();
          for(let j=0;j<=90;j++){
            const x=w*j/90,amplitude=h*.035*(pulse?1+.5*Math.sin(t*.7+i*.2):1);
            const y=h*(i-1)/12+Math.sin(j/90*Math.PI*4+i*.4-(pulse?0:t*.8))*amplitude;
            if(j)ctx.lineTo(x,y);else ctx.moveTo(x,y);
          }ctx.stroke();
        }
      }else if(preset==='rings'){
        const max=Math.hypot(w,h)*.6,step=max/9;
        for(let i=-1;i<11;i++){
          const radius=pulse?Math.max(0,i+.5)*step*(1+.045*Math.sin(t*.8)):(i+mod(t*.13,2))*step;
          ctx.strokeStyle=rgba(i%2?color1:color2,opacity*Math.max(0,Math.min(1,radius/step))*Math.max(0,1-radius/max));
          ctx.beginPath();ctx.arc(w/2,h/2,Math.max(.01,radius),0,tau);ctx.stroke();
        }
      }else if(preset==='particles'){
        for(let i=0;i<72;i++){
          const a=noise(i+1),b=noise(i+101),r=noise(i+201);
          const x=pulse?w*(.5+Math.cos(a*tau+t*(.1+r*.08))*(.12+b*.5)):w*mod(a+.025*Math.sin(t*.2+i),1);
          const y=pulse?h*(.5+Math.sin(a*tau+t*(.1+r*.08))*(.12+b*.5)):h*(1-mod(b+t*(.012+r*.025),1));
          ctx.fillStyle=rgba(i%2?color1:color2,opacity*(.35+.65*r));ctx.beginPath();ctx.arc(x,y,unit*(.001+r*.0025),0,tau);ctx.fill();
        }
      }else if(preset==='aurora'){
        for(let i=0;i<6;i++){
          const center=h*(.15+i*.14),drift=Math.sin(t*(pulse?.65:.25)+i)*h*(pulse?.07:.04);
          const gradient=ctx.createLinearGradient(0,center-h*.15,0,center+h*.22);
          gradient.addColorStop(0,rgba(color1,0));gradient.addColorStop(.45,rgba(i%2?color1:color2,opacity*.45));gradient.addColorStop(1,rgba(color2,0));
          ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(-w*.1,center+drift);
          ctx.bezierCurveTo(w*.25,center-h*.24+Math.sin(t*.3+i)*h*.12,w*.65,center+h*.2,w*1.1,center-h*.04+drift);
          ctx.lineTo(w*1.1,center+h*.22+drift);ctx.bezierCurveTo(w*.65,center+h*.4,w*.25,center-h*.04,-w*.1,center+h*.22+drift);ctx.closePath();ctx.fill();
        }
      }else if(preset==='beams'){
        ctx.translate(w/2,h/2);ctx.rotate(pulse?t*.08:Math.sin(t*.2)*.2);
        const span=Math.hypot(w,h);
        for(let i=0;i<7;i++){
          const x=(i-3)*span*.25+(pulse?0:Math.sin(t*.35+i)*span*.1),width=span*.13;
          const gradient=ctx.createLinearGradient(x-width,0,x+width,0);
          gradient.addColorStop(0,rgba(color1,0));gradient.addColorStop(.5,rgba(i%2?color1:color2,opacity*.32));gradient.addColorStop(1,rgba(color2,0));
          ctx.fillStyle=gradient;ctx.fillRect(x-width,-span,width*2,span*2);
        }
      }
    }finally{ctx.restore();}
  }
  return {draw,motions};
})();
