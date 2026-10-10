/**
 * Reference Vistas: hand-made examples that set the quality bar for model output and double as the
 * stub provider's output. Each is a single HTML document with a manifest header comment, inline CSS/JS,
 * the shared stage runtime and the bridge shim ({{SHIM}} is inlined by the composer).
 */
import { STAGE_CSS, STAGE_JS } from './stage';

export interface Reference { id: string; keywords: string[]; html: string }

const head = (title: string, extraCss: string) => `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${title}</title>
<style>${STAGE_CSS}${extraCss}</style>{{SHIM}}</head>`;

// 1 — Motion graphics: kinetic typography + animated SVG causal chain. 24s, 3 scenes.
const MOTION = `<!-- campsite:manifest ${JSON.stringify({ title: 'AI 데이터센터, 전력이 먼저다', summary: '전력 공급 → 건설 → 서버 설치 → 반도체 수요로 이어지는 병목의 인과를 한 장면씩 따라갑니다.', durationHintMs: 24000, aspect: '9:16', features: ['motion'], scenes: [{ id: 'intro', label: '한 줄 요약', atMs: 0 }, { id: 'chain', label: '인과 사슬', atMs: 6000 }, { id: 'outlook', label: '전망', atMs: 17000 }], captions: [{ atMs: 0, text: '전력이 먼저다' }, { atMs: 6000, text: '전력 → 건설 → 서버 → 반도체' }, { atMs: 17000, text: '병목은 2027년까지 이어진다' }], sources: [{ label: 'IEA Electricity 2026' }, { label: 'Uptime Institute 2026 Survey' }] })} -->
${head('AI 데이터센터, 전력이 먼저다', String.raw`
.bg{position:absolute;inset:0;background:radial-gradient(900px 700px at 20% 15%,var(--sky),transparent 60%),radial-gradient(800px 600px at 85% 90%,var(--butter),transparent 60%)}
.intro .h1{position:absolute;left:72px;top:520px;width:940px;animation-delay:.2s}
.intro .p{position:absolute;left:72px;top:900px;width:900px;animation-delay:.9s}
.big{position:absolute;left:72px;top:1240px;font-size:260px;font-weight:800;letter-spacing:-.06em;line-height:1;animation:rise 1s var(--ease) both;animation-delay:1.5s}
.big small{font-size:60px;letter-spacing:0;font-weight:600;color:var(--muted);margin-left:16px}
.chain .h2{position:absolute;left:72px;top:160px;width:940px}
.node{position:absolute;width:300px;height:300px;border-radius:50%;display:grid;place-items:center;font-size:40px;font-weight:650;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.08);animation:rise .8s var(--ease) both}
.node.a{left:90px;top:420px;background:var(--sky)}
.node.b{left:690px;top:720px;background:var(--butter)}
.node.c{left:90px;top:1020px;background:var(--lavender)}
.node.d{left:690px;top:1320px;background:var(--charcoal);color:#fff}
svg.links{position:absolute;inset:0;width:1080px;height:1920px}
svg.links path{fill:none;stroke:var(--charcoal);stroke-width:10;stroke-linecap:round;stroke-dasharray:900;stroke-dashoffset:900;animation:draw 1.2s var(--ease) both}
.outlook .h2{position:absolute;left:72px;top:220px;width:940px}
.bars{position:absolute;left:72px;top:520px;width:936px;height:900px;display:flex;align-items:flex-end;gap:40px}
.bar{flex:1;background:var(--charcoal);border-radius:24px 24px 8px 8px;transform-origin:bottom;animation:grow 1.2s var(--ease) both;position:relative}
.bar i{position:absolute;left:0;right:0;top:-60px;text-align:center;font-style:normal;font-size:30px;color:var(--muted)}
.bar.y{background:var(--sky)}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
`)}
<body><div class="stage-fit"><div class="stage"><div id="master" style="position:absolute;width:1px;height:1px;opacity:0;animation:fade 24s linear both"></div><div class="bg"></div>
<section class="scene intro" data-scene="intro" data-at="0" style="animation-delay:0s">
  <h1 class="h1 rise">AI 데이터센터는<br>칩보다 <em>전력</em>이 먼저 막힙니다.</h1>
  <p class="p rise">GPU는 주문하면 오지만, 변전소는 주문해도 4년이 걸립니다.</p>
  <div class="big">4<small>년 · 변전소 리드타임</small></div>
  <div class="caption rise" style="animation-delay:2s">전력이 먼저다</div>
</section>
<section class="scene chain" data-scene="chain" data-at="6000" style="animation-delay:6s">
  <h2 class="h2 rise" style="animation-delay:6.1s">하나가 늦으면 모두가 늦습니다</h2>
  <svg class="links" viewBox="0 0 1080 1920"><path d="M390 570 C 600 570, 700 760, 760 820" style="animation-delay:7.2s"/><path d="M780 1020 C 700 1100, 450 1120, 330 1180" style="animation-delay:8.6s"/><path d="M330 1320 C 450 1400, 700 1420, 780 1470" style="animation-delay:10s"/></svg>
  <div class="node a" style="animation-delay:6.6s">전력</div>
  <div class="node b" style="animation-delay:8s">건설</div>
  <div class="node c" style="animation-delay:9.4s">서버 설치</div>
  <div class="node d" style="animation-delay:10.8s">반도체 수요</div>
  <div class="caption rise" style="animation-delay:11.5s">전력 → 건설 → 서버 → 반도체. 앞 단계의 지연이 뒤 단계의 수요 시점을 밀어냅니다.</div>
</section>
<section class="scene outlook" data-scene="outlook" data-at="17000" style="animation-delay:17s">
  <h2 class="h2 rise" style="animation-delay:17.1s">전력 대기열은 2027년까지 길어집니다</h2>
  <div class="bars">
    <div class="bar" style="height:30%;animation-delay:17.6s"><i>2024</i></div>
    <div class="bar" style="height:48%;animation-delay:17.9s"><i>2025</i></div>
    <div class="bar y" style="height:70%;animation-delay:18.2s"><i>2026</i></div>
    <div class="bar y" style="height:92%;animation-delay:18.5s"><i>2027</i></div>
  </div>
  <div class="caption rise" style="animation-delay:19.5s">신규 데이터센터 전력 연결 대기(상대치). 병목은 2027년까지 이어집니다.</div>
  <div class="src rise" style="animation-delay:20s">IEA Electricity 2026 · Uptime Institute 2026</div>
</section>
</div></div><script>${STAGE_JS}</script></body></html>`;

// 2 — Interactive 3D: CSS preserve-3d ring of share bars; drag to rotate, auto-spin, depth labels. 20s.
const THREE_D = `<!-- campsite:manifest ${JSON.stringify({ title: 'HBM 시장, 세 개의 기둥', summary: '2026년 HBM 시장 점유율을 3D 링으로 돌려보며 공급사별 위치와 거리를 체감합니다.', durationHintMs: 20000, aspect: '9:16', features: ['motion', '3d', 'interactive'], scenes: [{ id: 'ring', label: '3D 링', atMs: 0 }, { id: 'gap', label: '격차', atMs: 9000 }], captions: [{ atMs: 0, text: '끌어서 돌려 보세요' }, { atMs: 9000, text: '1위와 3위의 격차' }], sources: [{ label: 'TrendForce HBM 2026Q2' }] })} -->
${head('HBM 시장, 세 개의 기둥', String.raw`
.title{position:absolute;left:72px;top:150px;width:940px}
.hint{position:absolute;left:72px;top:330px;width:900px}
.world{position:absolute;left:0;top:520px;width:1080px;height:1000px;perspective:1800px;touch-action:none}
.ring{position:absolute;left:540px;top:500px;width:0;height:0;transform-style:preserve-3d;transform:rotateX(-18deg) rotateY(0deg)}
.pillar{position:absolute;left:-90px;bottom:0;width:180px;transform-style:preserve-3d;transform-origin:bottom;animation:grow 1.4s var(--ease) both}
.pillar .face{position:absolute;left:0;bottom:0;width:180px;height:100%;border-radius:28px 28px 10px 10px}
.pillar .lbl{position:absolute;left:-60px;right:-60px;bottom:-110px;text-align:center;font-size:34px;font-weight:650;transform:translateZ(60px)}
.pillar .val{position:absolute;left:0;right:0;top:-70px;text-align:center;font-size:44px;font-weight:700}
.floor{position:absolute;left:-440px;top:-440px;width:880px;height:880px;border-radius:50%;background:radial-gradient(circle,rgba(31,31,31,.08),rgba(31,31,31,0) 70%);transform:rotateX(90deg) translateZ(-2px)}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
.gap{position:absolute;left:72px;right:72px;top:1560px;font-size:40px;line-height:1.35;color:var(--muted);animation:rise 1s var(--ease) both;animation-delay:9s}
.gap b{color:var(--ink);font-size:64px}
`)}
<body><div class="stage-fit"><div class="stage"><div id="master" style="position:absolute;width:1px;height:1px;opacity:0;animation:fade 20s linear both"></div>
<section class="scene" data-scene="ring" data-at="0" style="animation-delay:0s">
  <h1 class="h2 title rise">HBM 시장은 세 개의 기둥 위에 서 있습니다</h1>
  <p class="p hint rise" style="animation-delay:.6s">끌어서 돌려 보세요. 높이가 2026년 점유율입니다.</p>
  <div class="world"><div class="ring" id="ring"><div class="floor"></div>
    <div class="pillar" style="height:560px;transform:rotateY(0deg) translateZ(320px);animation-delay:.8s"><div class="face" style="background:var(--charcoal)"></div><div class="val">53%</div><div class="lbl">SK하이닉스</div></div>
    <div class="pillar" style="height:380px;transform:rotateY(120deg) translateZ(320px);animation-delay:1.1s"><div class="face" style="background:var(--sky)"></div><div class="val">36%</div><div class="lbl">삼성전자</div></div>
    <div class="pillar" style="height:120px;transform:rotateY(240deg) translateZ(320px);animation-delay:1.4s"><div class="face" style="background:var(--butter)"></div><div class="val">11%</div><div class="lbl">마이크론</div></div>
  </div></div>
  <div class="caption rise" style="animation-delay:2s">점유율은 출하량 기준 추정치입니다.</div>
</section>
<section class="scene" data-scene="gap" data-at="9000" style="animation-delay:9s;pointer-events:none">
  <div class="gap">1위와 3위의 격차 <b>4.8배</b>. 3위의 추격은 2027년 HBM4 양산에 달려 있습니다.</div>
  <div class="src rise" style="animation-delay:10s">TrendForce HBM 2026Q2</div>
</section>
</div></div><script>${STAGE_JS}</script>
<script>
(function(){
  var ring=document.getElementById('ring'),world=document.querySelector('.world');
  var yaw=0,vel=0.25,dragging=false,lastX=0,auto=true;
  function render(){ring.style.transform='rotateX(-18deg) rotateY('+yaw+'deg)';}
  function frame(){ if(!dragging&&auto){yaw=(yaw+vel)%360;} render(); requestAnimationFrame(frame);} requestAnimationFrame(frame);
  world.addEventListener('pointerdown',function(e){dragging=true;lastX=e.clientX;world.setPointerCapture(e.pointerId);});
  world.addEventListener('pointermove',function(e){if(!dragging)return;var dx=e.clientX-lastX;lastX=e.clientX;yaw=(yaw+dx*0.6)%360;});
  world.addEventListener('pointerup',function(){dragging=false; if(window.Campsite)Campsite.state({yaw:Math.round(yaw)});});
  window.addEventListener('load',function(){ var prevRestore=Campsite.onRestore; Campsite.onRestore=function(s){ if(s&&typeof s.yaw==='number'){yaw=s.yaw;} if(prevRestore)prevRestore(s); }; var prevPause=Campsite.onPause; Campsite.onPause=function(){auto=false; document.getAnimations().forEach(function(a){a.pause();});}; Campsite.onPlay=function(){auto=true; document.getAnimations().forEach(function(a){a.play();});}; });
})();
</script></body></html>`;

// 3 — Interactive canvas simulation with a slider whose value is portable semantic state. 20s.
const INTERACTIVE = `<!-- campsite:manifest ${JSON.stringify({ title: '이번 주 거시경제 한 장', summary: '금리 경로를 직접 움직여 보며 2026년 성장·물가 조합이 어떻게 바뀌는지 시뮬레이션합니다.', durationHintMs: 20000, aspect: '9:16', features: ['motion', 'interactive'], scenes: [{ id: 'now', label: '현재', atMs: 0 }, { id: 'sim', label: '시뮬레이션', atMs: 5000 }], captions: [{ atMs: 0, text: '세 숫자로 읽는 이번 주' }, { atMs: 5000, text: '슬라이더를 움직여 보세요' }], sources: [{ label: 'FOMC Statement 2026-09' }, { label: 'BOK 통화정책방향 2026-10' }] })} -->
${head('이번 주 거시경제 한 장', String.raw`
.kpis{position:absolute;left:72px;top:420px;width:936px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:28px}
.kpi{background:#fff;border-radius:36px;padding:40px 32px;box-shadow:0 16px 50px rgba(0,0,0,.06);animation:rise .9s var(--ease) both}
.kpi b{display:block;font-size:72px;letter-spacing:-.04em}
.kpi span{font-size:26px;color:var(--muted)}
canvas{position:absolute;left:72px;top:840px;width:936px;height:620px;border-radius:40px;background:#fff;box-shadow:0 16px 50px rgba(0,0,0,.06)}
.ctl{position:absolute;left:72px;right:72px;top:1500px;display:flex;align-items:center;gap:28px;font-size:34px}
.ctl input{flex:1;height:14px;accent-color:var(--charcoal)}
.ctl output{min-width:200px;text-align:right;font-weight:700}
.title{position:absolute;left:72px;top:160px;width:936px}
`)}
<body><div class="stage-fit"><div class="stage"><div id="master" style="position:absolute;width:1px;height:1px;opacity:0;animation:fade 20s linear both"></div>
<section class="scene" data-scene="now" data-at="0" style="animation-delay:0s">
  <h1 class="h2 title rise">세 숫자로 읽는 이번 주</h1>
  <div class="kpis"><div class="kpi" style="animation-delay:.3s"><b>3.50%</b><span>기준금리</span></div><div class="kpi" style="animation-delay:.6s"><b>2.1%</b><span>물가(전년비)</span></div><div class="kpi" style="animation-delay:.9s"><b>1.8%</b><span>성장 전망</span></div></div>
</section>
<section class="scene" data-scene="sim" data-at="5000" style="animation-delay:5s;pointer-events:none">
  <canvas id="c" width="1872" height="1240"></canvas>
  <div class="ctl" style="pointer-events:auto"><span>금리 경로</span><input id="rate" type="range" min="200" max="500" value="350" step="25"><output id="out">3.50%</output></div>
  <div class="caption rise" style="animation-delay:5.5s">슬라이더를 움직이면 2027년 성장·물가 조합이 바뀝니다. 단순화된 교육용 모형입니다.</div>
  <div class="src rise" style="animation-delay:6s">FOMC 2026-09 · BOK 2026-10</div>
</section>
</div></div><script>${STAGE_JS}</script>
<script>
(function(){
  var cv=document.getElementById('c'),ctx=cv.getContext('2d'),slider=document.getElementById('rate'),out=document.getElementById('out');
  var rate=350,t0=performance.now(),paused=false,pauseAt=0;
  function model(r){var dr=(r-350)/100;return {growth:1.8-0.9*dr,infl:2.1-0.6*dr};}
  function draw(now){
    var el=paused?pauseAt:(now-t0);
    ctx.clearRect(0,0,cv.width,cv.height);
    var w=cv.width,h=cv.height,pad=140;
    ctx.strokeStyle='#D7D7D2';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(pad,h-pad);ctx.lineTo(w-pad,h-pad);ctx.moveTo(pad,pad);ctx.lineTo(pad,h-pad);ctx.stroke();
    ctx.fillStyle='#6b6b6b';ctx.font='40px sans-serif';ctx.fillText('성장(%)',w-pad-150,h-pad+70);ctx.save();ctx.translate(pad-80,pad+160);ctx.rotate(-Math.PI/2);ctx.fillText('물가(%)',0,0);ctx.restore();
    var m=model(rate),pulse=1+0.06*Math.sin(el/400);
    var x=pad+((m.growth+1)/4)*(w-2*pad),y=h-pad-((m.infl)/4)*(h-2*pad);
    ctx.beginPath();ctx.arc(x,y,70*pulse,0,Math.PI*2);ctx.fillStyle='#1F1F1F';ctx.fill();
    ctx.fillStyle='#1F1F1F';ctx.font='bold 44px sans-serif';ctx.fillText('2027 · 성장 '+m.growth.toFixed(1)+'% / 물가 '+m.infl.toFixed(1)+'%',pad+40,pad+60);
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
  slider.addEventListener('input',function(){rate=+slider.value;out.textContent=(rate/100).toFixed(2)+'%';});
  slider.addEventListener('change',function(){if(window.Campsite)Campsite.state({rate:rate});});
  window.addEventListener('load',function(){ var prev=Campsite.onRestore; Campsite.onRestore=function(s){ if(s&&typeof s.rate==='number'){rate=s.rate;slider.value=String(rate);out.textContent=(rate/100).toFixed(2)+'%';} if(prev)prev(s); }; Campsite.onPause=function(){paused=true;pauseAt=performance.now()-t0;document.getAnimations().forEach(function(a){a.pause();});}; Campsite.onPlay=function(){if(paused){t0=performance.now()-pauseAt;paused=false;}document.getAnimations().forEach(function(a){a.play();});}; });
})();
</script></body></html>`;

export const REFERENCES: Reference[] = [
  { id: 'ref-motion', keywords: ['전력', '데이터센터', 'power', 'datacenter', 'energy', '인프라'], html: MOTION },
  { id: 'ref-3d', keywords: ['hbm', '시장', 'market', '점유율', '3d', '반도체', 'memory'], html: THREE_D },
  { id: 'ref-interactive', keywords: ['거시', '금리', 'macro', 'rate', '경제', 'economy', '시뮬레이션'], html: INTERACTIVE },
];

export function pickReference(prompt: string): Reference {
  const p = prompt.toLowerCase();
  let best = REFERENCES[0], score = -1;
  for (const r of REFERENCES) { const s = r.keywords.filter(k => p.includes(k)).length; if (s > score) { best = r; score = s; } }
  return best;
}
