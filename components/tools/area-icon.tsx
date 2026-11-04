import React from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { AppColors } from '@/constants/design-tokens';
import type { AreaId, KnowledgeArea } from '@/services/electividad-service';

// Stroke icons (24×24, 2 px) for the nine areas of HaNet Electividad and the
// areas of knowledge careers are sorted in (mifuturo.cl). Drawn for HaNet.

type IconProps = { size?: number; color?: string };

function Frame({ size = 24, color = AppColors.textPrimary, children }: IconProps & { children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {children}
    </Svg>
  );
}

const AREA_PATHS: Record<AreaId, React.ReactNode> = {
  bio: (
    <G>
      <Path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" />
      <Path d="M5 19l8-8" />
    </G>
  ),
  qui: (
    <G>
      <Path d="M9 3h6" />
      <Path d="M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
      <Path d="M7 15h10" />
    </G>
  ),
  mat: (
    <G>
      <Path d="M7 4v6M4 7h6" />
      <Path d="M14 7h6" />
      <Path d="M5 15l4 4M9 15l-4 4" />
      <Path d="M14 16h6M14 19.5h6" />
    </G>
  ),
  fis: (
    <G>
      <Circle cx={12} cy={12} r={1.5} />
      <Ellipse cx={12} cy={12} rx={9.5} ry={3.6} />
      <Ellipse cx={12} cy={12} rx={9.5} ry={3.6} transform="rotate(60 12 12)" />
      <Ellipse cx={12} cy={12} rx={9.5} ry={3.6} transform="rotate(120 12 12)" />
    </G>
  ),
  soc: (
    <G>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M3 12h18" />
      <Path d="M12 3c2.5 2.5 3.8 5.5 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.5-3.8-9S9.5 5.5 12 3z" />
    </G>
  ),
  len: (
    <G>
      <Path d="M3 5h6a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H3z" />
      <Path d="M21 5h-6a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h7z" />
    </G>
  ),
  mus: (
    <G>
      <Path d="M9 18V5l11-2v13" />
      <Circle cx={6} cy={18} r={3} />
      <Circle cx={17} cy={16} r={3} />
    </G>
  ),
  vis: (
    <G>
      <Path d="M12 3a9 9 0 1 0 0 18c1.2 0 2-.8 2-2 0-.6-.3-1-.6-1.4-.3-.4-.5-.8-.5-1.3 0-1 .9-1.8 2-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z" />
      <Circle cx={7.5} cy={11} r={1} />
      <Circle cx={10} cy={7} r={1} />
      <Circle cx={15} cy={7.5} r={1} />
    </G>
  ),
  mov: (
    <G>
      <Circle cx={14} cy={4.5} r={2} />
      <Path d="M9 21l2.5-6.5L15 17v4" />
      <Path d="M5 10.5L9 8l4 .5 3 3.5 3 1" />
      <Path d="M11.5 14.5L13 8.5" />
    </G>
  ),
};

export function AreaIcon({ area, ...props }: IconProps & { area: AreaId }) {
  return <Frame {...props}>{AREA_PATHS[area]}</Frame>;
}

const KNOWLEDGE_PATHS: Partial<Record<KnowledgeArea, React.ReactNode>> = {
  'Salud': <Path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z" />,
  'Tecnología': (
    <G>
      <Rect x={6} y={6} width={12} height={12} rx={2} />
      <Path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
    </G>
  ),
  'Educación': (
    <G>
      <Path d="M2 9l10-5 10 5-10 5z" />
      <Path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
      <Path d="M22 9v6" />
    </G>
  ),
  'Ciencias Básicas': (
    <G>
      <Circle cx={11} cy={11} r={6} />
      <Path d="M20 20l-4.5-4.5" />
    </G>
  ),
  'Arte y Arquitectura': AREA_PATHS.vis,
  'Ciencias Sociales': AREA_PATHS.soc,
  'Humanidades': AREA_PATHS.len,
  'Derecho': (
    <G>
      <Path d="M12 3v18M7 21h10" />
      <Path d="M5 7h14" />
      <Path d="M5 7l-3 7a3 3 0 0 0 6 0zM19 7l-3 7a3 3 0 0 0 6 0z" />
    </G>
  ),
  'Administración y Comercio': (
    <G>
      <Rect x={3} y={7} width={18} height={13} rx={2} />
      <Path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <Path d="M3 13h18" />
    </G>
  ),
  'Agropecuaria': (
    <G>
      <Path d="M12 21V11" />
      <Path d="M12 11c0-4 3-7 7-7 0 4-3 7-7 7zM12 14c0-3-2.5-5.5-6-5.5 0 3 2.5 5.5 6 5.5z" />
    </G>
  ),
};

export function KnowledgeIcon({ area, ...props }: IconProps & { area: KnowledgeArea }) {
  return <Frame {...props}>{KNOWLEDGE_PATHS[area] ?? AREA_PATHS.bio}</Frame>;
}

export const FIELD_AREA: Record<'ciencias' | 'humanidades' | 'artes', AreaId> = { ciencias: 'qui', humanidades: 'len', artes: 'vis' };
