# Card-game sound sources and provenance

Research on 2026-10-11 downloaded and validated **22 sound candidates**: 18 Kenney
WAVs and four original MP3s by n4. Unused candidates and duplicate research copies
have been removed. Only the eight sounds used by the native table remain in
[`apps/frontend-native/assets/sounds`](../../../apps/frontend-native/assets/sounds/README.md).

Both source packs are CC0; their included licenses allow commercial use without
mandatory attribution. Original license text is retained alongside each pack:
[Casino Audio](casino-audio/License.txt) and
[Interface Sounds](interface-sounds/License.txt).
The n4 files are also labeled CC0 on their creator-upload page; see their
[license and provenance record](n4-basic-sound-effects/README.md).

## Retained runtime assets

| Event           | Asset                                                                              | Duration |
| --------------- | ---------------------------------------------------------------------------------- | -------- |
| Select          | [card-select.wav](../../../apps/frontend-native/assets/sounds/card-select.wav)     | 0.160 s  |
| Deselect        | [card-deselect.wav](../../../apps/frontend-native/assets/sounds/card-deselect.wav) | 0.140 s  |
| Play, variant 1 | [card-place-1.wav](../../../apps/frontend-native/assets/sounds/card-place-1.wav)   | 0.689 s  |
| Play, variant 2 | [card-place-2.wav](../../../apps/frontend-native/assets/sounds/card-place-2.wav)   | 0.456 s  |
| Play, variant 3 | [card-place-3.wav](../../../apps/frontend-native/assets/sounds/card-place-3.wav)   | 0.883 s  |
| Play, variant 4 | [card-place-4.wav](../../../apps/frontend-native/assets/sounds/card-place-4.wav)   | 0.601 s  |
| Deal            | [card-deal.wav](../../../apps/frontend-native/assets/sounds/card-deal.wav)         | 0.550 s  |
| Your turn       | [bell2.mp3](../../../apps/frontend-native/assets/sounds/bell2.mp3)                 | 1.541 s  |

The native asset README records editing, playback volumes, and verification.
On macOS, open the files in QuickTime or play a retained sound from the repo root:

```sh
afplay apps/frontend-native/assets/sounds/bell2.mp3
```

## Source downloads

These are the official free ZIP links, verified by downloading them without an
account. The websites also offer optional donations.

| Pack                 | Official page                                          | Original ZIP                                                                                                        | ZIP SHA-256                                                        |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Casino Audio 1.1     | [kenney.nl](https://kenney.nl/assets/casino-audio)     | [Download](https://kenney.nl/media/pages/assets/casino-audio/2472606a04-1721639069/kenney_casino-audio.zip)         | `f36250766ac5bc378c13708ddf12a23a8e54a3251f8d482c7536e51b5dbafa18` |
| Interface Sounds 1.0 | [kenney.nl](https://kenney.nl/assets/interface-sounds) | [Download](https://kenney.nl/media/pages/assets/interface-sounds/fa43c1dd4d-1677589452/kenney_interface-sounds.zip) | `f2193d072726d6758a5f7871b2dcc54dcce0d5c35c6f0a62f92549b327c81232` |

The placement WAVs come from `Audio/card-place-<N>.ogg` in Casino Audio's ZIP. The
original OGG/Vorbis files were decoded with FFmpeg to 16-bit PCM WAV, retaining their
44.1 kHz sample rate and channel count. No deliberate trimming, volume adjustment,
or pitch changes were applied. Decoded WAV frame counts were used for durations;
these can differ slightly from the source OGG container durations.

Reproduce the conversion with FFmpeg after extracting a source pack:

```sh
ffmpeg -n -i Audio/card-place-2.ogg -c:a pcm_s16le card-place-2.wav
```

Only license text and provenance notes remain in this research directory. Use
the official links above to retrieve the source packs again.

The four n4 MP3s were downloaded unchanged from
[Basic Sound Effects](https://opengameart.org/content/basic-sound-effects).
Their original links and SHA-256 hashes are in the
[provenance record](n4-basic-sound-effects/README.md). Their durations are measured
from the MP3 containers and can include codec padding.

See [the research note](../../card-game-sound-effects.md) for other sources and
license caveats.

## Existing project audio

The web app already synthesizes selection, play, and turn sounds in
[`use-table-audio.ts`](../../../apps/frontend-web/src/components/game-room/use-table-audio.ts),
with a persisted mute preference and user-interaction audio unlock. A future
sample-based implementation should preserve those behaviors.

An in-game turn cue is separate from an operating-system push-notification sound:
the native push payload currently uses `sound: "default"` in
[`expo-turn-push.ts`](../../../apps/backend/src/lib/expo-turn-push.ts). The native
in-game sound implementation does not change push sounds or the web audio hook.
