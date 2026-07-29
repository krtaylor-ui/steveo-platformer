// §Animated skins — verify wheel-spin accumulation, pointer facing from movement, and _cellSkin
// resolution for anchor / direction / weight cells.
const fs=require('fs'),vm=require('vm');
const jsDir=require('path').join(__dirname,'..','js');
let pass=0,fail=0; const ok=(c,m)=>{if(c)pass++;else{fail++;console.log('  FAIL:',m);}};
const near=(a,b,e=1e-6)=>Math.abs(a-b)<=e;
const real={window:{},document:{},Math,console,Set,Map,Array,Object,JSON,Number,String,Boolean,isNaN,parseInt,parseFloat};
const sandbox=new Proxy(real,{has:()=>true,get:(t,k)=>(k in t?t[k]:(typeof k==='symbol'?undefined:1)),set:(t,k,v)=>{t[k]=v;return true;}});
vm.createContext(sandbox);
const load=(f,e)=>vm.runInContext(fs.readFileSync(`${jsDir}/${f}`,'utf8')+(e?`\n;${e}`:''),sandbox,{filename:f});
load('constants.js','this.BLOCK_SIZE=BLOCK_SIZE;');load('blocks.js','this.BLOCK=BLOCK;');
load('travel-tube.js');load('moving-platform.js','this.MOVING_PLATFORM=MOVING_PLATFORM;');
load('redstone.js','this.RedstoneSystem=RedstoneSystem;');load('game.js','this.Game=Game;');
const {Game,RedstoneSystem,BLOCK,BLOCK_SIZE:BS}=sandbox;
const g=Object.create(Game.prototype);
g.redstone=new RedstoneSystem([]);
g._platCell=()=>({acol:5,arow:5});

console.log('Wheel spin — accumulates with movement, signed by direction, idle = no change:');
{
  const pl={_ax:100,_ay:50,_pax:84,_pay:50,_dir:1};   // moved +16px right
  g._updateBlockAnim(pl);
  ok(near(pl._wheelAngle, 16/(BS*0.5)), 'wheel angle = distance / (BS/2) moving forward');
  ok(near(pl._moveAngle, 0), 'pointer faces +x when moving right');
  pl._pax=100; pl._ay=30; pl._pay=50;   // now moved up 20 (dy=-20)
  const before=pl._wheelAngle; g._updateBlockAnim(pl);
  ok(pl._wheelAngle>before, 'wheel keeps spinning forward while moving');
  ok(near(pl._moveAngle, Math.atan2(-20,0)), 'pointer faces movement vector (up)');
  // reverse direction spins the wheel back
  pl._dir=-1; pl._ax=100;pl._pax=116;pl._ay=30;pl._pay=30;   // moved -16 (left), dir -1
  const b2=pl._wheelAngle; g._updateBlockAnim(pl);
  ok(pl._wheelAngle<b2, 'wheel reverses when direction is backward');
  // idle: no movement -> angle unchanged, moveAngle held
  const b3=pl._wheelAngle, m3=pl._moveAngle; pl._pax=pl._ax; pl._pay=pl._ay; g._updateBlockAnim(pl);
  ok(near(pl._wheelAngle,b3), 'idle platform: wheel does not spin');
  ok(near(pl._moveAngle,m3), 'idle platform: pointer holds last heading');
}

console.log('_cellSkin — resolves anchor / direction / weight skins:');
{
  const pl={ skin:'wheel', anchorCol:5, anchorRow:5,
    _dirCtrls:[{dcol:1,drow:0,skin:'pointer'}] };
  g._dustBlocks=new Map();
  g.redstone=new RedstoneSystem([{type:'weight',col:5,row:5,skin:BLOCK.OAK_PLANKS}]);
  ok(g._cellSkin(pl,{blockType:BLOCK.ANCHOR_BLOCK,dcol:0,drow:0})==='wheel', 'anchor cell → platform skin');
  ok(g._cellSkin(pl,{blockType:BLOCK.DIRECTION_CONTROLLER,dcol:1,drow:0})==='pointer', 'direction cell → its dirCtrl skin');
  ok(g._cellSkin(pl,{blockType:BLOCK.WEIGHT_PLATE,dcol:0,drow:0})===BLOCK.OAK_PLANKS, 'weight cell → component skin (block id)');
  ok(g._cellSkin(pl,{blockType:BLOCK.OAK_LOG,dcol:2,drow:2})===null, 'plain block → no skin');
}

if(fail){console.log(`\n${fail} FAILED, ${pass} passed`);process.exit(1);}
console.log(`\nAll ${pass} block-skin assertions passed`);
