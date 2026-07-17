const express = require('express');
const Mission = require('../models/Mission');
const { telegramAuth } = require('../middleware/telegramAuth');
const {
  DAILY_BONUS_BASE,
  DAILY_BONUS_PER_STREAK_DAY,
  DAILY_BONUS_MAX_STREAK_DAYS,
  STREAK_RESET_HOURS,
  MISSION_CLAIM_DELAY_SECONDS,
} = require('../utils/gameConfig');
const { publicUserView } = require('../utils/gameLogic');

const router = express.Router();

// Statuses that count as "actually joined" when calling Telegram's getChatMember.
const JOINED_STATUSES = new Set(['creator', 'administrator', 'member', 'restricted']);

function getMissionProgressEntry(user, missionId) {
  const key = String(missionId);
  const entry = user.missionProgress?.get ? user.missionProgress.get(key) : user.missionProgress?.[key];
  return entry || null;
}

/**
 * GET /api/missions
 * Returns all enabled missions plus per-user state: completed, in-progress
 * (started but not yet claimable), or claimable-now — all timing derived from
 * the stored missionProgress timestamp, never a client-supplied value.
 */
router.get('/', telegramAuth, async (req, res) => {
  const user = req.user;
  const missions = await Mission.find({ enabled: true }).sort({ order: 1, createdAt: 1 });

  const completedIds = new Set(user.completedMissions.map((m) => String(m.missionId)));

  const now = Date.now();
  const canCheckInToday =
    !user.lastCheckInAt || now - new Date(user.lastCheckInAt).getTime() > 1000 * 60 * 60 * 20;

  const list = missions.map((m) => {
    const completed = m.type === 'daily_checkin' ? !canCheckInToday : completedIds.has(String(m._id));
    let claimReadyInSeconds = 0;
    let started = false;

    if (!completed && m.type === 'telegram_join') {
      const progress = getMissionProgressEntry(user, m._id);
      if (progress) {
        started = true;
        const elapsed = (now - new Date(progress.startedAt).getTime()) / 1000;
        claimReadyInSeconds = Math.max(0, Math.ceil(MISSION_CLAIM_DELAY_SECONDS - elapsed));
      }
    }

    return {
      id: m._id,
      title: m.title,
      description: m.description,
      type: m.type,
      url: m.url,
      reward: m.reward,
      completed,
      started,
      claimReadyInSeconds, // 0 once the wait is over (or if not applicable)
    };
  });

  res.json({ missions: list, streakCount: user.streakCount });
});

/**
 * POST /api/missions/:id/start
 * Records the moment the user tapped the mission link. Only meaningful for
 * telegram_join missions, which gate their "Claim" button off this timestamp.
 */
router.post('/:id/start', telegramAuth, async (req, res) => {
  try {
    const user = req.user;
    const mission = await Mission.findById(req.params.id);
    if (!mission || !mission.enabled) return res.status(404).json({ error: 'Mission not found' });

    if (!user.missionProgress) user.missionProgress = new Map();
    user.missionProgress.set(String(mission._id), { startedAt: new Date() });
    await user.save();

    res.json({ startedAt: new Date(), delaySeconds: MISSION_CLAIM_DELAY_SECONDS });
  } catch (err) {
    console.error('[missions/start] error:', err.message);
    res.status(500).json({ error: 'Failed to start mission' });
  }
});

/**
 * POST /api/missions/:id/complete
 * - telegram_join: requires the 45s server-timed wait since /start, then calls
 *   Telegram's getChatMember to confirm real channel membership before paying out.
 * - x_follow / custom_link / invite_friends: self-reported (no free verification API).
 * - daily_checkin: streak-based bonus, unrelated to the above.
 */
router.post('/:id/complete', telegramAuth, async (req, res) => {
  try {
    const user = req.user;
    const mission = await Mission.findById(req.params.id);
    if (!mission || !mission.enabled) {
      return res.status(404).json({ error: 'Mission not found' });
    }

    if (mission.type === 'daily_checkin') {
      const now = Date.now();
      const last = user.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null;

      if (last && now - last < 1000 * 60 * 60 * 20) {
        return res.status(400).json({ error: 'Daily Training Bonus already claimed today' });
      }

      const brokeStreak = last && now - last > STREAK_RESET_HOURS * 60 * 60 * 1000;
      user.streakCount = brokeStreak ? 1 : Math.min(user.streakCount + 1, DAILY_BONUS_MAX_STREAK_DAYS);
      user.lastCheckInAt = new Date(now);

      const reward = DAILY_BONUS_BASE + (user.streakCount - 1) * DAILY_BONUS_PER_STREAK_DAY + mission.reward;
      user.balance += reward;
      await user.save();
      return res.json({ user: publicUserView(user), rewardGranted: reward, streakCount: user.streakCount });
    }

    const alreadyDone = user.completedMissions.some((m) => String(m.missionId) === String(mission._id));
    if (alreadyDone) {
      return res.status(400).json({ error: 'Mission already completed' });
    }

    if (mission.type === 'telegram_join') {
      const progress = getMissionProgressEntry(user, mission._id);
      if (!progress) {
        return res.status(400).json({ error: 'Tap the mission link first, then come back and claim' });
      }

      const elapsedSeconds = (Date.now() - new Date(progress.startedAt).getTime()) / 1000;
      const remaining = Math.ceil(MISSION_CLAIM_DELAY_SECONDS - elapsedSeconds);
      if (remaining > 0) {
        return res.status(400).json({ error: 'Please wait before claiming', remainingSeconds: remaining });
      }

      const channelId = process.env.TELEGRAM_CHANNEL_ID;
      if (!channelId) {
        console.error('[missions/complete] TELEGRAM_CHANNEL_ID is not set — cannot verify membership');
        return res.status(500).json({ error: 'Verification is not configured yet' });
      }

      try {
        const bot = require('../bot/bot');
        const member = await bot.getChatMember(channelId, user.telegramId);
        if (!JOINED_STATUSES.has(member.status)) {
          return res.status(400).json({ error: 'You have not joined the channel yet — join, then claim again.' });
        }
      } catch (err) {
        console.error('[missions/complete] getChatMember failed:', err.message);
        return res.status(400).json({ error: 'Could not verify channel membership yet — try again in a moment.' });
      }
    }

    user.completedMissions.push({ missionId: mission._id, completedAt: new Date() });
    user.balance += mission.reward;
    if (user.missionProgress) user.missionProgress.delete(String(mission._id));
    await user.save();

    res.json({ user: publicUserView(user), rewardGranted: mission.reward });
  } catch (err) {
    console.error('[missions/complete] error:', err.message);
    res.status(500).json({ error: 'Failed to complete mission' });
  }
});

module.exports = router;
