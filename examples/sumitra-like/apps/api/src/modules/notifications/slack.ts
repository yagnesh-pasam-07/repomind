import { WebClient } from '@slack/web-api';
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
export async function notifyManager(body: any) { await slack.chat.postMessage({ channel: body.manager, text: 'Leave request' }); }
export async function postPoll(body: any) { await slack.chat.postMessage({ channel: body.channel, text: body.question }); }
