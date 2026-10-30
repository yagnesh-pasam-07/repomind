import twilio from 'twilio';
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
export async function sendOtp(phone: string, code: string) {
  await client.messages.create({ to: phone, from: process.env.TWILIO_FROM, body: `Your Sumitra code is ${code}` });
}
