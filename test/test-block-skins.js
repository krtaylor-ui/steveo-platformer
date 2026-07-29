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

console.log('Sticky config — next placed block inherits the last-configured settings:');
{
  const gg=Object.create(Game.prototype);
  // Configure a weight sensor, then remember it.
  gg._rememberBlockConfig({type:'weight', trigger:'mobs', conduct:true, skin:BLOCK.OAK_PLANKS});
  const fresh={type:'weight', trigger:'both'};   // a freshly-placed default
  gg._applyBlockDefaults(fresh);
  ok(fresh.trigger==='mobs' && fresh.conduct===true && fresh.skin===BLOCK.OAK_PLANKS, 'new weight sensor inherits trigger+conduct+skin');
  // Lamp remembers colour + conduct, independently of weight.
  gg._rememberBlockConfig({type:'lamp', color:5, conduct:false});
  const lamp={type:'lamp', color:0}; gg._applyBlockDefaults(lamp);
  ok(lamp.color===5 && lamp.conduct===false, 'new lamp inherits colour + conduct');
  // A type never configured gets no defaults applied.
  const td={type:'trapdoor'}; gg._applyBlockDefaults(td);
  ok(td.conduct===undefined, 'unconfigured type keeps its own defaults');
  // Non-configurable type is ignored by remember.
  gg._rememberBlockConfig({type:'lever', on:true});
  ok(!gg._blockDefaults.lever, 'levers are not tracked (no configurable fields)');
  // Brush/stroke placement path (_ensureRsComponent) creates the component WITH the sticky defaults.
  gg.redstone=new RedstoneSystem([]);
  gg._ensureRsComponent(4, 3, BLOCK.WEIGHT_PLATE);   // (row=4,col=3)
  const placed=gg.redstone.getAt(3,4);
  ok(placed && placed.type==='weight' && placed.trigger==='mobs' && placed.conduct===true && placed.skin===BLOCK.OAK_PLANKS,
     'brush-placed weight sensor is created with the remembered defaults');
  gg._ensureRsComponent(4, 3, BLOCK.WEIGHT_PLATE);   // already occupied → no duplicate
  ok(gg.redstone.components.filter(c=>c.col===3&&c.row===4).length===1, 'no duplicate component on re-place');
}

// §Platform lamp colour stability — a moving platform's lamp keeps its authored colour even when
// getAt at the MOVED cell resolves to a different (red) lamp. (Super Mario 1-1 "turns red" bug.)
console.log('Platform lamp colour stability (Super Mario 1-1 turns-red bug):');
{
  const gp=Object.create(Game.prototype);
  gp._platCell = () => ({ acol: 30, arow: 40 });   // platform has MOVED far from the lamp's origin
  // At the moved cell (30+0, 40+0)=(30,40) sits a DIFFERENT lamp with colour 0 (red) + off.
  gp.redstone = new RedstoneSystem([{ type:'lamp', col:30, row:40, color:0, on:false }]);
  const cell = { dcol:0, drow:0, blockType: BLOCK.REDSTONE_LAMP, lampColor: 4 };   // authored Cyan
  ok(gp._platformCellState({}, cell).colorIdx === 4, 'moving platform lamp keeps authored colour (cyan) despite getAt hitting a red lamp');
  ok(gp._platformCellState({}, { dcol:0, drow:0, blockType: BLOCK.REDSTONE_LAMP }).colorIdx === 0, 'no captured colour → falls back to getAt');
  // Captured component reference wins for BOTH colour and on-state, regardless of the moved-cell lookup.
  const cellC = { dcol:0, drow:0, blockType: BLOCK.REDSTONE_LAMP, lampComp: { type:'lamp', color:8, on:true } };  // White, lit
  const stC = gp._platformCellState({}, cellC);
  ok(stC.colorIdx === 8 && stC.on === true, 'captured lamp component drives colour(white)+on, not the red/off lamp at the moved cell');
}

if(fail){console.log(`\n${fail} FAILED, ${pass} passed`);process.exit(1);}
console.log(`\nAll ${pass} block-skin assertions passed`);
