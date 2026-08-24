import { config } from './config.js';
import nodemailer from 'nodemailer';

type Attachment = {
  filename: string;
  content: string;
  content_type: string;
};

type Email = {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
};

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpPort === 465,
  auth: {
    user: config.smtpUser,
    pass: config.smtpPass,
  },
});

/**
 * Sends transactional email through Resend's HTTPS API.  Keeping this small
 * and dependency-free makes local development safe: without credentials we
 * log the message instead of making a network request.
 */
export async function sendEmail(message: Email) {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass || !config.emailFrom) {
    console.info(`[email preview] ${message.subject} -> ${message.to}`);
    return { delivered: false, reason: 'Email is not configured' };
  }

  const info = await transporter.sendMail({
    from: config.emailFrom,
    to: message.to,
    subject: message.subject,
    html: message.html,
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      content: Buffer.from(attachment.content, 'base64'),
      contentType: attachment.content_type,
    })),
  });

  console.info(`[email sent] ${message.subject} -> ${message.to} (${info.messageId})`);

  return {
    delivered: true,
    messageId: info.messageId,
  };
}


export function qrPngAttachment(reference: string, qrDataUrl: string): Attachment {
  const base64 = qrDataUrl.split(',', 2)[1];
  if (!base64) throw new Error('Could not prepare QR attachment');
  return {
    filename: `${reference}.png`,
    content: base64,
    content_type: 'image/png',
  };
}

export function ticketEmailHtml(input: {
  name: string;
  reference: string;
  eventTitle: string;
  venue: string;
  startsAt: Date;
  seats: string[];
  category?: string;
  subtotal?: number;
  convenienceFee?: number;
  tax?: number;
  total?: number;
  posterUrl?: string | null;
  qrDataUrl: string;
}) {
  const when = input.startsAt.toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  });
  return `<main style="font-family:Arial,sans-serif;color:#1f2933;max-width:560px">
    <h1>Your Seatflow ticket is confirmed</h1>
    <p>Hi ${escapeHtml(input.name)}, your booking reference is <strong>${escapeHtml(input.reference)}</strong>.</p>
    ${input.posterUrl ? `<img src="${escapeHtml(input.posterUrl)}" width="120" alt="${escapeHtml(input.eventTitle)} poster" />` : ''}
    <p><strong>${escapeHtml(input.eventTitle)}</strong><br>${escapeHtml(input.venue)}<br>${when}<br>Seats: ${escapeHtml(input.seats.join(', '))}${input.category ? `<br>Category: ${escapeHtml(input.category)}` : ''}</p>
    ${typeof input.total === 'number' ? `<p>Ticket price: ${formatMoney(input.subtotal || 0)}<br>Convenience fee: ${formatMoney(input.convenienceFee || 0)}<br>GST: ${formatMoney(input.tax || 0)}<br><strong>Total: ${formatMoney(input.total)}</strong></p>` : ''}
    <p>Present this QR ticket at entry. It opens Seatflow's public ticket verification page for booking <strong>${escapeHtml(input.reference)}</strong>.</p>
    <img src="${input.qrDataUrl}" width="180" height="180" alt="QR ticket for ${escapeHtml(input.reference)}" />
  </main>`;
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character]!);

const formatMoney = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
