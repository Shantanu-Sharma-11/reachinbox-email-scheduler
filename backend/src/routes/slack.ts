import { Router, Request, Response } from 'express';
import { WebClient } from '@slack/web-api';
import { PrismaClient, User } from '@prisma/client';
import { requireAuth } from './auth';

const router = Router();
const prisma = new PrismaClient();

const SLACK_CLIENT_ID = process.env.SLACK_CLIENT_ID ?? '';
const SLACK_CLIENT_SECRET = process.env.SLACK_CLIENT_SECRET ?? '';
const SLACK_REDIRECT_URI = process.env.SLACK_REDIRECT_URI ?? 'http://localhost:4000/slack/callback';
const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

router.get('/connect', requireAuth, (req: Request, res: Response) => {
  const state = Buffer.from(JSON.stringify({ userId: (req.user as User).id })).toString('base64');

  const params = new URLSearchParams({
    client_id: SLACK_CLIENT_ID,
    scope: 'chat:write,channels:read,channels:join',
    redirect_uri: SLACK_REDIRECT_URI,
    state,
  });

  res.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`);
});

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string | undefined>;

  if (error || !code) {
    console.error('[Slack] OAuth callback error:', error ?? 'missing code');
    return res.redirect(`${FRONTEND_URL}/dashboard?slack=error`);
  }

  let userId: string | undefined;
  try {
    const decoded = JSON.parse(Buffer.from(state ?? '', 'base64').toString());
    userId = decoded.userId as string;
  } catch {
    return res.redirect(`${FRONTEND_URL}/dashboard?slack=error&reason=invalid_state`);
  }

  if (!userId) {
    return res.redirect(`${FRONTEND_URL}/dashboard?slack=error&reason=no_user`);
  }

  try {
    const client = new WebClient();
    const oauthResult = await client.oauth.v2.access({
      client_id: SLACK_CLIENT_ID,
      client_secret: SLACK_CLIENT_SECRET,
      code,
      redirect_uri: SLACK_REDIRECT_URI,
    });

    if (!oauthResult.ok || !oauthResult.access_token) {
      throw new Error('Slack oauth.v2.access failed: ' + oauthResult.error);
    }

    const accessToken = oauthResult.access_token;

    const botClient = new WebClient(accessToken);
    const channelsList = await botClient.conversations.list({
      types: 'public_channel',
      exclude_archived: true,
      limit: 1,
    });

    const channelId =
      channelsList.channels && channelsList.channels.length > 0
        ? (channelsList.channels[0].id ?? '')
        : '';

    await prisma.user.update({
      where: { id: userId },
      data: {
        slackAccessToken: accessToken,
        slackChannelId: channelId,
      },
    });

    console.log(`[Slack] Connected workspace for user ${userId}`);
    res.redirect(`${FRONTEND_URL}/dashboard?slack=connected`);
  } catch (err) {
    console.error('[Slack] Token exchange failed:', err);
    res.redirect(`${FRONTEND_URL}/dashboard?slack=error`);
  }
});

router.delete('/disconnect', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as User).id;

    await prisma.user.update({
      where: { id: userId },
      data: {
        slackAccessToken: null,
        slackChannelId: null,
      },
    });

    res.json({ success: true, message: 'Slack integration removed.' });
  } catch (err) {
    console.error('[Slack] Disconnect failed:', err);
    res.status(500).json({ error: 'Failed to disconnect Slack.' });
  }
});

export default router;
