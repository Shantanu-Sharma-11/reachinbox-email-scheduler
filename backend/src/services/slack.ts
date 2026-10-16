import { WebClient } from '@slack/web-api';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Posts a rate-limit alert to the user's connected Slack channel.
// No-ops when Slack is not connected; API failures are logged, never thrown.
export async function sendSlackAlert(userId: string, message: string): Promise<void> {
  let user;
  try {
    user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        slackAccessToken: true,
        slackChannelId: true,
        name: true,
        email: true,
      },
    });
  } catch (dbErr) {
    console.error(`[Slack] Failed to load user ${userId}:`, dbErr);
    return;
  }

  if (!user?.slackAccessToken || !user?.slackChannelId) {
    return;
  }

  try {
    const client = new WebClient(user.slackAccessToken);

    await client.chat.postMessage({
      channel: user.slackChannelId,
      text: message,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*ReachInbox rate limit alert*\n\n${message}`,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `User: *${user.name}* (${user.email}) | ${new Date().toISOString()}`,
            },
          ],
        },
      ],
    });

    console.log(`[Slack] Alert posted for user ${userId}`);
  } catch (slackErr) {
    console.error(`[Slack] Post failed for user ${userId}:`, slackErr);
  }
}
