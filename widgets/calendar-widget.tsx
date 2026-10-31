import { AccessoryWidgetBackground, Capsule, HStack, Image, Label, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { containerBackground, fixedSize, font, foregroundStyle, frame, lineLimit, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';
import type { WidgetEnvironment } from 'expo-widgets';

// The Calendar on the iPhone's Lock Screen, modeled on Apple Calendar's
// widgets: the class going on or the next one (with the test inside it, if
// there is one), tomorrow's first class when the day is over, and the date.
// Three sizes: one line above the clock, a circle and a rectangle. The app
// hands it a timeline for the week (services/calendar-widget.ts), so it moves
// on block by block without opening HaNet.
//
// It runs in the widget's own runtime: only @expo/ui/swift-ui, no hooks and
// nothing from outside the function.

export type CalendarWidgetProps = {
  /** "entry": a class or event to show; "empty": a free day or no timetable. */
  state: 'entry' | 'empty';
  /** "Ahora", "Hoy · Prueba", "Mañana"; the date ("Sáb, 31 oct.") on an empty day. */
  header: string;
  /** "11:00–12:30"; empty on an empty day. */
  time: string;
  /** The subject or event; "Sin clases hoy" on an empty day. */
  title: string;
  /** Third line of an empty day: "Tienes el día libre". */
  note: string;
  /** The line above the clock: "11:00 Matemática". */
  inline: string;
  /** The entry shown is a test. */
  test: boolean;
  /** For the circle: "SÁB" and "31". */
  weekday: string;
  day: string;
  /** A test still ahead today. */
  testToday: boolean;
};

const CalendarWidget = (props: CalendarWidgetProps, environment: WidgetEnvironment) => {
  'widget';
  const family = environment.widgetFamily;
  const url = 'hanetcl://calendar';
  const secondary = { type: 'hierarchical', style: 'secondary' } as const;
  // Until the app hands it a timeline, the date of the moment and how to fill it.
  const ready = !!props?.header;
  // The entry's moment comes as `timestamp` (milliseconds) from the native side.
  const stamp = (environment as { timestamp?: number }).timestamp;
  const when = typeof stamp === 'number' ? new Date(stamp) : new Date();
  const weekday = ready ? props.weekday : ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'][when.getDay()];
  const day = ready ? props.day : String(when.getDate());

  if (family === 'accessoryInline') {
    return (
      <Label
        title={ready ? props.inline : 'Abre HaNet'}
        systemImage={ready && props.test ? 'pencil.and.list.clipboard' : 'calendar'}
        modifiers={[containerBackground('clear', 'widget'), widgetURL(url)]}
      />
    );
  }

  if (family === 'accessoryCircular') {
    return (
      <ZStack modifiers={[containerBackground('clear', 'widget'), widgetURL(url)]}>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>{weekday}</Text>
          <Text modifiers={[font({ size: 26, weight: 'semibold', design: 'rounded' }), lineLimit(1)]}>{day}</Text>
          {ready && props.testToday ? (
            <Image systemName="pencil" modifiers={[font({ size: 10, weight: 'bold' })]} />
          ) : null}
        </VStack>
      </ZStack>
    );
  }

  // accessoryRectangular, as Apple's "A continuación".
  if (!ready || props.state === 'empty') {
    return (
      <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: 10_000, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(url)]}>
        <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{ready ? props.header : 'Calendar'}</Text>
        <Text modifiers={[font({ size: 15 }), lineLimit(1)]}>{ready ? props.title : 'Abre HaNet'}</Text>
        <Text modifiers={[font({ size: 15 }), foregroundStyle(secondary), lineLimit(1)]}>{ready ? props.note : 'Para ver tus clases aquí'}</Text>
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={1} modifiers={[frame({ maxWidth: 10_000, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(url)]}>
      <Text modifiers={[font({ size: 15, weight: 'semibold' }), foregroundStyle(secondary), lineLimit(1)]}>{props.header}</Text>
      <HStack spacing={6} modifiers={[fixedSize({ horizontal: false, vertical: true })]}>
        <Capsule modifiers={[frame({ width: 4 }), foregroundStyle(secondary)]} />
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[font({ size: 15, weight: 'bold' }), lineLimit(1)]}>{props.time}</Text>
          <Text modifiers={[font({ size: 15 }), lineLimit(1)]}>{props.title}</Text>
        </VStack>
      </HStack>
    </VStack>
  );
};

export default createWidget('HaNetCalendar', CalendarWidget);
