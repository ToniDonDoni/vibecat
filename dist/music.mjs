import{GrooveSynth,SAMPLE_RATE,BAR_SECONDS,BPM}from'./groove-core.mjs';
const button=document.getElementById('music'),label=document.getElementById('musicLabel'),volume=document.getElementById('volume');
let context,master,synth,nextBar=0,nextTime=0,timer=null,busy=false,playing=false;
let volumeValue=.62;
try{const stored=localStorage.getItem('vibecat-volume');if(stored!==null)volumeValue=Math.max(0,Math.min(1,Number(stored)||0));}catch{}
volume.value=Math.round(volumeValue*100);
function ui(){
  button.setAttribute('aria-pressed',String(playing));
  button.setAttribute('aria-label',playing?'Pause hip-hop':'Play hip-hop');
  label.textContent=playing?`${BPM} BPM / BOOM BAP`:'PLAY THE GROOVE';
  document.getElementById('soundbar').classList.toggle('playing',playing);
}
function schedule(){
  if(!playing||context.state!=='running')return;
  if(nextTime<context.currentTime-.1)nextTime=context.currentTime+.04;
  while(nextTime<context.currentTime+8){
    const{left,right}=synth.renderBar(nextBar++),buffer=context.createBuffer(2,left.length,SAMPLE_RATE);
    buffer.copyToChannel(left,0);buffer.copyToChannel(right,1);
    const source=context.createBufferSource();source.buffer=buffer;source.connect(master);
    source.onended=()=>{source.disconnect();source.buffer=null;};source.start(nextTime);
    nextTime+=BAR_SECONDS;
  }
}
async function toggle(){
  if(busy)return;busy=true;button.disabled=true;
  try{
    if(!context){
      const Audio=contextConstructor();context=new Audio({latencyHint:'playback'});
      master=context.createGain();master.gain.value=0;
      const low=context.createBiquadFilter();low.type='lowpass';low.frequency.value=6900;low.Q.value=.45;
      const high=context.createBiquadFilter();high.type='highpass';high.frequency.value=28;
      const compressor=context.createDynamicsCompressor();compressor.threshold.value=-13;compressor.knee.value=14;compressor.ratio.value=3;compressor.attack.value=.008;compressor.release.value=.16;
      master.connect(high).connect(low).connect(compressor).connect(context.destination);
      const seed=new Uint32Array(1);crypto.getRandomValues(seed);synth=new GrooveSynth(seed[0]);
      nextTime=context.currentTime+.07;
    }
    if(playing){
      playing=false;clearInterval(timer);timer=null;
      master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(0,context.currentTime,.025);
      await new Promise(resolve=>setTimeout(resolve,130));await context.suspend();
    }else{
      await context.resume();if(context.state!=='running')throw Error('Audio blocked');playing=true;
      schedule();master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(volumeValue*.95,context.currentTime,.09);
      timer=setInterval(schedule,150);
    }
    ui();
  }catch(e){
    playing=false;clearInterval(timer);timer=null;ui();label.textContent='TRY AGAIN';button.title='Could not start audio. Tap to try again.';
    console.error('Groove could not start:',e);
  }finally{busy=false;button.disabled=false;}
}
function contextConstructor(){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('Web Audio is not supported');return Audio;}
button.addEventListener('click',toggle);
volume.addEventListener('input',()=>{
  volumeValue=Number(volume.value)/100;
  if(master&&playing)master.gain.setTargetAtTime(volumeValue*.95,context.currentTime,.025);
  try{localStorage.setItem('vibecat-volume',String(volumeValue));}catch{}
});
document.addEventListener('visibilitychange',()=>{if(playing)schedule();});
// Mobile browsers may interrupt audio on a call or a device switch. A tap resumes it.
document.addEventListener('pointerdown',()=>{if(playing&&context?.state==='interrupted')context.resume().then(schedule).catch(()=>{});});
ui();
