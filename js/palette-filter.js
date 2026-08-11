// §E13 (§15) — "Other" palette mode-filter. Pure predicate shared by the palette render, the palette
// click routing, and the sandbox chest mirror, so all three show exactly the same items for a world.
//
// Each OTHER_PALETTE_ITEMS entry may carry a `modes:[]` set of the play modes it's useful in (one of
// 'normal'|'platformer'|'speedrunner'|'arena'). An item with NO `modes` is universal. A null / 'sandbox'
// / unknown worldMode shows everything (the editor designs worlds of any mode).
function otherItemVisibleInMode(item, worldMode) {
  if (!item || !item.modes) return true;
  if (!worldMode || worldMode === 'sandbox') return true;
  return item.modes.includes(worldMode);
}

if (typeof window !== 'undefined') window.otherItemVisibleInMode = otherItemVisibleInMode;
if (typeof module !== 'undefined' && module.exports) module.exports = { otherItemVisibleInMode };
