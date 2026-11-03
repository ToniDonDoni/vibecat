'use strict';

// A fixed neural depth map warps the live painting; inference is not a frame job.
(() => {
  const source=document.getElementById('scene'),view=document.getElementById('depth-view');
  const painting=document.getElementById('painting'),button=document.getElementById('depth-toggle');
  const slider=document.getElementById('depth-angle'),reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const state={ready:false,enabled:!reduced.matches,error:null,x:0,y:0,targetX:0,targetY:0,sourceFrames:0,displayFrames:0,sourceVersion:0,textureVersion:0,displayHz:0};
  let gl=null,program=null,uniforms=null,colorTexture=null,dirty=true,haveSource=false;
  let previous=performance.now(),statsTime=previous,statsFrames=0;
  function updateButton(){
    button.disabled=!state.ready;button.textContent=state.enabled&&state.ready?'3D ON':'3D OFF';
    button.setAttribute('aria-pressed',String(state.enabled&&state.ready));
    slider.disabled=!state.ready||!state.enabled;
    view.style.display=state.ready&&state.enabled&&haveSource?'block':'none';
  }
  function fail(error){state.error=String(error.message||error);state.enabled=false;state.ready=false;button.title='3D unavailable. The original painting is still active.';updateButton();}
  function shader(type,code){const s=gl.createShader(type);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  function makeTexture(unit){
    gl.activeTexture(gl.TEXTURE0+unit);const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
    for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
    return t;
  }
  function setTarget(x,y=0){state.targetX=Math.max(-1,Math.min(1,x));state.targetY=Math.max(-1,Math.min(1,y));slider.value=String(Math.round(state.targetX*100));dirty=true;}
  function enable(value){state.enabled=!!value&&state.ready;dirty=true;updateButton();}
  function draw(){
    if(!state.ready||!state.enabled||!haveSource)return;
    gl.useProgram(program);
    if(state.textureVersion!==state.sourceVersion){
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,colorTexture);
      // Always sample the original 2D canvas, never this WebGL output.
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      state.textureVersion=state.sourceVersion;
    }
    gl.viewport(0,0,view.width,view.height);gl.uniform2f(uniforms.camera,state.x,state.y);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);state.displayFrames++;statsFrames++;dirty=false;
  }
  function frame(now){
    const dt=Math.min(100,Math.max(0,now-previous));previous=now;
    if(!document.hidden){
      const moving=Math.abs(state.x-state.targetX)+Math.abs(state.y-state.targetY)>.0001;
      if(moving){const weight=reduced.matches?1:1-Math.exp(-dt/85);state.x+=(state.targetX-state.x)*weight;state.y+=(state.targetY-state.y)*weight;dirty=true;}
      if(dirty)draw();
    }
    if(now-statsTime>1000){state.displayHz=statsFrames*1000/(now-statsTime);statsFrames=0;statsTime=now;}
    requestAnimationFrame(frame);
  }
  painting.addEventListener('pointermove',event=>{
    if(event.target.closest('button,input,label,.toolbar,.soundbar,.tempo-control,.depth-control'))return;
    const box=source.getBoundingClientRect(),size=Math.min(box.width,box.height);
    const left=box.left+(box.width-size)/2,top=box.top+(box.height-size)/2;
    setTarget((event.clientX-left)/size*2-1,(event.clientY-top)/size*2-1);
  });
  painting.addEventListener('pointerleave',()=>setTarget(0,0));
  button.addEventListener('click',()=>enable(!state.enabled));
  slider.addEventListener('input',()=>setTarget(Number(slider.value)/100));
  reduced.addEventListener('change',event=>{if(event.matches){enable(false);setTarget(0,0)}});
  view.addEventListener('webglcontextlost',event=>{event.preventDefault();fail('Graphics context lost');});
  window.vibecatDepth={
    sourceChanged(){state.sourceFrames++;state.sourceVersion++;haveSource=true;dirty=true;updateButton()},
    status:()=>({...state}),setCamera:setTarget,setEnabled:enable
  };
  try{
    gl=view.getContext('webgl',{alpha:false});if(!gl)throw Error('WebGL is unavailable');
    program=gl.createProgram();
    gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 a;varying vec2 uv;void main(){uv=(a+1.)*.5;gl_Position=vec4(a,0,1);}'));
    gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision highp float;varying vec2 uv;uniform sampler2D photo;uniform sampler2D depth;uniform vec2 camera;
      void main(){
        // A small crop leaves room for the near layers to move at the edges.
        vec2 base=uv*.95+.025;vec2 shift=camera*vec2(.045,-.032);vec2 q=base;
        for(int i=0;i<7;i++){float nearValue=texture2D(depth,clamp(q,0.,1.)).r;q=mix(q,base-shift*(nearValue-.38),.6);}
        gl_FragColor=vec4(texture2D(photo,clamp(q,0.,1.)).rgb,1.);
      }`));
    gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    const attribute=gl.getAttribLocation(program,'a');gl.enableVertexAttribArray(attribute);gl.vertexAttribPointer(attribute,2,gl.FLOAT,false,0,0);
    uniforms=Object.fromEntries(['photo','depth','camera'].map(name=>[name,gl.getUniformLocation(program,name)]));
    colorTexture=makeTexture(0);gl.uniform1i(uniforms.photo,0);makeTexture(1);gl.uniform1i(uniforms.depth,1);
    // Image and canvas uploads share this orientation; the textures stay aligned.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
    const depth=new Image();depth.onload=()=>{
      gl.activeTexture(gl.TEXTURE1);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,depth);
      state.ready=true;dirty=true;updateButton();
    };
    depth.onerror=()=>fail('Depth image could not be loaded');depth.src='assets/cafe-depth.png';
  }catch(error){fail(error);}
  updateButton();requestAnimationFrame(frame);
})();
