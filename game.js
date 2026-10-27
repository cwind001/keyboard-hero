'use strict';
const $=id=>document.getElementById(id),canvas=$('game'),ctx=canvas.getContext('2d');
let practice=false,letterBag=[],lastLetter='',nextBossAt=0;
const SPAWN_END=270;
const defaultHintConfig={0:'full',1:'full',2:'first',3:'first',4:'edges',5:'hidden',6:'edges',7:'hidden'};
const difficultyPresets={easy:{full:92,edges:6,hidden:2},medium:{full:80,edges:15,hidden:5},hard:{full:60,edges:30,hidden:10}};
const difficultyNames={easy:'简单',medium:'中等',hard:'困难'};
let activeVocabulary=null,activeHintConfig={difficulty:'easy',weights:{...difficultyPresets.easy}},activeSource='builtin',previousWord='';
const builtinVocabulary=[{"text":"ant","meaning":"蚂蚁"},{"text":"bat","meaning":"蝙蝠"},{"text":"cat","meaning":"猫"},{"text":"dog","meaning":"狗"},{"text":"egg","meaning":"鸡蛋"},{"text":"fox","meaning":"狐狸"},{"text":"gem","meaning":"宝石"},{"text":"hat","meaning":"帽子"},{"text":"ice","meaning":"冰"},{"text":"joy","meaning":"欢乐"},{"text":"key","meaning":"钥匙"},{"text":"log","meaning":"木头"},{"text":"map","meaning":"地图"},{"text":"net","meaning":"网"},{"text":"owl","meaning":"猫头鹰"},{"text":"pig","meaning":"猪"},{"text":"red","meaning":"红色"},{"text":"sun","meaning":"太阳"},{"text":"tea","meaning":"茶"},{"text":"use","meaning":"使用"},{"text":"van","meaning":"货车"},{"text":"web","meaning":"网络"},{"text":"yak","meaning":"牦牛"},{"text":"zoo","meaning":"动物园"},{"text":"blue","meaning":"蓝色"},{"text":"cold","meaning":"寒冷"},{"text":"dawn","meaning":"黎明"},{"text":"fire","meaning":"火"},{"text":"glow","meaning":"光芒"},{"text":"home","meaning":"家"},{"text":"iron","meaning":"铁"},{"text":"jade","meaning":"玉"},{"text":"kite","meaning":"风筝"},{"text":"leaf","meaning":"叶子"},{"text":"moon","meaning":"月亮"},{"text":"nest","meaning":"鸟巢"},{"text":"open","meaning":"打开"},{"text":"pine","meaning":"松树"},{"text":"rain","meaning":"雨"},{"text":"star","meaning":"星星"},{"text":"tree","meaning":"树"},{"text":"unit","meaning":"单元"},{"text":"vine","meaning":"藤蔓"},{"text":"wind","meaning":"风"},{"text":"yarn","meaning":"纱线"},{"text":"zero","meaning":"零"},{"text":"anchor","meaning":"锚"},{"text":"bridge","meaning":"桥"},{"text":"castle","meaning":"城堡"},{"text":"dragon","meaning":"龙"},{"text":"energy","meaning":"能量"},{"text":"forest","meaning":"森林"},{"text":"garden","meaning":"花园"},{"text":"hammer","meaning":"锤子"},{"text":"island","meaning":"岛屿"},{"text":"jungle","meaning":"丛林"},{"text":"knight","meaning":"骑士"},{"text":"lantern","meaning":"灯笼"},{"text":"mirror","meaning":"镜子"},{"text":"nature","meaning":"自然"},{"text":"orange","meaning":"橙子"},{"text":"planet","meaning":"行星"},{"text":"quartz","meaning":"石英"},{"text":"rocket","meaning":"火箭"},{"text":"silver","meaning":"银"},{"text":"temple","meaning":"寺庙"},{"text":"velvet","meaning":"天鹅绒"},{"text":"winter","meaning":"冬天"},{"text":"yellow","meaning":"黄色"},{"text":"zephyr","meaning":"微风"}];
let W=900,H=650,running=false,paused=false,t=0,hp=5,score=0,kills=0,combo=0,maxCombo=0,keys=0,correct=0,enemies=[],particles=[],beams=[],locked=null,input='',spawnTimer=0,last=0,boss1=false,boss2=false,sound=true,audio,best=0,flash=0;
try{best=Number(localStorage.getItem('keySiegeBest'))||0}catch{}$('best').textContent='最高纪录 '+best;
const short='ant bat cat dog egg fox gem hat ice joy key log map net owl pig red sun tea use van web yak zoo blue cold dawn fire glow home iron jade kite leaf moon nest open pine rain star tree unit vine wind yarn zero'.split(' '),long='anchor bridge castle dragon energy forest garden hammer island jungle knight lantern mirror nature orange planet quartz rocket silver temple velvet winter yellow zephyr'.split(' ');
const defs=[['史莱姆','#91da71',13,1],['哥布林','#b9d96b',13,1],['疾跑怪','#f3b768',24,1],['飞行翼龙','#f1a46d',24,1],['钢铁守卫','#88c8e0',10,1],['暗影法师','#c09af5',12,3],['吸血蝙蝠','#f47c96',16,7],['九头怪','#edaa79',7,9]];
function word(big=false){
 if(practice){if(!letterBag.length)letterBag=$('range').value.split('').sort(()=>Math.random()-.5);let next=letterBag.pop();if(next===lastLetter&&letterBag.length){letterBag.unshift(next);next=letterBag.pop()}lastLetter=next;return next;}
 let pool=activeSource==='custom'&&activeVocabulary?activeVocabulary.map(w=>w.text):(big?long:short);
 if(activeSource==='custom'){const preferred=pool.filter(w=>big?answerFor(w).length>=6:answerFor(w).length<=5);if(preferred.length)pool=preferred;}
 const free=pool.filter(w=>!enemies.some(e=>e.word[0]===w[0]));if(free.length)pool=free;
 const fresh=pool.filter(w=>w!==previousWord);if(fresh.length)pool=fresh;
 previousWord=pool[Math.floor(Math.random()*pool.length)];return previousWord;
}
function meaningFor(text){return (activeVocabulary||builtinVocabulary).find(w=>w.text===text)?.meaning||''}
function randomHint(){if(practice)return 'full';const weights=activeHintConfig.weights;if(!weights)return null;let roll=Math.random()*100;for(const [hint,weight] of Object.entries(weights)){roll-=weight;if(roll<0)return hint;}return 'full';}
function assignWord(enemy,text){enemy.word=text;enemy.meaning=practice?'':meaningFor(text);enemy.hint=randomHint()}
function selectTarget(enemy,head=null){if(head&&!visibleHeads(enemy).includes(head))return;locked=enemy;input='';if(head){assignWord(enemy,head.text);enemy.headId=head.id;enemy.hint=head.hint;}hud();}
function hintFor(enemy,head=null){return practice?'full':(head?head.hint:enemy.hint)||activeHintConfig[enemy.type]||'full'}
function answerFor(text){return text.replace(/[^a-z]/gi,'').toLowerCase()}
function typedPrefix(text,count){let letters=0,end=0;for(const char of text){if(/[a-z]/i.test(char)){if(letters===count)break;letters++;}end++;}return text.slice(0,end);}
function hintText(text,progress='',mode='full'){
 if(practice)return text.toUpperCase();
 const total=answerFor(text).length;let index=0;
 return [...text].map(char=>{if(!/[a-z]/i.test(char))return char;const i=index++;return i<progress.length||mode==='full'||(mode==='first'&&i===0)||(mode==='edges'&&(i===0||i===total-1))?char:'_';}).join(mode==='full'?'':' ');
}
function canSpawn(type){
 if(practice)return type===0&&enemies.length===0;
 if(enemies.length>=9)return false;
 const fast=enemies.filter(e=>e.type===2||e.type===3).length;
 const elite=enemies.filter(e=>e.type===5).length;
 const bosses=enemies.filter(e=>e.type>=6).length;
 if(type>=6)return bosses===0&&fast<=1&&fast+elite<3&&t>=nextBossAt;
 if(type===5)return elite<1&&fast+elite+bosses<3;
 if(type===2||type===3)return fast<(bosses?1:2)&&fast+elite+bosses<3;
 return true;
}
function add(type){
 if(!canSpawn(type))return false;const w=word(type>=4);if(!w)return false;
 const angle=Math.random()*Math.PI*2,rad=Math.min(W,H)*.44;
 const heads=type===7?Array.from({length:9},(_,id)=>{const text=word(true);return {id,text,meaning:meaningFor(text),hint:randomHint()}}):null;
 const enemy={heads,type,x:W/2+Math.cos(angle)*rad,y:H/2+Math.sin(angle)*rad,parts:defs[type][3],angle,seed:Math.random()*6,progress:0};
 assignWord(enemy,heads?heads[0].text:w);if(heads){enemy.headId=heads[0].id;enemy.hint=heads[0].hint;}enemies.push(enemy);return true;
}
function knockBackEnemy(m){
 const dx=m.x-W/2,dy=m.y-H/2,d=Math.hypot(dx,dy);
 const ux=d>0?dx/d:Math.cos(m.angle),uy=d>0?dy/d:Math.sin(m.angle);
 const retreat=50*Math.min(W,H)/650;
 const edgeX=(W/2-50)/Math.max(Math.abs(ux),.001),edgeY=(H/2-110)/Math.max(Math.abs(uy),.001);
 const next=Math.max(d,Math.min(d+retreat,edgeX,edgeY));
 m.x=W/2+ux*next;m.y=H/2+uy*next;m.stagger=.3;
}
function tone(freq=440){if(!sound)return;try{audio??=new(window.AudioContext||window.webkitAudioContext)();audio.resume();let o=audio.createOscillator(),g=audio.createGain();o.connect(g);g.connect(audio.destination);o.frequency.value=freq;g.gain.setValueAtTime(.025,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.1);o.start();o.stop(audio.currentTime+.1)}catch{}}
function burst(x,y,color){for(let i=0;i<18;i++)particles.push({x,y,vx:(Math.random()-.5)*150,vy:(Math.random()-.5)*150,life:.7,color})}
function reset(){previousWord='';lastLetter='';running=true;paused=false;t=0;hp=5;score=kills=combo=maxCombo=keys=correct=0;enemies=[];particles=[];beams=[];locked=null;input='';spawnTimer=2;nextBossAt=0;letterBag=[];boss1=boss2=false;$('range').disabled=true;$('overlay').style.display='none';$('pause').textContent='暂停 Ⅱ';add(0);hud()}
function finish(win){persistResult(win);running=false;$('range').disabled=false;if(practice){$('overlay').style.display='flex';$('title').textContent=win?'练习完成，指尖更熟练了。':'休息一下，再练一轮。';$('message').innerHTML=`正确 ${correct} 次 · 准确率 ${keys?Math.round(correct/keys*100):0}%<br>每分钟正确字母 ${Math.round(correct/Math.max(t/60,.1))} · 练习时长 ${Math.floor(t)} 秒`;$('start').textContent='再练两分钟 ↗';return;}if(!activePlayer){best=Math.max(best,score);try{localStorage.setItem('keySiegeBest',best)}catch{}}$('best').textContent=activePlayer?'玩家 '+activePlayer.nickname+' · 成绩见右上角':'离线最高纪录 '+best;$('overlay').style.display='flex';$('title').textContent=win?'黎明已至，守城成功。':'城门失守，再战一次。';$('message').innerHTML=`得分 ${score}　·　击杀 ${kills}　·　最高连击 ${maxCombo}<br>准确率 ${keys?Math.round(correct/keys*100):0}%　·　WPM ${Math.round(correct/5/Math.max(t/60,.1))}`;$('start').textContent='再次守城　↗'}
function pause(){if(!running)return;paused=!paused;$('pause').textContent=paused?'继续 ▶':'暂停 Ⅱ';$('phase').textContent=paused?'已暂停 · Space 继续':'守城中'}
function hud(){if(practice)updateTrainer();$('score').textContent=String(score).padStart(5,'0');$('kills').textContent=kills;$('combo').textContent='×'+Math.min(3,1+combo*.1).toFixed(1);$('target').textContent=locked?defs[locked.type][0]+' · '+(practice?locked.word.toUpperCase():(locked.meaning?locked.meaning+' · ':'')+hintText(locked.word,input,hintFor(locked))):'等待目标';$('typed').textContent=input||'输入字母锁定';$('clock').textContent=`第 ${String(Math.min(10,1+Math.floor(t/30))).padStart(2,'0')} 波　 ·　 ${String(Math.floor(t/60)).padStart(2,'0')}:${String(Math.floor(t%60)).padStart(2,'0')} · ${t>=SPAWN_END?'清场':'出怪至 04:30'}`}
window.addEventListener('keydown',e=>{if(e.target.closest?.('input,select,textarea,dialog')||document.querySelector('dialog[open]'))return;if(e.code==='Space'&&e.target.tagName!=='BUTTON'){e.preventDefault();pause();return}if(e.repeat)return;if(!running||paused||e.ctrlKey||e.metaKey||e.altKey)return;if(e.key==='Escape'){locked=null;input='';hud();return}if(e.isComposing){$('notice').textContent='请切换为英文输入法';return}if(!/^[a-zA-Z]$/.test(e.key))return;e.preventDefault();let k=e.key.toLowerCase();keys++;let autoLocked=false;if(!locked){autoLocked=true;locked=enemies.filter(m=>m.heads?visibleHeads(m).some(h=>h.text[0]===k):m.word[0]===k).sort((a,b)=>Math.hypot(a.x-W/2,a.y-H/2)-Math.hypot(b.x-W/2,b.y-H/2))[0]||null;}if(locked&&locked.heads&&autoLocked){const head=visibleHeads(locked).find(h=>h.text[0]===k);assignWord(locked,head.text);locked.headId=head.id;locked.hint=head.hint;}if(locked&&answerFor(locked.word)[input.length]===k){correct++;input+=k;tone(400+input.length*80);beams.push({x:locked.x,y:locked.y,life:.16});$('notice').textContent='继续输入 · Esc 切换目标';if(input===answerFor(locked.word)){let m=locked;score+=Math.round(answerFor(m.word).length*10*Math.min(3,1+combo*.1));combo++;maxCombo=Math.max(maxCombo,combo);burst(m.x,m.y,defs[m.type][1]);m.parts--;if(m.heads)m.heads=m.heads.filter(h=>h.id!==m.headId);if(m.parts<=0){enemies=enemies.filter(x=>x!==m);kills++;if(m.type>=6)nextBossAt=t+8}else{if(m.type>=5){knockBackEnemy(m);$('notice').textContent='击退成功 · 继续输入下一个单词'}assignWord(m,m.heads?m.heads[0].text:(word(true)||m.word));if(m.heads){m.headId=m.heads[0].id;m.hint=m.heads[0].hint;}}locked=null;input=''}}else{combo=0;flash=.16;tone(120);$('notice').textContent='字母不匹配 · 继续当前进度'}hud()});
$('pause').onclick=pause;$('sound').onclick=()=>{sound=!sound;$('sound').textContent='声音 '+(sound?'开':'关')};document.addEventListener('visibilitychange',()=>{if(document.hidden&&running&&!paused)pause()});
function circle(x,y,r,color){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill()}
// Keep each original trio together; removing a head never pulls in a later group.
function visibleHeads(e){
 if(!e.heads?.length)return [];
 const group=Math.floor(e.heads[0].id/3);
 return e.heads.filter(head=>Math.floor(head.id/3)===group);
}
function headCards(e){
 const width=Math.min(146,(W-24)/3),height=49,total=width*3;
 const left=Math.max(12,Math.min(W-total-12,e.x-total/2));
 const bodyY=e.y+Math.sin(t*4+e.seed)*3;
 // Prefer above the body; near the top edge place the cards below it.
 const top=bodyY-105>=44?bodyY-105:bodyY+51;
 return visibleHeads(e).map(head=>({head,x:left+(head.id%3)*width,y:top,w:width,h:height}));
}
function paintWord(x,y,text,meaning,progress,maxWidth,selected,mode){
 const label=hintText(text,progress,mode),hasMeaning=!practice&&!!meaning;
 ctx.font='bold 15px monospace';const width=Math.min(maxWidth,Math.max(ctx.measureText(label).width+20,hasMeaning?ctx.measureText(meaning).width+20:0,50));
 const height=hasMeaning?43:27;ctx.fillStyle=selected?'#294934':'#091218ed';ctx.fillRect(x-width/2,y-height/2,width,height);
 if(selected){ctx.strokeStyle='#c4f29c';ctx.lineWidth=1;ctx.strokeRect(x-width/2,y-height/2,width,height);}
 ctx.textAlign='center';if(hasMeaning){ctx.font='12px system-ui';ctx.fillStyle='#f0c59e';ctx.fillText(meaning,x,y-5,width-10);}
 const baseline=y+(hasMeaning?13:5);ctx.font='bold 15px monospace';ctx.fillStyle='#e6f0e5';ctx.fillText(label,x,baseline,width-10);
 if(progress){const total=ctx.measureText(label).width,scale=Math.min(1,(width-10)/total);ctx.save();ctx.translate(x-total*scale/2,baseline);ctx.scale(scale,1);ctx.textAlign='left';ctx.fillStyle='#b6f387';ctx.fillText(mode==='full'||practice?typedPrefix(text,progress.length):[...typedPrefix(text,progress.length)].join(' '),0,0);ctx.restore();}
}
canvas.addEventListener('pointerdown',event=>{
 if(!running||paused||practice)return;const rect=canvas.getBoundingClientRect(),x=(event.clientX-rect.left)*W/rect.width,y=(event.clientY-rect.top)*H/rect.height;
 for(const enemy of [...enemies].reverse()){if(enemy.heads){const card=headCards(enemy).find(c=>x>=c.x&&x<=c.x+c.w&&y>=c.y&&y<=c.y+c.h);if(card){selectTarget(enemy,card.head);return;}}}
 const enemy=enemies.filter(e=>Math.hypot(e.x-x,e.y-y)<(e.type>=6?40:30)||(!e.heads&&Math.abs(e.x-x)<Math.min(W-20,330)/2&&Math.abs(Math.max(30,e.y-(e.type>=6?25:16)-30)-y)<23)).sort((a,b)=>Math.hypot(a.x-x,a.y-y)-Math.hypot(b.x-x,b.y-y))[0];
 if(enemy)selectTarget(enemy,enemy.heads?enemy.heads[0]:null);
});
function monster(e){let d=defs[e.type],x=e.x,y=e.y+Math.sin(t*4+e.seed)*3,s=e.type>=6?25:16;ctx.save();ctx.translate(x,y);ctx.shadowBlur=16;ctx.shadowColor=d[1];ctx.fillStyle=d[1];if(visualStyle==='illustrated'){drawIllustratedMonster(e)}else{if([3,6].includes(e.type)){let flap=Math.sin(t*9+e.seed)*10;ctx.beginPath();ctx.moveTo(-s*2,-12+flap);ctx.lineTo(-s/2,12);ctx.lineTo(0,-8);ctx.lineTo(s/2,12);ctx.lineTo(s*2,-12+flap);ctx.lineTo(s/2,0);ctx.lineTo(0,-16);ctx.lineTo(-s/2,0);ctx.fill()}else if(e.type===7){for(let j=0;j<e.parts;j++){let a=j/9*Math.PI*2;ctx.strokeStyle=d[1];ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*35,Math.sin(a)*27);ctx.stroke();circle(Math.cos(a)*35,Math.sin(a)*27,7,d[1])}circle(0,0,19,d[1])}else if(e.type===4){ctx.fillRect(-17,-17,34,34);ctx.strokeStyle='#e0faff';ctx.strokeRect(-10,-10,20,20)}else if(e.type===5){ctx.beginPath();ctx.moveTo(0,-24);ctx.lineTo(20,18);ctx.lineTo(-20,18);ctx.fill()}else{circle(0,0,s,d[1]);if(e.type===1){ctx.beginPath();ctx.moveTo(-12,-5);ctx.lineTo(-27,-17);ctx.lineTo(-17,8);ctx.moveTo(12,-5);ctx.lineTo(27,-17);ctx.lineTo(17,8);ctx.fill()}}ctx.shadowBlur=0;circle(-5,-2,2,'#112522');circle(5,-2,2,'#112522');}ctx.restore();if(e===locked){ctx.strokeStyle='#d3ffae';ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,s+11,0,Math.PI*2);ctx.stroke()}if(e.heads){for(const card of headCards(e)){paintWord(card.x+card.w/2,card.y+card.h/2,card.head.text,card.head.meaning,e===locked&&e.headId===card.head.id?input:'',card.w-6,e===locked&&e.headId===card.head.id,hintFor(e,card.head));}}
 else{paintWord(x,Math.max(30,y-s-30),e.word,e.meaning,e===locked?input:'',Math.min(W-20,330),e===locked,hintFor(e));}
 if(e.type>=5){ctx.textAlign='center';ctx.font='10px monospace';ctx.fillStyle=d[1];ctx.fillText(e.type===7?e.parts+' / 9 头':e.parts+' 段',x,y+s+23)}}
