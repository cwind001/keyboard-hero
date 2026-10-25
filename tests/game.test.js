'use strict';
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const elements=new Map(),handlers={},painted=[];
const element=id=>{if(!elements.has(id))elements.set(id,{id,style:{},value:id==='range'?'asdfjkl':'',classList:{toggle(){}},addEventListener(type,fn){handlers[id+':'+type]=fn},getContext(){return ctx},getBoundingClientRect(){return {width:900,height:650,left:0,top:0}},textContent:'',innerHTML:''});return elements.get(id)};
const ctx=new Proxy({fillText:text=>painted.push(text),measureText:t=>({width:t.length*9}),createRadialGradient:()=>({addColorStop(){}})},{get:(obj,key)=>key in obj?obj[key]:()=>{}});
const context=vm.createContext({console,document:{getElementById:element,querySelector:()=>null,addEventListener(){},body:{classList:{toggle(){}}}},window:{addEventListener:(name,fn)=>handlers[name]=fn},localStorage:{getItem:()=>null,setItem(){}},ResizeObserver:class{observe(){}},requestAnimationFrame(){},activePlayer:null,persistResult:()=>{},interruptSession:()=>{}});
vm.runInContext(fs.readFileSync('game.js','utf8'),context);
function run(code){return vm.runInContext(code,context)}
function key(k){handlers.keydown({key:k,code:k,target:{tagName:'BODY',closest:()=>null},preventDefault(){}})}
run("sound=false;activeVocabulary=[{text:'school',meaning:'学校'}];activeSource='custom';activeHintConfig=Object.fromEntries(defs.map((_,i)=>[i,'hidden']));reset();");
assert.equal(run('enemies[0].word'),'school');
assert.equal(run("hintText('school','','hidden')"),'_ _ _ _ _ _');
assert.equal(run("hintText('school','','first')"),'s _ _ _ _ _');
assert.equal(run("hintText('school','','edges')"),'s _ _ _ _ l');
run("selectTarget(enemies[0])");
assert(!element('target').textContent.includes('school'));
key('x');assert.equal(run('correct'),0);assert.equal(run('input'),'');
for(const c of 'school')key(c);
assert.equal(run('kills'),1);assert.equal(run('correct'),6);assert.equal(run('keys'),7);
// Duplicate words on the hydra must remove one head per complete spelling.
run('t=250;enemies=[];add(7);selectTarget(enemies[0],enemies[0].heads[1]);');
assert.equal(run('enemies[0].heads.length'),9);
assert.equal(run('new Set(enemies[0].heads.map(h=>h.text)).size'),1);
for(const c of 'school')key(c);
assert.equal(run('enemies[0].heads.length'),8);
assert.equal(run('enemies[0].heads.some(h=>h.id===1)'),false);
assert.equal(run('enemies[0].stagger'),.3);
assert.equal(run('canSpawn(6)'),false);
assert.equal(run('canSpawn(2)'),true);
run('add(2)');assert.equal(run('canSpawn(3)'),false);
run('add(5)');assert.equal(run('canSpawn(5)'),false);
run('while(enemies.length<9)add(0)');assert.equal(run('canSpawn(0)'),false);
// Boss cooldown, knockback distance, early cleanup and two minute practice.
run('enemies=[];nextBossAt=t+8');assert.equal(run('canSpawn(7)'),false);
run('t+=8');assert.equal(run('canSpawn(7)'),true);
run('enemies=[];add(5);enemies[0].x=W/2+100;enemies[0].y=H/2;knockBackEnemy(enemies[0])');
assert.equal(run('enemies[0].x-W/2'),150);
// No victory during gaps before spawn cutoff, while enemies remain, or with a scheduled boss pending.
run('boss1=boss2=true;t=269.9;enemies=[]');assert.equal(run('checkVictory()'),false);
run('t=270;add(0)');assert.equal(run('checkVictory()'),false);
run('enemies=[];boss2=false;t=274;nextBossAt=280;last=0;frame(20)');assert.equal(run('running'),true);
assert.equal(run('enemies.length'),0);
run('t=280;frame(40)');assert.equal(run('boss2'),true);assert.equal(run('enemies[0].type'),7);
for(let head=0;head<9;head++)for(const c of 'school')key(c);
run('frame(60)');assert.equal(run('running'),false);assert(run('t<300'));
// Exactly 04:30 with no enemies and both bosses dispatched ends immediately.
run('reset();boss1=boss2=true;t=270;enemies=[];frame(80)');assert.equal(run('running'),false);
// Simultaneous enemies use their own prompt in both the canvas and target HUD.
run("reset();activeHintConfig={...defaultHintConfig};enemies=[];add(0);add(2);selectTarget(enemies[0]);");
assert.equal(run('hintFor(enemies[0])'),'full');assert.equal(run('hintFor(enemies[1])'),'first');
painted.length=0;run('enemies.forEach(monster)');assert(painted.includes('school'));assert(painted.includes('s _ _ _ _ _'));
assert(element('target').textContent.includes('school'));
run('selectTarget(enemies[1])');assert(!element('target').textContent.includes('school'));
assert(element('target').textContent.includes('s _ _ _ _ _'));
run('enemies=[];add(7);selectTarget(enemies[0],enemies[0].heads[0])');
assert.equal(run('hintFor(enemies[0])'),'hidden');assert(!element('target').textContent.includes('school'));
painted.length=0;run('enemies.forEach(monster)');assert(!painted.includes('school'));assert(painted.includes('_ _ _ _ _ _'));

