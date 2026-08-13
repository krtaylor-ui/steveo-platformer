// Headless tests for the pure Campaign data model (routing + publish validation).
//   node test/test-campaign.js
const { CAMPAIGN_MODEL: M } = require('../js/campaign-model.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

// ── Build a small 2-zone campaign fixture ─────────────────────────────────
// Zone A: w1 → w2 → w3(boss).  Zone B: w4 → w5(boss).
function fixture() {
  const c = M.newCampaign('Test Campaign', 'creator1');
  const zA = M.newZone('z1', 'Green Hills');
  const zB = M.newZone('z2', 'Ice Caves');
  c.zones = [zA, zB];
  c.zoneOrder = ['z1', 'z2'];
  const mk = (id, zone, uid) => {
    const w = M.newCampaignWorld(id, zone, uid, id.toUpperCase());
    w.entryPoints = [{ spawnPointId: 'sp1', label: 'Start', isDefault: true },
                     { spawnPointId: 'sp2', label: 'Back door' }];
    return w;
  };
  const w1 = mk('w1', 'z1', 'uid1'), w2 = mk('w2', 'z1', 'uid2'), w3 = mk('w3', 'z1', 'uid3');
  const w4 = mk('w4', 'z2', 'uid4'), w5 = mk('w5', 'z2', 'uid5');
  c.worlds = [w1, w2, w3, w4, w5];
  zA.worldOrder = ['w1', 'w2', 'w3'];
  zB.worldOrder = ['w4', 'w5'];
  c.startingWorldId = 'w1';
  return c;
}

console.log('Boss World is computed as the last in worldOrder:');
{
  const c = fixture();
  ok(M.bossWorldId(c, 'z1') === 'w3', 'zone A boss = w3');
  ok(M.isBossWorld(c, 'w3') === true, 'w3 is boss');
  ok(M.isBossWorld(c, 'w2') === false, 'w2 is not boss');
  // Extend the sequence — boss designation shifts.
  M.addWorldToZone(c, 'z1', M.newCampaignWorld('w6', 'z1', 'uid6', 'W6'));
  ok(M.bossWorldId(c, 'z1') === 'w6', 'adding a world shifts the boss to w6');
  ok(M.isBossWorld(c, 'w3') === false, 'w3 no longer boss after extend');
}

console.log('Goal Star 1 = next in sequence (colour index 0):');
{
  const c = fixture();
  const r = M.resolveExit(c, 'w1', 0);
  ok(r.kind === 'world' && r.worldId === 'w2', 'w1 star1 → w2');
  ok(r.entryPointId === 'sp1', 'defaults to first/default entry point');
}

console.log('Boss Goal Star 1 transitions to the next Zone:');
{
  const c = fixture();
  const r = M.resolveExit(c, 'w3', 0);   // zone A boss
  ok(r.kind === 'zone' && r.zoneId === 'z2' && r.worldId === 'w4', 'zone A boss → zone B first world');
}

console.log('Last Zone boss Goal Star 1 completes the Campaign:');
{
  const c = fixture();
  const r = M.resolveExit(c, 'w5', 0);   // zone B boss (last zone)
  ok(r.kind === 'campaign-complete', 'final boss → campaign-complete');
}

console.log('Goal Stars 2–10 require explicit routing:');
{
  const c = fixture();
  // Unrouted secret star on w1 (colour index 1 = star 2).
  let r = M.resolveExit(c, 'w1', 1);
  ok(r.kind === 'unrouted' && r.starIndex === 2, 'star 2 unrouted → unrouted');
  // Route star 2 as a "connect" to w4 via its back door.
  M.getWorld(c, 'w1').goalStarRouting.push({
    starIndex: 2, routeType: 'connect', destinationWorldId: 'w4',
    destinationEntryPointId: 'sp2', hidden: true,
  });
  r = M.resolveExit(c, 'w1', 1);
  ok(r.kind === 'world' && r.worldId === 'w4' && r.entryPointId === 'sp2', 'routed star 2 → w4 back door');
  ok(r.secret === true, 'hidden route marked secret');
}

console.log('Goal Star numbering maps 1:1 to GOAL_COLORS index+1:');
{
  const c = fixture();
  M.getWorld(c, 'w2').goalStarRouting.push({
    starIndex: 5, routeType: 'bonus', destinationWorldId: 'w4', hidden: false });
  const r = M.resolveExit(c, 'w2', 4);   // colour index 4 → star 5
  ok(r.kind === 'world' && r.worldId === 'w4', 'colour index 4 resolves star 5');
}

console.log('starIndexesFromWorldData reads gold grid + non-gold goalStars:');
{
  // A 2×2 grid with a plain GOAL block (gold) + a recorded red (colour 1) star.
  const wd = {
    grid: [[0, M.GOAL_BLOCK_ID], [0, M.GOAL_BLOCK_ID]],
    goalStars: [{ row: 0, col: 1, color: 1 }],   // (0,1) is red, not gold
  };
  const stars = M.starIndexesFromWorldData(wd);
  ok(stars.includes(2), 'red star → index 2 present');
  ok(stars.includes(1), 'the plain gold GOAL at (1,1) → index 1 present');
  ok(stars.length === 2, 'exactly 2 distinct stars');
}

console.log('Bonus (out-of-sequence) world: star 1 needs explicit routing, never boss:');
{
  const c = fixture();
  const bonus = M.newCampaignWorld('wb', 'z1', 'uidB', 'Bonus Vault');
  bonus.entryPoints = [{ spawnPointId: 'sp1', label: 'Start', isDefault: true }];
  bonus.stars = [1];
  M.addBonusWorld(c, 'z1', bonus);
  ok(bonus.outOfSequence === true, 'flagged out-of-sequence');
  ok(M.isBossWorld(c, 'wb') === false, 'bonus world is never the boss');
  ok(M.bossWorldId(c, 'z1') === 'w3', 'boss unchanged after adding a bonus world');
  ok(M.bonusWorldsInZone(c, 'z1').length === 1, 'bonus grouped under its zone');
  // Its star 1 is unrouted → resolves as unrouted, and fails validation.
  let r = M.resolveExit(c, 'wb', 0);
  ok(r.kind === 'unrouted', 'bonus star 1 unrouted → unrouted (not campaign-complete)');
  // Route it back to w2 → resolves + validates.
  bonus.goalStarRouting.push({ starIndex: 1, routeType: 'connect', destinationWorldId: 'w2', destinationEntryPointId: 'sp1' });
  r = M.resolveExit(c, 'wb', 0);
  ok(r.kind === 'world' && r.worldId === 'w2', 'routed bonus star 1 → w2');
  const vr = M.resolveStarForValidation(c, bonus, 1);
  ok(vr.ok === true, 'routed bonus star 1 passes validation');
}

console.log('Publish validation gate (§6):');
{
  const c = fixture();
  // World goal-star maps: every world has star 1; give w1 an unrouted star 2.
  const gs = { w1: [1, 2], w2: [1], w3: [1], w4: [1], w5: [1] };
  let v = M.validateForPublish(c, gs);
  ok(v.ok === false, 'unrouted star 2 blocks publish');
  ok(v.errors.some((e) => e.type === 'unrouted-star' && e.worldId === 'w1'), 'names w1 star 2');

  // Route the star 2 → passes.
  M.getWorld(c, 'w1').goalStarRouting.push({ starIndex: 2, routeType: 'bonus', destinationWorldId: 'w4' });
  v = M.validateForPublish(c, gs);
  ok(v.ok === true, 'routing the star clears validation');

  // A world with no goal star blocks publish.
  const gs2 = { w1: [1], w2: [], w3: [1], w4: [1], w5: [1] };
  v = M.validateForPublish(c, gs2);
  ok(v.ok === false && v.errors.some((e) => e.type === 'no-goal-star' && e.worldId === 'w2'),
     'world missing a goal star is flagged');
}

console.log('Save is never blocked — validation is a separate call:');
{
  // The model has no "save gate"; an incomplete campaign is a legal object.
  const c = M.newCampaign('Draft', 'creator1');
  ok(c.published === false && Array.isArray(c.worlds) && c.worlds.length === 0,
     'a fresh draft campaign is a valid object with no worlds');
}

console.log('removeWorld cleans up worldOrder, inbound routes, and starting-world:');
{
  const c = M.newCampaign('Remove Test', 'creator1');
  const z = M.newZone('z1', 'Zone');
  c.zones = [z]; c.zoneOrder = ['z1'];
  M.addWorldToZone(c, 'z1', M.newCampaignWorld('w1', 'z1', 'u1', 'W1'));
  M.addWorldToZone(c, 'z1', M.newCampaignWorld('w2', 'z1', 'u2', 'W2'));
  const bonus = M.newCampaignWorld('wb', 'z1', 'ub', 'Bonus');
  M.addBonusWorld(c, 'z1', bonus);
  c.startingWorldId = 'w1';
  // w1's Goal Star 2 routes into the bonus world.
  M.getWorld(c, 'w1').goalStarRouting = [{ starIndex: 2, routeType: 'bonus', destinationWorldId: 'wb' }];

  M.removeWorld(c, 'wb');
  ok(!M.getWorld(c, 'wb'), 'bonus world is gone from c.worlds');
  ok((M.getWorld(c, 'w1').goalStarRouting || []).length === 0, 'inbound route to it was stripped');

  M.removeWorld(c, 'w1');
  ok(!z.worldOrder.includes('w1'), 'removed world drops out of worldOrder');
  ok(c.startingWorldId === 'w2', 'starting-world re-points to the next remaining world');
}

console.log(`\ncampaign model: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