function draw(){ctx.clearRect(0,0,W,H);if(visualStyle==='illustrated'){drawIllustratedBackground()}else{let g=ctx.createRadialGradient(W/2,H/2,20,W/2,H/2,W*.6);g.addColorStop(0,'#20382d');g.addColorStop(1,'#0b171b');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);ctx.strokeStyle='#91c28d0b';ctx.lineWidth=1;for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke()}for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}[64,125,215].forEach((r,i)=>{ctx.strokeStyle=i===0?'#c4e69c38':'#bce29810';ctx.beginPath();ctx.arc(W/2,H/2,r,0,Math.PI*2);ctx.stroke()});for(let i=0;i<12;i++){let a=i/12*Math.PI*2;circle(W/2+Math.cos(a)*64,H/2+Math.sin(a)*64,2,'#badc9560')}}enemies.forEach(monster);if(visualStyle==='illustrated'){drawIllustratedHero()}else{ctx.shadowBlur=25;ctx.shadowColor='#bbec95';circle(W/2,H/2,18,'#c2e8a0');ctx.shadowBlur=0;ctx.fillStyle='#234537';ctx.beginPath();ctx.moveTo(W/2,H/2-13);ctx.lineTo(W/2+11,H/2+9);ctx.lineTo(W/2-11,H/2+9);ctx.fill();}for(let i=0;i<5;i++){ctx.fillStyle=i<hp?(hp===1?'#f47c96':'#bdea98'):'#30483f';ctx.fillRect(W/2-31+i*13,H/2-42,10,5)}for(let b of beams){ctx.strokeStyle='#d3ffb5';ctx.lineWidth=2;ctx.globalAlpha=b.life/.16;ctx.beginPath();ctx.moveTo(W/2,H/2);ctx.lineTo(b.x,b.y);ctx.stroke()}ctx.globalAlpha=1;for(let p of particles){ctx.globalAlpha=Math.max(0,p.life/.7);circle(p.x,p.y,2,p.color)}ctx.globalAlpha=1;if(flash>0){ctx.fillStyle='#ff39551c';ctx.fillRect(0,0,W,H)}}
function checkVictory(){if(!practice&&running&&t>=SPAWN_END&&boss1&&boss2&&enemies.length===0){finish(true);return true;}return false;}
function frame(ms){let dt=Math.min(.04,(ms-last)/1000||0);last=ms;if(running&&!paused){t+=dt;spawnTimer-=dt;flash-=dt;if(practice&&spawnTimer<=0&&enemies.length===0){add(0);spawnTimer=1;}if(!practice&&t>=150&&!boss1){boss1=add(6)}if(!practice&&t>=240&&boss1&&!boss2){boss2=add(7)}if(!practice&&t<SPAWN_END&&spawnTimer<=0){let options=t<30?[0,1]:t<90?[0,0,1,1,2,3]:t<150?[0,0,1,1,2,3,4]:[0,0,0,1,1,1,2,3,4,5];options=options.filter(canSpawn);if(options.length)add(options[Math.floor(Math.random()*options.length)]);spawnTimer=enemies.some(e=>e.type>=6)?4.5:Math.max(2.8,4-t/150)}for(let e of [...enemies]){let dx=W/2-e.x,dy=H/2-e.y,dist=Math.hypot(dx,dy),speed=(practice?8:defs[e.type][2])*Math.min(W,H)/650; if((e.stagger||0)>0){e.stagger=Math.max(0,e.stagger-dt)}else if(dist>0){e.x+=dx/dist*speed*dt;e.y+=dy/dist*speed*dt;}if(dist<30){hp--;combo=0;flash=.4;tone(80);if(e.type>=6){e.parts=Math.min(defs[e.type][3],e.parts+(e.type===6?1:0));e.x=W/2+Math.cos(e.angle)*Math.min(W,H)*.4;e.y=H/2+Math.sin(e.angle)*Math.min(W,H)*.4}else enemies=enemies.filter(m=>m!==e);if(locked===e){locked=null;input=''}if(hp<=0){finish(false);break}}}particles.forEach(p=>{p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt});particles=particles.filter(p=>p.life>0);beams.forEach(b=>b.life-=dt);beams=beams.filter(b=>b.life>0);$('phase').textContent=enemies.some(e=>e.type>=6)?'⚠ 首领来袭':t>=SPAWN_END?'最后清场 · 击败剩余敌人':'守城中';if(practice&&running&&t>=120)finish(true);checkVictory();hud();if(practice){$('clock').textContent='盲打练习 · '+String(Math.floor(t/60)).padStart(2,'0')+':'+String(Math.floor(t%60)).padStart(2,'0')+' / 02:00';$('phase').textContent='单字母 · 慢速练习'}}draw();requestAnimationFrame(frame)}
new ResizeObserver(()=>{let r=canvas.getBoundingClientRect(),oldW=W,oldH=H;W=r.width;H=r.height;enemies.forEach(e=>{e.x=e.x/oldW*W;e.y=e.y/oldH*H});let d=window.devicePixelRatio||1;canvas.width=W*d;canvas.height=H*d;ctx.setTransform(d,0,0,d,0,0)}).observe(canvas);requestAnimationFrame(frame);

