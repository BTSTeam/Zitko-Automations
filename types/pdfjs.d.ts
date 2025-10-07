// types/pdfjs.d.ts
declare module 'pdfjs-dist' {
  // Extremely light ambient types just to satisfy TS in app code.
  export const version: string
  export function getDocument(src: any): any
  // You can add more exports if you need them later.
}
