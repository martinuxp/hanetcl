import { Box, Column, Spacer, Text } from '@expo/ui/jetpack-compose';
import { background, cornerRadius, fillMaxSize, fillMaxWidth, height, paddingAll } from '@expo/ui/jetpack-compose/modifiers';
import { createWidget } from 'expo-widgets';
import type { HomeWidgetProps } from './home-widget';

// The home screen widget on Android: the same day as the iPhone's
// (widgets/home-widget.tsx), drawn with Glance. It starts at 2x2 and the sizes
// fit that, but it can be stretched. Android has no timeline, so
// the app hands it every moment of today and tomorrow at once
// (services/widget-service.ts) and the widget picks the one that applies each
// time Android redraws it (at least every 30 minutes,
// plugins/with-android-widget-refresh.js).
//
// It runs in the widget's own runtime: only @expo/ui/jetpack-compose, no hooks
// and nothing from outside the function, so the colors are written inside it.

export type HomeWidgetAndroidProps = {
  /** Every change of the day, oldest first: `at` is a timestamp in ms. */
  entries?: (HomeWidgetProps & { at: number })[];
};

const HomeWidget = (props: HomeWidgetAndroidProps) => {
  'widget';
  const canvas = '#282829';
  const accent = '#EF2274';
  const primary = '#F9F9FA';
  const secondary = '#DDDDE2';
  // Not a React component: it runs once per draw, and the time is the point.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const entries = props?.entries ?? [];
  let current: HomeWidgetProps | null = null;
  for (const entry of entries) {
    if (entry.at <= now) current = entry;
  }
  // Until the app hands it the day, the widget shows how to fill it instead
  // of an empty box.
  const empty = !current?.subject;
  const label = empty ? 'Tu día' : current!.label;
  const subject = empty ? 'Abre HaNet' : current!.subject;
  const detail = empty ? 'Para ver tu horario aquí' : current!.detail;
  const exam = empty ? '' : current!.exam;

  // Glance has no weights, so the layers of a Box put "HaNet" in the corner
  // and the exam at the bottom.
  return (
    <Box modifiers={[fillMaxSize(), background(canvas), cornerRadius(24), paddingAll(14)]}>
      <Column modifiers={[fillMaxWidth()]}>
        <Text color={accent} style={{ fontSize: 12, fontWeight: 'bold' }} maxLines={1}>{label}</Text>
        <Spacer modifiers={[height(4)]} />
        <Text color={primary} style={{ fontSize: 18, fontWeight: 'bold' }} maxLines={2}>{subject}</Text>
        <Text color={secondary} style={{ fontSize: 12, fontWeight: '500' }} maxLines={1}>{detail}</Text>
      </Column>
      <Box modifiers={[fillMaxSize()]} contentAlignment="topEnd">
        <Text color={secondary} style={{ fontSize: 11, fontWeight: '500' }}>HaNet</Text>
      </Box>
      {exam ? (
        <Box modifiers={[fillMaxSize()]} contentAlignment="bottomStart">
          <Text color={accent} style={{ fontSize: 11, fontWeight: '600' }} maxLines={2}>{exam}</Text>
        </Box>
      ) : null}
    </Box>
  );
};

export default createWidget('HaNetHoy', HomeWidget);