const fingerGroups=[['左手小指','qaz','#e6a2a9'],['左手无名指','wsx','#e1ba82'],['左手中指','edc','#d9d88d'],['左手食指','rfvtgb','#95d3ac'],['右手食指','yuhnjm','#8ecfdb'],['右手中指','ik,','#a6b8ec'],['右手无名指','ol.','#c3a7e4'],['右手小指','p;/','#e0a7cf']];
function fingerFor(k){return fingerGroups.find(g=>g[1].includes(k))}
$('keyboard').innerHTML=['qwertyuiop','asdfghjkl;','zxcvbnm,./'].map(row=>'<div class="keyrow">'+[...row].map(k=>{let f=fingerFor(k);return '<div id="key-'+k+'" class="keycap '+('fj'.includes(k)?'home':'')+'" style="--finger:'+f[2]+'"><b>'+k.toUpperCase()+'</b><small>'+f[0]+'</small></div>'}).join('')+'</div>').join('');
$('fingers').innerHTML=fingerGroups.map((f,i)=>'<span class="finger" id="finger-'+i+'" style="--finger:'+f[2]+'">'+f[0]+'</span>').join('');
function updateTrainer(){let k=running?enemies[0]?.word:null;for(const row of ['qwertyuiop','asdfghjkl;','zxcvbnm,./'])for(const c of row)$('key-'+c).classList.toggle('active',c===k);fingerGroups.forEach((f,i)=>$('finger-'+i).classList.toggle('active',!!k&&f[1].includes(k)));$('fingerHint').textContent=k?'按 '+k.toUpperCase()+' · 用'+fingerFor(k)[0]:'双手回到基准位，准备下一个字母';$('practiceStats').textContent='准确率 '+(keys?Math.round(correct/keys*100):0)+'% · 正确 '+correct;}
$('mode').onclick=()=>{interruptSession();practice=!practice;running=false;paused=false;enemies=[];locked=null;input='';t=0;hp=5;score=kills=combo=keys=correct=0;particles=[];beams=[];$('range').disabled=false;document.body.classList.toggle('practice',practice);$('trainer').hidden=!practice;$('mode').textContent=practice?'切换到标准闯关':'切换到盲打练习';$('overlay').style.display='flex';$('title').textContent=practice?'眼睛看屏幕，让手指记住。':'你的键盘，就是武器。';$('message').innerHTML=practice?'每次只有一只慢速史莱姆，按对一个字母即可消灭。<br>跟随下方指法提示，完成两分钟练习。':'输入怪物头顶的英文单词，将它击败。<br>守护中央法阵，出怪结束后清空敌人即可通关。';$('start').textContent=practice?'开始盲打练习 ↗':'开始守城 ↗';$('pause').textContent='暂停 Ⅱ';$('phase').textContent='准备练习';hud();if(practice)$('clock').textContent='盲打练习 · 02:00';};

$('visualStyle').onclick=()=>{visualStyle=visualStyle==='classic'?'illustrated':'classic';try{localStorage.setItem('khVisualStyle',visualStyle)}catch{}updateVisualToggle();draw();};updateVisualToggle();
