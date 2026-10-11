import { AppColors, AppRadii, AppSpacing, AppTouch } from '@/constants/design-tokens';
import { ThemedText } from '@/components/themed-text';
import { CustomIcon } from '@/components/ui/custom-icon';
import { AlertModal } from '@/components/ui/alert-modal';
import { HanetButton } from '@/components/ui/hanet-button';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const WEEKDAY_NAMES = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MINUTE_STEP = 5;
const WHEEL_ITEM_HEIGHT = 36;
const WHEEL_SETTLE_MS = 120;
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, index) => index * MINUTE_STEP);

type Props = {
  value: Date;
  onChange: (date: Date) => void;
  style?: StyleProp<ViewStyle>;
};

type ModalProps = {
  visible: boolean;
  value: Date;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
};

// Dialog version: edits a draft and only reports it on "Listo".
export function HanetDateTimePickerModal({ visible, value, onConfirm, onCancel }: ModalProps) {
  return (
    <AlertModal visible={visible} onRequestClose={onCancel}>
      {visible && <PickerDialog value={value} onConfirm={onConfirm} onCancel={onCancel} />}
    </AlertModal>
  );
}

function PickerDialog({ value, onConfirm, onCancel }: Omit<ModalProps, 'visible'>) {
  const [draft, setDraft] = useState(value);

  return (
    <View style={styles.backdrop}>
      <Pressable accessibilityLabel="Cerrar sin cambiar la fecha" style={StyleSheet.absoluteFill} onPress={onCancel} />
      <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
        <ThemedText style={styles.dialogTitle}>Fecha y hora</ThemedText>
        <HanetDateTimePicker value={draft} onChange={setDraft} style={styles.dialogPicker} />
        <View style={styles.dialogActions}>
          <HanetButton label="Cancelar" variant="surface" onPress={onCancel} style={styles.dialogButton} />
          <HanetButton label="Listo" onPress={() => onConfirm(draft)} style={styles.dialogButton} />
        </View>
      </View>
    </View>
  );
}

