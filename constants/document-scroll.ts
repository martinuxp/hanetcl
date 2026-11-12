// The page-scroll mode of the phone web (hooks/use-document-scroll.ts):
// the class the root HTML gets while a screen lends its list's scroll to the
// page, the empty block that gives the page its height, and their CSS (in
// app/+html.tsx). Apart so the root HTML doesn't import the app.

export const DOCUMENT_SCROLL_CLASS = 'hn-document-scroll';
export const DOCUMENT_SCROLL_SPACER = 'hn-document-spacer';

export const DOCUMENT_SCROLL_CSS = [
  `html.${DOCUMENT_SCROLL_CLASS},html.${DOCUMENT_SCROLL_CLASS} body{height:auto;min-height:100%;overflow:visible;}`,
  // Over the whole window, also behind the browser's bars once they shrink.
  `html.${DOCUMENT_SCROLL_CLASS} #root{position:fixed;top:0;left:0;right:0;bottom:0;height:auto;}`,
  `#${DOCUMENT_SCROLL_SPACER}{width:1px;pointer-events:none;}`,
].join('');
