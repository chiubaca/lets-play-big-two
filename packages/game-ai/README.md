# @big-two/game-ai

Pure, deterministic move generation and bot move selection for Big Two.

```ts
import { chooseBotMove, getLegalPlays } from "@big-two/game-ai";
```

- `getLegalPlays(request)` returns legal plays from weakest to strongest.
- `chooseBotMove(request)` returns the first legal play, or `null` to pass.

The request accepts a `hand`, the current `roundMode`, and optional `cardsToBeat` and
`requiredCard` constraints. A `null` round mode means the player is leading.
