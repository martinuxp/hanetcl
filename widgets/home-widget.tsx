import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetEnvironment } from 'expo-widgets';

// The home screen widget (iPhone): what class is on now or next, from the
// course's Horario, and the next evaluation of the Calendar. The Lock Screen
// has its own, the Calendar (widgets/calendar-widget.tsx). The app hands
// it a timeline for the rest of the day (services/widget-service.ts), so it
// changes block by block without opening HaNet.
//
// It runs in the widget's own runtime: only @expo/ui/swift-ui, no hooks and
// nothing from outside the function, so the colors are written inside it.

export type HomeWidgetProps = {
  /** "Ahora", "Después", "Mañana" or "Hoy". */
  label: string;
  subject: string;
  /** "Hasta las 09:30 · Sala 12" */
  detail: string;
  /** "Prueba de Química en 2 días", or empty. */
  exam: string;
};

const HomeWidget = (props: HomeWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const canvas = '#282829';
  const accent = '#EF2274';
  const primary = '#F9F9FA';
  const secondary = '#DDDDE2';
  const small = environment.widgetFamily === 'systemSmall';
  // Until the app hands it a timeline (or when it cannot: a build without the
  // App Group), the widget shows how to fill it instead of an empty box.
  const empty = !props?.subject;
  const label = empty ? 'Tu día' : props.label;
  const subject = empty ? 'Abre HaNet' : props.subject;
  const detail = empty ? 'Para ver tu horario aquí' : props.detail;
  const exam = empty ? '' : props.exam;

  return (
    <VStack alignment="leading" spacing={4} modifiers={[padding({ all: small ? 2 : 4 }), containerBackground(canvas, 'widget'), widgetURL('hanetcl://schedule')]}>
      <HStack>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(accent)]}>{label}</Text>
        <Spacer />
        <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(secondary)]}>HaNet</Text>
      </HStack>
      <Text modifiers={[font({ size: small ? 20 : 24, weight: 'bold' }), foregroundStyle(primary), lineLimit(2)]}>{subject}</Text>
      <Text modifiers={[font({ size: 13, weight: 'medium' }), foregroundStyle(secondary), lineLimit(1)]}>{detail}</Text>
      <Spacer />
      {exam ? (
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(accent), lineLimit(2)]}>{exam}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('HaNetHoy', HomeWidget);