run('practice=true;activeVocabulary=null;reset();t=119.99;last=0;frame(40)');
assert.equal(run('running'),false);assert(element('title').textContent.includes('练习完成'));
// Phrases and hyphenated terms preserve spelling, but only letters are entered and scored.
for(const [term,answer] of [['hard-working','hardworking'],['ping-pong','pingpong'],['take care of','takecareof'],['ice cream','icecream']]){
 run(`practice=false;activeVocabulary=[{text:${JSON.stringify(term)},meaning:'课本词条'}];activeSource='custom';activeHintConfig={...defaultHintConfig};reset();`);
 assert.equal(run('enemies[0].word'),term);
 assert.equal(run('answerFor(enemies[0].word)'),answer);
 assert.equal(run(`hintText(${JSON.stringify(term)},'','full')`),term);
 for(const c of answer)key(c);
 assert.equal(run('kills'),1);assert.equal(run('correct'),answer.length);assert.equal(run('score'),answer.length*10);
}
assert.equal(run("hintText('ice cream','','hidden')"),'_ _ _   _ _ _ _ _');
assert.equal(run("hintText('hard-working','','edges')"),'h _ _ _ - _ _ _ _ _ _ g');
assert.equal(run("typedPrefix('hard-working',4)"),'hard-');
assert.equal(run("typedPrefix('ice cream',4)"),'ice c');
console.log('Game tests passed: hints, typing, duplicate hydra heads, spawn limits, knockback, cooldown, early cleanup, pending boss, per-monster hints, practice timer');

// Deterministic probability coverage, independent of enemy type.
run("practice=false;const savedRandom=Math.random;");
for(const level of ['easy','medium','hard']){
 run(`activeHintConfig={difficulty:'${level}',weights:{...difficultyPresets.${level}}}`);
 const counts={full:0,edges:0,hidden:0};
 for(let i=0;i<100;i++){run(`Math.random=()=>${(i+.5)/100}`);counts[run('randomHint()')]++;}
 assert.deepEqual(counts,JSON.parse(run('JSON.stringify(activeHintConfig.weights)')));
}
run("Math.random=savedRandom;activeHintConfig={difficulty:'easy',weights:{full:0,edges:100,hidden:0}};enemies=[];t=250;nextBossAt=0;add(7);");
assert.equal(run("enemies[0].heads.every(h=>h.hint==='edges')"),true);
run("activeHintConfig={difficulty:'hard',weights:{full:0,edges:0,hidden:100}};selectTarget(enemies[0],enemies[0].heads[2]);");
assert.equal(run('hintFor(enemies[0])'),'edges');
for(const c of run('answerFor(enemies[0].word)'))key(c);
assert.equal(run('enemies[0].heads.length'),8);
assert.equal(run('hintFor(enemies[0])'),'edges');
run("enemies=[];add(0);add(5)");
assert.equal(run("enemies.every(e=>hintFor(e)==='hidden')"),true);
run("practice=true");assert.equal(run('randomHint()'),'full');
console.log('Random difficulty tests passed');

// Hydra trios: hidden heads cannot be selected or auto-locked; each trio must clear.
run("practice=false;activeVocabulary=[{text:'school',meaning:'学校'}];activeSource='custom';reset();enemies=[];t=250;add(7);const hydra=enemies[0];hydra.heads[3].text='zebra';");
assert.equal(run('headCards(hydra).length'),3);
run('selectTarget(hydra,hydra.heads[3])');assert.equal(run('locked'),null);
key('z');assert.equal(run('locked'),null);assert.equal(run('hydra.parts'),9);
for(let group=0;group<3;group++){
 assert.deepEqual(JSON.parse(run('JSON.stringify(visibleHeads(hydra).map(h=>h.id))')),[group*3,group*3+1,group*3+2]);
 for(let n=0;n<3;n++){
  run('selectTarget(hydra,visibleHeads(hydra).at(-1))');
  for(const c of run('answerFor(locked.word)'))key(c);
  assert.equal(run('hydra.parts'),8-group*3-n);
  if(n<2)assert.equal(run('headCards(hydra).length'),2-n);
 }
}
assert.equal(run('enemies.length'),0);assert.equal(run('kills'),1);
// Cards track movement and bobbing, stay within the canvas, and avoid the body.
run('enemies=[];nextBossAt=0;add(7);const movingHydra=enemies[0];movingHydra.x=450;movingHydra.y=300;');
const before=JSON.parse(run('JSON.stringify(headCards(movingHydra)[0])'));
run('movingHydra.x+=20;movingHydra.y+=10');
const after=JSON.parse(run('JSON.stringify(headCards(movingHydra)[0])'));
assert.equal(after.x-before.x,20);assert.equal(after.y-before.y,10);
for(const [x,y] of [[45,45],[855,45],[45,600],[855,600],[450,325]]){
 run(`movingHydra.x=${x};movingHydra.y=${y}`);
 assert(run('headCards(movingHydra).every(c=>c.x>=0&&c.x+c.w<=W&&c.y>=0&&c.y+c.h<=H)'));
 assert(run('headCards(movingHydra).every(c=>c.y+c.h< movingHydra.y+Math.sin(t*4+movingHydra.seed)*3-40 || c.y>movingHydra.y+Math.sin(t*4+movingHydra.seed)*3+40)'));
}
console.log('Hydra trio, targeting, tracking and body clearance tests passed');
