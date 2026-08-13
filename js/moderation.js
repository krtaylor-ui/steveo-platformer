// §B6 — appropriateness filter (SAFETY). A young audience will type usernames, world names, and
// descriptions that get shown to other players; there is no moderation anywhere in the app today. This is
// a standard wordlist blocklist, shared by the client (instant UX feedback) and the server (authoritative
// enforcement on create / rename / publish). It is intentionally conservative — for kids, over-blocking a
// borderline word is safer than letting a slur through — and easy to extend (add to BLOCKED / ANYWHERE).
//
// Matching model (precision matters — arbitrary substring matching over-blocked document(cum),
// skyscraper(rape), spicy(spic), shiitake(shit)):
//   • BLOCKED_SUBSTR — the worst slurs, matched ANYWHERE on the de-spaced string (catches "n i g g e r").
//   • ANYWHERE       — a curated set of profanity roots that never occur inside an innocent English word,
//                      so they can safely match as an infix too (catches "unf*ckingbelievable").
//   • BLOCKED        — every root, matched per-token as a STEM: exact, padded (collapsed === root), or at
//                      the START or END of the token (bullshit, dumbfuck, dickhead, shitty, fucking). A
//                      root in the MIDDLE of a longer word does NOT match — that's what freed document,
//                      skyscraper, cucumber, accumulate, circumstance… without enumerating them.
//   • ALLOW          — innocent words that genuinely START/END with a root (uranus, peacock, grape, spicy).
//
// NOTE: a wordlist is a floor, not a ceiling. It does not catch creative spelling forever; pair it with
// user reporting + admin review for anything that reaches a public storefront (tracked in the handoff).

const BLOCKED = new Set([
  'fuck', 'fuk', 'shit', 'sht', 'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy', 'cunt',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'spic', 'kike', 'chink', 'wetback',
  'rape', 'rapist', 'nazi', 'hitler', 'kkk', 'porn', 'sex', 'penis', 'vagina', 'boobs', 'tits',
  'damn', 'crap', 'piss', 'wank', 'jizz', 'cum', 'anus', 'twat', 'prick', 'bollocks',
]);

// Severe slurs — blocked even embedded, matched on the fully de-spaced, de-leeted string. SMALL + unambiguous.
const BLOCKED_SUBSTR = [
  'nigger', 'nigga', 'faggot', 'kkk', 'nazi', 'childporn',
];

// Profanity roots with NO innocent-English infix — safe to match anywhere within a token (infix evasion).
const ANYWHERE = ['fuck', 'shit', 'bitch', 'asshole'];

// De-leet map so "sh1t" / "f@ck" / "@ss" / "ni66er" / "ni99er" normalize to their letters.
// ('6'→'g' and '9'→'g' both close the ni66er/ni99er bypasses the tester found.)
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
const _LEET_RE = new RegExp('[' + Object.keys(LEET).join('').replace(/[\]\\^-]/g, '\\$&') + ']', 'g');

function _deleet(s) { return String(s).toLowerCase().replace(_LEET_RE, (ch) => LEET[ch] ?? ch); }

// Collapse EVERY run of a repeated character to a single (e.g. "shiiit" → "shit") so padding can't slip a
// word past. The collapsed form is matched EXACTLY against a root (=== , not includes) — it exists only to
// undo padding of the root itself; "includes" here would re-introduce the over-blocking (kkk→k flags "sky").
function _collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
const ROOTS = [...BLOCKED];

