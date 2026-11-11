// Builds a standalone, Netlify-ready HTML deck from ai-harms-deck/project.
import fs from 'node:fs';
import path from 'node:path';

const [, , projectDir, outDir] = process.argv;
const deck = JSON.parse(fs.readFileSync(path.join(projectDir, 'deck.json'), 'utf8'));

const ICONS = {
  Search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  Lightbulb: '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/>',
  Lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  Globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  Warning: '<path d="M12 3 2 21h20L12 3z"/><path d="M12 10v5M12 18h.01"/>',
  Users: '<circle cx="9" cy="8" r="4"/><path d="M2 21v-1a6 6 0 0 1 12 0v1M16 4a4 4 0 0 1 0 8M22 21v-1a6 6 0 0 0-4-5.6"/>',
  Book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
  Database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};

function convert(html) {
  html = html.replace(/<x-icon name="(\w+)" style="([^"]*)"><\/x-icon>/g, (m, name, style) => {
    if (!ICONS[name]) throw new Error('missing icon ' + name);
    return `<svg aria-hidden="true" style="${style};flex-shrink:0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</svg>`;
  });
  html = html.replace(/<x-connector([^>]*)><\/x-connector>/g, (m, attrs) => {
    const a = (k) => (attrs.match(new RegExp(`${k}="([^"]*)"`)) || [])[1];
    const x1 = +a('x1'), y1 = +a('y1'), x2 = +a('x2');
    const build = a('data-build-in');
    const color = (a('style').match(/color:([^;]+)/) || [])[1] || '#000';
    const w = x2 - x1;
    return `<svg aria-hidden="true"${build ? ` data-build-in="${build}"` : ''} style="position:absolute;left:${x1}px;top:${y1 - 12}px;width:${w}px;height:24px" viewBox="0 0 ${w} 24"><line x1="0" y1="12" x2="${w - 14}" y2="12" stroke="${color}" stroke-width="4"/><path d="M${w - 18} 3 L${w} 12 L${w - 18} 21 z" fill="${color}"/></svg>`;
  });
  return html;
}

