// Short messages at the top of the screen ("Order placed", "Wrong code. 4 tries left.").
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Text } from './text';
import { Icon, type IconName } from './icon';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '@/theme/theme';

type Kind = 'success' | 'error' | 'info';
const ToastContext = createContext<(message: string, kind?: Kind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; kind: Kind } | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const insets = useSafeAreaInsets();

  const show = useCallback((message: string, kind: Kind = 'info') => {
    clearTimeout(timer.current);
    setToast({ message, kind });
    Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setToast(null));
    }, 2800);
  }, [opacity]);

  // A small coloured dot with an icon says what kind of message it is; the card itself stays calm and dark.
  const accent = toast?.kind === 'error' ? colors.danger : toast?.kind === 'success' ? colors.success : colors.primary;
  const icon: IconName = toast?.kind === 'error' ? 'x' : toast?.kind === 'success' ? 'check' : 'info';
  const drop = opacity.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] });
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="none" style={[styles.wrap, { opacity, top: Math.max(insets.top, 16) + 6, transform: [{ translateY: drop }] }]}>
          <View style={styles.toast}>
            <View style={[styles.icon, { backgroundColor: accent }]}><Icon name={icon} size={14} color={colors.white} strokeWidth={3} /></View>
            <Text style={styles.text} numberOfLines={3}>{toast.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: 20, zIndex: 99999, elevation: 999 },
  toast: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 420, backgroundColor: '#1e293b', borderRadius: radius.pill, paddingVertical: 10, paddingLeft: 10, paddingRight: 18, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  icon: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  text: { flexShrink: 1, color: colors.white, fontSize: 14, fontWeight: '600' }
});
