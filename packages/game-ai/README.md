# @big-two/game-ai

Deterministic move generation and bot decision planning for Big Two.

```ts
import {
  chooseBotMove,
  createJevBotMovePlan,
  getLegalPlays,
  resolveJevBotMove,
} from "@big-two/game-ai";
```

- `getLegalPlays(request)` returns legal plays from weakest to strongest.
- `chooseBotMove(request)` returns the first legal play, or `null` to pass.
- `createJevBotMovePlan(request)` turns the bot's hand, played hands, and a bounded set of
  legal actions into structured state and a closed-set Choice question for TypeSafe Jev.
- `resolveJevBotMove(plan, choice)` maps Jev's selected id back to the exact legal cards.

The request accepts a `hand`, the current `roundMode`, and optional `cardsToBeat` and
`requiredCard` constraints. A `null` round mode means the player is leading.

Move legality always remains in code. Jev selects only among generated legal actions; API
transport, credentials, and deterministic fallback are handled by the backend.
