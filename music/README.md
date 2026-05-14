# Music Files

Place music files in the subdirectories. Supported formats: .mp3, .wav

## /intro/
- Any filename (e.g. intro.mp3) — plays once at game start

## /background/
Music files that correspond to MUSIC_DISCS entries in constants.js:
- newday.mp3      → "Sunny Day" disc (default unlocked)
- peaceful.mp3    → "Peaceful" disc (default unlocked)
- exploration.mp3 → "Exploration" disc (default unlocked)

Add more songs by adding entries to MUSIC_DISCS in js/constants.js.

## /boss/
- ender-dragon.mp3 — plays during Ender Dragon battle; drops as "Dragon's Lament" disc on defeat

## Adding new songs
1. Add your .mp3 to the appropriate subfolder
2. Add a new entry to MUSIC_DISCS in js/constants.js:
   ```js
   MY_SONG: {
     discName:       'My Song Name',
     audioFile:      'music/background/mysong.mp3',
     category:       'background',
     defaultUnlocked: true,
   }
   ```
3. No other code changes needed.

All files are optional. Missing files are silently skipped (no sound plays for that track).

## Music credits
Music by @LaudividniMusic and @T_en_M
