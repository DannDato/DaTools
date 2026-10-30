import fs from 'node:fs/promises';
import {FileBlob,SpreadsheetFile} from 'file:///C:/Users/Soporte/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs';
const dir='C:/Users/Soporte/Desktop/DaTools/outputs/2188e62e';
const wb=await SpreadsheetFile.importXlsx(await FileBlob.load('C:/Users/Soporte/Downloads/Asistentes a jornada academica.xlsx'));
const sh=wb.worksheets.getItemAt(0);
console.log((await wb.inspect({kind:'table',range:'Hoja1!A1:H5',maxChars:2200,tableMaxCols:8})).ndjson);
await fs.writeFile(dir+'/before.png',new Uint8Array(await (await wb.render({sheetName:'Hoja1',range:'A1:H8',scale:1})).arrayBuffer()));
const text=await fs.readFile('C:/Users/Soporte/.codex/attachments/2188e62e-e55f-4de3-88a9-49c9401c6e06/Texto pegado.txt','utf8');
const norm=x=>String(x??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/\s+/g,' ').trim();
const records=text.trim().split(/\r?\n/).slice(1).map(l=>l.split('\t')).filter(x=>x.length>=3);
const byCode=new Map();for(const r of records){let k=r[0].trim();if(!byCode.has(k))byCode.set(k,[]);byCode.get(k).push(r);}
const rows=sh.getRange('A1:H700').values;const edits=[],missing=[],conflicts=[];
for(let i=1;i<rows.length;i++){const r=rows[i];if(!r[1]&&!r[2])continue;if(r[6])continue;const matches=byCode.get(String(r[1]).trim())??[];const emails=[...new Set(matches.map(x=>x[2].trim()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];if(emails.length===1){edits.push({row:i+1,email:emails[0],name:norm([r[3],r[4],r[2]].join(' ')),source:matches[0][1]});}else{missing.push({row:i+1,code:r[1],name:[r[3],r[4],r[2]].join(' ')});if(emails.length>1)conflicts.push(i+1);}}
for(let i=missing.length-1;i>=0;i--){const m=missing[i];const found=records.filter(x=>norm(x[1])===norm(m.name));const emails=[...new Set(found.map(x=>x[2].trim()).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];if(emails.length===1){edits.push({row:m.row,email:emails[0],name:norm(m.name),source:found[0][1],method:'name'});missing.splice(i,1);}}
await fs.writeFile(dir+'/matches.json',JSON.stringify({source:records.length,edits,missing,conflicts},null,2));
console.log(JSON.stringify({source:records.length,matched:edits.length,missing:missing.length,conflicts}));
if(process.argv.includes('--edit')){
 for(const e of edits)sh.getRange('G'+e.row).values=[[e.email]];
 wb.recalculate();
 await fs.writeFile(dir+'/after.png',new Uint8Array(await (await wb.render({sheetName:'Hoja1',range:'A1:H8',scale:1})).arrayBuffer()));
 await (await SpreadsheetFile.exportXlsx(wb)).save(dir+'/Asistentes con correos.xlsx');
}

