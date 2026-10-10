/** Shared stage CSS + scene runtime used by reference Vistas (and offered to the model in the system prompt). */
export const STAGE_CSS = String.raw`
:root{--snow:#FAF9F6;--charcoal:#1F1F1F;--stone:#D7D7D2;--butter:#FFE7C7;--sky:#D6E6FF;--lavender:#E9D6FF;--ink:#1F1F1F;--muted:#6b6b6b;--ease:cubic-bezier(.2,.8,.2,1);--font:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR","Segoe UI",sans-serif}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:100%;height:100%;overflow:hidden;background:var(--snow);color:var(--ink);font-family:var(--font);-webkit-font-smoothing:antialiased}
.stage-fit{position:fixed;inset:0;overflow:hidden}
.stage{position:absolute;left:50%;top:50%;width:1080px;height:1920px;transform-origin:center;overflow:hidden;background:var(--snow)}
.scene{position:absolute;inset:0;opacity:0;animation:scene-show 1ms linear both}
@keyframes scene-show{to{opacity:1}}
.h1{font-size:92px;line-height:1.08;letter-spacing:-.04em;font-weight:700}
.h2{font-size:56px;line-height:1.15;letter-spacing:-.03em;font-weight:650}
.p{font-size:34px;line-height:1.45;color:var(--muted)}
.caption{position:absolute;left:72px;right:72px;bottom:120px;font-size:30px;line-height:1.4;color:var(--muted)}
.src{position:absolute;left:72px;bottom:56px;font-size:22px;letter-spacing:.08em;color:#9a9a9a;text-transform:uppercase}
.rise{animation:rise .9s var(--ease) both}
@keyframes rise{from{opacity:0;transform:translateY(28px)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0}to{opacity:1}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes spin{to{transform:rotateY(360deg)}}
`;

/** Scales the 1080×1920 stage to the viewport and drives scenes from one master animation. */
export const STAGE_JS = String.raw`
(function(){
  var stage=document.querySelector('.stage');
  function fit(){var w=innerWidth,h=innerHeight;var s=Math.min(w/1080,h/1920);stage.style.transform='translate(-50%,-50%) scale('+s+')';}
  addEventListener('resize',fit);fit();
  var scenes=Array.prototype.slice.call(document.querySelectorAll('.scene')).map(function(el){return {id:el.dataset.scene,atMs:+el.dataset.at||0,el:el};}).sort(function(a,b){return a.atMs-b.atMs;});
  var master=document.getElementById('master');
  var current=null;
  function sceneAt(t){var s=scenes[0];for(var i=0;i<scenes.length;i++){if(t>=scenes[i].atMs)s=scenes[i];}return s;}
  function tick(){
    if(master){var a=master.getAnimations()[0];if(a){var t=Number(a.currentTime)||0;var s=sceneAt(t);if(s&&s!==current){current=s;window.Campsite&&Campsite.scene(s.id,s.atMs);window.Campsite&&Campsite.state({scene:s.id,atMs:Math.round(t)});}}}
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  window.addEventListener('load',function(){ if(window.Campsite){ Campsite.onScene=function(id){var s=scenes.filter(function(x){return x.id===id;})[0];if(s){Campsite.seek(s.atMs);current=s;Campsite.scene(s.id,s.atMs);Campsite.state({scene:s.id,atMs:s.atMs});}}; Campsite.onRestore=function(state){ if(state&&typeof state.atMs==='number'){Campsite.seek(state.atMs);} else if(state&&typeof state.scene==='string'){Campsite.onScene(state.scene);} }; } });
})();
`;
