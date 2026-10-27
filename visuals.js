'use strict';
// Cosmetic drawing only: never consume gameplay randomness or mutate game state.
let visualStyle='illustrated';
try{if(localStorage.getItem('khVisualStyle')==='classic')visualStyle='classic'}catch{}
function artShape(points,fill,stroke='#172a29',line=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=line;ctx.stroke();}}
function artOval(x,y,rx,ry,color){ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();}
function artLine(points,color,width=2){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.stroke();}
function artEyes(x,y,color='#fff0c5'){artOval(x-5,y,3,3,color);artOval(x+5,y,3,3,color);artOval(x-4,y,1.3,2,'#15242a');artOval(x+4,y,1.3,2,'#15242a');}
function drawIllustratedHero(){
 ctx.save();ctx.translate(W/2,H/2);artOval(0,22,24,7,'#07171670');
 // Cloak, boots, tunic and belt give the guardian a human silhouette.
 artShape([[-10,-9],[-19,20],[0,15],[17,21],[10,-10]],'#536d99');
 artLine([[-5,10],[-6,23],[-11,23]],'#263640',7);artLine([[5,10],[7,23],[12,23]],'#263640',7);
 artShape([[-9,-9],[8,-9],[11,12],[-10,12]],'#d8caa0');artLine([[-9,8],[10,8]],'#725a40',4);
 artLine([[-10,-6],[-17,4]],'#b3b8b1',7);artLine([[10,-5],[17,3]],'#b3b8b1',7);
 artOval(0,-19,9,11,'#e4b48a');artShape([[-9,-19],[-10,-26],[-3,-31],[7,-28],[10,-20],[3,-24],[-3,-20]],'#493d37');
 artOval(-3,-18,1,1.5,'#273739');artOval(4,-18,1,1.5,'#273739');artLine([[-2,-12],[3,-12]],'#a9775e',1);
 // Sword and a small shield remain clear at gameplay scale.
 artShape([[18,3],[19,-26],[23,-33],[26,-25],[23,3]],'#dce8dd');artLine([[14,2],[28,4]],'#d8b56a',3);artLine([[21,5],[20,11]],'#785e44',4);
 artShape([[-24,-3],[-12,-3],[-12,9],[-18,15],[-25,8]],'#607f9d','#d7c18c');artLine([[-19,0],[-19,10]],'#d7c18c',2);
 ctx.restore();
}
function drawIllustratedMonster(e){
 const color=defs[e.type][1];ctx.shadowBlur=0;artOval(0,21,e.type>=6?30:20,6,'#06151565');
 if(e.type===0){
  artOval(0,7,19,14,'#355f43');artShape([[-18,9],[-14,-5],[-7,-14],[5,-13],[15,-3],[19,11],[7,18],[-8,17]],'#8bc775');artOval(-6,-5,5,3,'#cbe9a3');artEyes(0,5);artLine([[-3,12],[3,12]],'#345239');
 }else if(e.type===1||e.type===2){
  const fast=e.type===2;artLine([[-6,10],[-10,23]],'#403b32',6);artLine([[6,10],[12,22]],'#403b32',6);
  artShape([[-10,-5],[10,-5],[13,14],[-12,14]],fast?'#ab6040':'#766949');
  artShape([[-10,-15],[-24,-20],[-16,-5],[0,0],[16,-5],[24,-20],[10,-15]],color);
  artOval(0,-10,12,12,color);artShape([[-10,-18],[0,-25],[11,-18]],fast?'#9c4c37':'#435a36');artEyes(0,-10);artLine([[-3,-2],[4,-2]],'#425038');
  artLine([[-12,1],[-20,11]],color,5);artLine([[12,1],[19,7]],color,5);artShape([[18,6],[25,-7],[27,8]],'#d5d9bd');
  if(fast){artLine([[-26,2],[-34,2]],'#e8ba7470');artLine([[-23,10],[-32,10]],'#e8ba7470');}
 }else if(e.type===3||e.type===6){
  const boss=e.type===6,span=boss?43:32,flap=Math.sin(t*9+e.seed)*6;
  artShape([[-5,-10],[-span,-21+flap],[-span+4,9],[-23,1],[-13,15],[0,8],[13,15],[23,1],[span-4,9],[span,-21+flap],[5,-10]],boss?'#9e4663':'#be8858');
  artLine([[-8,-7],[-span+4,-15+flap],[-23,1]],color);artLine([[8,-7],[span-4,-15+flap],[23,1]],color);
  artOval(0,1,10,boss?18:14,color);artShape([[-9,-9],[-9,-24],[-2,-16],[5,-23],[10,-8]],color);artEyes(0,-7);
  if(boss){artShape([[-5,0],[-2,7],[0,0]],'#fff0da',null);artShape([[2,0],[4,7],[6,0]],'#fff0da',null);}
 }else if(e.type===4){
  artLine([[-8,10],[-9,24]],'#516b78',9);artLine([[8,10],[9,24]],'#516b78',9);artShape([[-17,-10],[15,-10],[17,16],[-16,16]],'#718e9c');
  artShape([[-12,-23],[10,-23],[14,-8],[0,-3],[-13,-8]],'#c0d0ce');artLine([[-8,-12],[8,-12]],'#294855',4);artLine([[0,-21],[0,-15]],'#e4ddd1');
  artShape([[-25,-5],[-12,-5],[-12,16],[-19,23],[-26,13]],'#557785','#c1d4cd',3);artLine([[23,17],[23,-15]],'#b9cbd0',5);artShape([[17,-16],[24,-25],[29,-15]],'#d4dfd8');
 }else if(e.type===5){
  artShape([[0,-20],[-19,22],[17,22]],'#65578d');artShape([[-9,-10],[0,-27],[11,-10],[6,0],[-7,0]],'#b295cd');artOval(0,-7,6,7,'#d6bda9');artEyes(0,-8,'#efe3af');artLine([[22,21],[22,-24]],'#937453',4);artOval(22,-25,6,7,'#c7a3ed');artLine([[-5,7],[12,13]],'#b295cd',5);
 }else if(e.type===7){
  artOval(0,8,22,18,'#756144');artShape([[-18,9],[-29,19],[-34,8],[-29,25],[-15,24]],'#b29562');
  for(let j=0;j<e.parts;j++){const a=(-170+j*320/8)*Math.PI/180,x=Math.sin(a)*33,y=Math.cos(a)*27;
   artLine([[0,7],[x*.55,y*.5],[x,y]],'#53664c',9);artLine([[0,6],[x*.55,y*.5],[x,y]],'#aeb077',5);artOval(x,y,8,6,'#c4b57d');artOval(x-3,y-1,1.5,2,'#e9f1ba');artOval(x+3,y-1,1.5,2,'#e9f1ba');
  }artOval(0,9,11,13,'#b7a174');
 }
}
function drawIllustratedBackground(){
 ctx.save();const g=ctx.createRadialGradient(W/2,H/2,30,W/2,H/2,Math.max(W,H)*.7);g.addColorStop(0,'#34493b');g.addColorStop(1,'#132a29');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
 // Deterministic scenery, kept subtle so words remain the focal point.
 for(let i=0;i<90;i++){const x=(i*137.51)%W,y=(i*83.37)%H;if(Math.hypot(x-W/2,y-H/2)<105)continue;artLine([[x-3,y+3],[x,y-3],[x+2,y+2],[x+5,y-1]],'#72875822',1);}
 ctx.fillStyle='#b0b59d08';ctx.fillRect(W/2-24,0,48,H);ctx.fillRect(0,H/2-24,W,48);
 artOval(W/2,H/2+5,81,68,'#0e242770');
 for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.save();ctx.translate(W/2+Math.cos(a)*68,H/2+Math.sin(a)*68);ctx.rotate(a);artShape([[-10,-15],[10,-13],[11,14],[-10,15]],i%2?'#617166':'#56665e','#324c43',1);ctx.restore();}
 ctx.strokeStyle='#bed29a66';ctx.lineWidth=2;ctx.beginPath();ctx.arc(W/2,H/2,53,0,Math.PI*2);ctx.stroke();
 for(let i=0;i<8;i++){const a=i*Math.PI/4;artOval(W/2+Math.cos(a)*53,H/2+Math.sin(a)*53,2,2,'#c5d5a0');}ctx.restore();
}
function updateVisualToggle(){const button=$('visualStyle');button.textContent=visualStyle==='classic'?'画面：经典版':'画面：新版';button.setAttribute?.('aria-label','当前'+(visualStyle==='classic'?'经典版':'新版')+'画面，点击切换');}
