import { AppColors } from '@/constants/design-tokens';
import * as React from "react"
import Svg, { Path, Circle, Rect, Line } from "react-native-svg"
import type { SvgProps } from "react-native-svg"

type IconProps = SvgProps & {
  name: 
    | 'home'
    | 'user'
    | 'star' // Iconoir Star
    | 'graduationcap' // Iconoir Graduation Cap
    | 'feed' // Solar Feed Linear
    | 'calendar' // Solar Calendar Linear
    | 'notes' // Solar Notes Linear
    | 'wallet' // Solar Wallet Outline
    | 'notification' // Mynaui Notification
    | 'warning' // Mingcute Warning
    | 'chevron-left'
    | 'chevron-right'
    | 'search'
    | 'check-circle'
    | 'book'
    | 'clock'
    | 'map-pin'
    | 'tag'
    | 'file-text'
    | 'link'
    | 'image'
    | 'camera'
    | 'plus'
    | 'close'
    | 'more'
    | 'share'
    | 'smile-plus'
    | 'pin';
  size?: number;
  color?: string;
}

export function CustomIcon({ name, size = 24, color = AppColors.textPrimary, ...props }: IconProps) {
  switch (name) {
    case 'clock':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={1.5} />
          <Path d="M12 6v6l4 2" stroke={color} strokeWidth={1.5} />
        </Svg>
      );
    case 'map-pin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke={color} strokeWidth={1.5} />
          <Circle cx="12" cy="10" r="3" stroke={color} strokeWidth={1.5} />
        </Svg>
      );
    case 'tag':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" stroke={color} strokeWidth={1.5} />
          <Line x1="7" y1="7" x2="7.01" y2="7" stroke={color} strokeWidth={2.5} strokeLinecap="round" />
        </Svg>
      );
    case 'file-text':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke={color} strokeWidth={1.5} />
          <Path d="M14 2v6h6" stroke={color} strokeWidth={1.5} />
          <Line x1="16" y1="13" x2="8" y2="13" stroke={color} strokeWidth={1.5} />
          <Line x1="16" y1="17" x2="8" y2="17" stroke={color} strokeWidth={1.5} />
          <Line x1="10" y1="9" x2="8" y2="9" stroke={color} strokeWidth={1.5} />
        </Svg>
      );
    case 'link':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M10 14a4.5 4.5 0 0 0 6.36 0l3.18-3.18a4.5 4.5 0 0 0-6.36-6.36l-1.06 1.06" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
          <Path d="M14 10a4.5 4.5 0 0 0-6.36 0l-3.18 3.18a4.5 4.5 0 0 0 6.36 6.36l1.06-1.06" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      );
    case 'image':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth={1.5} />
          <Circle cx="8.5" cy="8.5" r="1.5" stroke={color} strokeWidth={1.5} />
          <Path d="M21 15l-5-5L5 21" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'camera':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.6l1.4-2h7l1.4 2h1.6A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" stroke={color} strokeWidth={1.5} strokeLinejoin="round" />
          <Circle cx="12" cy="13" r="3.5" stroke={color} strokeWidth={1.5} />
        </Svg>
      );
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M2 8L11.7317 3.13416C11.9006 3.04971 12.0994 3.0497 12.2683 3.13416L22 8" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M20 11V19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19V11" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'user':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M5 20V19C5 15.134 8.13401 12 12 12C15.866 12 19 15.134 19 19V20" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M12 12C14.2091 12 16 10.2091 16 8C16 5.79086 14.2091 4 12 4C9.79086 4 8 5.79086 8 8C8 10.2091 9.79086 12 12 12Z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'graduationcap':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 4L2 9l10 5 10-5-10-5z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M5 10.5v5.044a2 2 0 001.325 1.884l5 1.786a2 2 0 001.35 0l5-1.786A2 2 0 0019 15.544V10.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M22 9v7" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'feed':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Rect x="4" y="4" width="16" height="16" rx="4" stroke={color} strokeWidth={1.5} />
          <Path d="M8 10h8M8 14h5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Rect x="4" y="5" width="16" height="16" rx="4" stroke={color} strokeWidth={1.5} />
          <Path d="M16 3v4M8 3v4M4 11h16M8 15h.01M12 15h.01M16 15h.01" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'notes':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M15 4H7a4 4 0 00-4 4v8a4 4 0 004 4h10a4 4 0 004-4V10.4a2 2 0 00-.586-1.414l-4-4A2 2 0 0015 4z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M15 4v4a2 2 0 002 2h4M9 12h6M9 16h4" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'wallet':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Rect x="3" y="6" width="18" height="13" rx="4" stroke={color} strokeWidth={1.5} />
          <Path d="M16 12.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" stroke={color} strokeWidth={1.5} />
          <Path d="M21 11V9a4 4 0 00-4-4H7M3 12h5" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'notification':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 4a5 5 0 00-5 5v3c0 1.1-.9 2-2 2h14c-1.1 0-2-.9-2-2V9a5 5 0 00-5-5zM10 17a2 2 0 004 0" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'warning':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M11 10.024A.975.975 0 1113 10v2.951a.975.975 0 11-2-.024V10zM12 17.5a1 1 0 100-2 1 1 0 000 2z" fill={color} />
          <Path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zM3.5 12a8.5 8.5 0 1117 0 8.5 8.5 0 01-17 0z" fill={color} />
        </Svg>
      );
    case 'chevron-left':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M15 18l-6-6 6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'chevron-right':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M9 18l6-6-6-6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Circle cx="11" cy="11" r="6.5" stroke={color} strokeWidth={1.5} />
          <Path d="m16 16 4.5 4.5" stroke={color} strokeWidth={1.5} strokeLinecap="round" />
        </Svg>
      );
    case 'check-circle':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" stroke={color} strokeWidth={1.5} />
          <Path d="M8 11.857l2.5 2.5L15.857 9" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'book':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      );
    case 'close':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M6 6l12 12M18 6L6 18" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      );
    case 'more':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Circle cx="5" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="19" cy="12" r="1.8" fill={color} />
        </Svg>
      );
    case 'share':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 15V3M7.5 7.5L12 3l4.5 4.5M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'smile-plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Circle cx="11" cy="13" r="8" stroke={color} strokeWidth={1.7} />
          <Path d="M8 15c.8 1 1.8 1.5 3 1.5s2.2-.5 3-1.5M8.5 11h.01M13.5 11h.01M19 2v5M16.5 4.5h5" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'pin':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
          <Path d="M12 17v5M9 3h6l-1 6 3 3v2H7v-2l3-3z" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    default:
      return null;
  }
}
