const fs=require('fs'),vm=require('vm');
const jsDir=require("path").join(__dirname,"..","js");
const real={window:{},document:{},Math,console,Set,Map,Array,Object,JSON,Number,String,Boolean,isNaN,parseInt,parseFloat};
const sandbox=new Proxy(real,{has:()=>true,get:(t,k)=>(k in t?t[k]:(typeof k==='symbol'?undefined:1)),set:(t,k,v)=>{t[k]=v;return true;}});
vm.createContext(sandbox);
const load=(f,e)=>vm.runInContext(fs.readFileSync(`${jsDir}/${f}`,'utf8')+(e?`\n;${e}`:''),sandbox,{filename:f});
load('constants.js','this.BLOCK_SIZE=BLOCK_SIZE;');load('blocks.js','this.BLOCK=BLOCK;');
load('travel-tube.js');load('moving-platform.js','this.MOVING_PLATFORM=MOVING_PLATFORM;');
load('redstone.js','this.RedstoneSystem=RedstoneSystem;');load('game.js','this.Game=Game;');
const {Game,RedstoneSystem,BLOCK,BLOCK_SIZE:BS}=sandbox;
const W=40,H=30;
function mkGame(){
  const grid=Array.from({length:H},()=>Array(W).fill(BLOCK.AIR));
  const g=Object.create(Game.prototype);
  Object.assign(g,{gameMode:'platformer',frameCount:0,_rsQueue:[],_worldAdvSettings:{redstoneSpeed:1},
    _dustBlocks:new Map(),_receivers:new Map(),_transmitters:new Map(),_gateBlocks:new Map(),
    _dirControllers:new Map(),_dustConnCache:new Map(),_notify:()=>{},mobManager:{mobs:[]},player:null,player2:null});
  g.level={width:W,height:H,grid,get:(r,c)=>(r>=0&&r<H&&c>=0&&c<W?grid[r][c]:BLOCK.AIR),set:(r,c,v)=>{if(r>=0&&r<H&&c>=0&&c<W)grid[r][c]=v;}};
  g.redstone=new RedstoneSystem([]);
  return g;
}
const drain=(g)=>{let gd=400;while(gd-->0&&g._rsQueue.length){g.frameCount++;g._rsProcessQueue();}};
// emulate the main-loop source-change trigger for plates/weights
const fireSources=(g)=>{ for(const c of g.redstone.components){ if(c.type==='pressure_plate'||c.type==='target'||c.type==='weight'){ if(c._rsWasOn===undefined){c._rsWasOn=c.on;continue;} if(c.on!==c._rsWasOn){c._rsWasOn=c.on; g._rsStartFromSource(c.col,c.row,c.on);} } } };
const ent=(col,row)=>({x:col*BS+2,y:row*BS-24,width:24,height:24,vy:0,hp:10});
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};

