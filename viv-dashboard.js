/* Live fields, matched-window spectra and measured speed-point comparisons. */
(function(root){
'use strict';
const $=id=>document.getElementById(id), fmt=(n,d=3)=>Number.isFinite(n)?(n!==0&&Math.abs(n)<10**(-d)?n.toExponential(2):n.toFixed(d)):'待积累', colors=['#24759e','#d48132'];
let latest=null,lastSpectral=0,spectra=[null,null],points=[],modeKey='',wasViv=false,lockRendered=false;
let pendingSpeed=null,speedTimer=null,residence={key:'',settledAt:null},lastObservation=null,lastObservationAt=-Infinity,lastAutomaticTime=-Infinity,autoBlockedKey='';
const windPrefixes=['viv-wind-top','viv-wind-lock'],SETTLE_TIME=20,MIN_CYCLES=10,INITIAL_DEVELOPMENT=240;
const scanTracks=new Map();
const lesson=$('viv-learning'),heading=lesson.querySelector('.lesson-heading');
heading.querySelector('h3').textContent='① 流场与桥梁振动';
heading.querySelector('.eyebrow').textContent='气流、运动、时程和频谱对应着看';
const live=document.createElement('div');live.id='viv-live-fields';heading.after(live);
const jump=document.createElement('nav');jump.className='viv-jump';jump.setAttribute('aria-label','涡振图表导航');jump.innerHTML='<a href="#viv-live-fields">流场与运动</a><a href="#viv-time-slot">时程</a><a href="#viv-spectrum-card">频谱</a><a href="#viv-lockin-card">锁定区间</a>';heading.after(jump);
const fieldTools=document.createElement('div');fieldTools.className='viv-field-tools';fieldTools.innerHTML='<p>上半图：实际涡量场；下半图：同一步的实际位移。A/B共用色标和运动倍率。</p><label>流场视野 <select id="viv-field-view"><option value="near">近尾流 · 看清旋涡</option><option value="full">完整计算域</option></select></label>';live.before(fieldTools);
function windMarkup(prefix){return `<div class="viv-wind-bar"><div class="viv-wind-heading"><label for="${prefix}-range">亲手调风速 U/Uref</label><output id="${prefix}-value">0.700</output></div><div class="viv-wind-input"><button id="${prefix}-down" aria-label="降低风速0.05">−</button><input id="${prefix}-range" aria-label="亲手调风速 U/Uref" type="range" min="0.5" max="1.5" step="0.025" value="0.7"><button id="${prefix}-up" aria-label="增大风速0.05">＋</button></div><div class="viv-wind-endpoints"><span>0.5 · 低风速</span><span>1.5 · 高风速</span></div><div class="viv-live-frequencies" id="${prefix}-frequencies"></div><div class="viv-hold-track"><span id="${prefix}-progress"></span></div><p id="${prefix}-note" class="viv-hold-note">停在一个风速，观察升力波形与频率，再换一个风速比较。</p></div>`;}
const windTop=document.createElement('section');windTop.className='viv-wind-experiment';windTop.id='viv-wind-experiment';windTop.innerHTML=`<div class="viv-card-heading"><h3>调风速，看频率怎样走</h3><button id="viv-start-lockin-top">重新开始扫风速对照</button></div><p class="viv-wind-intro">A 固定圆柱看脱涡，B 可动圆柱看流固反馈。低Re课堂模型；快速网格只作定性观察。</p>${windMarkup('viv-wind-top')}`;fieldTools.before(windTop);
const motionDetail=document.createElement('details');motionDetail.className='lesson-detail';motionDetail.id='motion-detail';motionDetail.innerHTML='<summary>放大观察位移与参数读数</summary>';live.after(motionDetail);motionDetail.append($('viv-motion'),$('motion-note'),$('frequency-readout'));
$('flow-field-detail').hidden=true;
const timeSlot=document.createElement('section');timeSlot.id='viv-time-slot';live.after(timeSlot);
const plotCard=document.querySelector('.plot-card'),plotHome=plotCard.parentElement;
const windowTools=document.createElement('div');windowTools.className='viv-chart-controls';windowTools.innerHTML='<label>共同时间窗 Δt* <select id="viv-window"><option value="15">最近15</option><option value="30">最近30</option><option value="60">最近60</option><option value="120" selected>最近120</option></select></label><span>时程与频谱使用同一窗口。改风速后重新积累。</span>';plotCard.querySelector('.plot-heading').after(windowTools);
const spectrumCard=document.createElement('section');spectrumCard.id='viv-spectrum-card';spectrumCard.className='viv-chart-card';spectrumCard.innerHTML=`<div class="viv-card-heading"><h3>③ 对比频谱</h3><span><i class="dot-a"></i>A <i class="dot-b"></i>B</span></div><div class="viv-chart-controls"><label>纵轴 <select id="viv-spectrum-kind"><option value="amplitude">幅值谱</option><option value="psd">功率谱密度 PSD</option></select></label><label>频率范围 <select id="viv-spectrum-band"><option value="low">低频放大 0–0.6</option><option value="full">全部采样频率</option></select></label></div><canvas id="viv-spectrum" aria-label="两组同一物理量同尺度频谱，虚线为固有频率"></canvas><div id="viv-spectrum-peaks" class="viv-peak-readout"></div><p id="viv-spectrum-note"></p><p class="helper">取上方时程所选物理量，去均值后加Hann窗。A/B共用纵轴，不各自归一化；峰高可以比较。短窗峰较宽，补零不会提高物理分辨率。</p><button id="viv-spectrum-export">导出当前频谱 CSV</button>`;timeSlot.after(spectrumCard);
const lockCard=document.createElement('section');lockCard.id='viv-lockin-card';lockCard.className='viv-chart-card';
lockCard.innerHTML=`<div class="viv-card-heading"><h3>④ 走过几个风速，找频率平台</h3><button id="viv-start-lockin-lock">重新开始扫风速对照</button></div>
${windMarkup('viv-wind-lock')}
<div class="viv-chart-controls"><label><input type="checkbox" id="viv-lockin-auto" checked> 数据充分后自动记录此风速</label><button id="viv-lockin-capture">记录当前A/B风速点</button><button id="viv-lockin-clear">清空本次点</button></div>
<p id="viv-lockin-feedback" class="viv-record-feedback" aria-live="polite">停稳一个风速后再比较；快拖滑块只能看过渡过程。</p>
<div class="viv-chart-controls"><label>记录图 <select id="viv-lockin-data"><option value="live" selected>我的扫风速记录</option><option value="reference">标准8格参考 · 独立起算（非本次实验）</option></select></label></div>
<p id="viv-lockin-source"></p><canvas id="viv-lockin-frequency" aria-label="自己的风速记录：固定圆柱升力频率与可动圆柱升力、位移频率"></canvas><canvas id="viv-lockin-amplitude" aria-label="自己的风速记录：窗内振幅随约化风速变化"></canvas><p id="viv-lockin-status" class="viv-lock-status"></p>
<p class="helper">先看：风速继续增加时，A、B的升力频率是否都继续增加？再看：B的升力与位移频率是否在几个相邻风速下保持接近？图上空心点是当前观察，实心点才是已记录的可靠频率。</p>
<details><summary>完成观察后，再看判据与参数解释</summary><p>锁定意味着一段风速内尾流与运动持续同步。页面只在至少3个同条件相邻记录点满足频率筛查后标出候选范围；不是精确边界或实桥预测。还要考察相位、幅值持续性和扫速方向。</p><p>横轴Uᵣ=U/(fₙD)，纵轴为fL/fₙ和fy/fₙ。固定圆柱没有运动频率，A组只作自然脱涡对照，不能被判断为锁定。</p><p>箱梁m*=m/(ρD²)，圆柱m*=4m/(πρD²)。Sc=4πmζ/(ρD²)；改变质量也会改变fₙ。Re_ref固定时，实际Re随风速变化。保持其余参数不变，每个风速至少积累10个周期；不要把不断扫动时的混合时程当作稳态。</p><p>初次从均匀流启动，先发展至t*=240再正式取点；每次变速另等待20个无量纲时间，再用同一风速的记录。实时频率读数不是已经稳态的证明。取点使用独立的最近120时间窗，不随上方频谱的显示窗口改变；还检查前后半窗频率及振幅。标准8格参考是独立起算，不能直接与快速6格数值比较。</p></details><div id="viv-lockin-table" class="table-scroll"></div>`;spectrumCard.after(lockCard);
function setup(id){const cv=$(id),r=cv.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,r.width),h=Math.max(1,r.height);cv.width=Math.round(w*dpr);cv.height=Math.round(h*dpr);const c=cv.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return{c,w,h};}
function axes(id,{xmin=0,xmax=1,ymin=0,ymax=1,xlabel='',ylabel=''}){const {c,w,h}=setup(id),p={l:54,r:16,t:29,b:37},X=x=>p.l+(x-xmin)/(xmax-xmin)*(w-p.l-p.r),Y=y=>p.t+(ymax-y)/(ymax-ymin)*(h-p.t-p.b);c.fillStyle='#fff';c.fillRect(0,0,w,h);c.font='11px Consolas, Microsoft YaHei';for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;c.strokeStyle='#e1eaee';c.beginPath();c.moveTo(p.l,Y(y));c.lineTo(w-p.r,Y(y));c.stroke();c.fillStyle='#597987';c.textAlign='right';c.fillText(Math.abs(y)>=1000||Math.abs(y)<.001&&y!==0?y.toExponential(1):fmt(y,Math.abs(ymax)>10?1:3),p.l-5,Y(y)+4);const x=xmin+(xmax-xmin)*i/4;c.textAlign='center';c.fillText(fmt(x,xmax>10?1:2),X(x),h-19);}c.textAlign='left';c.fillText(ylabel,4,13);c.textAlign='right';c.fillText(xlabel,w-6,h-3);c.textAlign='left';return{c,w,h,p,X,Y,ymin,ymax};}
function line(chart,rows,color,dash=[]){const {c,X,Y,p,w,h}=chart;c.save();c.beginPath();c.rect(p.l,p.t,w-p.l-p.r,h-p.t-p.b);c.clip();c.strokeStyle=color;c.lineWidth=1.8;c.setLineDash(dash);c.beginPath();let started=false;for(const r of rows){if(!Number.isFinite(r.x)||!Number.isFinite(r.y)){started=false;continue;}if(started)c.lineTo(X(r.x),Y(r.y));else{c.moveTo(X(r.x),Y(r.y));started=true;}}c.stroke();c.restore();}
function samples(){if(!latest?.frames?.[0])return[[],[]];const end=Math.min(...latest.records.map(r=>r.at(-1)?.t||0)),start=Math.max(end-(+$('viv-window').value),...latest.records.map(r=>r[0]?.t||0));return latest.records.map(r=>r.filter(p=>p.t>=start&&p.t<=end));}
function calculate(){const rows=samples();spectra=rows.map(r=>LabSpectrum.spectrum(r,latest?.plotType||'y',{span:+$('viv-window').value}));return rows;}
function renderSpectrum(){calculate();const key=latest?.plotType||'y',kind=$('viv-spectrum-kind').value,full=$('viv-spectrum-band').value==='full',xmax=full?Math.max(1,...spectra.map(s=>s?.nyquist||0)):.6,unit={y:'y/D',cl:'CL,D',cd:'CD,D',force:'L/(ρUref²D)'}[key],series=spectra.map(s=>(s?.bins||[]).filter(b=>b.frequency<=xmax).map(b=>({x:b.frequency,y:b[kind]}))),ymax=Math.max(1e-8,...series.flat().map(p=>p.y))*1.12,chart=axes('viv-spectrum',{xmax,ymax,xlabel:'f* = fD/Uref',ylabel:kind==='psd'?`PSD · (${unit})² / f*`:`幅值 · ${unit}`});series.forEach((r,i)=>line(chart,r,colors[i]));latest?.frames?.forEach((f,i)=>{if(f?.fn&&f.fn<=xmax){line(chart,[{x:f.fn,y:0},{x:f.fn,y:ymax}],colors[i],[5,4]);chart.c.fillStyle=colors[i];chart.c.fillText((i?'B':'A')+' fₙ',Math.min(chart.w-42,chart.X(f.fn)+4),26+i*14);}});
 $('viv-spectrum-peaks').innerHTML=spectra.map((s,i)=>{const pk=full?s?.peak:s?.lowPeak;const quality=!pk?'数据不足或无可用局部峰':!full&&s.lowBandFraction<.001?'低频带能量不足0.1%，峰不用于同步判断':!pk.mature?'不足3周期，峰位暂不稳定':!full&&!pk.valid?'低频峰尚不可靠，不用于同步判断':'已覆盖至少3周期；仍需看稳态';return `<div><b>${i?'B':'A'} · ${unit}</b><span>${full?'全频主峰':'0.04–0.6局部峰'} f* ${fmt(pk?.frequency)}</span><span>${kind==='psd'?'峰值PSD':'谱峰幅值'} ${fmt(pk?.[kind],4)}</span><small>${quality}</small></div>`;}).join('');
 const valid=spectra.filter(Boolean),s=valid[0];$('viv-spectrum-note').textContent=s?`共同窗口 t*=${fmt(s.start,1)}–${fmt(s.end,1)}；Δt*=${fmt(s.span,1)}，分辨率约1/Δt*=${fmt(s.resolution,3)}。峰位差小于1/Δt*时，不能据此断言频率显著不同。${!full?'图含0–0.6，局部峰读数只搜索0.04–0.6；更慢的趋势不作为该局部峰。':''}${!full&&valid.some(x=>x.highBandFraction>.5)?'有显著高频成分，请切换全部采样频率；低频图不代表全频主峰。':''}`:'积累至少32个原生采样点后显示频谱；当前时程仍可观察。';
}
function pointSet(){if($('viv-lockin-data').value==='reference'){return root.LockinReference?.points||[];}return points;}
function signature(f){return JSON.stringify([f.shape,f.diameterLattice,f.ReRef,f.massRatio,f.zeta,f.fn,!!f.fixed,latest?.generation]);}
function scanSignature(base,segment,direction){return JSON.stringify([base,'manual-continuation',segment,direction]);}
function assignScan(point){
 const base=point.conditionSignature,key=JSON.stringify([base,point.group]);
 if(point.windNotSettled){point.scanDirection='transition';point.scanSegment=null;point.signature=scanSignature(base,'transition','transition');return point;}
 let track=scanTracks.get(key);if(!track){track={lastU:point.U,direction:0,segment:0};scanTracks.set(key,track);}
 const direction=Math.abs(point.U-track.lastU)<=1e-5?0:Math.sign(point.U-track.lastU);
 if(direction&&track.direction===0){track.direction=direction;for(const p of points)if(p.conditionSignature===base&&p.group===point.group&&p.scanSegment===track.segment&&p.scanDirection===0){p.scanDirection=direction;p.signature=scanSignature(base,track.segment,direction);}}
 else if(direction&&direction!==track.direction){track.segment++;track.direction=direction;}
 track.lastU=point.U;point.scanSegment=track.segment;point.scanDirection=track.direction;point.signature=scanSignature(base,track.segment,track.direction);return point;
}
function usableLift(p){return p.valid!==false&&!p.windNotSettled&&!p.highFrequencyDominated&&p.halfWindowStable!==false&&Number.isFinite(p.fl??p.fL);}
function usableFrequency(p){return usableLift(p)&&(p.fixed||Number.isFinite(p.fy));}
function pointStatus(p){if(p.windNotSettled)return '风速过渡，尚不记录';if(p.initialDeveloping)return '首次尾流尚在发展（需至t*=240）';if(p.settling)return '等待变速后的过渡结束';if(p.highFrequencyDominated)return '高频主导，暂不取点';if(p.peakAvailable===false)return '尚无可靠谱峰（尾流可能趋稳）';if(p.recordWindowTooShort)return '频率过低，120窗不足10周期';if(!p.enoughCycles&&p.enoughCycles!==undefined)return '尚不足10周期';if(p.halfWindowStable===false)return '前后半窗尚未稳定';if(!usableFrequency(p))return '短窗或谱峰不可靠';if(p.fixed)return '固定对照 · 只看脱涡频率';const a=VivAnalysis.assess(p);if(a.candidate)return '同步候选点';return '有效观测，未满足同步筛查';}
function scanLabel(p){return p.scanDirection===1?'升速段'+(p.scanSegment+1):p.scanDirection===-1?'降速段'+(p.scanSegment+1):p.scanDirection===0?'待第二个风速':'独立起算参考';}
function windSettled(){return !!latest?.frames?.[0]&&latest.frames.every(f=>f&&(!Number.isFinite(f.Utarget)||Math.abs(f.U-f.Utarget)<=1e-5));}
function nowTime(){return Math.min(...(latest?.frames||[]).map(f=>f?.t??f?.time??0));}
function updateResidence(){
 if(!latest?.frames?.[0]){residence={key:'',settledAt:null};lastObservation=null;return;}
 const key=JSON.stringify([latest.generation,latest.controlRevision,latest.frames.map(f=>[signature(f),f.Utarget??f.U])]);
 if(key!==residence.key){residence={key,settledAt:null};lastObservation=null;lastObservationAt=-Infinity;lastAutomaticTime=-Infinity;}
 if(windSettled()&&residence.settledAt===null)residence.settledAt=nowTime();
}
function observationRows(){
 if(residence.settledAt===null)return [[],[]];
 const end=Math.min(...latest.records.map(rows=>rows.at(-1)?.t||0)),after=Math.max(residence.settledAt+SETTLE_TIME,end-120);
 return latest.records.map(rows=>rows.filter(r=>r.t>=after&&r.t<=end));
}
function readObservations(){
 const rows=observationRows(),spanLimit=120;
 return latest.frames.map((f,i)=>{
  const data=rows[i],fl=LabSpectrum.spectrum(data,'cl',{span:spanLimit}),fy=f.fixed?null:LabSpectrum.spectrum(data,'y',{span:spanLimit});
  const span=fl?.span||0,mid=fl?(fl.start+fl.end)/2:0,halves=[data.filter(r=>r.t<=mid),data.filter(r=>r.t>=mid)];
  const halfSpectra=halves.map(r=>({fl:LabSpectrum.spectrum(r,'cl',{span:spanLimit}),fy:f.fixed?null:LabSpectrum.spectrum(r,'y',{span:spanLimit})}));
  const hasPeak=s=>!!(s?.lowPeak?.valid&&s.lowPeak.mature&&s.highBandFraction<=.5);
  const stableKey=key=>halfSpectra.every(h=>hasPeak(h[key]))&&Math.abs(halfSpectra[0][key].lowPeak.frequency-halfSpectra[1][key].lowPeak.frequency)<=.1*f.fn;
  const amplitude=r=>r.length?(Math.max(...r.map(x=>x.y))-Math.min(...r.map(x=>x.y)))/2:0;
  const halfAmplitudes=halves.map(amplitude),amplitudeChange=f.fixed?0:Math.abs(halfAmplitudes[1]-halfAmplitudes[0])/Math.max(...halfAmplitudes,1e-12);
  const frequencyStable=stableKey('fl')&&(f.fixed||stableKey('fy')),halfWindowStable=frequencyStable&&(f.fixed||amplitudeChange<=.25);
  const lift=fl?.lowPeak?.frequency,motion=fy?.lowPeak?.frequency,cycles=span*Math.min(f.fn,lift||0,f.fixed?f.fn:motion||0),enoughCycles=cycles>=MIN_CYCLES;
  const peakAvailable=hasPeak(fl)&&(f.fixed||hasPeak(fy)),recordWindowTooShort=span>=119.9&&peakAvailable&&!enoughCycles,initialDeveloping=!!latest.lockinExperiment&&nowTime()<INITIAL_DEVELOPMENT;
  const windNotSettled=!windSettled()||pendingSpeed!==null,settling=residence.settledAt===null||nowTime()<residence.settledAt+SETTLE_TIME;
  const highFrequencyDominated=!!(fl?.highBandFraction>.5||fy?.highBandFraction>.5);
  return {conditionSignature:signature(f),group:i?'B':'A',shape:f.shape,U:f.U,Utarget:f.Utarget,Re:f.Re,ReRef:f.ReRef,mass:f.massRatio,zeta:f.zeta,fn:f.fn,fixed:!!f.fixed,fl:lift,fy:f.fixed?null:motion,span,resolution:span?1/span:Infinity,half:amplitude(data),windowStart:fl?.start,windowEnd:fl?.end,settledAt:residence.settledAt,discardedTransitionTime:SETTLE_TIME,cycles,enoughCycles,peakAvailable,recordWindowTooShort,initialDeveloping,frequencyStable,amplitudeChange,halfWindowStable,windNotSettled,settling,highFrequencyDominated,valid:!windNotSettled&&!initialDeveloping&&!settling&&!highFrequencyDominated&&enoughCycles&&hasPeak(fl)&&(f.fixed||hasPeak(fy))&&halfWindowStable};
 });
}
function capture(automatic=false){
 if(!latest?.frames?.[0]||pendingSpeed!==null)return false;
 const observations=readObservations();lastObservation=observations;lastObservationAt=performance.now();
 if(!observations.every(p=>p.valid)){
  if(!automatic)$('viv-lockin-feedback').textContent='尚未记点：'+observations.map(p=>p.group+' '+pointStatus(p)).join('；')+(observations.some(p=>p.recordWindowTooShort)?'。当前120时间窗不足以满足10周期；可换风速或参数，长周期研究需要更长记录窗。':observations.some(p=>p.peakAvailable===false&&!p.initialDeveloping)?'。没有可靠谱峰时不补造频率；可继续看流场，或改变风速比较。':'。保持此风速继续观察。');
  return false;
 }
 observations.forEach(raw=>{
  const point=assignScan({...raw}),old=points.findIndex(p=>p.group===point.group&&p.signature===point.signature&&Math.abs(p.U-point.U)<=1e-5);
  if(old>=0)points[old]=point;else points.push(point);
 });
 if(points.length>64)points.splice(0,points.length-64);
 $('viv-lockin-data').value='live';$('viv-lockin-feedback').textContent=(automatic?'已自动记录':'已记录')+' U*='+fmt(observations[0].U,3)+'。现在可以改变风速，看频率点怎样移动；同风速继续观察会更新此点。';
 lastAutomaticTime=nowTime();renderLockin();return true;
}
function currentReadings(){
 if(!latest?.frames?.[0]||!latest.frames[1])return [];
 return (latest?.frames||[]).map((f,i)=>{const q=latest.frequencies?.[i]||{},high=q.liftInfo?.highFrequencyDominated||(!f.fixed&&q.yInfo?.highFrequencyDominated);return {f,fl:high?null:q.lift,fy:f.fixed||high?null:q.y,span:q.liftInfo?.span||0,high};});
}
function syncWindControls(value=pendingSpeed??+$('viv-u').value){
 windPrefixes.forEach(prefix=>{$(prefix+'-range').value=value;$(prefix+'-value').textContent=fmt(value,3);});
}
function renderWind(){
 syncWindControls();const reads=currentReadings(),a=reads[0],b=reads[1],fn=b?.f?.fn;
 const cell=(label,value,note,tone)=>`<div class="${tone||''}"><small>${label}</small><strong>${fmt(value)}</strong><span>${note}</span></div>`;
 const html=cell(a?.f?.fixed?'A 固定 · 升力 fL':'A 升力频率 fL',a?.fl,Number.isFinite(a?.fl)?'fL/fₙ = '+fmt(a.fl/a.f.fn,2):'至少积累3周期','viv-read-a')+cell(b?.f?.fixed?'B 固定 · 升力 fL':'B 可动 · 升力 fL',b?.fl,Number.isFinite(b?.fl)?'fL/fₙ = '+fmt(b.fl/fn,2):'至少积累3周期','viv-read-b')+cell(b?.f?.fixed?'B 已固定 · 无运动频率':'B 位移频率 fy',b?.fy,Number.isFinite(b?.fy)?'fy/fₙ = '+fmt(b.fy/fn,2):'观察上下运动','viv-read-b')+cell('B 固有频率 fₙ',fn,'全部频率均为 fD/Uref');
 const elapsed=residence.settledAt===null?0:Math.max(0,nowTime()-residence.settledAt),usable=Math.max(0,Math.min(elapsed-SETTLE_TIME,120)),minimumF=Math.min(...reads.flatMap(r=>[r.f.fn,r.fl||r.f.fn,...(!r.f.fixed?[r.fy||r.f.fn]:[])])),cycles=Number.isFinite(minimumF)?usable*minimumF:0;
 let note;
 if(pendingSpeed!==null||!windSettled())note='正在调节来流；停在一个风速，让尾流与频率重新发展。';
 else if(latest?.lockinExperiment&&nowTime()<INITIAL_DEVELOPMENT)note=`首次尾流发展：t* ${fmt(nowTime(),1)} / ${INITIAL_DEVELOPMENT}；频率先观察，发展完成后才正式取点。`;
 else if(elapsed<SETTLE_TIME)note=`变速过渡：t* ${fmt(elapsed,1)} / ${SETTLE_TIME}；频率读数仅供观察，暂不记点。`;
 else if(usable>=119.9&&cycles<MIN_CYCLES)note='当前频率在120时间窗内不足10周期，暂不记录；可换风速或参数，长周期观察需要更长记录窗。';
 else if(cycles<MIN_CYCLES)note=`同风速观察：约 ${fmt(cycles,1)} / ${MIN_CYCLES} 周期；改变风速会重新积累。`;
 else if(lastObservation?.some(p=>!p.valid))note=lastObservation.filter(p=>!p.valid).map(p=>p.group+'：'+pointStatus(p)).join('；')+'。暂不取点，可继续看流场或改变风速比较。';
 else note='观察窗已足够长。比较A、B的频率走向，再选下一个风速。';
 if(latest?.paused)note='计算已暂停。点击“暂停 / 继续”恢复后再观察。';
 if(!latest?.lockinExperiment)note+=' 当前不是固定/可动对照，可点击“开始扫风速对照”。';
 windPrefixes.forEach(prefix=>{$(prefix+'-frequencies').innerHTML=html;$(prefix+'-progress').style.width=Math.min(100,Math.max(0,cycles/MIN_CYCLES*100),latest?.lockinExperiment?nowTime()/INITIAL_DEVELOPMENT*100:100)+'%';$(prefix+'-note').textContent=note;});
 windTop.querySelector('.viv-wind-intro').textContent=latest?.lockinExperiment?(b?.f?.fixed?'A、B均已固定，只比较自然脱涡，没有运动反馈。取消“也固定B圆柱”可恢复对照。':'A固定圆柱看脱涡，B可动圆柱看流固反馈。低Re课堂模型；快速网格只作定性观察。'):'当前为'+(a?.f?.shape==='cylinder'?'圆柱参数':'箱梁')+'实验；A/B约束与参数见流场读数。点“开始扫风速对照”切到固定A与可动B。';
 const label=latest?.lockinExperiment?'重新开始扫风速对照':'开始扫风速对照';$('viv-start-lockin-top').textContent=label;$('viv-start-lockin-lock').textContent=label;
}
function previewMarker(chart,reads,amplitude=false){
 for(const r of reads){if(!r.f)continue;const x=r.f.U/r.f.fn;if(!Number.isFinite(x))continue;line(chart,[{x,y:0},{x,y:chart.ymax}],'#adc1ca',[2,5]);}
 if(amplitude)return;
 reads.forEach((r,i)=>{for(const value of[r.fl,...(!r.f.fixed?[r.fy]:[])]){if(!Number.isFinite(value))continue;const x=chart.X(r.f.U/r.f.fn),y=chart.Y(value/r.f.fn);chart.c.beginPath();chart.c.arc(x,y,5,0,Math.PI*2);chart.c.fillStyle='#fff';chart.c.strokeStyle=colors[i];chart.c.lineWidth=2;chart.c.fill();chart.c.stroke();}});
}
function renderLockin(){
 const reference=$('viv-lockin-data').value==='reference',data=pointSet(),analysis=VivAnalysis.lockCandidate(data),fixed=reference?(root.LockinReference?.fixedPoints||[]):[],reads=reference?[]:currentReadings(),all=[...data,...fixed],urs=all.map(p=>p.U/p.fn).concat(reads.map(r=>r.f.U/r.f.fn)).filter(Number.isFinite),xmin=Math.max(0,Math.min(...urs,3.1)-.3),xmax=Math.max(...urs,9.4)+.3;
 const ratios=data.filter(usableFrequency).flatMap(p=>[(p.fl??p.fL)/p.fn,...(!p.fixed?[p.fy/p.fn]:[])]).concat(fixed.map(p=>(p.fl??p.fL)/p.fn),reads.flatMap(r=>[(r.fl||0)/r.f.fn,(r.fy||0)/r.f.fn])).filter(Number.isFinite),ymax=Math.max(1.4,...ratios)*1.12;
 const fc=axes('viv-lockin-frequency',{xmin,xmax,ymax,xlabel:'约化风速 Uᵣ = U/(fₙD)',ylabel:'频率比 f/fₙ'}),ac=axes('viv-lockin-amplitude',{xmin,xmax,ymax:Math.max(.01,...data.map(p=>p.half??p.amplitude??0))*1.15,xlabel:'约化风速 Uᵣ = U/(fₙD)',ylabel:'窗内半幅 A/D'});
 for(const range of analysis.ranges){for(const ch of[fc,ac]){ch.c.fillStyle='#13928b18';ch.c.fillRect(ch.X(range.UrMin),ch.p.t,ch.X(range.UrMax)-ch.X(range.UrMin),ch.h-ch.p.t-ch.p.b);}}
 line(fc,[{x:xmin,y:1},{x:xmax,y:1}],'#849ca7',[4,4]);
 for(const g of analysis.groups){const i=g.group==='B'?1:0,ps=[...g.points].sort((a,b)=>a.U-b.U);line(fc,ps.map(p=>({x:p.U/p.fn,y:usableFrequency(p)?(p.fl??p.fL)/p.fn:NaN})),colors[i],[5,4]);line(fc,ps.map(p=>({x:p.U/p.fn,y:usableFrequency(p)&&!p.fixed?p.fy/p.fn:NaN})),colors[i]);line(ac,ps.map(p=>({x:p.U/p.fn,y:usableFrequency(p)?p.half??p.amplitude:NaN})),colors[i]);for(const p of ps){if(!usableFrequency(p))continue;for(const [ch,y]of[[fc,(p.fl??p.fL)/p.fn],[fc,p.fixed?NaN:p.fy/p.fn],[ac,p.half??p.amplitude]])if(Number.isFinite(y)){ch.c.beginPath();ch.c.arc(ch.X(p.U/p.fn),ch.Y(y),3.2,0,Math.PI*2);ch.c.fillStyle=colors[i];ch.c.fill();}}}
 if(fixed.length)line(fc,[...fixed].sort((a,b)=>a.U-b.U).map(p=>({x:p.U/p.fn,y:(p.fl??p.fL)/p.fn})),'#6d8e63',[2,4]);
 if(!reference)previewMarker(fc,reads);
 $('viv-lockin-source').textContent=reference?(root.LockinReference?.caption||'参考数据未载入。'):'曲线只连接你已经走过并记录的风速；空心点随当前计算移动，未满3周期不画频率。横向细虚线表示f/fₙ=1。反向调速另起一段，不能与升速混为一条曲线。';
 const ranges=analysis.ranges;$('viv-lockin-status').textContent=data.length?(ranges.length?'你的记录出现频率平台候选：'+ranges.map(r=>`${r.group}，Uᵣ ${fmt(r.UrMin,2)}–${fmt(r.UrMax,2)}（${r.count}个风速）`).join('；'):'已记录 '+new Set(data.map(p=>p.U.toPrecision(6))).size+' 个风速。继续改变风速，比较B的升力与运动频率是否一起移动。'):'这里暂时没有答案。停稳一个风速完成首个取点，再改变风速，看点连成什么形状。';
 $('viv-lockin-table').innerHTML='<p class="helper">蓝/橙表示A/B；虚线是升力频率，实线是可动组的运动频率。固定组不画运动频率。空心为当前观察，实心为可靠记录。'+(reference?'绿色点线为另算的固定圆柱参考。':'')+'</p>'+(data.length?'<table><thead><tr><th>组 / U*</th><th>Re / m*</th><th>fL/fₙ</th><th>fy/fₙ</th><th>A/D</th><th>窗口</th><th>状态 / 扫速段</th></tr></thead><tbody>'+data.map(p=>`<tr><td>${p.group||'A'} / ${fmt(p.U,3)}</td><td>${fmt(p.Re,0)} / ${fmt(p.mass??p.massRatio??root.LockinReference?.settings.massRatio,0)}</td><td>${usableLift(p)?fmt((p.fl??p.fL)/p.fn):'—'}</td><td>${!p.fixed&&usableFrequency(p)?fmt(p.fy/p.fn):'—'}</td><td>${fmt(p.half??p.amplitude,4)}</td><td>${fmt(p.span,0)}</td><td>${pointStatus(p)} · ${scanLabel(p)}</td></tr>`).join('')+'</tbody></table>':'');lockRendered=true;
}
function downloadSpectrum(){calculate();let csv='\uFEFF# '+JSON.stringify({quantity:latest?.plotType,requestedSpan:+$('viv-window').value,actualWindows:spectra.map((s,i)=>s?{group:i?'B':'A',start:s.start,end:s.end,span:s.span,samples:s.samples,dt:s.dt,resolution:s.resolution,fftBinSpacing:s.fftBinSpacing,nyquist:s.nyquist}:{group:i?'B':'A',status:'insufficient-data'}),frequency:'fD/Uref',amplitude:'same units as selected quantity',psd:'quantity squared per dimensionless frequency',window:'Hann',config:latest?.frames?.map(f=>({shape:f.shape,U:f.U,Re:f.Re,ReRef:f.ReRef,mass:f.massRatio,zeta:f.zeta,fn:f.fn,diameter:f.diameterLattice}))})+'\r\ncase,frequency_fD_over_Uref,amplitude,psd\r\n';spectra.forEach((s,i)=>s?.bins.forEach(b=>csv+=[i?'B':'A',b.frequency,b.amplitude,b.psd].join(',')+'\r\n'));const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='涡振_频谱_'+Date.now()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const id of['viv-window','viv-spectrum-kind','viv-spectrum-band'])$(id).onchange=()=>{lastSpectral=0;root.Lab?.refresh();if(latest?.mode==='viv')renderSpectrum();};
$('viv-field-view').onchange=()=>root.Lab?.refresh();$('motion-scale').addEventListener('change',()=>root.Lab?.refresh());
function clearPoints(){points=[];scanTracks.clear();lastAutomaticTime=nowTime();autoBlockedKey=residence.key;$('viv-lockin-feedback').textContent='已清空记录。当前风速不会自动回填；改变风速后继续记录，也可手动取点。';renderLockin();}
function submitSpeed(){if(speedTimer!==null){clearTimeout(speedTimer);speedTimer=null;}if(pendingSpeed===null)return;const value=pendingSpeed;pendingSpeed=null;root.Lab?.setVivSpeed(value);syncWindControls(value);lastObservation=null;lastObservationAt=-Infinity;renderWind();if($('viv-lockin-data').value==='live')renderLockin();}
function queueSpeed(value,immediate=false){const target=Math.max(.5,Math.min(1.5,Math.round(Number(value)/.025)*.025));if(!Number.isFinite(target))return;pendingSpeed=target;syncWindControls(target);if(speedTimer!==null)clearTimeout(speedTimer);if(immediate)submitSpeed();else speedTimer=setTimeout(submitSpeed,180);}
windPrefixes.forEach(prefix=>{
 $(prefix+'-range').addEventListener('input',e=>queueSpeed(e.target.value));
 $(prefix+'-range').addEventListener('change',e=>queueSpeed(e.target.value,true));
 $(prefix+'-down').onclick=()=>queueSpeed((pendingSpeed??+$('viv-u').value)-.05,true);
 $(prefix+'-up').onclick=()=>queueSpeed((pendingSpeed??+$('viv-u').value)+.05,true);
});
$('viv-u').addEventListener('input',()=>{syncWindControls();lastObservation=null;lastObservationAt=-Infinity;});
function resetExperiment(){if(speedTimer!==null)clearTimeout(speedTimer);speedTimer=null;pendingSpeed=null;points=[];scanTracks.clear();lastObservation=null;lastAutomaticTime=-Infinity;autoBlockedKey='';$('viv-lockin-data').value='live';$('viv-lockin-auto').checked=true;$('viv-lockin-feedback').textContent='从低风速开始。先看波形变密还是变稀，再比较固定A与可动B的升力频率。';renderLockin();}
function startExperiment(){resetExperiment();root.Lab?.startLockinExperiment();}
$('viv-start-lockin-top').onclick=$('viv-start-lockin-lock').onclick=startExperiment;
$('viv-lockin-capture').onclick=$('capture-viv').onclick=()=>capture(false);
$('viv-lockin-clear').onclick=$('clear-viv').onclick=clearPoints;
$('viv-lockin-data').onchange=renderLockin;$('viv-spectrum-export').onclick=downloadSpectrum;
root.VivDashboard={points:()=>points.slice(),resetExperiment,update(state){
 latest=state;const viv=state.mode==='viv',entered=viv&&!wasViv;wasViv=viv;windowTools.hidden=!viv;const target=viv?timeSlot:plotHome;
 if(plotCard.parentElement!==target){if(viv)target.append(plotCard);else target.prepend(plotCard);}if(!viv)return;
 $('chart-title').textContent='② 对比时程';updateResidence();
 const key=state.plotType+'|'+$('viv-window').value+'|'+(state.frames[0]?.shape||'')+'|'+state.controlRevision+'|'+state.generation,now=performance.now();
 if(key!==modeKey||now-lastSpectral>1000){
  modeKey=key;lastSpectral=now;renderSpectrum();renderWind();
  const elapsed=residence.settledAt===null?0:nowTime()-residence.settledAt;
  if(state.lockinExperiment&&!state.paused&&residence.key!==autoBlockedKey&&$('viv-lockin-auto').checked&&pendingSpeed===null&&elapsed>SETTLE_TIME+MIN_CYCLES/(state.frames[1]?.fn||.16)&&now-lastObservationAt>3000&&nowTime()-lastAutomaticTime>=10)capture(true);
  if($('viv-lockin-data').value==='live')renderLockin();
 }
 if(entered||!lockRendered)renderLockin();
}};
root.addEventListener('resize',()=>{if(latest?.mode==='viv'){renderSpectrum();renderLockin();}});
})(window);
