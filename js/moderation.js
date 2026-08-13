// §B6 — appropriateness filter (SAFETY). A young audience will type usernames, world names, and
// descriptions that get shown to other players; there is no moderation anywhere in the app today. This is
// a standard wordlist blocklist, shared by the client (instant UX feedback) and the server (authoritative
// enforcement on create / rename / publish). It is intentionally conservative — for kids, over-blocking a
// borderline word is safer than letting a slur through — and easy to extend (add to BLOCKED / BLOCKED_SUBSTR).
//
// NOTE: a wordlist is a floor, not a ceiling. It does not catch creative spelling forever; pair it with
// user reporting + admin review for anything that reaches a public storefront (tracked in the handoff).

// Whole-word blocks (matched against normalized, de-leeted tokens). Kept PG in this source: profanity
// roots + common slurs are represented; extend as needed. (Abbreviated roots catch inflections.)
const BLOCKED = new Set([
  'fuck', 'fuk', 'shit', 'sht', 'bitch', 'bastard', 'asshole', 'dick', 'cock', 'pussy', 'cunt',
  'whore', 'slut', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'spic', 'kike', 'chink', 'wetback',
  'rape', 'rapist', 'nazi', 'hitler', 'kkk', 'porn', 'sex', 'penis', 'vagina', 'boobs', 'tits',
  'damn', 'crap', 'piss', 'wank', 'jizz', 'cum', 'anus', 'twat', 'prick', 'bollocks',
]);

// Substring blocks — offensive roots that should be caught even when embedded (matched on the fully
// de-spaced, de-leeted string). Keep this list SMALL and unambiguous to limit false positives.
const BLOCKED_SUBSTR = [
  'nigger', 'nigga', 'faggot', 'kkk', 'nazi', 'childporn',
];   // NB: 'rape' lives in the token pass instead (so the allowlist can spare "grape"/"therapist").

// De-leet map so "sh1t" / "f@ck" / "@ss" / "ni66er" normalize to their letters. ('6'→'g' closes the
// ni66er bypass the tester found.)
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

function _deleet(s) { return String(s).toLowerCase().replace(/[0134567 8@$!|]/g, (ch) => LEET[ch] ?? ch); }

// Collapse EVERY run of a repeated character to a single (e.g. "shiiit" → "shit") so padding can't slip a
// word past. The LITERAL root is matched against BOTH the token and its collapsed form — NOT a collapsed
// root (collapsing "kkk"→"k" would then flag any word with a 'k', e.g. "sky").
function _collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
const ROOTS = [...BLOCKED];

// Innocent words that CONTAIN a blocked root — allowlisted so stem-matching doesn't over-block common
// kid words (Scunthorpe problem). Safety still wins on anything not here; extend as false positives surface.
const ALLOW = new Set([
  'cockpit', 'cockpits', 'peacock', 'peacocks', 'cockatoo', 'cockatoos', 'cockatiel', 'cockroach', 'cockroaches',
  'shuttlecock', 'woodcock', 'hancock', 'gamecock', 'weathercock',
  'dickens', 'dickory', 'uranus', 'cucumber', 'cucumbers', 'accumulate', 'accumulator', 'circumstance', 'circumstances',
  'succumb', 'sussex', 'essex', 'middlesex', 'scunthorpe', 'therapist', 'therapists', 'grape', 'grapes', 'grapefruit',
  'scrape', 'scraped', 'scrapes', 'scrap', 'scraps', 'scrapbook', 'scrapyard', 'analyse', 'analysis',
]);

const MODERATION = {
  // Returns { ok: boolean, reason?: string }. `label` names the field for the message.
  check(text, label = 'name') {
    if (text == null) return { ok: true };
    const raw = String(text);
    const deleeted = _deleet(raw);
    const bad = () => ({ ok: false, reason: `That ${label} isn't allowed — please choose another.` });
    // Whole-string pass for the worst slurs (also catches spaced/padded evasion like "n i g g e r").
    const stripped = deleeted.replace(/[^a-z]/g, '');
    for (const s of BLOCKED_SUBSTR) if (stripped.includes(s)) return bad();
    // Stem pass: a token is blocked if it CONTAINS a blocked root (catches inflections — shitty, fucking,
    // assholes, bitches, dickhead — and compounds — bullshit, dumbfuck), unless the whole token is allowlisted.
    for (const tok of deleeted.split(/[^a-z]+/).filter(Boolean)) {
      if (ALLOW.has(tok)) continue;
      const col = _collapse(tok);
      for (const r of ROOTS) { if (tok.includes(r) || col.includes(r)) return bad(); }
    }
    return { ok: true };
  },

  isClean(text) { return this.check(text).ok; },

  // Case-fold for username uniqueness (see the migrations doc for a proper citext/folded-unique index).
  foldUsername(name) { return String(name || '').trim().toLowerCase(); },
};

if (typeof window !== 'undefined') window.MODERATION = MODERATION;
if (typeof module !== 'undefined' && module.exports) module.exports = MODERATION;
