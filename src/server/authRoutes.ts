import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createSession,
  createUser,
  deleteSession,
  deleteSlaveUser,
  getSession,
  hasMasterUser,
  listUsers,
  validatePassword,
  validateUsername,
  verifyCredentials
} from './authStore';
import {
  clearSessionCookie,
  readSessionToken,
  requireAuth,
  requireMaster,
  setSessionCookie
} from './requireAuth';

const loginLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 5 minutes and try again.' }
});

export function createAuthRouter(): express.Router {
  const router = express.Router();

  router.get('/status', async (req, res) => {
    try {
      const masterExists = await hasMasterUser();
      const session = await getSession(readSessionToken(req));
      res.json({
        setupRequired: !masterExists,
        authenticated: !!session,
        username: session ? session.username : null,
        role: session ? session.role : null
      });
    } catch (err) {
      console.error('Auth status error', err);
      res.status(500).json({ error: 'Failed to read authentication status.' });
    }
  });

  router.post('/setup', loginLimiter, async (req, res) => {
    try {
      const masterExists = await hasMasterUser();
      if (masterExists) {
        res.status(409).json({ error: 'Master account already exists.' });
        return;
      }
      const username = req.body?.username;
      const password = req.body?.password;
      const usernameError = validateUsername(username);
      if (usernameError) {
        res.status(400).json({ error: usernameError });
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
      }
      await createUser(String(username), String(password), 'master');
      const user = await verifyCredentials(String(username), String(password));
      if (!user) {
        res.status(500).json({ error: 'Failed to create master account.' });
        return;
      }
      const session = await createSession(user, false);
      setSessionCookie(res, session.token, false);
      res.json({ success: true, username: user.username, role: user.role });
    } catch (err) {
      console.error('Auth setup error', err);
      res.status(500).json({ error: 'Failed to create master account.' });
    }
  });

  router.post('/login', loginLimiter, async (req, res) => {
    try {
      const masterExists = await hasMasterUser();
      if (!masterExists) {
        res.status(409).json({ error: 'Master account is not set up yet.' });
        return;
      }
      const rememberMe = req.body?.rememberMe === true;
      const user = await verifyCredentials(req.body?.username, req.body?.password);
      if (!user) {
        res.status(401).json({ error: 'Incorrect username or password.' });
        return;
      }
      const session = await createSession(user, rememberMe);
      setSessionCookie(res, session.token, rememberMe);
      res.json({ success: true, username: user.username, role: user.role });
    } catch (err) {
      console.error('Auth login error', err);
      res.status(500).json({ error: 'Failed to sign in.' });
    }
  });

  router.post('/logout', async (req, res) => {
    try {
      await deleteSession(readSessionToken(req));
      clearSessionCookie(res);
      res.json({ success: true });
    } catch (err) {
      console.error('Auth logout error', err);
      clearSessionCookie(res);
      res.json({ success: true });
    }
  });

  router.get('/me', requireAuth, async (req: any, res) => {
    res.json({ username: req.authUser.username, role: req.authUser.role });
  });

  router.get('/users', requireAuth, requireMaster, async (_req, res) => {
    try {
      const users = await listUsers();
      res.json({ users });
    } catch (err) {
      console.error('Auth list users error', err);
      res.status(500).json({ error: 'Failed to load users.' });
    }
  });

  router.post('/users', requireAuth, requireMaster, async (req, res) => {
    try {
      const username = req.body?.username;
      const password = req.body?.password;
      const usernameError = validateUsername(username);
      if (usernameError) {
        res.status(400).json({ error: usernameError });
        return;
      }
      const passwordError = validatePassword(password);
      if (passwordError) {
        res.status(400).json({ error: passwordError });
        return;
      }
      const created = await createUser(String(username), String(password), 'slave');
      res.json({ success: true, user: created });
    } catch (err: any) {
      if (err?.message === 'USERNAME_TAKEN') {
        res.status(409).json({ error: 'This username already exists.' });
        return;
      }
      console.error('Auth create user error', err);
      res.status(500).json({ error: 'Failed to create user.' });
    }
  });

  router.delete('/users/:username', requireAuth, requireMaster, async (req, res) => {
    try {
      const removed = await deleteSlaveUser(req.params.username);
      if (!removed) {
        res.status(400).json({ error: 'This account cannot be deleted.' });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error('Auth delete user error', err);
      res.status(500).json({ error: 'Failed to delete user.' });
    }
  });

  return router;
}
