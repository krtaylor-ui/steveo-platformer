// §Rail Switch — verify route geometry (pivot→A/B), terminal cells, redstone-driven animation, and
// platform hand-off (transfer) between a switch and a touching rail.
const fs=require('fs'),vm=require('vm');
const jsDir=require('path').join(__dirname,'..','js');
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const real={window:{},document:{},Math,console,Set,Map,Array,Object,JSON,Number,String,Boolean,isNaN,parseInt,parseFloat};
const sandbox=new Proxy(real,{has:()=>true,get:(t,k)=>(k in t?t[k]:(typeof k==='symbol'?undefined:1)),set:(t,k,v)=>{t[k]=v;return true;}});
vm.createContext(sandbox);
const load=(f,e)=>vm.runInContext(fs.readFileSync(`${jsDir}/${f}`,'utf8')+(e?`\n;${e}`:''),sandbox,{filename:f});
load('constants.js','this.BLOCK_SIZE=BLOCK_SIZE;');load('blocks.js','this.BLOCK=BLOCK;');
load('travel-tube.js','this.TRAVEL_TUBE=TRAVEL_TUBE;');load('moving-platform.js','this.MOVING_PLATFORM=MOVING_PLATFORM;');
load('redstone.js','this.RedstoneSystem=RedstoneSystem;');load('game.js','this.Game=Game;');
const {Game,RedstoneSystem,BLOCK,BLOCK_SIZE:BS}=sandbox;
const mk=()=>{ const g=Object.create(Game.prototype);
  Object.assign(g,{frameCount:0,_dustBlocks:new Map(),_receivers:new Map(),_transmitters:new Map()});
  g.redstone=new RedstoneSystem([]); return g; };
const sw=()=>({ id:1, isSwitch:true, pivot:{col:5,row:5}, a:{col:10,row:5}, b:{col:5,row:10}, _anim:0, switchState:0, switchDur:10, switchChannel:null });

console.log('Route geometry — pivot → lerped(A,B):');
{
  const g=mk(); const s=sw(); g._rails=[s];
  const at0=g._railPts(s); ok(near(at0[0].x,5*BS+BS/2)&&near(at0[1].x,10*BS+BS/2)&&near(at0[1].y,5*BS+BS/2),'anim 0 → end at route A');
  s._anim=1; const at1=g._railPts(s); ok(near(at1[1].x,5*BS+BS/2)&&near(at1[1].y,10*BS+BS/2),'anim 1 → end at route B');
  s._anim=0.5; const atm=g._railPts(s); ok(near(atm[1].x,(10*BS+BS/2+5*BS+BS/2)/2),'anim 0.5 → end at midpoint');
}
console.log('Terminal cells:');
{
  const g=mk(); const s=sw(); g._rails=[s];
  ok(g._railStartCell(s).col===5&&g._railStartCell(s).row===5,'start = pivot');
  s._anim=0; ok(g._railEndCell(s).col===10&&g._railEndCell(s).row===5,'end = A when anim<0.5');
  s._anim=1; ok(g._railEndCell(s).col===5&&g._railEndCell(s).row===10,'end = B when anim>=0.5');
}
console.log('Redstone-driven animation:');
{
  const g=mk(); const s=sw(); g._rails=[s];
  g._dustBlocks.set('4,5',{col:4,row:5,on:true});   // adjacent to pivot (5,5)
  ok(g._switchAdjacentPowered(s)===true,'adjacent dust powers the switch');
  g._updateRailSwitches(); ok(near(s._anim,0.1),'powered → eases toward route B (1/dur per frame)');
  g._dustBlocks.get('4,5').on=false;
  for(let i=0;i<20;i++) g._updateRailSwitches();
  ok(near(s._anim,0),'unpowered → eases back to default route A');
}
console.log('Platform hand-off (transfer):');
{
  const g=mk(); const s=sw(); s._anim=0;   // active route = A end (10,5)
  const rail2={ id:2, cells:[{col:10,row:5},{col:20,row:5}], vis:'visible' };   // starts at the switch's A end
  g._rails=[s, rail2];
  const pl={ railId:1, _dist:100, _dir:1, anchorCol:5, anchorRow:5 };
  const moved = g._transferPlatform(pl, s, false);   // reached the switch's active END
  ok(moved===true,'transfers onto the rail touching the active route');
  ok(pl.railId===2 && pl._dist===0 && pl._dir===1,'bound to rail 2 at its start, heading inward');
  ok(pl.anchorCol===10 && pl.anchorRow===5,'anchor re-based to the junction cell');
  // Guard: two PLAIN rails sharing an endpoint do NOT transfer (no switch involved).
  const g2=mk(); const rA={id:1,cells:[{col:0,row:0},{col:5,row:0}],vis:'visible'}, rB={id:2,cells:[{col:5,row:0},{col:9,row:0}],vis:'visible'};
  g2._rails=[rA,rB]; const p2={railId:1,_dist:0,_dir:-1,anchorCol:0,anchorRow:0};
  ok(g2._transferPlatform(p2, rA, false)===false,'plain rail↔rail does NOT hand off (no behavior change)');
}
if(fail){console.log(`\n${fail} FAILED, ${pass} passed`);process.exit(1);}
console.log(`\nAll ${pass} rail-switch assertions passed`);
