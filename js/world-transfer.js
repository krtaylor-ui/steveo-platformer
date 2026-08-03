// World Transfer — ONE export/import payload shape for BOTH engines.
//
// Before this, export lived in two side-scroll-only places (SANDBOX_UI.exportWorld and
// MENU._exportWorldFromMenu) and the overhead editor had none at all: an overhead world
// could be built in the app but never taken out of it (the QA fixture had to be recovered
// by reading localStorage by hand). This module is the single place that knows the file
// format, so the Sandbox card buttons, the overhead editor, and the importers agree.
//
// FILE FORMAT (v1 wrapper):
//   { steveoExport: 1, world_name, description, game_mode_default, view_mode,
//     exportedAt, world_data: <the world object the engine actually loads> }
//
// `world_data` is verbatim what the editor holds — for overhead that means viewMode:
// 'overhead' + schemaVersion, so OH_SETTINGS.migrate() can upgrade an old file on import.
// unwrap() also accepts a RAW world object (no wrapper) so hand-made fixtures and files
// written by older builds still import.
(function () {
  const WRAPPER_VERSION = 1;

  const isOverheadData = (wd) => !!(wd && wd.viewMode === 'overhead');

  // Pull a world name out of whatever we were handed, falling back to the file's
  // basename (an import should never silently become "Imported World").
  function nameFrom(parsed, wd, fileName) {
    const embedded = (parsed && (parsed.world_name || parsed.worldName || parsed.name)) ||
                     (wd && (wd.name || wd.world_name || wd.worldName));
    if (embedded && String(embedded).trim()) return String(embedded).trim();
    if (fileName) {
      const base = String(fileName).replace(/^.*[\\/]/, '').replace(/\.json$/i, '')
        .replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      if (base) return base;
    }
    return 'Imported World';
  }

  const safeName = (name) => String(name || 'world').replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'world';

  // `dateStr` is passed in (not stamped here) so callers control the clock and the
  // headless tests stay deterministic.
  const filename = (name, dateStr) => safeName(name) + (dateStr ? '-' + dateStr : '') + '.json';

  function wrap(worldData, opts) {
    opts = opts || {};
    const wd = worldData || {};
    return {
      steveoExport: WRAPPER_VERSION,
      world_name: opts.name || wd.name || wd.world_name || 'World',
      description: opts.description || wd.description || '',
      game_mode_default: wd.gameModeDefault || opts.mode || 'NRM',
      view_mode: isOverheadData(wd) ? 'overhead' : 'side',
      exportedAt: opts.exportedAt || null,
      world_data: wd,
    };
  }

  // Accepts a v1 wrapper OR a bare world object. Never throws on shape — callers get
  // `ok:false` + a reason so they can show it instead of dying on a stray file.
  function unwrap(parsed, fileName) {
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'Not a world file (expected a JSON object).' };
    }
    const wrapped = Object.prototype.hasOwnProperty.call(parsed, 'world_data');
    const wd = wrapped ? parsed.world_data : parsed;
    if (!wd || typeof wd !== 'object' || Array.isArray(wd)) {
      return { ok: false, error: 'World file has no usable world_data.' };
    }
    const overhead = isOverheadData(wd);
    return {
      ok: true,
      worldData: wd,
      name: nameFrom(parsed, wd, fileName),
      description: (wrapped && parsed.description) || wd.description || '',
      mode: (wrapped && parsed.game_mode_default) || wd.gameModeDefault || 'NRM',
      isOverhead: overhead,
      wrapped,
    };
  }

  // Structural check for an OVERHEAD world before we hand it to the editor/runtime.
  // Cheap on purpose: enough to catch "that's a side-scroll file" and truncated saves,
  // not a full schema validation (the migrator backfills the rest).
  function validateOverhead(wd) {
    const errors = [];
    if (!wd || typeof wd !== 'object') { return { ok: false, errors: ['not an object'] }; }
    if (wd.viewMode !== 'overhead') errors.push("not an overhead world (viewMode is not 'overhead')");
    const map = wd.mapSnapshot;
    if (!map || typeof map !== 'object') errors.push('missing mapSnapshot');
    else {
      if (!(map.gridW > 0) || !(map.gridH > 0)) errors.push('mapSnapshot has no grid size');
      if (!Array.isArray(map.ground)) errors.push('mapSnapshot.ground is not an array');
      else if (map.gridH > 0 && map.ground.length !== map.gridH) {
        errors.push('mapSnapshot.ground has ' + map.ground.length + ' rows, expected ' + map.gridH);
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // Trigger a browser download of `payload` as pretty JSON. No-op outside a browser.
  function download(payload, fileName) {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') return false;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return true;
  }

  const today = () => {
    try { return new Date().toISOString().slice(0, 10); } catch (e) { return ''; }
  };

  // Open a NATIVE file picker and hand back the parsed JSON. `cb(err, parsed, fileName)`.
  //
  // DEPRECATED — kept only so nothing external breaks. Do NOT use it for new UI: a
  // programmatic input.click() needs user activation, so it can silently do nothing
  // (the build-346 editor import looked like a dead button, QA F5), and an automated
  // session can neither drive nor see the OS dialog. Use an in-page modal with a
  // visible <input type="file"> instead, the way OH_EDITOR._import() now does.
  function pickJsonFile(cb) {
    if (typeof document === 'undefined') { cb(new Error('no DOM')); return; }
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.style.display = 'none';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) { cb(null, null, null); return; }
      const reader = new FileReader();
      reader.onload = (e) => {
        let parsed;
        try { parsed = JSON.parse(e.target.result); }
        catch (err) { cb(new Error('Invalid JSON file')); return; }
        cb(null, parsed, file.name);
      };
      reader.onerror = () => cb(new Error('Could not read the file'));
      reader.readAsText(file);
      if (input.parentNode) input.parentNode.removeChild(input);
    };
    document.body.appendChild(input);
    input.click();
  }

  const WORLD_TRANSFER = {
    WRAPPER_VERSION, wrap, unwrap, validateOverhead, isOverheadData,
    nameFrom, safeName, filename, download, pickJsonFile, today,
  };

  if (typeof window !== 'undefined') window.WORLD_TRANSFER = WORLD_TRANSFER;
  if (typeof module !== 'undefined' && module.exports) module.exports = WORLD_TRANSFER;
})();
