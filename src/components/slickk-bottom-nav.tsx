// SLICKK UI FOUNDATION V1
import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ComponentProps } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  SlickkColors,
  SlickkRadius,
} from '@/constants/slickk-design';

type IconName =
  ComponentProps<typeof Ionicons>['name'];

export type SlickkPrimaryRoute =
  | 'home'
  | 'tutor'
  | 'camera'
  | 'progress'
  | 'profile';

type NavItem = {
  id: SlickkPrimaryRoute;
  label: string;
  icon: IconName;
  activeIcon: IconName;
  open: () => void;
};

export function SlickkBottomNav({
  active,
}: {
  active: SlickkPrimaryRoute;
}) {
  const insets = useSafeAreaInsets();

  const items: NavItem[] = [
    {
      id: 'home',
      label: 'Home',
      icon: 'home-outline',
      activeIcon: 'home',
      open: () =>
        router.replace('/explore' as Href),
    },
    {
      id: 'tutor',
      label: 'Tutor',
      icon: 'mic-outline',
      activeIcon: 'mic',
      open: () =>
        router.push('/live-tutor' as Href),
    },
    {
      id: 'camera',
      label: 'Camera',
      icon: 'camera-outline',
      activeIcon: 'camera',
      open: () =>
        router.push({
          pathname: '/camera-learn',
          params: {
            mode: 'camera',
          },
        }),
    },
    {
      id: 'progress',
      label: 'Progress',
      icon: 'analytics-outline',
      activeIcon: 'analytics',
      open: () =>
        router.push('/twin' as Href),
    },
    {
      id: 'profile',
      label: 'Profile',
      icon: 'person-outline',
      activeIcon: 'person',
      open: () =>
        router.push('/onboarding' as Href),
    },
  ];

  return (
    <View
      style={[
        styles.shell,
        {
          paddingBottom: Math.max(
            insets.bottom,
            10
          ),
        },
      ]}
    >
      <View style={styles.bar}>
        {items.map((item) => {
          const selected = item.id === active;

          return (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.label}`}
              accessibilityState={{
                selected,
              }}
              onPress={
                selected ? undefined : item.open
              }
              style={({ pressed }) => [
                styles.item,
                selected && styles.itemSelected,
                pressed &&
                  !selected &&
                  styles.itemPressed,
              ]}
            >
              <Ionicons
                name={
                  selected
                    ? item.activeIcon
                    : item.icon
                }
                size={21}
                color={
                  selected
                    ? SlickkColors.blackInk
                    : SlickkColors.textMuted
                }
              />

              <Text
                style={[
                  styles.label,
                  selected && styles.labelSelected,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    paddingHorizontal: 14,
    paddingTop: 8,
    backgroundColor: SlickkColors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: SlickkColors.border,
  },
  bar: {
    minHeight: 64,
    padding: 6,
    borderRadius: SlickkRadius.large,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SlickkColors.surfaceSoft,
    borderWidth: 1,
    borderColor: SlickkColors.border,
  },
  item: {
    flex: 1,
    minHeight: 50,
    borderRadius: SlickkRadius.medium,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  itemSelected: {
    backgroundColor: SlickkColors.mint,
  },
  itemPressed: {
    opacity: 0.58,
  },
  label: {
    color: SlickkColors.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  labelSelected: {
    color: SlickkColors.blackInk,
  },
});
