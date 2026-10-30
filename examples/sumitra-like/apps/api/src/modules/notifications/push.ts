import { Expo } from 'expo-server-sdk';
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });
export async function push(tokens: string[], body: string) { await expo.sendPushNotificationsAsync(tokens.map((to) => ({ to, body }))); }
