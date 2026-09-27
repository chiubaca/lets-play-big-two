# Expire unattended rooms and their chat together

Room chat retains every message while its room exists, but empty rooms should not become permanent archives. An online room expires 48 hours after its last signed-in visitor disconnects (or its creation, if nobody ever connects); an unfinished game gets up to seven days instead. A connected Spectator keeps the room active, and expiry removes the room, game state, and chat together. This balances short-term return visits against indefinite retention of abandoned conversations, while giving an in-progress game longer to resume.

On rollout, remove all existing rooms with no connected visitors immediately, including rooms with unfinished games: their last-disconnect times are unknown, so the new grace periods do not apply retroactively. A visitor still connected at rollout keeps their room active and starts a new countdown when they disconnect.
