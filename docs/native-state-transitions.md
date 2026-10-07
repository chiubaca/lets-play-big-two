# Native state-transition layout

React Native does not expose browser CLS. The regression contract is stable
native view geometry while asynchronous data, errors, and busy states change.

## Contract

- Local and online tables keep one table shell through loading, retry, and ready.
  Room authentication does not replace the table owner or reset its measurements.
  Loading never fabricates a dealt hand.
- Waiting, playing, finished, and spectator states allocate the same action lane.
  Hidden controls retain geometry but are untouchable and hidden from accessibility.
  Reconnection and notices do not consume the board's flex space.
- Waiting seats remain in a normal-flow scroll view. Short portrait tables use
  smaller cards and a bounded turn-status lane. Very short landscape tables use
  a smaller fan/pile and scrolling controls rather than overflowing the header.
- Busy buttons retain their label/icon dimensions under an overlaid spinner.
  Sheets have a viewport-sized frame, persistent header, and scrolling body;
  changing menu content or validation does not recenter the sheet.
- Home navigation starts in normal flow and uses native sticky headers, not a
  zero-height spacer corrected after measurement. Membership controls and room
  placeholders retain their allocation. Refresh failures retain known rooms.
- Status slots reserve font-scaled space; long errors scroll rather than moving
  form actions or the chat composer. Android keyboard resizing is not applied
  a second time by KeyboardAvoidingView.
- Saved Pass & Play configuration is read before opening the editor. The home
  remains mounted under a loading overlay until it is ready. Resume availability,
  Human/Bot fields, and validation retain their space once the editor is open.
- A pending session recheck is not sign-out. Confirmed sign-out or account changes
  clear private state; pending checks must not discard editor/chat identity or
  retry-safe message IDs.

## Verification

```sh
vp check
vp test --run
vp run frontend-native#check
# Native component/hook regressions only:
cd apps/frontend-native
vp test --run
```

Component regressions exercise mounted views and state updates, with native host
views mocked. They verify structure, identity, visibility, and layout allocation,
not Yoga pixels or frame rate. Network-hook regressions use mocked I/O, not an
unchanging room-hook stub.

Android API 36 checks on 6 October 2026 used the existing development client,
including a real saved solo hand, portrait, 320×568-equivalent portrait, and
568×320-equivalent landscape. Menu and rules close-button bounds both measured
`[860,313][980,434]` at 1080×2400; opening/closing the table menu retained board
bounds. Short-screen inspection also caught and corrected landscape control
overflow and ScrollView flex growth stealing board width. Display-size overrides
were restored. No online rooms, accounts, or remote data were mutated.

Still required before release: physical low-end devices, iOS, TalkBack/VoiceOver,
large-font keyboard combinations, and sustained frame-time profiling. Screenshot
and component checks do not establish zero layout movement in every environment.
