import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'output/parallax-check');fs.mkdirSync(out,{recursive:true});
const url=process.env.VIBECAT_URL||'http://127.0.0.1:9892/';
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
const errors=[],requests=[];
try{
  let context=await browser.newContext({viewport:{width:1100,height:1000},deviceScaleFactor:1});
  let page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  await page.goto(url);await page.waitForFunction(()=>window.vibecatDepth?.status().textureVersion>0);
  await page.getByRole('button',{name:'Pause animation',exact:true}).click();
  await page.waitForTimeout(100);
  const clean=await page.locator('#scene').evaluate(c=>c.toDataURL());
  const box=await page.locator('#painting').boundingBox();
  await page.mouse.move(box.x+box.width*.08,box.y+box.height*.5);await page.waitForTimeout(450);
  const left=await page.locator('#depth-view').screenshot({path:path.join(out,'left.png')});
  const leftState=await page.evaluate(()=>vibecatDepth.status());
  assert(leftState.x<-.7,'Pointer did not move camera left');
  await page.mouse.move(box.x+box.width*.92,box.y+box.height*.5);await page.waitForTimeout(450);
  const right=await page.locator('#depth-view').screenshot({path:path.join(out,'right.png')});
  assert((await page.evaluate(()=>vibecatDepth.status())).x>.7,'Pointer did not move camera right');
  assert.equal(await page.locator('#scene').evaluate(c=>c.toDataURL()),clean,'Warped output leaked into the source painting');
  // Compare image pixels inside the cat, excluding the controls and slider.
  const changed=await page.evaluate(async({a,b})=>{
    async function decode(encoded){const img=new Image();img.src='data:image/png;base64,'+encoded;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);return {width:img.width,height:img.height,pixels:g.getImageData(0,0,img.width,img.height).data};}
    const one=await decode(a),two=await decode(b);let changed=0,total=0;
    for(let y=Math.floor(one.height*.2);y<one.height*.72;y++)for(let x=Math.floor(one.width*.18);x<one.width*.65;x++){
      const i=(y*one.width+x)*4;let d=0;for(let k=0;k<3;k++)d+=Math.abs(one.pixels[i+k]-two.pixels[i+k]);if(d>30)changed++;total++;
    }
    return changed/total;
  },{a:left.toString('base64'),b:right.toString('base64')});
  assert(changed>.05,'The cat image did not visibly change with the viewpoint');
  await page.locator('#depth-angle').fill('65');await page.locator('#depth-angle').dispatchEvent('input');
  await page.waitForTimeout(350);
  assert(Math.abs((await page.evaluate(()=>vibecatDepth.status())).x-.65)<.03,'Keyboard-accessible view slider did not update camera');
  // The original lamp click still reaches the 2D source under the overlay.
  const sceneBox=await page.locator('#scene').boundingBox();
  await page.mouse.click(sceneBox.x+sceneBox.width*167/1024,sceneBox.y+sceneBox.height*150/1024);
  assert.notEqual(await page.locator('#scene').evaluate(c=>c.toDataURL()),clean,'Lamp toggle no longer changes the scene');
  await page.locator('#depth-toggle').click();
  assert.equal(await page.locator('#depth-view').isVisible(),false);
  await page.locator('#depth-toggle').click();
  assert.equal(await page.locator('#depth-view').isVisible(),true);
  await page.getByRole('button',{name:'Resume animation',exact:true}).click();
  const before=await page.evaluate(()=>({time:performance.now(),...vibecatDepth.status()}));
  await page.waitForTimeout(3000);
  const after=await page.evaluate(()=>({time:performance.now(),...vibecatDepth.status()}));
  const measuredDisplayFps=(after.displayFrames-before.displayFrames)*1000/(after.time-before.time);
  assert(after.sourceFrames>before.sourceFrames,'The original animation stopped');
  assert(after.textureVersion>=before.textureVersion,'Live texture did not update');
  await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.waitForTimeout(200);
    const bounds=await page.locator('.depth-control').boundingBox();
    assert(bounds.x>=0&&bounds.x+bounds.width<=width,'Depth controls overflow the phone');
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:path.join(out,`phone-${width}.png`),fullPage:true});
  }
  assert.equal(requests.filter(r=>r.endsWith('/assets/cafe-depth.png')).length,1,'Depth was fetched more than once');
  assert(requests.every(r=>new URL(r).origin===new URL(url).origin),'An external runtime request was made');
  await context.close();

  context=await browser.newContext({viewport:{width:800,height:900},reducedMotion:'reduce'});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>window.vibecatDepth?.status().ready);
  assert.equal((await page.evaluate(()=>vibecatDepth.status())).enabled,false,'Reduced motion should start with parallax off');
  await page.locator('#depth-toggle').click();
  await page.waitForFunction(()=>vibecatDepth.status().textureVersion>0);
  await context.close();

  context=await browser.newContext();
  await context.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args)};});
  page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#scene').classList.contains('ready'));
  assert((await page.evaluate(()=>vibecatDepth.status())).error);
  assert.equal(await page.locator('#depth-view').isVisible(),false);
  assert.equal(await page.locator('#depth-toggle').isDisabled(),true);
  await context.close();assert.deepEqual(errors,[]);
  const report={passed:true,measuredDisplayFps,changedCatPixelFraction:changed,singleStaticDepthRequest:true,noExternalRuntimeRequests:true,sourcePaintingUnwarped:true,animationAndLampPreserved:true,reducedMotion:true,webglFallback:true,phoneWidths:[390,320],errors};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
