global.window=global; global.CANVAS_W=800; global.CANVAS_H=500; global.GAME_VERSION='v3 build 334';
function stubCtx(){ return new Proxy({filter:'none',globalAlpha:1,canvas:{width:800,height:500}},{get(t,k){ if(k==='measureText')return ()=>({width:8}); if(k==='createLinearGradient'||k==='createRadialGradient')return ()=>({addColorStop(){}}); if(k==='getContext')return ()=>stubCtx(); if(k in t)return t[k]; return (typeof k==='string')?(()=>{}):undefined;},set(t,k,v){t[k]=v;return true;}}); }
const cls={add(){},remove(){},toggle(){},contains(){return false;}};
function mkEl(){return {style:{},classList:cls,appendChild(){},addEventListener(){},getContext:()=>stubCtx(),getBoundingClientRect:()=>({width:800,height:500,left:0,top:0}),width:800,height:500};}
global.document={getElementById:()=>mkEl(),head:{appendChild(){}},createElement:()=>mkEl(),body:{appendChild(){},classList:cls},addEventListener(){}};
global.window.addEventListener=()=>{};global.window.dispatchEvent=()=>{};global.Event=function(){};
global.InputManager=function(){this.flush=()=>{};this.isJustDown=()=>false;this.isDown=()=>false;this.mouse={x:0,y:0,clicked:false,down:false,rightClicked:false,moveVec:{x:0,y:0}};};
global.requestAnimationFrame=()=>0;
const R=require('path').join(__dirname,'..','js','overhead','overhead-');
['palette','grid','buildings','movement','controls','combat','weapons','elevation','settings','daynight','redstone','templates','launch','game'].forEach(m=>require(R+m+'.js'));
const OG=global.OverheadGame, OS=global.OH_SETTINGS, OH_REDSTONE=global.OH_REDSTONE;
const W=18,H=16,ground=[],elevation=[];
for(let r=0;r<H;r++){ground.push(new Array(W).fill('grass'));elevation.push(new Array(W).fill(0));}
const redstone=[{kind:'lever', col:1, row:1, on:false, channel:'gate', txId:1}];
// gate: hinge at (8,8), length 3, rest 0° (pointing east), powered swing 90° (to south)
const gates=[{col:8,row:8,len:3,rest:0,angle:90,height:2,channel:'gate'}];
const world={name:'t',mode:'platformer',viewMode:'overhead',gameModeDefault:'NRM',controlScheme:'free-aim',rules:{},
  mapSnapshot:{gridW:W,gridH:H,density:1,baseW:W,baseH:H,cell:32,objectScaleMode:'independent',ground,elevation,decorations:[]},
  buildings:[],mobs:[],items:[],spawns:[{col:2,row:2}],ramps:[],bridges:[],redstone,gates, goal:null, settings:OS.defaults()};
const g=new OG(JSON.parse(JSON.stringify(world)),{testMode:true},()=>{});
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
g.player.x=2.5*32; g.player.y=2.5*32;  // player far from the gate
// rest state: gate points east → cells (9,8),(10,8),(11,8) solid
g._rs=OH_REDSTONE.evaluate(g._redstone); g._updateGates();
ok(g._gateSolidAt(9,8) && g._gateSolidAt(11,8), 'at rest the gate panel blocks along its length (east)');
g._redstone[0].on=true;
// power on: swings 90° toward south → after easing, cells move to (8,9),(8,10),(8,11)
for(let i=0;i<80;i++){ g._rs=OH_REDSTONE.evaluate(g._redstone); g._updateGates(); }
ok(g._gates[0]._phase > 0.95, 'a powered gate swings to its full angle');
ok(g._gateSolidAt(8,11), 'after the 90° swing the panel blocks the new (south) cells');
ok(!g._gateSolidAt(11,8), 'and no longer blocks the old (east) cells');
// obstruction: reset, put the player in the swing path, power on → gate should stop before the player
const w2=JSON.parse(JSON.stringify(world)); w2.redstone[0].on=true; const g2=new OG(w2,{testMode:true},()=>{});
g2.player.x=8.5*32; g2.player.y=9.5*32;  // stand at cell (8,9) — in the swing arc
for(let i=0;i<80;i++){ g2._rs=OH_REDSTONE.evaluate(g2._redstone); g2._updateGates(); }
ok(g2._gates[0]._phase < 0.95, 'the gate STOPS when an entity obstructs its swing arc');
ok(!g2._gateSolidAt(8,9), 'it does not close through the player');
console.log(`\ngate: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
