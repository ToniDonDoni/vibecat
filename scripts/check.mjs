import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {GrooveSynth,SAMPLE_RATE,BAR_SECONDS} from '../dist/groove-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ignored=new Set(['.git','.venv','__pycache__','node_modules','output']);
const binary=new Set(['.png','.jpg','.bmp','.wav','.pyc']);
let checked=0;
function inspect(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    if(ignored.has(entry.name))continue;
    const target=path.join(directory,entry.name);
    assert(!entry.isSymbolicLink(),`Unexpected symbolic link: ${entry.name}`);
    if(entry.isDirectory()){inspect(target);continue;}
    if(binary.has(path.extname(target)))continue;
    const text=fs.readFileSync(target,'utf8');
    assert(!/[^\x00-\x7F]/.test(text),`Non-English source characters in ${path.relative(root,target)}`);
    assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text),`Email address in ${path.relative(root,target)}`);
    assert(!/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text),`Private key in ${entry.name}`);
    checked++;
  }
}
inspect(root);
const dist=path.join(root,'dist'),html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
assert(html.includes('lang="en"'),'The document must declare English');
for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  if(/^(?:https?:|data:)/.test(match[1]))continue;
  assert(fs.existsSync(path.join(dist,match[1])),`Missing local resource: ${match[1]}`);
}
for(const asset of ['assets/cafe.jpg','assets/lamp0.png','assets/lamp1.png','assets/windows.json','groove-core.mjs'])assert(fs.existsSync(path.join(dist,asset)),`Missing asset: ${asset}`);
const windows=JSON.parse(fs.readFileSync(path.join(dist,'assets/windows.json'),'utf8'));
assert(windows.length>0&&windows.every(w=>w.x>=0&&w.x<1024&&w.y>=0&&w.y<1024&&/^#[0-9a-f]{6}$/i.test(w.color)),'Invalid window data');

const first=new GrooveSynth(112026),same=new GrooveSynth(112026),different=new GrooveSynth(112027);
const a=first.renderBar(0),b=same.renderBar(0),c=different.renderBar(0);
assert.deepEqual(a.left,b.left,'A fixed seed must reproduce the waveform');
assert.notDeepEqual(a.left,c.left,'Different seeds must create variation');
assert.equal(a.left.length,a.right.length,'Stereo lengths must match');
assert(a.left.length>BAR_SECONDS*SAMPLE_RATE,'Bars must include overlapping tails');

const synth=new GrooveSynth(112026),bars=32,total=Math.ceil((bars*BAR_SECONDS+3)*SAMPLE_RATE);
const left=new Float32Array(total),right=new Float32Array(total);
let glitches=0,breakdowns=0;
for(let bar=0;bar<bars;bar++){
  const out=synth.renderBar(bar),offset=Math.round(bar*BAR_SECONDS*SAMPLE_RATE);
  glitches+=out.plan.events.filter(e=>e.kind==='glitch').length;
  breakdowns+=Number(out.plan.breakdown);
  for(let i=0;i<out.left.length&&offset+i<total;i++){left[offset+i]+=out.left[i];right[offset+i]+=out.right[i];}
}
let peak=0;
for(let i=0;i<total;i++){
  assert(Number.isFinite(left[i])&&Number.isFinite(right[i]),'Invalid generated audio sample');
  peak=Math.max(peak,Math.abs(left[i]),Math.abs(right[i]));
}
for(let bar=0;bar<bars;bar++){
  const start=Math.round(bar*BAR_SECONDS*SAMPLE_RATE),end=Math.round((bar+1)*BAR_SECONDS*SAMPLE_RATE);
  let energy=0;for(let i=start;i<end;i++)energy+=left[i]**2;
  assert(Math.sqrt(energy/(end-start))>.015,`Unexpected silent bar: ${bar}`);
}
assert(peak<.95,'The overlapping mix must retain signal headroom');
assert(glitches>0&&breakdowns>0,'Phrase variation must occur');
assert(synth.cache.size<=40,'The note cache must stay bounded');
console.log(`Checked ${checked} text files, all local assets, and ${bars} generated bars. Peak: ${peak.toFixed(3)}. No invalid samples.`);
