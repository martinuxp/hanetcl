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
  `html.${DOCUMENT_SCROLL_CLASS},html.${DOCUMENT_SCROLL_CLASS} body{height:auto;min-height:100%;overflow:visible;}`,
  `#${DOCUMENT_SCROLL_SPACER}{width:1px;pointer-events:none;}`,
].join('');
