// Web shim for react-native-pager-view
// PagerView is native-only; on web we use a plain ScrollView-based approach.
// This file is automatically picked by the Metro bundler on web (.web.tsx).

import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';

// Minimal interface matching what calendar.tsx uses
interface PagerViewProps {
  style?: any;
  initialPage?: number;
  onPageSelected?: (e: any) => void;
  ref?: any;
  children?: React.ReactNode;
}

const PagerViewWeb = React.forwardRef<any, PagerViewProps>(
  ({ style, initialPage = 0, onPageSelected, children }, ref) => {
    const scrollRef = React.useRef<ScrollView>(null);
    const childrenArray = React.Children.toArray(children);
    const [width, setWidth] = React.useState(0);

    // Expose setPage method for compatibility
    React.useImperativeHandle(ref, () => ({
      setPage: (index: number) => {
        scrollRef.current?.scrollTo({ x: index * width, animated: true });
      },
    }));

    // Scroll to initialPage on mount
    React.useEffect(() => {
      if (width > 0 && initialPage > 0) {
        setTimeout(() => {
          scrollRef.current?.scrollTo({ x: initialPage * width, animated: false });
        }, 50);
      }
    }, [width, initialPage]);

    return (
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        style={style}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onMomentumScrollEnd={(e) => {
          if (width > 0) {
            const index = Math.round(e.nativeEvent.contentOffset.x / width);
            onPageSelected?.({ nativeEvent: { position: index } });
          }
        }}
      >
        {childrenArray.map((child, i) => (
          <View key={i} style={{ width: width || '100%' as any }}>
            {child}
          </View>
        ))}
      </ScrollView>
    );
  }
);

PagerViewWeb.displayName = 'PagerViewWeb';
export default PagerViewWeb;
