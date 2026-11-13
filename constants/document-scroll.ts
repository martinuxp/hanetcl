// The page-scroll mode of the phone web (hooks/use-document-scroll.ts):
// the class the root HTML gets while a screen lends its list's scroll to the
// page, the empty block that gives the page its height, and their CSS (in
// app/+html.tsx). Apart so the root HTML doesn't import the app.

export const DOCUMENT_SCROLL_CLASS = 'hn-document-scroll';
export const DOCUMENT_SCROLL_SPACER = 'hn-document-spacer';

export const DOCUMENT_SCROLL_CSS = [
  // The app always covers the whole window. With height:100% an iPhone's
  // home-screen app (translucent status bar) came out a status bar short,
  // leaving an empty band at the bottom; in the browser it also spans what
  // the bars uncover once they shrink.
  '#root{position:fixed;top:0;left:0;right:0;bottom:0;height:auto;}',
  // The page is the same on every screen, whether or not one lends its list
  // to the page's scroll: on an iPhone's home screen the window measured
  // differently in each case, so between screens the app ended a band short
  // of the bottom and the tab bar jumped.
  // The page itself never stretches: with overflow visible, the iPhone let
  // the finger pull the whole app (tab bar included) and it sprang back.
  'html,body{height:auto;min-height:100%;overflow:visible;overscroll-behavior:none;}',
  // The empty block is always there and the page is always a little taller
  // than the window: on an iPhone's home screen the window only reached the
  // bottom on screens whose page was taller (Inicio, Perfil and
  // Configuraciones, which lend it their long lists). Elsewhere the app ended
  // a band short and the tab bar sat higher. A screen lending its scroll sets
  // its own height over this one.
  // (Only on touch screens: on a computer the extra pixel would show a scroll bar.)
  `#${DOCUMENT_SCROLL_SPACER}{width:1px;pointer-events:none;}`,
  `@media (pointer:coarse){#${DOCUMENT_SCROLL_SPACER}{height:calc(100vh + 1px);}}`,
].join('');
