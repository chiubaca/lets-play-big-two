export const scheduleOnUI = <Args extends unknown[]>(
  worklet: (...args: Args) => void,
  ...args: Args
) => worklet(...args);
export const scheduleOnRN = scheduleOnUI;
