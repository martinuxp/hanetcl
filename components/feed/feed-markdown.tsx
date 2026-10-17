import { ThemedText } from '@/components/themed-text';
import { AppColors, AppSpacing } from '@/constants/design-tokens';
import React from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

// The Markdown a post may carry: headings, lists, quotes, a rule, and inline
// bold, italic, strikethrough, code and links. Nothing else is interpreted
// (no images or HTML), so a post can only format its own text.

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'rule' };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;

function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'paragraph', text: paragraph.join('\n') });
    paragraph = [];
  };

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const last = blocks[blocks.length - 1];

    if (!trimmed) {
      flush();
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ kind: 'rule' });
    } else if (heading) {
      flush();
      blocks.push({ kind: 'heading', level: heading[1].length as 1 | 2 | 3, text: heading[2] });
    } else if (trimmed.startsWith('>')) {
      flush();
      const text = trimmed.replace(/^>\s?/, '');
      if (last?.kind === 'quote') last.text += `\n${text}`;
      else blocks.push({ kind: 'quote', text });
    } else if (bullet || numbered) {
      flush();
      const ordered = !bullet;
      const text = (bullet ?? numbered)![1];
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(text);
      else blocks.push({ kind: 'list', ordered, items: [text] });
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

type Span = { text: string; bold?: boolean; italic?: boolean; strike?: boolean; code?: boolean; url?: string };

const INLINE = /(\*\*|__)(.+?)\1|~~(.+?)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?!\w)|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])/;

/** Only web links open; anything else stays as plain text. */
function safeUrl(raw: string) {
  const url = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  return /^https?:\/\/[^\s]+\.[^\s]+/i.test(url) ? url : null;
}

function parseInline(text: string, marks: Omit<Span, 'text'> = {}): Span[] {
  const spans: Span[] = [];
  let rest = text;
  while (rest) {
    const match = INLINE.exec(rest);
    if (!match) {
      spans.push({ ...marks, text: rest });
      break;
    }
    if (match.index > 0) spans.push({ ...marks, text: rest.slice(0, match.index) });
    const [whole, , bold, strike, code, label, href, star, under, bare] = match;
    if (bold !== undefined) spans.push(...parseInline(bold, { ...marks, bold: true }));
    else if (strike !== undefined) spans.push(...parseInline(strike, { ...marks, strike: true }));
    else if (code !== undefined) spans.push({ ...marks, code: true, text: code });
    else if (label !== undefined) {
      const url = safeUrl(href);
      spans.push(...parseInline(label, url ? { ...marks, url } : marks));
    } else if (star !== undefined || under !== undefined) spans.push(...parseInline(star ?? under, { ...marks, italic: true }));
    else if (bare !== undefined) spans.push({ ...marks, text: bare, url: bare });
    rest = rest.slice(match.index + whole.length);
  }
  return spans;
}

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

// DM Sans has no synthesized italic: the italic faces are loaded on their own (app/_layout.tsx).
function fontFor(span: Span, base: string) {
  if (span.code) return MONO;
  const bold = span.bold || base === 'DMSans_700Bold';
  if (span.italic) return bold ? 'DMSans_700Bold_Italic' : 'DMSans_400Regular_Italic';
  return bold ? 'DMSans_700Bold' : base;
}

function Inline({ text, style, baseFont }: { text: string; style: StyleProp<TextStyle>; baseFont: string }) {
  return (
    <ThemedText selectable style={style}>
      {parseInline(text).map((span, index) => (
        // Plain Text, so each piece inherits the paragraph's color and size;
        // a nested ThemedText would bring the system theme's color back
        // (dark text on the dark canvas when the phone is in light mode).
        <Text
          key={index}
          onPress={span.url ? () => void Linking.openURL(span.url!) : undefined}
          accessibilityRole={span.url ? 'link' : undefined}
          style={[
            { fontFamily: fontFor(span, baseFont) },
            span.strike && styles.strike,
            span.code && styles.code,
            span.url && styles.link,
          ]}
        >
          {span.text}
        </Text>
      ))}
    </ThemedText>
  );
}

/** A post's text, formatted. */
export function FeedMarkdown({ source }: { source: string }) {
  const blocks = parseBlocks(source);
  return (
    <View style={styles.blocks}>
      {blocks.map((block, index) => {
        switch (block.kind) {
          case 'heading':
            return <Inline key={index} text={block.text} baseFont="DMSans_700Bold" style={[styles.heading, block.level === 1 ? styles.h1 : block.level === 2 ? styles.h2 : styles.h3]} />;
          case 'quote':
            return (
              <View key={index} style={styles.quote}>
                <Inline text={block.text} baseFont="DMSans_400Regular" style={[styles.body, styles.quoteText]} />
              </View>
            );
          case 'list':
            return (
              <View key={index} style={styles.list}>
                {block.items.map((item, position) => (
                  <View key={position} style={styles.item}>
                    <ThemedText style={[styles.body, styles.marker]}>{block.ordered ? `${position + 1}.` : '•'}</ThemedText>
                    <View style={styles.itemText}>
                      <Inline text={item} baseFont="DMSans_400Regular" style={styles.body} />
                    </View>
                  </View>
                ))}
              </View>
            );
          case 'rule':
            return <View key={index} style={styles.rule} />;
          default:
            return <Inline key={index} text={block.text} baseFont="DMSans_400Regular" style={styles.body} />;
        }
      })}
    </View>
  );
}

/** The same text without its marks, for sharing and searching. */
export function markdownToPlain(source: string) {
  return parseBlocks(source).map(block => {
    const plain = (text: string) => parseInline(text).map(span => (span.url && span.url !== span.text ? `${span.text} (${span.url})` : span.text)).join('');
    if (block.kind === 'rule') return '';
    if (block.kind === 'list') return block.items.map((item, index) => `${block.ordered ? `${index + 1}.` : '•'} ${plain(item)}`).join('\n');
    return plain(block.text);
  }).filter(Boolean).join('\n\n');
}

const styles = StyleSheet.create({
  blocks: {
    gap: AppSpacing.md,
  },
  body: {
    fontFamily: 'DMSans_400Regular',
    fontSize: 17,
    lineHeight: 25,
    color: AppColors.textPrimary,
  },
  heading: {
    color: AppColors.textPrimary,
  },
  h1: {
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -1,
  },
  h2: {
    fontSize: 21,
    lineHeight: 26,
    letterSpacing: -0.8,
  },
  h3: {
    fontSize: 18,
    lineHeight: 23,
    letterSpacing: -0.4,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  code: {
    fontSize: 15,
    backgroundColor: AppColors.surface,
  },
  // The light pink that stays legible on the dark canvas.
  link: {
    color: AppColors.errorText,
    textDecorationLine: 'underline',
  },
  quote: {
    paddingLeft: AppSpacing.md,
    borderLeftWidth: 3,
    borderLeftColor: AppColors.accent,
  },
  quoteText: {
    color: AppColors.textSecondary,
  },
  list: {
    gap: AppSpacing.xs,
  },
  item: {
    flexDirection: 'row',
    gap: AppSpacing.sm,
  },
  marker: {
    minWidth: 18,
    color: AppColors.textSecondary,
  },
  itemText: {
    flex: 1,
  },
  rule: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
