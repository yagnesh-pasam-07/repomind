import express from 'express';
import twilio from 'twilio';

const app = express();
const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

app.post('/leave/apply', async (_req, res) => {
  await sms.messages.create({ to: '+910000000000', from: '+10000000000', body: 'Leave applied' });
  res.json({ ok: true });
});

app.listen(8080);