// Innocent words that START or END with a blocked root — allowlisted so stem-matching doesn't over-block
// (the Scunthorpe problem). Only words that COLLIDE at a boundary need listing; a root in the middle of a
// longer word (document, cucumber, accumulate, suspicious…) is already safe under stem-matching.
const ALLOW = new Set([
  // cock-
  'cockpit', 'cockpits', 'peacock', 'peacocks', 'cockatoo', 'cockatoos', 'cockatiel', 'cockatiels',
  'cockroach', 'cockroaches', 'shuttlecock', 'shuttlecocks', 'woodcock', 'woodcocks', 'hancock',
  'gamecock', 'gamecocks', 'weathercock', 'stopcock', 'haycock', 'cocktail', 'cocktails',
  'hitchcock', 'babcock', 'shattercock',
  // dick-
  'dickens', 'dickory', 'dickinson',
  // -sex(ton) / damn(ation)
  'sexton', 'sextons', 'damnation',
  // -anus / anus
  'uranus',
  // cum- (start) — mid-word cum is already safe (document, vacuum, succumb, cucumber, accumulate…)
  'cumin', 'cumulus', 'cumulative', 'cumbersome', 'cumberland', 'scum', 'scums',
  // -sex
  'sussex', 'essex', 'middlesex', 'unisex', 'sextet', 'sextant',
  // rape/rapist boundary
  'therapist', 'therapists', 'therapy', 'grape', 'grapes', 'grapefruit', 'scrape', 'scraped', 'scrapes',
  'scraper', 'drape', 'drapes', 'rapeseed',
  // crap boundary
  'scrap', 'scraps', 'scrapbook', 'scrapyard', 'scrappy',
  // spic-
  'spice', 'spices', 'spicy', 'spiced', 'spicier', 'spiciest', 'spiceberry',
  // prick-
  'prickly', 'prickle', 'prickles', 'prickled', 'prickling',
  // retard- (fire retardant)
  'retardant', 'retardants',
  // pussy(cat/willow)
  'pussycat', 'pussycats', 'pussywillow', 'pussywillows',
  // misc analyse
  'analyse', 'analysis',
  // infix collisions with the ANYWHERE set (mi-shit)
  'mishit', 'mishits',
]);

// A token is blocked if it exactly is / is padded to / starts with / ends with a root (stem match),
// or contains an ANYWHERE root as an infix. Allowlisted tokens are exempt.
function _hits(tok) {
  if (!tok || ALLOW.has(tok)) return false;
  for (const a of ANYWHERE) if (tok.includes(a)) return true;
  const col = _collapse(tok);
  for (const r of ROOTS) { if (col === r || tok.startsWith(r) || tok.endsWith(r)) return true; }
  return false;
}

const MODERATION = {
  // Returns { ok: boolean, reason?: string }. `label` names the field for the message.
  check(text, label = 'name') {
    if (text == null) return { ok: true };
    const deleeted = _deleet(String(text));
    const bad = () => ({ ok: false, reason: `That ${label} isn't allowed — please choose another.` });

    // 1) Severe slurs, de-spaced (catches "n i g g e r").
    const stripped = deleeted.replace(/[^a-z]/g, '');
    for (const s of BLOCKED_SUBSTR) if (stripped.includes(s)) return bad();

    // 2) Per-token stem match.
    const toks = deleeted.split(/[^a-z]+/).filter(Boolean);

    // 3) Spaced-out evasion: join runs of 3+ single-letter tokens ("f u c k", "f.u.c.k" → "fuck") and test
    //    those as extra tokens (they still pass through _hits / ALLOW). Normal multi-letter words are untouched.
    const joined = [];
    let run = [];
    const flush = () => { if (run.length >= 3) joined.push(run.join('')); run = []; };
    for (const t of toks) { if (t.length === 1) run.push(t); else flush(); }
    flush();

    for (const tok of toks.concat(joined)) if (_hits(tok)) return bad();
    return { ok: true };
  },

  isClean(text) { return this.check(text).ok; },

  // Case-fold for username uniqueness (see the migrations doc for a proper citext/folded-unique index).
  foldUsername(name) { return String(name || '').trim().toLowerCase(); },
};

if (typeof window !== 'undefined') window.MODERATION = MODERATION;
if (typeof module !== 'undefined' && module.exports) module.exports = MODERATION;
