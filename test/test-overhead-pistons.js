global.window=global; global.CANVAS_W=800; global.CANVAS_H=500; global.GAME_VERSION='v3 build 333';
function stubCtx(){ return new Proxy({filter:'none',globalAlpha:1,canvas:{width:800,height:500}},{get(t,k){ if(k==='measureText')return ()=>({width:8}); if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}}); if(k==='getContext')return ()=>stubCtx(); if(k in t)return t[k]; return (typeof k==='string')?(()=>{}):undefined;},set(t,k,v){t[k]=v;return true;}}); }
const cls={add(){},remove(){},toggle(){},contains(){return false;}};
function mkEl(){return {style:{},classList:cls,appendChild(){},addEventListener(){},getContext:()=>stubCtx(),getBoundingClientRect:()=>({width:800,height:500,left:0,top:0}),width:800,height:500};}
global.document={getElementById:()=>mkEl(),head:{appendChild(){}},createElement:()=>mkEl(),body:{appendChild(){},classList:cls},addEventListener(){}};
global.window.addEventListener=()=>{};global.window.dispatchEvent=()=>{};global.Event=function(){};
global.InputManager=function(){this.flush=()=>{};this.isJustDown=()=>false;this.isDown=()=>false;this.mouse={x:0,y:0,clicked:false,down:false,rightClicked:false,moveVec:{x:0,y:0}};};
global.requestAnimationFrame=()=>0;
const R=''+require('path').join(__dirname,'..','js','overhead','overhead-')+'';
['palette','grid','buildings','movement','controls','combat','weapons','elevation','settings','daynight','redstone','templates','launch','game'].forEach(m=>require(R+m+'.js'));
const OG=global.OverheadGame, OS=global.OH_SETTINGS;
const W=16,H=14,ground=[],elevation=[];
for(let r=0;r<H;r++){ground.push(new Array(W).fill('grass'));elevation.push(new Array(W).fill(0));}
const redstone=[
  {kind:'lever', col:1, row:1, on:true, channel:'gate', txId:1},
  {kind:'piston', col:5, row:5, dir:'up', reach:2, rxChannel:'gate'},
  {kind:'piston', col:9, row:5, dir:'e', reach:2, rxChannel:'gate'},
];
const world={name:'t',mode:'platformer',viewMode:'overhead',gameModeDefault:'NRM',controlScheme:'free-aim',rules:{},
  mapSnapshot:{gridW:W,gridH:H,density:1,baseW:W,baseH:H,cell:32,objectScaleMode:'independent',ground,elevation,decorations:[]},
  buildings:[],mobs:[],items:[],spawns:[{col:5,row:5}],ramps:[],bridges:[],redstone, goal:null, settings:OS.defaults()};
const OH_REDSTONE=global.OH_REDSTONE;
const g=new OG(JSON.parse(JSON.stringify(world)),{testMode:true},()=>{});
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
// place player on the vertical piston cell (5,5)
g.player.x=5.5*32; g.player.y=5.5*32; g.player.elev=0;
// power on: evaluate + update pistons repeatedly to ease phase to ~1
for(let i=0;i<50;i++){ g._rs=OH_REDSTONE.evaluate(g._redstone); g._updatePistons(); }
console.log('vertical boost @5,5 =', (g._pistonBoostMap&&g._pistonBoostMap['5,5'])?.toFixed(2));
ok(g._elev(5,5) > 1.8, 'a powered UP piston raises its cell elevation toward reach (2)');
ok(g.player.elev > 1.8, 'a rider standing on the UP piston is carried up (elev tracks the floor)');
ok(g._pistonSolidAt(10,5)===true, 'a powered EAST piston head is solid 1 cell out');
ok(g._pistonSolidAt(11,5)===true, 'and 2 cells out (reach 2)');
ok(g._pistonSolidAt(12,5)===false, 'but not beyond its reach');
// power off: lever off -> retract
g._redstone[0].on=false; g._pistonList=null;
for(let i=0;i<60;i++){ g._rs=OH_REDSTONE.evaluate(g._redstone); g._updatePistons(); }
ok(!g._pistonBoostMap || !g._pistonBoostMap['5,5'], 'unpowered UP piston retracts (no boost)');
ok(Math.abs(g._elev(5,5)) < 0.2, 'the cell returns to its base elevation');
ok(g._pistonSolidAt(10,5)===false, 'the horizontal head retracts (no longer solid)');
// render smoke
let threw=false; try{ g._render ? g._render() : null; }catch(e){ threw=true; console.log('render throw', e.message); }
// Horizontal piston SHOVES an entity ahead of its extending head; sticky drags it back.
{
  const w2=JSON.parse(JSON.stringify(world)); w2.redstone=[{kind:'lever',col:1,row:1,on:true,channel:'gate',txId:1},{kind:'piston',col:5,row:10,dir:'e',reach:2,sticky:true,rxChannel:'gate'}];
  const g2=new OG(w2,{testMode:true},()=>{});
  g2.player.x=6.5*32; g2.player.y=10.5*32; g2.player.elev=0;   // sitting where the head will extend (cell 6,10)
  const x0=g2.player.x;
  for(let i=0;i<40;i++){ g2._rs=OH_REDSTONE.evaluate(g2._redstone); g2._updatePistons(); }
  ok(g2.player.x > x0 + 16, 'a horizontal piston shoves the player ahead of its extending head');
  g2._redstone[0].on=false; g2._pistonList=null; const xExt=g2.player.x;
  for(let i=0;i<60;i++){ g2._rs=OH_REDSTONE.evaluate(g2._redstone); g2._updatePistons(); }
  ok(g2.player.x < xExt - 1, 'a STICKY piston drags the player back as it retracts');
}
// Portal step-through animation reuses the climb driver.
{
  const w3=JSON.parse(JSON.stringify(world)); w3.buildings=[{typeId:'portal',col:3,row:3,level:0,config:{dest:'8,8'}},{typeId:'portal',col:8,row:8,level:0,config:{}}];
  const g3=new OG(w3,{testMode:true},()=>{});
  g3._startPortalStep(g3.player, g3.buildings[0], {px:8.5*32,py:9.5*32,key:'8,8'});
  ok(!!g3.player._climb && g3.player._climb.timeline.length===2, 'entering a portal starts a 2-phase step-through animation');
  let f=0; while(g3.player._climb && f<200){ g3._updatePipeClimb(g3.player); f++; }
  ok(!g3.player._climb, 'the portal step completes + teleports');
}

console.log(`\npiston: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
