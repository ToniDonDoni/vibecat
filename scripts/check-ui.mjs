import assert from 'node:assert/strict';

const elements={};
for(const id of ['music','musicLabel','volume','bpm','bpmValue','soundbar']){
  elements[id]={
    value:'',textContent:'',handlers:{},attributes:{},
    setAttribute(name,value){this.attributes[name]=value;},
    addEventListener(name,handler){this.handlers[name]=handler;},
    classList:{toggle(){}}
  };
}
const stored=new Map(),sources=[],buffers=[];
globalThis.localStorage={
  getItem:key=>stored.has(key)?stored.get(key):null,
  setItem:(key,value)=>stored.set(key,value)
};
globalThis.document={
  getElementById:id=>elements[id],
  addEventListener(){}
};
const node=()=>({
  connect(){return this;},disconnect(){},
  frequency:{value:0},Q:{value:0},threshold:{value:0},knee:{value:0},
  ratio:{value:0},attack:{value:0},release:{value:0}
});
class MockAudioContext{
  constructor(){this.currentTime=10;this.state='suspended';this.destination=node();}
  createGain(){
    const gain=node();
    gain.gain={value:0,cancelScheduledValues(){},setTargetAtTime(value){this.value=value;}};
    return gain;
  }
  createBiquadFilter(){return node();}
  createDynamicsCompressor(){return node();}
  createBuffer(channels,length,sampleRate){
    const buffer={channels,length,sampleRate,copyToChannel(){}};
    buffers.push(buffer);return buffer;
  }
  createBufferSource(){
    const source={
      connect(){},disconnect(){},buffer:null,
      start(at){this.startedAt=at;},stop(at){this.stoppedAt=at;}
    };
    sources.push(source);return source;
  }
  async resume(){this.state='running';}
  async suspend(){this.state='suspended';}
}
globalThis.window={AudioContext:MockAudioContext};
const realSetInterval=globalThis.setInterval;
globalThis.setInterval=()=>1;
try{
  await import('../dist/music.mjs');
  assert.equal(elements.bpmValue.textContent,'74 BPM');
  await elements.music.handlers.click();
  assert.equal(elements.music.attributes['aria-pressed'],'true');
  const initial=sources.length;
  assert(initial>=2,'Playback must schedule multiple bars');
  assert(Math.abs(sources[1].startedAt-sources[0].startedAt-240/74)<1e-8);

  elements.bpm.value='110';
  elements.bpm.handlers.input();
  assert.equal(elements.bpmValue.textContent,'110 BPM','The readout must follow input immediately');
  assert.equal(stored.get('vibecat-bpm'),'110','Tempo should be persisted');
  await new Promise(resolve=>setTimeout(resolve,150));
  assert(sources.slice(0,initial).every(source=>source.stoppedAt!==undefined),'The old queue must stop');
  const changed=sources.slice(initial);
  assert(changed.length>=2,'A new queue must be scheduled');
  assert(Math.abs(changed[1].startedAt-changed[0].startedAt-240/110)<1e-8);
  assert.equal(buffers.at(-1).length,Math.ceil((240/110+3)*24000));

  await elements.music.handlers.click();
  assert.equal(elements.music.attributes['aria-pressed'],'false');
  elements.bpm.value='90';
  elements.bpm.handlers.input();
  await new Promise(resolve=>setTimeout(resolve,150));
  const stoppedCount=sources.length;
  await elements.music.handlers.click();
  const resumed=sources.slice(stoppedCount);
  assert(resumed.length>=2,'Resume must schedule bars at the selected tempo');
  assert(Math.abs(resumed[1].startedAt-resumed[0].startedAt-240/90)<1e-8);
  console.log('Tempo control UI, audio rescheduling, and paused tempo changes passed.');
}finally{
  globalThis.setInterval=realSetInterval;
}
