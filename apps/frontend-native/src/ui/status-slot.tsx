import type { ReactNode } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";

/** Reserve two readable status lines; longer messages scroll instead of moving actions. */
export function StatusSlot({ children, testID }: { children: ReactNode; testID?: string }) {
  const { fontScale } = useWindowDimensions();
  return (
    <View
      testID={testID}
      style={{ width: "100%", height: 40 * Math.max(1, fontScale), flexShrink: 0 }}
    >
      <ScrollView
        style={{ flex: 1, minHeight: 0 }}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets={false}
      >
        {children}
      </ScrollView>
    </View>
  );
}