// A: chain of 3 conducting weight sensors; lamp at far end. Stand on near end -> far lamp lights.
{
  const g=mkGame(); const r=8;
  for(const c of [4,5,6]) g.redstone.addComponent({type:'weight',col:c,row:r,on:false,trigger:'both',conduct:true,links:[]});
  g.redstone.addComponent({type:'lamp',col:7,row:r,on:false,color:0,conduct:true,links:[]}); // sink adjacent to sensor 6
  fireSources(g);              // init _rsWasOn=false for all sources
  g.player=ent(4,r);           // stand on sensor at col 4
  g._updateWeightPlates(); fireSources(g); drain(g);
  ok(g.redstone.getAt(7,r).on===true, 'A: conducting sensor chain lights far lamp');
  g.player=null; g._updateWeightPlates(); fireSources(g); drain(g);
  ok(g.redstone.getAt(7,r).on===false, 'A: far lamp turns OFF when released (no latch)');
}
// B: conduct=false isolates a lamp. Two adjacent lamps, right one conduct=false; lever powers left.
{
  const g=mkGame(); const r=8;
  g.redstone.addComponent({type:'lever',col:3,row:r,on:false,links:[]});
  g.redstone.addComponent({type:'lamp',col:4,row:r,on:false,color:0,conduct:true,links:[]});   // adjacent to lever
  g.redstone.addComponent({type:'lamp',col:5,row:r,on:false,color:0,conduct:false,links:[]});  // isolated
  const lever=g.redstone.getAt(3,r); lever.on=true; g._rsStartFromSource(3,r,true); drain(g);
  ok(g.redstone.getAt(4,r).on===true, 'B: lever lights adjacent conducting lamp');
  ok(g.redstone.getAt(5,r).on===false, 'B: conduct=false lamp stays dark (isolated)');
}
// C: regression — default sinks (no conduct field) still conduct to each other.
{
  const g=mkGame(); const r=8;
  g.redstone.addComponent({type:'lever',col:3,row:r,on:false,links:[]});
  g.redstone.addComponent({type:'lamp',col:4,row:r,on:false,color:0,links:[]});  // no conduct field -> default true
  g.redstone.addComponent({type:'lamp',col:5,row:r,on:false,color:0,links:[]});
  const lever=g.redstone.getAt(3,r); lever.on=true; g._rsStartFromSource(3,r,true); drain(g);
  ok(g.redstone.getAt(4,r).on===true && g.redstone.getAt(5,r).on===true, 'C: default sinks still conduct (no regression)');
}
// D: cross-lighting guard — two SEPARATE conducting weight sensors NOT adjacent don't share.
{
  const g=mkGame(); const r=8;
  g.redstone.addComponent({type:'weight',col:3,row:r,on:false,trigger:'both',conduct:true,links:[]});
  g.redstone.addComponent({type:'lamp',col:4,row:r,on:false,color:0,conduct:true,links:[]});
  g.redstone.addComponent({type:'weight',col:8,row:r,on:false,trigger:'both',conduct:true,links:[]}); // far, disconnected
  g.redstone.addComponent({type:'lamp',col:9,row:r,on:false,color:0,conduct:true,links:[]});
  fireSources(g); g.player=ent(3,r); g._updateWeightPlates(); fireSources(g); drain(g);
  ok(g.redstone.getAt(4,r).on===true, 'D: near lamp lights');
  ok(g.redstone.getAt(9,r).on===false, 'D: far disconnected lamp stays dark');
}
// E: conduct DEFAULTS — sinks default ON, sources default OFF (so old worlds are unchanged).
{
  const g=mkGame();
  const lamp=g.redstone.addComponent?null:null;
  g.redstone.components.push({type:'lamp',col:1,row:1},{type:'trapdoor',col:2,row:1},{type:'piston',col:3,row:1},
    {type:'pressure_plate',col:4,row:1},{type:'weight',col:5,row:1},{type:'target',col:6,row:1});
  ok(g._conducts({type:'lamp'})===true && g._conducts({type:'trapdoor'})===true && g._conducts({type:'piston'})===true, 'E: sinks conduct by default');
  ok(g._conducts({type:'weight'})===false && g._conducts({type:'pressure_plate'})===false && g._conducts({type:'target'})===false, 'E: sources do NOT conduct by default');
  ok(g._conducts({type:'lamp',conduct:false})===false && g._conducts({type:'weight',conduct:true})===true, 'E: explicit flag overrides the default');
}
// F: persistence — _restoreRsExtras applies conduct + skin from a saved payload.
{
  const g=mkGame(); const r=2;
  g.redstone.addComponent({type:'lamp',col:1,row:r,on:false,color:0,links:[]});
  g.redstone.addComponent({type:'weight',col:2,row:r,on:false,trigger:'both',links:[]});
  g.level.set(r,3,BLOCK.PRESSURE_PLATE); g.redstone.addComponent({type:'pressure_plate',col:3,row:r,on:false,links:[]});
  g._restoreRsExtras({
    sandboxLamps:[{col:1,row:r,color:4,conduct:false}],
    sandboxWeightPlates:[{col:2,row:r,trigger:'mobs',conduct:true,skin:BLOCK.OAK_PLANKS}],
    sandboxPlates:[{col:3,row:r,conduct:true,skin:BLOCK.STONE}],
  });
  const lamp=g.redstone.getAt(1,r), wt=g.redstone.getAt(2,r), pl=g.redstone.getAt(3,r);
  ok(lamp.color===4 && lamp.conduct===false, 'F: lamp colour + conduct restored');
  ok(wt.trigger==='mobs' && wt.conduct===true && wt.skin===BLOCK.OAK_PLANKS, 'F: weight trigger + conduct + skin restored');
  ok(pl.conduct===true && pl.skin===BLOCK.STONE, 'F: plate conduct + skin restored');
}
// G: no-regression — a DEFAULT lamp lights but must NOT arm adjacent TNT; an EXPLICIT conducting lamp does.
{
  const g=mkGame(); const r=8;
  g.redstone.addComponent({type:'lever',col:3,row:r,on:false,links:[]});
  g.redstone.addComponent({type:'lamp',col:4,row:r,on:false,color:0,links:[]});   // default (untouched)
  g.redstone.addComponent({type:'tnt',col:5,row:r,fuse:0,links:[]});
  const lever=g.redstone.getAt(3,r); lever.on=true; g._rsStartFromSource(3,r,true); drain(g);
  g._rsApplyDevice(g.redstone.getAt(5,r));
  ok(g.redstone.getAt(4,r).on===true, 'G: default lamp lights');
  ok(g.redstone.getAt(5,r).fuse===0, 'G: default lit lamp does NOT arm adjacent TNT (no 265 regression)');
}
{
  const g=mkGame(); const r=8;
  g.redstone.addComponent({type:'lever',col:3,row:r,on:false,links:[]});
  g.redstone.addComponent({type:'lamp',col:4,row:r,on:false,color:0,conduct:true,links:[]});  // explicit conduct
  g.redstone.addComponent({type:'tnt',col:5,row:r,fuse:0,links:[]});
  const lever=g.redstone.getAt(3,r); lever.on=true; g._rsStartFromSource(3,r,true); drain(g);
  g._rsApplyDevice(g.redstone.getAt(5,r));
  ok(g.redstone.getAt(5,r).fuse>0, 'G: an EXPLICIT conducting lamp DOES relay to arm adjacent TNT');
}
if(fail)console.log(`\n${fail} FAILED, ${pass} passed`); else console.log(`\nAll ${pass} conduction assertions passed`);

if(fail)process.exit(1);
