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
  'nigger', 'nigga', 'faggot', 'kkk', 'rape', 'nazi', 'childporn',
];

// De-leet map so "sh1t" / "f@ck" / "@ss" normalize to their letters.
const LEET = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

function _deleet(s) { return String(s).toLowerCase().replace(/[013457 8@$!|]/g, (ch) => LEET[ch] ?? ch); }

// Collapse EVERY run of a repeated character to a single (e.g. "shiiit" → "shit") so padding can't slip a
// word past. We match a token against BOTH its literal and collapsed form (and store the blocklist in
// both forms) so legitimate double letters in a blocked root — "asshole" → "ashole" — still match.
function _collapse(s) { return s.replace(/(.)\1+/g, '$1'); }
const BLOCKED_COLLAPSED = new Set([...BLOCKED].map(_collapse));

const MODERATION = {
  // Returns { ok: boolean, reason?: string }. `label` names the field for the message.
  check(text, label = 'name') {
    if (text == null) return { ok: true };
    const raw = String(text);
    const deleeted = _deleet(raw);
    const bad = () => ({ ok: false, reason: `That ${label} isn't allowed — please choose another.` });
    // Substring pass — literal roots against the de-spaced string (whole-word pass below handles padding).
    const stripped = deleeted.replace(/[^a-z]/g, '');
    for (const s of BLOCKED_SUBSTR) if (stripped.includes(s)) return bad();
    // Whole-word pass on de-leeted, punctuation-split tokens — match the literal token or its de-padded form.
    for (const tok of deleeted.split(/[^a-z]+/).filter(Boolean)) {
      if (BLOCKED.has(tok) || BLOCKED_COLLAPSED.has(_collapse(tok))) return bad();
    }
    return { ok: true };
  },

  isClean(text) { return this.check(text).ok; },

  // Case-fold for username uniqueness (see the migrations doc for a proper citext/folded-unique index).
  foldUsername(name) { return String(name || '').trim().toLowerCase(); },
};

if (typeof window !== 'undefined') window.MODERATION = MODERATION;
if (typeof module !== 'undefined' && module.exports) module.exports = MODERATION;
