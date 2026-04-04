import { createContext, type PropsWithChildren, useEffect, useState } from "react";
import type { BigTwoGameMachineSnapshot } from "@big-two/game-state-machine";

type GameRoomContext = {
  roomId: string;
  user?: { userId: string; userName: string };
  gameState?: BigTwoGameMachineSnapshot;
};

export const GameRoomContext = createContext<GameRoomContext>({
  roomId: "",
  user: undefined,
  gameState: undefined,
});

export const GameRoomProvider = ({
  roomId,
  user,
  children,
}: PropsWithChildren<GameRoomContext>) => {
  const { gameState: liveGameState } = useSubscribeToPlayers({ roomId });

  return (
    <GameRoomContext.Provider
      value={{
        roomId,
        user,
        gameState: liveGameState,
      }}
    >
      {children}
    </GameRoomContext.Provider>
  );
};

const useSubscribeToPlayers = ({ roomId }: { roomId: string }) => {
  const [gameState, setGameState] = useState<BigTwoGameMachineSnapshot | undefined>(undefined);

  useEffect(() => {
    const host = import.meta.env.VITE_BACKEND_URL.replace(/^https?/, "wss");
    const WEBSOCKET_ENDPOINT = `${host}/api/room/ws/${roomId}`;

    const websocket = new WebSocket(WEBSOCKET_ENDPOINT);

    websocket.onmessage = (event) => {
      const gameState = JSON.parse(event.data);
      setGameState(gameState);
    };

    websocket.onerror = (error) => {
      console.error("WebSocket error:", error);
    };

    return () => {
      websocket.close();
    };
  }, [roomId]);

  return { gameState };
};
