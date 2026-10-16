import { Router, Request, Response, NextFunction } from 'express';
import passport from 'passport';
import { User } from '@prisma/client';

const router = Router();

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Unauthorized. Please log in.' });
}

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/login?error=oauth_failed`,
    session: true,
  }),
  (_req: Request, res: Response) => {
    res.redirect(`${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/dashboard`);
  }
);

router.get('/me', requireAuth, (req: Request, res: Response) => {
  const user = req.user as User;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatarUrl: user.avatarUrl,
    hasSlack: !!(user.slackAccessToken && user.slackChannelId),
  });
});

router.get('/logout', (req: Request, res: Response, next: NextFunction) => {
  req.logout((err) => {
    if (err) {
      return next(err);
    }
    req.session.destroy((destroyErr) => {
      if (destroyErr) {
        console.error('[Auth] Session destroy failed:', destroyErr);
      }
      res.clearCookie('connect.sid');
      res.json({ success: true, message: 'Logged out successfully.' });
    });
  });
});

export default router;
