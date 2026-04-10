import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";
import type { BigTwoGameMachineSnapshot, GameEvent } from "@big-two/game-state-machine";
import type { Card } from "@big-two/game-core";

type GameRoomContext = {
  roomId: string;
  user?: { userId: string; userName: string };
  gameState?: BigTwoGameMachineSnapshot;
  sendEvent: (event: GameEvent) => void;
  joinGame: () => void;
  startGame: () => void;
  playCards: (cards: Card[]) => void;
  passTurn: () => void;
  isConnected: boolean;
};

export const GameRoomContext = createContext<GameRoomContext>({
  roomId: "",
  user: undefined,
  gameState: undefined,
  sendEvent: () => {},
  joinGame: () => {},
  startGame: () => {},
  playCards: () => {},
  passTurn: () => {},
  isConnected: false,
});

type GameRoomProviderProps = PropsWithChildren<{
  roomId: string;
  user?: { userId: string; userName: string };
}>;

export const GameRoomProvider = ({ roomId, user, children }: GameRoomProviderProps) => {
  const { gameState, sendEvent, isConnected } = useGameWebSocket({ roomId, user });

  const joinGame = useCallback(() => {
    if (user) {
      sendEvent({ type: "JOIN_GAME", playerId: user.userId, playerName: user.userName });
    }
  }, [user, sendEvent]);

  const startGame = useCallback(() => {
    sendEvent({ type: "START_GAME" });
  }, [sendEvent]);

  const playCards = useCallback(
    (cards: Card[]) => {
      // Depending on game state, send appropriate event
      if (gameState?.value === "ROUND_FIRST_MOVE") {
        sendEvent({ type: "PLAY_FIRST_MOVE", cards });
      } else {
        sendEvent({ type: "PLAY_CARDS", cards });
      }
    },
    [gameState, sendEvent],
  );

  const passTurn = useCallback(() => {
    if (user) {
      sendEvent({ type: "PASS_TURN", playerId: user.userId });
    }
  }, [user, sendEvent]);

  return (
    <GameRoomContext.Provider
      value={{
        roomId,
        user,
        gameState,
        sendEvent,
        joinGame,
        startGame,
        playCards,
        passTurn,
        isConnected,
      }}
    >
      {children}
    </GameRoomContext.Provider>
  );
};

const useGameWebSocket = ({
  roomId,
  user,
}: {
  roomId: string;
  user?: { userId: string; userName: string };
}) => {
  const [gameState, setGameState] = useState<BigTwoGameMachineSnapshot | undefined>(undefined);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  const sendEvent = useCallback((event: GameEvent) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(event));
    } else {
      console.warn("WebSocket not connected, cannot send event:", event);
    }
  }, []);

  useEffect(() => {
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    const WEBSOCKET_ENDPOINT = `${host}/api/room/ws/${roomId}`;

    const websocket = new WebSocket(WEBSOCKET_ENDPOINT);
    wsRef.current = websocket;

    websocket.onopen = () => {
      setIsConnected(true);
      // Auto-join on connect
      if (user) {
        websocket.send(
          JSON.stringify({
            type: "JOIN_GAME",
            playerId: user.userId,
            playerName: user.userName,
          }),
        );
      }
    };

    websocket.onmessage = (event) => {
      try {
        const state = JSON.parse(event.data);
        setGameState(state);
      } catch (error) {
        console.error("Failed to parse game state:", error);
      }
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    websocket.onclose = () => {
      setIsConnected(false);
    };

    return () => {
      websocket.close();
      wsRef.current = null;
    };
  }, [roomId, user?.userId, user?.userName]);

  return { gameState, sendEvent, isConnected };
};