const sections = deck.order.map((id) => convert(fs.readFileSync(path.join(projectDir, 'slides', id + '.html'), 'utf8').trim()));
const fontLinks = Object.values(deck.faces).map((f) => `<link rel="stylesheet" href="${f.href}">`).join('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(deck.title)}</title>
<meta name="description" content="Reporting tips for African journalists through the lens of HumAngle / Pulitzer Center's Drone Wars investigations. By Ibrahim Adeyemi, HumAngle Media.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fontLinks}
<style>
*{box-sizing:border-box}
html,body{margin:0;height:100%;background:#0d1015;overflow:hidden;font-family:'Public Sans',Arial,sans-serif}
h1,h2,h3,p,ul,ol{margin:0}
#viewport{position:fixed;inset:0 0 56px 0;display:flex;align-items:center;justify-content:center}
#stage{width:1920px;height:1080px;position:relative;flex:none;transform-origin:center center;box-shadow:0 20px 60px rgba(0,0,0,.5)}
#stage>section{position:absolute;inset:0;width:1920px;height:1080px;overflow:hidden;opacity:0;visibility:hidden;transition:opacity .45s ease,visibility .45s}
#stage>section.active{opacity:1;visibility:visible}
section aside{display:none}
[data-build-in]{transition:opacity .5s ease,transform .5s ease}
[data-build-in].pending{opacity:0!important}
[data-build-in^="rise"].pending{transform:translateY(40px)}
[data-build-in^="pop"].pending{transform:scale(.85)}
#bar{position:fixed;left:0;right:0;bottom:0;height:56px;display:flex;align-items:center;gap:8px;padding:0 16px;background:#15191F;color:#C9CED6;font-size:14px;border-top:1px solid #2a3039}
#bar button{background:#232933;color:#F5F1E8;border:1px solid #3A414C;border-radius:8px;height:36px;min-width:40px;padding:0 12px;font:inherit;cursor:pointer}
#bar button:hover,#bar button:focus-visible{background:#C8641E;border-color:#C8641E;color:#15191F;outline:none}
#count{min-width:64px;text-align:center;font-variant-numeric:tabular-nums}
#title{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;opacity:.8}
#progress{position:fixed;left:0;bottom:56px;height:3px;background:#C8641E;transition:width .3s}
#notes{position:fixed;right:16px;bottom:72px;width:min(440px,calc(100% - 32px));max-height:45vh;overflow:auto;background:#F5F1E8;color:#15191F;border-radius:12px;padding:20px;font-size:16px;line-height:1.55;box-shadow:0 10px 40px rgba(0,0,0,.4);display:none}
#notes.open{display:block}
#notes h4{margin:0 0 8px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#A44F14}
#overview{position:fixed;inset:0 0 56px 0;background:#0d1015f2;overflow:auto;padding:24px;display:none;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px;align-content:start}
#overview.open{display:grid}
#overview button{all:unset;cursor:pointer;color:#C9CED6;font-size:14px;display:flex;flex-direction:column;gap:6px}
#overview .thumb{aspect-ratio:16/9;width:100%;overflow:hidden;position:relative;border-radius:6px;border:2px solid transparent}
#overview button.current .thumb,#overview button:hover .thumb{border-color:#C8641E}
#overview .thumb section{position:absolute;left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;pointer-events:none}
#overview .thumb [data-build-in]{opacity:1!important;transform:none!important}
@media (max-width:600px){#title,.wide{display:none}}
</style>
</head>
<body>
<div id="viewport"><div id="stage">
${sections.join('\n')}
</div></div>
<div id="progress"></div>
<div id="notes" role="region" aria-label="Speaker notes"><h4>Speaker notes</h4><div id="notesText"></div></div>
<div id="overview" role="dialog" aria-label="All slides"></div>
<nav id="bar" aria-label="Slide controls">
<button id="prev" aria-label="Previous">&#8592;</button>
<span id="count" aria-live="polite"></span>
<button id="next" aria-label="Next">&#8594;</button>
<span id="title">${esc(deck.title)}</span>
<button id="gridBtn" title="All slides (O)">Slides</button>
<button id="notesBtn" title="Speaker notes (N)" class="wide">Notes</button>
<button id="fsBtn" title="Full screen (F)">Present</button>
</nav>
<script>
(function(){
  var stage=document.getElementById('stage');
  var slides=[].slice.call(stage.children);
  var cur=0, step=0;
  function builds(s){return [].slice.call(s.querySelectorAll('[data-build-in]')).sort(function(a,b){
    var n=function(e){var m=e.getAttribute('data-build-in').match(/\\d+/);return m?+m[0]:0};return n(a)-n(b);});}
  function fit(){var vp=document.getElementById('viewport');var s=Math.min(vp.clientWidth/1920,vp.clientHeight/1080);stage.style.transform='scale('+s+')';}
  function render(){
    slides.forEach(function(s,i){s.classList.toggle('active',i===cur);s.setAttribute('aria-hidden',i!==cur);});
    builds(slides[cur]).forEach(function(e,i){e.classList.toggle('pending',i>=step);});
    document.getElementById('count').textContent=(cur+1)+' / '+slides.length;
    document.getElementById('progress').style.width=((cur+1)/slides.length*100)+'%';
    var a=slides[cur].querySelector('aside');document.getElementById('notesText').textContent=a?a.textContent:'';
    if(location.hash!=='#slide-'+(cur+1))history.replaceState(null,'','#slide-'+(cur+1));
    [].forEach.call(document.querySelectorAll('#overview button'),function(b,i){b.classList.toggle('current',i===cur);});
  }
  function go(i,showAll){if(i<0||i>=slides.length)return;cur=i;step=showAll?builds(slides[i]).length:0;render();}
  function next(){if(step<builds(slides[cur]).length){step++;render();}else go(cur+1);}
  function prev(){if(step>0){step--;render();}else go(cur-1,true);}
  // overview
  var ov=document.getElementById('overview');
  slides.forEach(function(s,i){var b=document.createElement('button');var t=document.createElement('div');t.className='thumb';
    var c=s.cloneNode(true);c.removeAttribute('id');c.className='';c.style.opacity=1;c.style.visibility='visible';t.appendChild(c);
    b.appendChild(t);var l=document.createElement('span');var h=s.querySelector('h1,h2');l.textContent=(i+1)+'. '+(h?h.textContent:'');b.appendChild(l);
    b.onclick=function(){go(i,false);ov.classList.remove('open');};ov.appendChild(b);});
  function sizeThumbs(){[].forEach.call(ov.querySelectorAll('.thumb'),function(t){t.firstChild.style.transform='scale('+(t.clientWidth/1920)+')';});}
  function toggleOv(){ov.classList.toggle('open');sizeThumbs();}
  function toggleNotes(){document.getElementById('notes').classList.toggle('open');}
  function fs(){if(!document.fullscreenElement){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}else{document.exitFullscreen();}}
  document.getElementById('next').onclick=next;document.getElementById('prev').onclick=prev;
  document.getElementById('gridBtn').onclick=toggleOv;document.getElementById('notesBtn').onclick=toggleNotes;document.getElementById('fsBtn').onclick=fs;
  document.getElementById('viewport').addEventListener('click',function(e){if(e.clientX<window.innerWidth/3)prev();else next();});
  document.addEventListener('keydown',function(e){
    if(e.metaKey||e.ctrlKey||e.altKey)return;
    var k=e.key;
    if(k==='ArrowRight'||k===' '||k==='PageDown'){e.preventDefault();next();}
    else if(k==='ArrowLeft'||k==='PageUp'){e.preventDefault();prev();}
    else if(k==='Home')go(0);else if(k==='End')go(slides.length-1,true);
    else if(k==='n'||k==='N')toggleNotes();else if(k==='f'||k==='F')fs();
    else if(k==='o'||k==='O')toggleOv();else if(k==='Escape')ov.classList.remove('open');
  });
  var tx=null;document.addEventListener('touchstart',function(e){tx=e.touches[0].clientX;},{passive:true});
  document.addEventListener('touchend',function(e){if(tx===null)return;var dx=e.changedTouches[0].clientX-tx;if(Math.abs(dx)>50){dx<0?next():prev();}tx=null;});
  window.addEventListener('resize',function(){fit();sizeThumbs();});
  var m=location.hash.match(/slide-(\\d+)/);cur=m?Math.min(Math.max(+m[1]-1,0),slides.length-1):0;
  fit();render();
})();
</script>
</body>
</html>
`;
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), page);
console.log('wrote', path.join(outDir, 'index.html'), page.length, 'bytes');
