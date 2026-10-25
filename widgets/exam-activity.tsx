import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, monospacedDigit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity } from 'expo-widgets';
import type { LiveActivityEnvironment } from 'expo-widgets';

// The Live Activity of an evaluation that is close (iPhone, iOS 16.2+): on
// the Lock Screen and in the Dynamic Island, a countdown to the test. The app
// starts it when the test is 24 hours away or less (services/exam-reminders.ts);
// without Live Activities the same moments arrive as notifications.
//
// It runs in the widget's own runtime: only @expo/ui/swift-ui, no hooks and
// nothing from outside the function.

export type ExamActivityProps = {
  /** The Calendar event, to know which test it is. */
  id: string;
  subject: string;
  title: string;
  /** When it starts, in milliseconds. */
  startsAt: number;
  /** "Mañana, 10:15 · Sala 12" */
  when: string;
};

const ExamActivity = (props: ExamActivityProps, environment: LiveActivityEnvironment) => {
  'widget';
  const accent = environment.isLuminanceReduced ? '#FFFFFF' : '#EF2274';
  const primary = '#F9F9FA';
  const secondary = '#DDDDE2';
  const start = new Date(props.startsAt);

  return {
    banner: (
      <HStack spacing={12} modifiers={[padding({ all: 16 })]}>
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(accent)]}>Prueba</Text>
          <Text modifiers={[font({ size: 20, weight: 'bold' }), foregroundStyle(primary), lineLimit(1)]}>{props.subject}</Text>
          <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary), lineLimit(1)]}>{props.when}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ size: 12 }), foregroundStyle(secondary)]}>Empieza en</Text>
          <Text date={start} dateStyle="timer" modifiers={[font({ size: 24, weight: 'bold' }), monospacedDigit(), foregroundStyle(primary)]} />
        </VStack>
      </HStack>
    ),
    compactLeading: <Image systemName="pencil.and.list.clipboard" color={accent} />,
    compactTrailing: <Text date={start} dateStyle="timer" modifiers={[font({ size: 14, weight: 'semibold' }), monospacedDigit()]} />,
    minimal: <Image systemName="pencil.and.list.clipboard" color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 8 })]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(accent)]}>Prueba</Text>
        <Text modifiers={[font({ size: 16, weight: 'bold' }), lineLimit(1)]}>{props.subject}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <Text date={start} dateStyle="timer" modifiers={[font({ size: 20, weight: 'bold' }), monospacedDigit(), padding({ trailing: 8 })]} />
    ),
    expandedBottom: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ horizontal: 8, bottom: 4 })]}>
        <Text modifiers={[font({ size: 14 }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 13 }), foregroundStyle(secondary), lineLimit(1)]}>{props.when}</Text>
      </VStack>
    ),
  };
};

export default createLiveActivity('HaNetPrueba', ExamActivity);
