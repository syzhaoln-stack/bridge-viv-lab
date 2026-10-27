/* Existing course's validated educational cylinder LBM/SDOF core; two matched channels. */
if(!self.BridgeSection) importScripts('section-geometry.js?v=20261024f');
if(!self.BrowserFlow) importScripts('viv-flow.js?v=20261027b');
let sims=[],running=false,timer=null,last=0,revision=0,history=[[],[]];
function publish(){self.postMessage({type:'frame',revision,frames:sims.map((s,i)=>({...s.snapshot(true),history:history[i]}))});history=[[],[]];last=performance.now();}
function schedule(){if(running&&!timer)timer=setTimeout(tick,8);}
function tick(){timer=null;if(!running)return;try{const start=performance.now();do{sims.forEach((s,i)=>{s.advance(5);history[i].push(s.scalar());});}while(performance.now()-start<28);if(performance.now()-last>130)publish();schedule();}catch(e){running=false;self.postMessage({type:'error',message:e.message});}}
onmessage=e=>{const m=e.data;try{if(m.type==='init'||m.type==='reset'){revision=m.revision||0;sims=(m.configs||[{},{}]).map(c=>new BrowserFlow({diameter:8,ReRef:100,referenceVelocity:.04,U:1,fn:.16,zeta:.01,massRatio:10,...c}));history=[[],[]];publish();running=!m.paused;schedule();}else if(m.type==='control'){revision=m.revision||0;m.configs.forEach((c,i)=>sims[i].setParams(c));history=[[],[]];publish();}else if(m.type==='pause'){running=!m.paused;if(!running&&timer){clearTimeout(timer);timer=null;}schedule();}}catch(e){running=false;self.postMessage({type:'error',message:e.message});}};
