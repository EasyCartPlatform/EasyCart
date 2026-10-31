// The owner picks their shop's colours from the themes the platform admin switched on.
// The owner's own app changes colour straight away, so they see what customers will see.
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Text } from '@/components/text';
import { Icon } from '@/components/icon';
import { Card } from '@/components/ui';
import { useToast } from '@/components/toast';
import { errorMessage } from '@/lib/api';
import { useThemeSettings } from '@/lib/brand';
import { BRANDS } from '@/theme/brands';
import { colors, radius, space, text } from '@/theme/theme';
import { manageCalls, useRefreshingAction } from './owner-api';

export function ThemePicker({ current }: { current: string | null | undefined }) {
  const settings = useThemeSettings();
  const save = useRefreshingAction(manageCalls.setColorTheme, ['store', 'storefront']);
  const toast = useToast();
  const enabled = settings.data?.enabled ?? [];
  const chosen = current && enabled.includes(current as never) ? current : settings.data?.default;

  function pick(id: string) {
    if (id === chosen) return;
    save.mutate(id, { onSuccess: () => toast(`Shop colour changed to ${BRANDS[id as keyof typeof BRANDS].name}`, 'success'), onError: (err) => toast(errorMessage(err), 'error') });
  }

  if (enabled.length === 0) return null;
  return (
    <Card title="Shop colours" icon="sparkles">
      <Text style={text.muted}>Customers see your shop in these colours: buttons, banner and tabs.</Text>
      <View style={styles.grid}>
        {enabled.map((id) => {
          const brand = BRANDS[id];
          const active = id === chosen;
          return (
            <Pressable key={id} onPress={() => pick(id)} style={[styles.option, active && { borderColor: brand.primary }]} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={brand.name} disabled={save.isPending}>
              <LinearGradient colors={brand.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.swatch}>
                {active ? <Icon name="check" size={18} color={colors.white} strokeWidth={3} /> : null}
              </LinearGradient>
              <Text style={[styles.name, active && { color: brand.primaryDark }]}>{brand.name}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  option: { width: 96, alignItems: 'center', gap: 6, paddingVertical: space.sm, borderRadius: radius.md, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.white },
  swatch: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 13, fontWeight: '700', color: colors.textSoft }
});
