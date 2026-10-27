/* Source-backed construction references, separate from the enlarged D=12 CFD mask.
   Coordinates in these reference records are metres, transverse x right and y down.
   No dimensions from the 2015 bridge are merged with those from the 2023 bridge. */
(function(root){
  'use strict';
  const VERSION='section-reference-20261027a';
  const sources={
    guide2015:{title:'张建等（2015）· 表2、3.2–3.3节',url:'https://html.rhhz.net/SYLTLX/html/2015-2-48.htm',image:'https://html.rhhz.net/SYLTLX/html/PIC/2015-2-48-T2.jpg',noseImage:'https://html.rhhz.net/SYLTLX/html/PIC/2015-2-48-T3.jpg'},
    rail2023:{title:'Li等（2023）· 图2–4',url:'https://www.frontiersin.org/journals/built-environment/articles/10.3389/fbuil.2023.1264996/full',image:'https://www.frontiersin.org/files/Articles/1264996/xml-images/fbuil-09-1264996-g002.webp'}
  };
  const records={
    guide2015:{bridgeWidth:42,bridgeDepth:3.5,bottomWidth:24.10,fairingWidth:1.5,webAngleDeg:13,
      plateLength:1,plateAngleDeg:23,plateTrackGap:.265,trackDistanceFromBottomEdge:2.4,
      plateThickness:null,trackHeight:null,trackWidth:null,
      note:'采用表2方案7的L、D与B；D在原图是水平板—轨间距，不是梁高。梁高另记H。板厚、轨高与轨宽未在该局部图标注。'},
    rail2023:{bridgeWidth:39.6,bridgeDepth:3,bottomWidth:26.6,trackHeight:.320,trackWidth:.130,trackWeb:.010,
      trackDistanceFromBottomEdge:1,flangeThickness:null,mountHeight:null,
      note:'图2的轨道尺寸与图4的1m位置工况。1m指由底板外缘沿横桥向内移，不是离梁底的竖向悬挂高度。'},
    nose2015:{bridgeWidth:42,bridgeDepth:3.5,plateLength:1.25,noseGap:0,plateThickness:null,
      note:'表2方案14：风嘴处紧贴水平板L=1.25m；与梁底23°轨道导流板是两种位置/构造。'}
  };
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=x=>Number(x).toFixed(2);
  function link(source,label){return `<a href="${source.url}" target="_blank" rel="noopener noreferrer">${esc(label||source.title)} ↗</a>`;}
  function svg(w,h,label,body){return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}" style="width:100%;height:auto;display:block"><title>${esc(label)}</title>${body}</svg>`;}
  function line(x1,y1,x2,y2,color='#547887',width=1.5,dash=''){return `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${color}" stroke-width="${width}"${dash?` stroke-dasharray="${dash}"`:''}/>`;}
  function text(x,y,value,anchor='middle',size=13,color='#294b60'){return `<text x="${n(x)}" y="${n(y)}" text-anchor="${anchor}" fill="${color}" font-size="${size}" font-family="system-ui, sans-serif">${esc(value)}</text>`;}
  function dim(x1,y1,x2,y2,label,tx=(x1+x2)/2,ty=(y1+y2)/2-7){let s=line(x1,y1,x2,y2,'#86a0ad',1);const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy)||1,px=-dy/l*4,py=dx/l*4;for(const [x,y] of [[x1,y1],[x2,y2]])s+=line(x-px,y-py,x+px,y+py,'#86a0ad',1);return s+text(tx,ty,label,'middle',12);}
  function polygon(points,fill='#d8e5ec',stroke='#547887',width=1.4){return `<polygon points="${points.map(p=>n(p[0])+','+n(p[1])).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}"/>`;}
  function rect(x,y,w,h,fill='#547887'){return `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`;}
  function iTrack(cx,top,scale,height=.320,width=.130,web=.010,flange=.014){const h=height*scale,w=width*scale,t=web*scale,f=flange*scale;return rect(cx-w/2,top,w,f)+rect(cx-t/2,top+f,t,h-2*f)+rect(cx-w/2,top+h-f,w,f);}
  function overview(kind){
    const isRail=kind==='rail',r=isRail?records.rail2023:records.guide2015,W=620,H=170,scale=550/r.bridgeWidth,cx=310,top=48,depth=r.bridgeDepth*scale,bottomHalf=r.bottomWidth/2;
    // Only the labelled envelope/placement is source-dimensioned. Roof and noses are schematic.
    const p=[[-r.bridgeWidth/2,1.35],[-r.bridgeWidth/2+1.5,.1],[0,0],[r.bridgeWidth/2-1.5,.1],[r.bridgeWidth/2,1.35],[bottomHalf,r.bridgeDepth],[-bottomHalf,r.bridgeDepth]].map(([x,y])=>[cx+x*scale,top+y*scale]);
    let s=polygon(p),trackX=bottomHalf-r.trackDistanceFromBottomEdge;
    for(const side of [-1,1]){
      const x=cx+side*trackX*scale,railTop=top+depth+1.5;
      s+=line(x,top+depth,x,railTop,'#547887',1);
      s+=iTrack(x,railTop,scale,isRail?.32:.48,isRail?.13:.16,isRail?.01:.012);
      if(!isRail){const L=r.plateLength,dx=L*Math.cos(r.plateAngleDeg*Math.PI/180),dy=L*Math.sin(r.plateAngleDeg*Math.PI/180),endX=x-side*r.plateTrackGap*scale,endY=railTop+.48*scale;
        s+=line(endX-side*dx*scale,endY-dy*scale,endX,endY,'#c98131',2);
      }
      s+=`<circle cx="${n(x)}" cy="${n(railTop+.3*scale)}" r="12" fill="none" stroke="#c98131" stroke-dasharray="3 3"/>`;
    }
    s+=dim(35,24,585,24,`总宽 ${r.bridgeWidth.toFixed(1)} m`);
    s+=dim(606,top,606,top+depth,`H=${r.bridgeDepth.toFixed(1)}m`,575,top+depth/2+4);
    s+=text(310,138,isRail?'轨高 / 梁高 = 0.320 / 3.000 ≈ 10.7%':'导流板长度 / 梁宽 = 1 / 42 ≈ 2.4%','middle',13);
    s+=text(310,158,'整梁与附件使用同一长度比例；轮廓细节概化，细线描边仅为可见性。','middle',11,'#607d8d');
    return svg(W,H,isRail?'2023文献检修轨道整梁尺度参考':'2015文献梁底导流板整梁尺度参考',s);
  }
  function railDetail(){
    const scale=650,cx=180,top=53,bottom=top+.32*scale,w=.13*scale;
    let s=rect(75,28,220,10,'#d8e5ec')+line(cx,38,cx,top,'#547887',3)+iTrack(cx,top,scale);
    s+=dim(cx+w/2+38,top,cx+w/2+38,bottom,'320 mm',cx+w/2+77,(top+bottom)/2+5);
    s+=dim(cx-w/2,bottom+24,cx+w/2,bottom+24,'130 mm',cx,bottom+42);
    s+=line(cx+4,top+110,335,top+110,'#8aa2ae',1)+text(340,top+114,'腹板 10 mm','start',14);
    s+=text(340,213,'翼缘厚度及安装座未标尺寸','start',12,'#607d8d')+text(340,233,'这里仅画形状，不补写“实桥尺寸”','start',12,'#607d8d');
    return svg(620,320,'局部放大：工字轨道高320毫米宽130毫米腹板10毫米，其他细节示意',s);
  }
  function guideDetail(){
    const r=records.guide2015,scale=240,trackX=385,soffit=42,top=55,trackBottom=181;
    const endX=trackX-r.plateTrackGap*scale,endY=trackBottom,dx=r.plateLength*Math.cos(r.plateAngleDeg*Math.PI/180)*scale,dy=r.plateLength*Math.sin(r.plateAngleDeg*Math.PI/180)*scale,startX=endX-dx,startY=endY-dy;
    let s=rect(30,soffit-9,530,9,'#d8e5ec')+text(48,26,'箱梁底板','start',13)+iTrack(trackX,top,scale,(trackBottom-top)/scale,.16,.012,.015)+line(trackX,soffit,trackX,top,'#547887',3);
    s+=line(startX,startY,endX,endY,'#c98131',4);
    s+=dim(startX-5,startY+17,endX-5,endY+17,'L = 1.00 m',(startX+endX)/2-13,(startY+endY)/2+39);
    s+=dim(endX,trackBottom+58,trackX,trackBottom+58,'D = 0.265 m',(endX+trackX)/2,trackBottom+80);
    s+=line(startX,startY,startX+100,startY,'#99b0ba',1,'4 3')+text(startX+78,startY+18,'23°','middle',13);
    s+=text(442,126,'工字检修轨','start',14)+text(442,147,'本图轨高未标尺寸','start',11,'#607d8d');
    s+=text(310,301,'桥中线一侧 ←　内侧斜板紧邻轨道；D是水平间距，不是梁高。','middle',12);
    return svg(620,323,'2015表2方案7局部构造：一米长导流板与底板夹角23度，轨道内侧水平间距0.265米',s);
  }
  function noseDetail(){
    let s=polygon([[40,42],[90,42],[172,105],[90,166],[40,166]],'#e3edf2');
    s+=line(172,105,322,105,'#c98131',4)+dim(172,86,322,86,'L = 1.25 m');
    s+=text(344,100,'风嘴位置的水平分流板','start',14)+text(344,123,'方案14：间隙 D = 0','start',13)+text(344,148,'不是下面那片23°轨道导流板','start',12,'#607d8d');
    s+=text(310,191,'局部形状示意；所标L和D来自2015表2，不表示普遍最优尺寸。','middle',11,'#607d8d');
    return svg(620,212,'2015风嘴分流板局部对照：紧贴风嘴的1.25米水平板',s);
  }
  const styles=`<style>.section-reference{color:#294b60;font-size:14px;line-height:1.65}.section-reference h4{font-size:16px;margin:0 0 8px}.section-reference p{margin:9px 0}.section-reference .ref-card{border:1px solid #dce7eb;background:#f7fafb;padding:14px;border-radius:12px;margin:12px 0}.section-reference .ref-tag{color:#9b6325;font-size:12px;font-weight:700}.section-reference .ref-caution{border-left:3px solid #d69a49;padding:10px 12px;background:#fff8ed}.section-reference a{color:#176d9a}.section-reference .ref-zoom{overflow-x:auto;-webkit-overflow-scrolling:touch}.section-reference .ref-zoom svg{min-width:420px}.section-reference .ref-help{font-size:12px;color:#607d8d}.section-reference summary{cursor:pointer;font-weight:600}@media(max-width:600px){.section-reference{font-size:14px}.section-reference .ref-card{padding:10px}.section-reference .ref-zoom{margin:0 -4px}.section-reference .ref-overview svg{min-width:350px}.section-reference .ref-overview{overflow-x:auto}}</style>`;
  function render(shape){
    if(!['guide','rail'].includes(shape))return '';
    const guide=shape==='guide';
    let s=styles+`<div class="section-reference" data-reference-version="${VERSION}"><p class="ref-tag">构造参考 · 与下方“放大构件数值示教”分开</p>`;
    if(guide){
      s+=`<article class="ref-card"><h4>梁底轨道导流板：存在，但尺寸比旧图小</h4><div class="ref-overview">${overview('guide')}</div><p>2015年桥例全宽42 m、梁高3.5 m。这里选表2方案7：导流板长1.0 m、夹角23°、水平板—轨间距0.265 m。板厚和本桥轨道高度没有从其他桥例补入。</p><details open><summary>放大看内侧斜板的位置</summary><p class="ref-help">手机可横向滑动详图。标注尺寸可核对；未标轨高仅为符号化示意。</p><div class="ref-zoom">${guideDetail()}</div></details><p>${link(sources.guide2015)} · <a href="${sources.guide2015.image}" target="_blank" rel="noopener noreferrer">核对表2内侧板原图 ↗</a></p></article>`;
      s+=`<article class="ref-card"><h4>别混淆：风嘴分流板在箱梁外缘</h4><div class="ref-zoom">${noseDetail()}</div><p>该桥试验中，梁底轨道板改善有限；紧贴风嘴的宽分流板更有效。这是特定断面和迎角下的结果，不能把“加导流板”设成固定减振率。</p><p><a href="${sources.guide2015.noseImage}" target="_blank" rel="noopener noreferrer">核对风嘴板原图 ↗</a></p></article>`;
    }else{
      s+=`<article class="ref-card"><h4>真实尺度：检修轨道是梁底很小的构件</h4><div class="ref-overview">${overview('rail')}</div><p>这张独立参考图来自2023年桥例：梁宽39.6 m、梁高3.0 m，轨道高320 mm、宽130 mm、腹板10 mm。图中1 m是轨道离底板外缘的横向距离，不是竖向悬挂高度。</p><details open><summary>局部放大：工字轨与安装座</summary><p class="ref-help">手机可横向滑动详图。安装座与翼缘细部仅示意。</p><div class="ref-zoom">${railDetail()}</div></details><p>${link(sources.rail2023)} · <a href="${sources.rail2023.image}" target="_blank" rel="noopener noreferrer">核对图2原图 ↗</a></p></article>`;
    }
    s+=`<p class="ref-caution">当前手机CFD网格每个梁高只有12格，不能解析10 mm腹板或真实薄板。上图用于辨认构造与尺寸；若开启放大构件数值示教，求解的是另一个被放大的教学几何。它的CL、CD或位移增大，不足以判定真实导流板方案变差。</p></div>`;
    return s;
  }
  const api={VERSION,sources,records,render,overview,railDetail,guideDetail,noseDetail};root.BridgeSectionReference=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
