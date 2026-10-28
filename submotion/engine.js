    (() => {
      'use strict';
      const $ = id => document.getElementById(id),
        canvas = $('canvas'),
        ctx = canvas.getContext('2d');
      const brandLogo = document.querySelector('.brand-logo');
      if (brandLogo) brandLogo.addEventListener('error', () => {
        if (brandLogo.dataset.fallback) return;
        brandLogo.dataset.fallback = '1';
        brandLogo.src = '../img/DaTools.png';
      });
      let W = canvas.width,
        H = canvas.height;

      function setOrientation() {
        const vertical = $('orientation').value === 'vertical';
        W = vertical ? 1440 : 2560;
        H = vertical ? 2560 : 1440;
        if (canvas.width !== W || canvas.height !== H) {
          canvas.width = W;
          canvas.height = H;
        }
        canvas.parentElement.classList.toggle('vertical', vertical);
        $('resolution').textContent = W + ' × ' + H;
      }
      let cues = [],
        duration = 0,
        current = 0,
        playing = false,
        playOrigin = 0,
        frameHandle = 0,
        recording = false;
      let gothamLoaded = false;
      async function ensureFont(){
        const used=new Set([$("weight").value+' 100px "'+$("font").value+'"']);
        for(const cue of cues)used.add(styleValue('weight',cue)+' 100px "'+styleValue('font',cue)+'"');
        await Promise.all([...used].map(font=>document.fonts.load(font).catch(()=>[])));
        return true;
      }
      let restored=null;
      const styleIds=['font','textCase','size','weight','textColor','posX','posY','animation','speed','idleEffect','idleStrength','idleRate','lineHeight'];
      const globalStyle={};
      function styleValue(id,cue){return cue?.style?.[id]??globalStyle[id]??$(id).value;}
      const settings = ['font', 'textCase', 'size', 'weight', 'textColor', 'backColor', 'posX', 'posY', 'animation',
        'speed', 'idleEffect', 'idleStrength', 'idleRate', 'lineHeight', 'fps', 'tail', 'orientation', 'cueSearch', 'shiftSeconds'
      ];
      try {
        const saved = JSON.parse(localStorage.getItem('subtitle-motion-settings') || '{}');restored=saved;
        for (const key of settings)
          if (saved[key] !== undefined) $(key).value = saved[key];
        if (saved.srtDraft) $('srt').value = saved.srtDraft;
      } catch {}

      for(const id of styleIds)globalStyle[id]=$(id).value;
      function save() {
        const data = {};
        for (const key of settings) data[key] = globalStyle[key]??$(key).value;
        data.srtDraft = $('srt').value;
        data.cues = cues;
        try{localStorage.setItem('subtitle-motion-settings', JSON.stringify({...data,position:current}));}catch{};
      }

      function labelValues() {
        for (const id of ['size', 'posX', 'posY', 'speed', 'lineHeight', 'idleStrength', 'idleRate']) {
          const v = $(id).value;
          $(id + 'Value').textContent = id === 'speed' ? v + ' ms' : id === 'posX' || id === 'posY' ? v + '%' : id ===
            'lineHeight' ? (v / 100).toFixed(2) : id === 'idleStrength' ? v + '%' : id === 'idleRate' ? (v / 100).toFixed(
              2) + '×' : v;
        }
      }

      function parseTime(s) {
        const m = s.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
        if (!m) return NaN;
        return (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) + (+m[4].padEnd(3, '0')) / 1000;
      }

      function parseSRT(src) {
        const normalized = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        const blocks = normalized.trim().split(/\n\s*\n/);
        const out = [];
        for (const block of blocks) {
          const lines = block.split('\n');
          const idx = lines.findIndex(l => l.includes('-->'));
          if (idx < 0) continue;
          const tm = lines[idx].match(
            /(\d{1,}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})\s*-->\s*(\d{1,}:\d{2}:\d{2}[,.]\d{1,3}|\d{1,2}:\d{2}[,.]\d{1,3})/
          );
          if (!tm) continue;
          const start = parseTime(tm[1]),
            end = parseTime(tm[2]);
          const text = lines.slice(idx + 1).join('\n').replace(/<[^>]*>/g, '').trim();
          if (Number.isFinite(start) && end > start && text) out.push({
            start,
            end,
            text
          });
        }
        if (out.length) return out.sort((a, b) => a.start - b.start);
        // Texto plano: párrafos separados por líneas en blanco; estima lectura a 160 ppm.
        const plain = (/\n\s*\n/.test(normalized) ? normalized.trim().split(/\n\s*\n/) : normalized.trim().split(/\n+/)).map(x => x.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
        let cursor = 0;
        for (const text of plain) {
          const words = text.split(/\s+/).filter(Boolean).length;
          const seconds = Math.max(1.5, words / (160 / 60) + 0.35);
          out.push({start: cursor, end: cursor + seconds, text});
          cursor += seconds + 0.12;
        }
        return out;
      }

      function formatText(text,mode=globalStyle.textCase||$('textCase').value) {
        if (mode === 'upper') return text.toLocaleUpperCase('es');
        if (mode === 'lower') return text.toLocaleLowerCase('es');
        if (mode === 'sentence') {
          const lower = text.toLocaleLowerCase('es');
          return lower.replace(/\p{L}/u, letter => letter.toLocaleUpperCase('es'));
        }
        if (mode === 'title') return text.toLocaleLowerCase('es').replace(/(^|[^\p{L}\p{N}])([\p{L}])/gu, (_,
          separator, letter) => separator + letter.toLocaleUpperCase('es'));
        return text;
      }

      function updateCueTexts() {
        for (const node of $('cues').children) {
          const cue = cues[Number(node.dataset.index)];
          if (cue) node.firstElementChild.textContent = formatText(cue.text,styleValue('textCase',cue));
        }
      }

      function fmt(t) {
        const m = Math.floor(t / 60),
          s = (t % 60).toFixed(2).padStart(5, '0');
        return String(m).padStart(2, '0') + ':' + s;
      }

      function getDuration() {
        return cues.length ? Math.max(...cues.map(c => c.end)) + Number($('tail').value) : 0;
      }


      function formatSrtTime(seconds) {
        const safe = Math.max(0, Number(seconds) || 0);
        const ms = Math.round(safe * 1000);
        const hh = Math.floor(ms / 3600000), mm = Math.floor(ms % 3600000 / 60000), ss = Math.floor(ms % 60000 / 1000), milli = ms % 1000;
        return String(hh).padStart(2,'0') + ':' + String(mm).padStart(2,'0') + ':' + String(ss).padStart(2,'0') + ',' + String(milli).padStart(3,'0');
      }
      function serializeSRT() {
        return cues.map((cue, i) => `${i + 1}\n${formatSrtTime(cue.start)} --> ${formatSrtTime(cue.end)}\n${cue.text}`).join('\n\n') + (cues.length ? '\n' : '');
      }
      function renderCueList() {
        const query = ($('cueSearch')?.value || '').trim().toLocaleLowerCase('es');
        for (const node of $('cues').children) {
          const cue = cues[Number(node.dataset.index)];
          node.hidden = Boolean(query) && !`${cue?.text || ''} ${fmt(cue?.start || 0)}`.toLocaleLowerCase('es').includes(query);
        }
      }
      function updateQualityStats() {
        const total = cues.length;
        let longLines = 0, fastRead = 0, overlaps = 0;
        for (let i = 0; i < total; i++) {
          const cue = cues[i];
          if (cue.text.split('\n').some(line => line.trim().length > 42)) longLines++;
          const chars = Array.from(cue.text.replace(/\s/g, '')).length;
          if (chars / Math.max(.1, cue.end - cue.start) > 17) fastRead++;
          if (i > 0 && cue.start < cues[i - 1].end - .02) overlaps++;
        }
        $('qualityStats').replaceChildren();
        const stats = [[`${total} fragmentos`, ''], [`${longLines} líneas largas`, longLines ? 'warn' : 'good'], [`${fastRead} lecturas rápidas`, fastRead ? 'warn' : 'good'], [`${overlaps} solapamientos`, overlaps ? 'warn' : 'good']];
        for (const [label, cls] of stats) { const el = document.createElement('span'); el.textContent = label; if (cls) el.className = cls; $('qualityStats').appendChild(el); }
        const warningCount = longLines + fastRead + overlaps;
        $('qualityBadge').textContent = total ? (warningCount ? `${warningCount} alertas` : 'Todo en orden') : 'Esperando SRT';
        $('qualityBadge').style.color = warningCount ? '#f2c47d' : '';
      }
      function downloadSRT() {
        if (!cues.length) { $('status').textContent = 'Carga primero un SRT para poder descargarlo.'; return; }
        const blob = new Blob([serializeSRT()], {type:'text/plain;charset=utf-8'});
        const url = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = url; a.download = 'submotion-subtitulos.srt'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        $('status').textContent = 'SRT descargado con los tiempos actuales.';
      }
      function shiftAllTimes() {
        if (recording || !cues.length) { $('status').textContent = 'Carga subtítulos antes de ajustar sus tiempos.'; return; }
        const offset = Number($('shiftSeconds').value);
        if (!Number.isFinite(offset) || offset === 0) { $('status').textContent = 'Escribe un desplazamiento distinto de cero.'; return; }
        pause();
        cues = cues.map(cue => { const start = Math.max(0, cue.start + offset); return { ...cue, start, end: Math.max(start + .05, cue.end + offset) }; });
        $('srt').value = serializeSRT();
        duration = getDuration(); current = Math.min(current, duration);
        $('count').textContent = '(' + cues.length + ')';
        $('cues').replaceChildren();
        cues.forEach((cue, i) => {
          const b = document.createElement('button'); b.className = 'cue';
          const text = document.createElement('div'); text.textContent = formatText(cue.text,styleValue('textCase',cue));
          const time = document.createElement('span'); time.textContent = fmt(cue.start);
          b.append(text, time); b.dataset.index = i;
          b.onclick = event => {if(window.submotionStudio){window.submotionStudio.select(i,event.shiftKey);return;}pause();current=cue.start;draw(current);};
          $('cues').appendChild(b);
        });
        renderCueList(); updateQualityStats(); draw(current);save();window.submotionStudio?.changed();
        $('status').textContent = `Tiempos ajustados ${offset > 0 ? '+' : ''}${offset.toFixed(3)} s · revisa y descarga el SRT cuando quieras.`;
      }

      let editingCueIndex = -1;
      function openCueEditor(index) {
        const cue = cues[index]; if (!cue) return;
        editingCueIndex = index;
        $('editText').value = cue.text;
        $('editStart').value = cue.start.toFixed(2);
        $('editEnd').value = cue.end.toFixed(2);
        $('cueEditor').hidden = false;
      }
      function closeCueEditor() { $('cueEditor').hidden = true; editingCueIndex = -1; }
      function commitCueEdit() {
        if (editingCueIndex < 0 || !cues[editingCueIndex]) return;
        const start = Number($('editStart').value), end = Number($('editEnd').value), text = $('editText').value.trim();
        if (!text || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) { $('status').textContent = 'Revisa el texto y los tiempos: el fin debe ser posterior al inicio.'; return; }
        cues[editingCueIndex] = {...cues[editingCueIndex],start,end,text};
        cues.sort((a,b) => a.start-b.start);
        $('srt').value = serializeSRT(); duration = getDuration(); current = Math.min(current, duration);
        rebuildCueList(); save(); draw(current); closeCueEditor();
        $('status').textContent = 'Subtítulo actualizado.';window.submotionStudio?.changed();
      }
      function rebuildCueList() {
        $('count').textContent = '(' + cues.length + ')'; $('cues').replaceChildren();
        cues.forEach((cue, i) => {
          const b = document.createElement('button'); b.className = 'cue'; b.type = 'button'; b.dataset.index = i;
          const text = document.createElement('div'); text.textContent = formatText(cue.text,styleValue('textCase',cue));
          const time = document.createElement('span'); time.textContent = fmt(cue.start);
          b.append(text, time);
          b.onclick = event => {if(window.submotionStudio){window.submotionStudio.select(i,event.shiftKey);return;}openCueEditor(i);pause();current=cue.start;draw(current);};
          $('cues').appendChild(b);
        });
        renderCueList(); updateQualityStats();
      }
      function load() {
        if (recording) return;
        const sourceText = $('srt').value;
        const hasTimestamps = /-->/.test(sourceText);
        const parsed = parseSRT(sourceText);
        if (!parsed.length) {
          $('status').textContent = 'No encontré subtítulos SRT válidos. Revisa los timestamps.';
          return;
        }
        pause();
        cues = parsed;
        duration = getDuration();
        current = 0;
        $('srt').value = serializeSRT();
        rebuildCueList();
        $('status').textContent = cues.length + ' fragmentos cargados · duración ' + fmt(duration) + (hasTimestamps ? '' : ' · tiempos estimados desde texto plano');
        draw(0); save();window.submotionStudio?.changed({imported:true});
      }

      function splitLines(text, maxWidth) {
        const explicit = text.split('\n'),
          result = [];
        for (const original of explicit) {
          let line = '';
          for (const word of original.split(/\s+/)) {
            const test = line ? line + ' ' + word : word;
            if (line && ctx.measureText(test).width > maxWidth) {
              result.push(line);
              line = word;
            } else line = test;
          }
          result.push(line || ' ');
        }
        return result;
      }

      function clamp01(v) {
        return Math.max(0, Math.min(1, v));
      }

      function easeOut(t) {
        return 1 - Math.pow(1 - t, 3);
      }

      function easeBack(t) {
        const c = 1.70158;
        return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
      }

      function easeBounce(t) {
        const n = 7.5625,
          d = 2.75;
        if (t < 1 / d) return n * t * t;
        if (t < 2 / d) {
          t -= 1.5 / d;
          return n * t * t + .75;
        }
        if (t < 2.5 / d) {
          t -= 2.25 / d;
          return n * t * t + .9375;
        }
        t -= 2.625 / d;
        return n * t * t + .984375;
      }

      function easeElastic(t) {
        return t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((10 * t - .75) * (2 * Math.PI) / 3) + 1;
      }

      function activeCue(t) {
        return cues.find(c => t >= c.start && t < c.end);
      }
      // Deterministic, cue-relative effects: seeking and exported frames stay identical.
      function livingText(lines, lh, age, power, rate, mode) {
        const time = age * rate,
          center = (lines.length - 1) / 2;
        if (mode === 'jump' || mode === 'wave') {
          let index = 0;
          for (let i = 0; i < lines.length; i++) {
            const chars = Array.from(lines[i]);
            const widths = chars.map(ch => ctx.measureText(ch).width);
            let left = -widths.reduce((a, b) => a + b, 0) / 2;
            for (let j = 0; j < chars.length; j++) {
              const glyph = chars[j],
                half = widths[j] / 2;
              if (glyph.trim()) {
                const phase = mode === 'wave' ? time * 5 - index * .38 : time * 2.6 - index * .87;
                const jump = mode === 'wave' ? Math.sin(phase) * power * 13 : Math.pow(Math.max(0, Math.sin(phase)),
                  10) * power * 29;
                ctx.save();
                ctx.translate(left + half, (i - center) * lh - jump);
                const bump = mode === 'jump' ? 1 + Math.max(0, jump) * .002 : 1;
                ctx.scale(bump, bump);
                ctx.fillText(glyph, 0, 0);
                ctx.restore();
              }
              left += widths[j];
              index++;
            }
          }
          return;
        }
        lines.forEach((line, i) => ctx.fillText(line, 0, (i - center) * lh));
        if (mode === 'sparkle') {
          ctx.save();
          ctx.fillStyle = '#fff';
          const size = parseFloat(ctx.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || '100');
          for (let i = 0; i < 12; i++) {
            const period = 1.15 + (i % 4) * .23;
            const phase = (time + i * .37) % period / period;
            const visible = Math.pow(Math.max(0, 1 - Math.abs(phase - .4) * 3), 2) * power;
            if (visible < .015) continue;
            const lineIndex = i % lines.length,
              line = lines[lineIndex];
            const width = ctx.measureText(line).width;
            const px = (Math.sin(i * 93.71) * .48) * width;
            const py = (lineIndex - center) * lh + Math.cos(i * 27.3) * size * .66 - phase * size * .18;
            const r = (2 + size * .042) * visible;
            ctx.globalAlpha = Math.min(1, visible * .88);
            ctx.beginPath();
            ctx.moveTo(px - r * 2, py);
            ctx.lineTo(px, py - r * .28);
            ctx.lineTo(px + r * 2, py);
            ctx.lineTo(px, py + r * .28);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(px, py - r * 2);
            ctx.lineTo(px + r * .28, py);
            ctx.lineTo(px, py + r * 2);
            ctx.lineTo(px - r * .28, py);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        } else if (mode === 'shimmer') {
          // Moving highlight through the glyphs, without touching the black backdrop.
          ctx.save();
          ctx.fillStyle = '#fff';
          const sweep = (Math.sin(time * 2.5) + 1) / 2;
          ctx.globalAlpha = .13 * power + .23 * power * sweep;
          ctx.shadowColor = '#fff';
          ctx.shadowBlur = (6 + 16 * sweep) * power;
          lines.forEach((line, i) => ctx.fillText(line, 0, (i - center) * lh));
          ctx.restore();
        }
      }

      function render(t) {
        ctx.fillStyle = $('backColor').value;
        ctx.fillRect(0, 0, W, H);
        window.submotionBounds=null;
        const cue = activeCue(t);
        if (!cue) return;
        const x = W * Number(styleValue('posX',cue)) / 100,
          y = H * Number(styleValue('posY',cue)) / 100;
        const sz = Number(styleValue('size',cue)),
          speed = Number(styleValue('speed',cue)) / 1000;
        ctx.font = `${styleValue('weight',cue)} ${sz}px "${styleValue('font',cue)}", Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const lines = splitLines(formatText(cue.text,styleValue('textCase',cue)), W * .85),
          lh = sz * Number(styleValue('lineHeight',cue)) / 100;
        const anim = styleValue('animation',cue);
        // Clamp transitions to half the cue length: tiny SRT cues must remain readable.
        const staticEdit=window.submotionStudio?.editing&&!playing&&!recording;
        const transition = staticEdit?0:Math.min(speed, (cue.end - cue.start) / 2);
        const widths=lines.map(line=>ctx.measureText(line).width);
        window.submotionBounds={id:cue.id,x:x-Math.max(1,...widths)/2,y:y-lines.length*lh/2,width:Math.max(1,...widths),height:lines.length*lh};
        const entering = transition > 0 ? clamp01((t - cue.start) / transition) : 1;
        const exiting = transition > 0 ? clamp01((cue.end - t) / transition) : 1;
        const exit = easeOut(exiting);
        let alpha = 1,
          scale = 1,
          scaleX = 1,
          scaleY = 1,
          dy = 0,
          rotation = 0;
        if (transition > 0 && anim !== 'none') {
          const p = easeOut(entering),
            q = Math.min(p, exit);
          if (anim === 'fade') alpha = q;
          if (anim === 'pop') {
            scale = .7 + .3 * q;
            alpha = q;
          }
          if (anim === 'zoom') {
            scale = 1.16 - .16 * q;
            alpha = q;
          }
          if (anim === 'slide') {
            dy = (1 - q) * 65;
            alpha = q;
          }
          if (anim === 'bounce') {
            const b = easeBounce(entering);
            scale = .65 + .35 * b;
            dy = (1 - b) * 110;
            if (exiting < 1) {
              scale *= .88 + .12 * exit;
              dy += (1 - exit) * 38;
              alpha = exit;
            }
          }
          if (anim === 'elastic') {
            scale = .5 + .5 * easeElastic(entering);
            alpha = clamp01(entering * 5);
            if (exiting < 1) {
              scale *= .86 + .14 * exit;
              alpha *= exit;
            }
          }
          if (anim === 'punch') {
            const b = easeBack(entering);
            scale = .45 + .55 * b;
            alpha = clamp01(entering * 7);
            if (exiting < 1) {
              scale *= .78 + .22 * exit;
              alpha *= exit;
            }
          }
          if (anim === 'swing') {
            const b = easeBack(entering);
            rotation = (1 - b) * -.18;
            dy = (1 - p) * 42;
            alpha = clamp01(entering * 4);
            if (exiting < 1) {
              rotation += (1 - exit) * .1;
              alpha *= exit;
            }
          }
          if (anim === 'rise') {
            dy = (1 - p) * 95;
            alpha = clamp01(entering * 3) * exit;
            if (exiting < 1) dy -= (1 - exit) * 34;
          }
          if (anim === 'cascade') alpha = exit;
        }
        const idle = styleValue('idleEffect',cue);
        const power = Number(styleValue('idleStrength',cue)) / 100;
        const rate = Number(styleValue('idleRate',cue)) / 100;
        const age = Math.max(0, t - cue.start - transition);
        const live = !staticEdit && idle !== 'none' && power > 0 && t >= cue.start + transition;
        // Do not interrupt the entrance; ease movement away as the exit starts.
        const livePower = live ? power * (exiting < 1 ? easeOut(exiting) : 1) : 0;
        if (livePower && idle === 'breathe') scale *= 1 + Math.sin(age * rate * 2.5) * .034 * livePower;
        if (livePower && idle === 'pulse') scale *= 1 + Math.pow(Math.max(0, Math.sin(age * rate * 3.5)), 8) * .075 *
          livePower;
        if (livePower && idle === 'float') dy += Math.sin(age * rate * 2.4) * 22 * livePower;
        ctx.save();
        ctx.globalAlpha = clamp01(alpha);
        ctx.translate(x, y + dy);
        ctx.rotate(rotation);
        ctx.scale(scale * scaleX, scale * scaleY);
        ctx.fillStyle = styleValue('textColor',cue);
        if (anim === 'cascade' && transition > 0 && !(livePower && ['jump', 'wave', 'sparkle', 'shimmer'].includes(
            idle))) {
          // Each word has a small stagger; measure glyph widths to keep centered lines.
          const words = lines.map(line => line.trim().split(/\s+/).filter(Boolean));
          const count = words.reduce((sum, line) => sum + line.length, 0);
          const stagger = Math.min(.075, transition / Math.max(1, count));
          const wordTransition = Math.max(.03, transition - stagger * Math.max(0, count - 1));
          let index = 0;
          words.forEach((parts, i) => {
            const gap = ctx.measureText(' ').width;
            const widths = parts.map(word => ctx.measureText(word).width);
            const width = widths.reduce((a, b) => a + b, 0) + gap * Math.max(0, parts.length - 1);
            let left = -width / 2;
            parts.forEach((word, j) => {
              const wp = clamp01((t - cue.start - index * stagger) / wordTransition);
              const smooth = easeBack(wp);
              ctx.save();
              ctx.globalAlpha *= clamp01(wp * 4);
              ctx.translate(left + widths[j] / 2, (i - (lines.length - 1) / 2) * lh + (1 - easeOut(wp)) * 35);
              const grow = .7 + .3 * smooth;
              ctx.scale(grow, grow);
              ctx.fillText(word, 0, 0);
              ctx.restore();
              left += widths[j] + gap;
              index++;
            });
          });
        } else if (livePower && ['jump', 'wave', 'sparkle', 'shimmer'].includes(idle)) livingText(lines, lh, age,
          livePower, rate, idle);
        else lines.forEach((line, i) => ctx.fillText(line, 0, (i - (lines.length - 1) / 2) * lh));
        ctx.restore();
      }

      function draw(t) {
        render(t);
        $('seek').value = duration ? Math.round(t / duration * 1000) : 0;
        $('time').textContent = fmt(t) + ' / ' + fmt(duration);
        const cue = activeCue(t);
        for (const node of $('cues').children) node.classList.toggle('active', cue === cues[Number(node.dataset.index)]);
        window.submotionStudio?.onDraw(t);
      }

      function tick(now) {
        if (!playing) return;
        current = Math.min(duration, (now - playOrigin) / 1000);
        draw(current);
        if (current >= duration) {
          pause();
          return;
        }
        frameHandle = requestAnimationFrame(tick);
      }

      function pause() {
        playing = false;
        cancelAnimationFrame(frameHandle);
        $('play').textContent = '▶ Reproducir';
      }

      function togglePlay() {
        if (recording || !duration) return;
        if (playing) {
          pause();
          return;
        }
        if (current >= duration) current = 0;
        playOrigin = performance.now() - current * 1000;
        playing = true;
        $('play').textContent = 'Ⅱ Pausar';
        frameHandle = requestAnimationFrame(tick);
      }

      function formatMime() {
        if (typeof MediaRecorder === 'undefined') return null;
        for (const type of ['video/mp4;codecs="avc1.640032"', 'video/mp4;codecs=avc1', 'video/mp4',
            'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'
          ])
          if (MediaRecorder.isTypeSupported(type)) return type;
        return null;
      }

      function download(blob, ext) {
        const url = URL.createObjectURL(blob),
          a = document.createElement('a');
        a.href = url;
        a.download = 'submotion-' + ($('orientation').value === 'vertical' ? 'vertical' : 'horizontal') + '-2k.' +
          ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }
      let cancelRecording=null;
      async function exportVideo(){
        if(!cues.length||recording)return;
        const mime=formatMime();
        if(!canvas.captureStream||!mime){$('status').textContent='No hay grabación compatible en este navegador.';return;}
        window.submotionStudio?.flush();pause();recording=true;
        const controls=[...document.querySelectorAll('main input,main select,main textarea,main button,header button')].filter(node=>!['cancelExport','fullscreenPreview'].includes(node.id));
        const previous=controls.map(node=>node.disabled);controls.forEach(node=>node.disabled=true);
        $('cancelExport').hidden=false;$('cancelExport').disabled=false;$('bar').style.width='0%';$('status').textContent='Preparando video…';
        let stream,recorder,raf=0,cancelled=false,finalized=false,ended=false,chunks=[];
        const finish=()=>{if(finalized)return;finalized=true;cancelAnimationFrame(raf);stream?.getTracks().forEach(t=>t.stop());recording=false;controls.forEach((node,i)=>node.disabled=previous[i]);$('cancelExport').hidden=true;cancelRecording=null;document.removeEventListener('keydown',keys);document.removeEventListener('visibilitychange',visibility);window.submotionStudio?.sync();};
        const abort=()=>{if(ended||cancelled)return;cancelled=true;chunks=[];cancelAnimationFrame(raf);$('status').textContent='Exportación cancelada. No se guardó ningún video.';try{if(recorder?.state==='recording')recorder.stop();else finish();}catch{finish();}};
        const keys=event=>{if(event.key==='Escape'){event.preventDefault();abort();}};
        const visibility=()=>{if(document.hidden)abort();};
        cancelRecording=abort;$('cancelExport').onclick=abort;document.addEventListener('keydown',keys);document.addEventListener('visibilitychange',visibility);
        try{
          await ensureFont();await document.fonts.ready;if(cancelled){finish();return;}
          duration=getDuration();current=0;draw(0);stream=canvas.captureStream(Number($('fps').value));recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:18000000});
          recorder.ondataavailable=e=>{if(!cancelled&&e.data.size)chunks.push(e.data);};
          recorder.onerror=()=>{cancelled=true;chunks=[];$('status').textContent='Error al grabar el video.';finish();};
          recorder.onstop=()=>{if(finalized)return;if(!cancelled&&chunks.length){download(new Blob(chunks,{type:recorder.mimeType||mime}),(recorder.mimeType||mime).includes('mp4')?'mp4':'webm');$('bar').style.width='100%';$('status').textContent='Video generado correctamente.';}else if(!cancelled)$('status').textContent='No se recibieron datos de video.';finish();};
          recorder.start(1000);const started=performance.now();$('status').textContent='Grabando en tiempo real. Mantén esta pestaña visible.';
          const step=now=>{if(!recording||cancelled||finalized)return;current=Math.min(duration,(now-started)/1000);draw(current);const percent=duration?100*current/duration:100;$('bar').style.width=percent+'%';$('exportTiming').textContent=Math.floor(percent)+'% · '+fmt(current)+' / '+fmt(duration)+' · restante '+fmt(Math.max(0,duration-current));if(current>=duration){ended=true;recorder.stop();}else raf=requestAnimationFrame(step);};raf=requestAnimationFrame(step);
        }catch(error){cancelled=true;chunks=[];$('status').textContent='No se pudo exportar: '+error.message;try{if(recorder?.state==='recording')recorder.stop();}catch{}finish();}
      }
      $('gothamFile').addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          const face = new FontFace('Gotham', await file.arrayBuffer());
          await face.load();
          document.fonts.add(face);
          gothamLoaded = true;
          $('font').value = 'Gotham';
          save();
          draw(current);
          $('status').textContent = 'Gotham cargada para esta sesión.';
        } catch (err) {
          $('status').textContent = 'No se pudo cargar la fuente: ' + err.message;
        }
      });
      $('font').addEventListener('change', async () => {
        await ensureFont();
        save();
        if (!playing && !recording) draw(current);
      });
      $('file').addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        $('srt').value = await file.text();
        load();
      });
      $('load').onclick = load;
      $('closeCueEditor').onclick = closeCueEditor; $('cancelCueEdit').onclick = closeCueEditor; $('saveCueEdit').onclick = commitCueEdit;
      $('srt').addEventListener('input', save); $('cueSearch').addEventListener('input', () => { renderCueList(); save(); }); $('shiftSeconds').addEventListener('change', save);
      $('example').onclick = () => {
        $('srt').value =
          '1\n00:00:01,000 --> 00:00:03,300\nESTO ES UNA PRUEBA\n\n2\n00:00:03,500 --> 00:00:05,600\nDE SUBTÍTULOS ANIMADOS\n\n3\n00:00:06,000 --> 00:00:08,400\nLISTOS PARA DAVINCI';
        load();
      };
      $('play').onclick = togglePlay;
      $('seek').oninput = e => {
        if (recording) return;
        pause();
        current = duration * Number(e.target.value) / 1000;
        window.submotionStudio?.selectAt(current);draw(current);
      };
      $('export').onclick = exportVideo;
      $('downloadSrt').onclick = downloadSRT;
      $('shiftTimes').onclick = shiftAllTimes;
      $('cueSearch').addEventListener('input', renderCueList);
      for (const id of settings) $(id).addEventListener('input', () => {
        if (recording) return;
        if (id === 'orientation') setOrientation();
        save();
        labelValues();
        if (id === 'tail') duration = getDuration();
        if (id === 'textCase') updateCueTexts();
        if (!playing && !recording) draw(current);
      });

      // El tamaño de cada panel se ajusta por celdas pequeñas y se guarda sin tocar el motor Canvas.
      const dockGrid = $('dockGrid');
      const previewPanel = $('previewPanel');
      const fullscreenPreview = $('fullscreenPreview');
      const DOCK_KEY = 'submotion.workspace.v4';
      const defaultOrder = ['subtitles','appearance','preview','export','animation','fragments'];
      const defaultSizes = {
        subtitles:{cols:24,rows:68},appearance:{cols:16,rows:34},preview:{cols:40,rows:34},
        export:{cols:16,rows:48},animation:{cols:16,rows:34},fragments:{cols:40,rows:34}
      };
      const dockCards = new Map(Array.from(dockGrid.querySelectorAll('.dock-card')).map(card=>[card.dataset.dock,card]));
      let dragDock = null;
      let resizeDock = null;
      const prefersReducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
      const clampSize = (value,min,max)=>Math.max(min,Math.min(max,Math.round(value)));
      const readDock = key=>{try{return JSON.parse(localStorage.getItem(key)||'null')}catch(_){return null}};

      // El contenido conserva sus nodos/IDs y listeners; un contenedor interior permite scroll sin mover la esquina.
      for (const card of dockCards.values()) {
        const body = document.createElement('div');
        body.className = 'dock-body';
        while(card.firstChild) body.appendChild(card.firstChild);
        card.appendChild(body);
        const handle = document.createElement('button');
        handle.type='button';handle.className='dock-resizer';
        const name=card.querySelector('h2')?.textContent.trim()||'panel';
        handle.setAttribute('aria-label','Redimensionar '+name);
        handle.title='Arrastra para cambiar ancho y alto · Flechas del teclado para ajustar';
        card.appendChild(handle);
      }

      function dockUnits() {
        const style=getComputedStyle(dockGrid);
        const colGap=parseFloat(style.columnGap)||0;
        const rowGap=parseFloat(style.rowGap)||0;
        const width=dockGrid.clientWidth;
        return {x:(width-95*colGap)/96+colGap,y:8+rowGap};
      }
      function minCols(card) {
        const target=card.dataset.dock==='preview'?390:card.dataset.dock==='fragments'?300:card.dataset.dock==='export'?235:235;
        const x=dockUnits().x;
        return clampSize(Math.ceil((target+(parseFloat(getComputedStyle(dockGrid).columnGap)||0))/x),8,96);
      }
      function minRows(card) {return card.dataset.dock==='preview'?21:card.dataset.dock==='fragments'?18:card.dataset.dock==='export'?22:14;}
      function setDockSize(card,cols,rows) {
        const c=clampSize(cols,minCols(card),96);
        const r=clampSize(rows,minRows(card),140);
        card.dataset.cols=String(c);card.dataset.rows=String(r);
        card.style.gridColumn='span '+c;
        card.style.gridRow='span '+r;
      }
      function getDockState() {
        const order=Array.from(dockGrid.querySelectorAll('.dock-card')).map(card=>card.dataset.dock);
        const sizes={};for(const [id,card] of dockCards)sizes[id]={cols:Number(card.dataset.cols),rows:Number(card.dataset.rows)};
        return {order,sizes};
      }
      function saveDock() {
        try{localStorage.setItem(DOCK_KEY,JSON.stringify(getDockState()));}
        catch(_){$('dockNotice').textContent='El navegador no permitió guardar la distribución.';}
      }
      // Redistribución animada, sin alterar ni clonar los controles internos de cada panel.
      function animateReflow(mutate,exclude=null){
        if(prefersReducedMotion||window.innerWidth<=760){mutate();return;}
        const before=new Map();
        for(const card of dockCards.values()){
          if(card!==exclude&&card.isConnected&&card.style.display!=='none'){
            card.getAnimations().forEach(animation=>animation.cancel());
            before.set(card,card.getBoundingClientRect());
          }
        }
        mutate();
        for(const [card,first] of before){
          const last=card.getBoundingClientRect();
          const dx=first.left-last.left,dy=first.top-last.top;
          if(Math.abs(dx)<2&&Math.abs(dy)<2)continue;
          card.animate([{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],
            {duration:250,easing:'cubic-bezier(.18,.84,.22,1)'});
        }
      }

      // El scroll vertical debe recorrer la página desde cualquier tarjeta.
      // Alt+rueda o las barras visibles permiten navegar dentro de un panel largo.
      dockGrid.addEventListener('wheel',event=>{
        if(event.ctrlKey||event.metaKey||event.altKey||recording)return;
        const textarea=event.target.closest('textarea');
        if(textarea&&textarea===document.activeElement&&textarea.scrollHeight>textarea.clientHeight)return;
        const maxScroll=Math.max(0,document.documentElement.scrollHeight-window.innerHeight);
        if(maxScroll<=1)return;
        const factor=event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1;
        const dy=event.deltaY*factor;
        if((dy>0&&window.scrollY>=maxScroll-1)||(dy<0&&window.scrollY<=1))return;
        event.preventDefault();
        window.scrollBy({top:dy,left:event.deltaX*factor,behavior:'instant'});
      },{passive:false});

      function restoreDock() {
        // V4 incorpora Exportación como sexta tarjeta y estrena el acomodo elegido.
        // No reutilizamos las dimensiones incompatibles de layouts anteriores.
        const stored=readDock(DOCK_KEY);
        const ids=defaultOrder;
        const order=stored&&Array.isArray(stored.order)&&stored.order.length===ids.length&&
          new Set(stored.order).size===ids.length&&stored.order.every(id=>dockCards.has(id))?stored.order:ids;
        for(const id of order)dockGrid.appendChild(dockCards.get(id));
        for(const id of ids){
          const card=dockCards.get(id),defaults=defaultSizes[id];
          const saved=stored?.sizes?.[id];
          const cols=saved&&Number.isFinite(Number(saved.cols))?Number(saved.cols):defaults.cols;
          const rows=saved&&Number.isFinite(Number(saved.rows))?Number(saved.rows):defaults.rows;
          setDockSize(card,cols,rows);
        }
        if(!stored)saveDock();
      }
      function restoreDefaultDock() {
        if(recording||dragDock||resizeDock)return;
        for(const id of defaultOrder){
          const card=dockCards.get(id),size=defaultSizes[id];
          setDockSize(card,size.cols,size.rows);dockGrid.appendChild(card);
        }
        saveDock();$('dockNotice').textContent='Distribución original restaurada.';draw(current);
      }
      $('resetDock').addEventListener('click',restoreDefaultDock);

      function stopDockResize(event,commit) {
        if(!resizeDock||event.pointerId!==resizeDock.pointerId)return;
        const resize=resizeDock;resizeDock=null;
        window.removeEventListener('pointermove',moveDockResize);
        window.removeEventListener('pointerup',commitDockResize);
        window.removeEventListener('pointercancel',cancelDockResize);
        resize.outline?.remove();
        resize.card.classList.remove('is-resizing');document.body.classList.remove('dock-is-resizing');
        if(!commit)setDockSize(resize.card,resize.cols,resize.rows);
        else{saveDock();$('dockNotice').textContent='Tamaño guardado.';}
        draw(current);
      }
      function updateResizeOutline(event){
        if(!resizeDock?.outline)return;
        const resize=resizeDock;
        const width=Math.max(100,resize.rect.width+event.clientX-resize.x);
        const height=Math.max(100,resize.rect.height+event.clientY-resize.y);
        Object.assign(resize.outline.style,{
          left:resize.rect.left+'px',top:resize.rect.top+'px',
          width:width+'px',height:height+'px'
        });
      }
      function moveDockResize(event) {
        if(!resizeDock||event.pointerId!==resizeDock.pointerId)return;
        event.preventDefault();
        const {card,x,y,cols,rows,unitX,unitY}=resizeDock;
        const nextCols=cols+Math.round((event.clientX-x)/unitX);
        const nextRows=rows+Math.round((event.clientY-y)/unitY);
        if(nextCols!==Number(card.dataset.cols)||nextRows!==Number(card.dataset.rows)){
          animateReflow(()=>setDockSize(card,nextCols,nextRows),card);
          if(card===previewPanel&&!playing)draw(current);
        }
        updateResizeOutline(event);
      }
      function commitDockResize(event){stopDockResize(event,true);}
      function cancelDockResize(event){stopDockResize(event,false);}
      for(const card of dockCards.values()){
        const handle=card.querySelector('.dock-resizer');
        handle.addEventListener('pointerdown',event=>{
          if(recording||dragDock||resizeDock||event.button!==0||window.innerWidth<=760)return;
          event.preventDefault();
          const units=dockUnits();
          const rect=card.getBoundingClientRect();
          const outline=document.createElement('div');outline.className='dock-resize-outline';
          document.body.appendChild(outline);
          resizeDock={card,pointerId:event.pointerId,x:event.clientX,y:event.clientY,
            cols:Number(card.dataset.cols),rows:Number(card.dataset.rows),unitX:units.x,unitY:units.y,
            rect,outline};
          updateResizeOutline(event);
          card.classList.add('is-resizing');document.body.classList.add('dock-is-resizing');
          window.addEventListener('pointermove',moveDockResize);
          window.addEventListener('pointerup',commitDockResize);
          window.addEventListener('pointercancel',cancelDockResize);
        });
        handle.addEventListener('keydown',event=>{
          if(recording||dragDock||resizeDock||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
          event.preventDefault();const d=event.shiftKey?3:1;
          animateReflow(()=>setDockSize(card,Number(card.dataset.cols)+(event.key==='ArrowRight'?d:event.key==='ArrowLeft'?-d:0),
            Number(card.dataset.rows)+(event.key==='ArrowDown'?d:event.key==='ArrowUp'?-d:0)),card);
          saveDock();if(card===previewPanel)draw(current);
        });
        const grip=card.querySelector('.dock-grip');
        grip.addEventListener('pointerdown',event=>{
          if(recording||dragDock||resizeDock||event.button!==0)return;
          event.preventDefault();
          dragDock={card,grip,pointerId:event.pointerId,x:event.clientX,y:event.clientY,active:false,
            originalOrder:Array.from(dockGrid.querySelectorAll('.dock-card')).map(item=>item.dataset.dock)};
          window.addEventListener('pointermove',dockPointerMove);
          window.addEventListener('pointerup',dockPointerUp);
          window.addEventListener('pointercancel',dockPointerCancel);
        });
        grip.addEventListener('keydown',event=>{
          if(recording||resizeDock||!['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'].includes(event.key))return;
          event.preventDefault();
          const cards=Array.from(dockGrid.querySelectorAll('.dock-card'));
          const index=cards.indexOf(card);
          const next=index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1);
          if(next<0||next>=cards.length)return;
          animateReflow(()=>dockGrid.insertBefore(card,next>index?cards[next].nextSibling:cards[next]));
          saveDock();grip.focus();draw(current);
        });
      }
      function startDockDrag(event){
        const drag=dragDock;drag.active=true;
        drag.placeholder=document.createElement('div');
        drag.placeholder.className='dock-placeholder';drag.placeholder.textContent='Soltar aquí';
        drag.placeholder.style.gridColumn='span '+drag.card.dataset.cols;
        drag.placeholder.style.gridRow='span '+drag.card.dataset.rows;
        drag.card.after(drag.placeholder);drag.card.style.display='none';
        drag.ghost=document.createElement('div');drag.ghost.className='dock-ghost';
        drag.ghost.textContent=drag.card.querySelector('h2')?.textContent.trim()||'Panel';
        document.body.appendChild(drag.ghost);document.body.classList.add('dock-is-dragging');
        drag.lastX=event.clientX;drag.lastY=event.clientY;moveGhost(event);
        drag.scrollRaf=requestAnimationFrame(dockAutoScroll);
      }
      function moveGhost(event){
        if(!dragDock?.ghost)return;
        dragDock.ghost.style.left=event.clientX+'px';dragDock.ghost.style.top=event.clientY+'px';
      }
      function repositionDockPlaceholder(x,y){
        const drag=dragDock;if(!drag?.active)return;
        const hovered=document.elementFromPoint(x,y);
        const target=hovered?.closest('.dock-card');
        if(target&&target!==drag.card&&dockGrid.contains(target)){
          const rect=target.getBoundingClientRect();
          const relativeY=y-rect.top;
          const after=relativeY>rect.height*.75?true:relativeY<rect.height*.25?false:x>rect.left+rect.width/2;
          const reference=after?target.nextSibling:target;
          if(reference!==drag.placeholder&&reference!==drag.placeholder.nextSibling)animateReflow(()=>dockGrid.insertBefore(drag.placeholder,reference));
        }else if(hovered?.closest('#dockGrid')){
          const cards=Array.from(dockGrid.querySelectorAll('.dock-card')).filter(card=>card!==drag.card);
          const last=cards.at(-1);
          if(last&&y>last.getBoundingClientRect().bottom)animateReflow(()=>dockGrid.append(drag.placeholder));
        }
      }
      function dockAutoScroll(){
        const drag=dragDock;if(!drag?.active)return;
        const edge=75,y=drag.lastY;
        const delta=y<edge?-Math.min(18,(edge-y)*.34):y>innerHeight-edge?Math.min(18,(y-innerHeight+edge)*.34):0;
        if(delta){window.scrollBy(0,delta);repositionDockPlaceholder(drag.lastX,drag.lastY);}
        drag.scrollRaf=requestAnimationFrame(dockAutoScroll);
      }
      function dockPointerMove(event){
        const drag=dragDock;if(!drag||event.pointerId!==drag.pointerId)return;
        if(!drag.active){if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;startDockDrag(event);}
        event.preventDefault();moveGhost(event);
        drag.lastX=event.clientX;drag.lastY=event.clientY;
        repositionDockPlaceholder(event.clientX,event.clientY);
      }
      function clearDockListeners(){
        window.removeEventListener('pointermove',dockPointerMove);
        window.removeEventListener('pointerup',dockPointerUp);
        window.removeEventListener('pointercancel',dockPointerCancel);
      }
      function finishDockDrag(commit,event){
        const drag=dragDock;if(!drag||event.pointerId!==drag.pointerId)return;
        clearDockListeners();dragDock=null;
        if(drag.active){
          cancelAnimationFrame(drag.scrollRaf);
          const gridRect=dockGrid.getBoundingClientRect();
          if(commit&&event.clientX>=gridRect.left&&event.clientX<=gridRect.right&&event.clientY>=gridRect.top&&event.clientY<=gridRect.bottom){
            animateReflow(()=>dockGrid.insertBefore(drag.card,drag.placeholder));
            saveDock();$('dockNotice').textContent='Nuevo orden guardado.';
          }else{for(const id of drag.originalOrder)dockGrid.appendChild(dockCards.get(id));}
          drag.card.style.removeProperty('display');drag.placeholder.remove();drag.ghost.remove();
          document.body.classList.remove('dock-is-dragging');
          if(commit&&!prefersReducedMotion)drag.card.animate([
            {opacity:.78,transform:'translate3d(0,7px,0) scale(.99)'},
            {opacity:1,transform:'translate3d(0,0,0) scale(1)'}
          ],{duration:210,easing:'cubic-bezier(.2,.9,.2,1)'});
          draw(current);
        }
      }
      function dockPointerUp(event){finishDockDrag(true,event);}
      function dockPointerCancel(event){finishDockDrag(false,event);}
      async function togglePreviewFullscreen() {
        try{
          if(document.fullscreenElement)await document.exitFullscreen();
          else await previewPanel.requestFullscreen();
        }catch(err){$('status').textContent='No se pudo abrir pantalla completa: '+err.message;}
      }
      function syncPreviewFullscreenButton(){
        fullscreenPreview.textContent=document.fullscreenElement===previewPanel?'✕ Salir de pantalla completa':'⛶ Pantalla completa';
      }
      fullscreenPreview.addEventListener('click',togglePreviewFullscreen);
      document.addEventListener('fullscreenchange',syncPreviewFullscreenButton);
      restoreDock();
      setOrientation();
      syncPreviewFullscreenButton();
      labelValues();
      if($('srt').value.trim())load();
      window.submotionCore={get cues(){return cues;},get current(){return current;},get duration(){return duration;},get playing(){return playing;},get recording(){return recording;},get restored(){return restored;},settings,styleIds,globalStyle,styleValue,canvas,ctx,formatText,save,labelValues,ensureFont,pause,
        seek(time){current=Math.max(0,Math.min(getDuration(),time));draw(current);},
        replace(list){cues=list;duration=getDuration();current=Math.min(current,duration);$('srt').value=serializeSRT();rebuildCueList();draw(current);},
        refresh(){duration=getDuration();$('srt').value=serializeSRT();rebuildCueList();draw(current);},
        config(values){for(const id of settings)if(values[id]!=null){$(id).value=values[id];if(styleIds.includes(id))globalStyle[id]=$(id).value;}setOrientation();duration=getDuration();labelValues();draw(current);},
        openCueEditor,rebuildCueList,draw,exportVideo,cancel(){cancelRecording?.();}};
    })();
