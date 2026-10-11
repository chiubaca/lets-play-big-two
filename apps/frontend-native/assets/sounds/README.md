# Native table sound effects

Eight bundled CC0 sound files, about 601 KB total. No network download or
microphone permission is needed for playback in an installed release build.

| Asset               | Source                                 | Edit                   | Playback volume |
| ------------------- | -------------------------------------- | ---------------------- | --------------- |
| `card-select.wav`   | Kenney Casino Audio `card-slide-1.ogg` | 160 ms, 25 ms fade-out | 22%             |
| `card-deselect.wav` | Kenney Casino Audio `card-slide-2.ogg` | 140 ms, 25 ms fade-out | 18%             |
| `card-place-1.wav`  | Kenney Casino Audio `card-place-1.ogg` | Untrimmed, 689 ms      | 38%             |
| `card-place-2.wav`  | Kenney Casino Audio `card-place-2.ogg` | Untrimmed, 456 ms      | 38%             |
| `card-place-3.wav`  | Kenney Casino Audio `card-place-3.ogg` | Untrimmed, 883 ms      | 38%             |
| `card-place-4.wav`  | Kenney Casino Audio `card-place-4.ogg` | Untrimmed, 601 ms      | 38%             |
| `card-deal.wav`     | Kenney Casino Audio `card-fan-1.ogg`   | 550 ms, 60 ms fade-out | 28%             |
| `bell2.mp3`         | n4 Basic Sound Effects `bell2.mp3`     | Unchanged, 1.541 s     | 32%             |

The selection, deselection, and deal edits remove leading silence at -50 dB, use a 3 ms fade-in,
and are exported as 44.1 kHz mono 16-bit PCM WAV with peaks normalized to -3 dBFS.
Low playback volumes keep frequent selection softer than play and the turn cue
restrained.
The turn cue is the original 44.1 kHz stereo MP3, without trimming or processing.
The four placement variants are the unchanged 44.1 kHz stereo WAVs from the
research downloads, decoded from Kenney's originals without trimming or normalization.
Unused candidates and duplicate source copies have been removed. Source download
links, licenses, and hashes remain in
[`docs/assets/sound-effects`](../../../../docs/assets/sound-effects/README.md).

## Licenses and sources

- **Kenney Casino Audio 1.1**, by Kenney Vleugels:
  <https://kenney.nl/assets/casino-audio>. The included license is reproduced in
  [KENNEY-LICENSE.txt](KENNEY-LICENSE.txt). CC0 allows personal/commercial use and
  redistribution, with no mandatory credit.
- **Basic Sound Effects**, by n4:
  <https://opengameart.org/content/basic-sound-effects>. The creator-upload page
  labels the downloadable files CC0 and links to
  <https://creativecommons.org/publicdomain/zero/1.0/>. Downloaded on 2026-10-11
  from <https://opengameart.org/sites/default/files/bell2_0.mp3>.
  There is no separate license file for that individual MP3; its source license
  and hash are recorded in the research directory. Optional credit:
  `Sound effects by Kenney and n4 (CC0)`.

## Behavior

Selection/deselection use one shared gesture handler for both the hand and the
accessible card sheet. Placement is triggered by a newly confirmed pile entry,
not tapping Play. Each audible placement cycles through `card-place-1.wav`,
`card-place-2.wav`, `card-place-3.wav`, and `card-place-4.wav`, then wraps to the
first. All variants are preloaded and share the same volume. Muted, unavailable,
or canceled cues do not consume a rotation slot, and a newer placement stops the
previous one. Switching tables starts the cycle again.

An observed new deal uses one fan sound, not 52 overlapping clips. The turn chime
follows a meaningful turn/reveal transition and is briefly delayed after a
play/deal cue rather than starting simultaneously with it.

Initial hydration, reconnects, room/account changes, and background snapshots
are silent. Muting stops active playback and queued cues; unmuting does not replay
missed events. Sound is foreground-only, respects the device's silent mode, and
mixes with other apps' audio. Push-notification sounds are unchanged.

`Table settings → Sound effects` saves the preference under
`big-two-native-sound-enabled` in AsyncStorage (on by default).

## Native rebuild

`expo-audio` adds native code. App/runtime version **1.1.6** needs a new development
or release binary; do not publish this to the older 1.1.5 runtime as an OTA-only
change. The plugin disables recording permissions and background playback.

From the repo root, rebuild the development client with `vp run native:android`
or `vp run native:ios`, then start the usual native or Storybook Metro session.
Device listening checks are still needed to tune the final mix on phone speakers
and headphones.

## Verification

Before the switch to `bell2.mp3`, Expo MCP checks on the API 36 Android emulator
(2026-10-11) confirmed all five native players completing playback at the
configured volumes, repeated playback,
muted interactions, mute persistence after a cold restart, and no stale cue when
unmuting or resuming. These checks found and fixed Android's completed-player
readiness mismatch: use `currentStatus.isLoaded`, not the `isLoaded` getter, before
seeking and replaying. iOS, online reconnects, silent mode, and listening on actual
phone speakers/headphones still need device QA.

After the switch, Expo MCP confirmed `bell2.mp3` completing its 1.541-second native
turn playback at 32% volume without errors.

After adding placement rotation, Expo MCP confirmed the native sequence
`1 → 2 → 3 → 4 → 1` on confirmed plays, with each variant playing at 38% volume.
Hook tests cover wrapping, rerenders, mute, background/reconnect baselines, failed
loads/seeks, stale-seek cancellation, and resetting the cycle when switching tables.
