import DOMPurify from 'dompurify';

export function sanitizeHtml(dirty: string | null | undefined): string {
  if (dirty === null || dirty === undefined || typeof dirty !== 'string') {
    return '';
  }
  
  try {
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS: ['b', 'i', 'u', 'br', 'span', 'mark'],
      ALLOWED_ATTR: ['class', 'style'],
      RETURN_DOM: false,
      RETURN_DOM_FRAGMENT: false,
    }) as string;
  } catch (e) {
    console.error('Error sanitizing HTML:', e);
    return '';
  }
}