function tick() {
  if (Platform.OS === 'ios') void Haptics.selectionAsync();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// Weeks start on Monday; leading and trailing blanks keep every row at 7 cells.
function buildMonthCells(year: number, month: number): (Date | null)[] {
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, month, day));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function HanetDateTimePicker({ value, onChange, style }: Props) {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(value.getFullYear(), value.getMonth(), 1));
  const today = useMemo(() => new Date(), []);
  const cells = useMemo(
    () => buildMonthCells(visibleMonth.getFullYear(), visibleMonth.getMonth()),
    [visibleMonth],
  );

  const shiftMonth = (delta: number) => {
    tick();
    setVisibleMonth(current => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  };

  const selectDay = (day: Date) => {
    tick();
    const next = new Date(value);
    next.setFullYear(day.getFullYear(), day.getMonth(), day.getDate());
    onChange(next);
  };

  const setHours = (hours: number) => {
    const next = new Date(value);
    next.setHours(hours);
    onChange(next);
  };

  const setMinutes = (minutes: number) => {
    const next = new Date(value);
    next.setMinutes(minutes, 0, 0);
    onChange(next);
  };

  // Times that fall between steps show on the nearest one.
  const minuteIndex = Math.round(value.getMinutes() / MINUTE_STEP) % MINUTES.length;

  return (
    <View style={[styles.panel, style]}>
      <View style={styles.monthHeader}>
        <RoundButton label="Mes anterior" onPress={() => shiftMonth(-1)}>
          <CustomIcon name="chevron-left" size={18} color={AppColors.textPrimary} />
        </RoundButton>
        <ThemedText accessibilityLiveRegion="polite" style={styles.monthTitle}>
          {MONTHS[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}
        </ThemedText>
        <RoundButton label="Mes siguiente" onPress={() => shiftMonth(1)}>
          <CustomIcon name="chevron-right" size={18} color={AppColors.textPrimary} />
        </RoundButton>
      </View>

      <View style={styles.grid} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {WEEKDAYS.map((weekday, index) => (
          <View key={`${weekday}-${index}`} style={styles.cell}>
            <ThemedText style={styles.weekday}>{weekday}</ThemedText>
          </View>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((day, index) => {
          if (!day) return <View key={`blank-${index}`} style={styles.cell} />;
          const selected = isSameDay(day, value);
          const isToday = isSameDay(day, today);
          return (
            <View key={day.toISOString()} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${WEEKDAY_NAMES[index % 7]} ${day.getDate()} de ${MONTHS[day.getMonth()]}${isToday ? ', hoy' : ''}`}
                accessibilityState={{ selected }}
                onPress={() => selectDay(day)}
                style={({ pressed }) => [
                  styles.day,
                  selected && styles.daySelected,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText style={[styles.dayText, isToday && styles.dayTextToday, selected && styles.dayTextSelected]}>{day.getDate()}</ThemedText>
                {isToday && <View style={styles.todayDot} />}
              </Pressable>
            </View>
          );
        })}
      </View>

      <View style={styles.divider} />

      <View style={styles.timeRow}>
        <ThemedText style={styles.timeLabel}>Hora</ThemedText>
        <View style={styles.timeControls}>
          <Wheel label="Hora" values={HOURS} selectedIndex={value.getHours()} onSelect={index => setHours(HOURS[index])} />
          <ThemedText style={styles.timeColon}>:</ThemedText>
          <Wheel label="Minutos" values={MINUTES} selectedIndex={minuteIndex} onSelect={index => setMinutes(MINUTES[index])} />
        </View>
      </View>
    </View>
  );
}

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: React.ReactNode }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.roundButton, pressed && styles.pressed]}
    >
      {children}
    </Pressable>
  );
}

type WheelProps = {
  label: string;
  values: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

// Scroll wheel: the row resting under the centre band is the selection.
// Snapping is done by hand once scrolling settles so it behaves the same on
// web, where ScrollView has no snapToInterval.
function Wheel({ label, values, selectedIndex, onSelect }: WheelProps) {
  const scrollRef = useRef<ScrollView>(null);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selectedIndex);

  useEffect(() => {
    selectedRef.current = selectedIndex;
  }, [selectedIndex]);

  useEffect(() => () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
  }, []);

  const scrollToIndex = (index: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ y: index * WHEEL_ITEM_HEIGHT, animated });
  };

  const select = (index: number) => {
    const clamped = Math.max(0, Math.min(values.length - 1, index));
    scrollToIndex(clamped, true);
    if (clamped !== selectedRef.current) {
      tick();
      onSelect(clamped);
    }
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.y;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => select(Math.round(offset / WHEEL_ITEM_HEIGHT)), WHEEL_SETTLE_MS);
  };

  return (
    <View
      style={styles.wheel}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: String(values[selectedIndex]) }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => select(selectedRef.current + (event.nativeEvent.actionName === 'increment' ? 1 : -1))}
    >
      <View pointerEvents="none" style={styles.wheelBand} />
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_ITEM_HEIGHT }}
        onLayout={() => scrollToIndex(selectedRef.current, false)}
        onScroll={handleScroll}
        contentContainerStyle={styles.wheelContent}
      >
        {values.map((item, index) => (
          <Pressable key={item} onPress={() => select(index)} style={styles.wheelItem}>
            <ThemedText style={[styles.wheelText, index === selectedIndex && styles.wheelTextSelected]}>
              {String(item).padStart(2, '0')}
            </ThemedText>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: AppSpacing.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    padding: AppSpacing.lg,
    borderRadius: AppRadii.xl,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  dialogTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 24,
    color: AppColors.textPrimary,
    marginBottom: AppSpacing.sm,
  },
  dialogPicker: {
    marginTop: 0,
    padding: 0,
  },
  dialogActions: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
    marginTop: AppSpacing.lg,
  },
  dialogButton: {
    flex: 1,
  },
  panel: {
    marginTop: AppSpacing.sm,
    padding: AppSpacing.md,
    borderRadius: AppRadii.lg,
    borderCurve: 'continuous',
    backgroundColor: AppColors.surface,
  },
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: AppSpacing.sm,
  },
  monthTitle: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 16,
    lineHeight: 22,
    color: AppColors.textPrimary,
  },
  roundButton: {
    width: 36,
    height: 36,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppColors.surfaceMuted,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: `${100 / 7}%`,
    height: AppTouch.minimum,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekday: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 12,
    lineHeight: 16,
    color: AppColors.textSecondary,
    opacity: 0.7,
  },
  day: {
    width: 38,
    height: 38,
    borderRadius: AppRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayTextToday: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.accent,
  },
  todayDot: {
    position: 'absolute',
    bottom: 3,
    width: 5,
    height: 5,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.accent,
  },
  daySelected: {
    backgroundColor: AppColors.controlActive,
    borderColor: AppColors.controlActive,
  },
  dayText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  dayTextSelected: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.controlOnActive,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: AppColors.surfaceMuted,
    marginVertical: AppSpacing.md,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeLabel: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 15,
    lineHeight: 20,
    color: AppColors.textPrimary,
  },
  timeControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AppSpacing.xs,
  },
  timeColon: {
    fontFamily: 'DMSans_700Bold',
    fontSize: 18,
    lineHeight: 22,
    color: AppColors.textSecondary,
  },
  wheel: {
    width: 64,
    height: WHEEL_ITEM_HEIGHT * 3,
    overflow: 'hidden',
  },
  wheelBand: {
    position: 'absolute',
    top: WHEEL_ITEM_HEIGHT,
    left: 0,
    right: 0,
    height: WHEEL_ITEM_HEIGHT,
    borderRadius: AppRadii.pill,
    backgroundColor: AppColors.surfaceMuted,
  },
  wheelContent: {
    paddingVertical: WHEEL_ITEM_HEIGHT,
  },
  wheelItem: {
    height: WHEEL_ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelText: {
    fontFamily: 'DMSans_500Medium',
    fontSize: 17,
    lineHeight: 22,
    color: AppColors.textSecondary,
    opacity: 0.45,
    fontVariant: ['tabular-nums'],
  },
  wheelTextSelected: {
    fontFamily: 'DMSans_700Bold',
    color: AppColors.textPrimary,
    opacity: 1,
  },
  pressed: {
    opacity: 0.6,
  },
});
