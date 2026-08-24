import { describe, expect, it } from 'vitest';
import QRCode from 'qrcode';
import { qrPngAttachment, ticketEmailHtml } from './email.js';

describe('ticket email helpers', () => {
  it('creates a portable PNG attachment from the QR data URL', async () => {
    const qr = await QRCode.toDataURL('BK-2026-TEST1234');
    const attachment = qrPngAttachment('BK-2026-TEST1234', qr);
    expect(attachment.filename).toBe('BK-2026-TEST1234.png');
    expect(attachment.content_type).toBe('image/png');
    expect(attachment.content.length).toBeGreaterThan(100);
  });

  it('shows the booking reference in the ticket HTML', async () => {
    const html = ticketEmailHtml({ name: 'Test Customer', reference: 'BK-2026-TEST1234', eventTitle: 'Demo', venue: 'Theatre', startsAt: new Date('2026-08-24T19:00:00Z'), seats: ['A1'], qrDataUrl: await QRCode.toDataURL('BK-2026-TEST1234') });
    expect(html).toContain('BK-2026-TEST1234');
    expect(html).toContain('A1');
  });
});
