import nodemailer from 'nodemailer';
const t = nodemailer.createTransport({ host: process.env.SMTP_HOST, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
export async function sendEmail(body: any) { await t.sendMail({ to: body.email, subject: 'Leave update' }); }
