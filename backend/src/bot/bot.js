const TelegramBot = require('node-telegram-bot-api');

const token = process.env.TELEGRAM_BOT_TOKEN;
const miniAppUrl = process.env.MINI_APP_URL;

if (!token) {
  console.warn('[bot] TELEGRAM_BOT_TOKEN not set — bot will not start');
  module.exports = null;
  return;
}

// Polling is simplest for a free-tier single instance. If you outgrow polling,
// switch to bot.setWebHook(<your Render URL>/bot<token>) and an Express route instead.
const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start(?:\s+(.+))?/, (msg, match) => {
  const chatId = msg.chat.id;
  const referralCode = match?.[1]; // supports t.me/YourBot?start=CODE deep links

  const appUrl = referralCode ? `${miniAppUrl}?ref=${referralCode}` : miniAppUrl;

  bot.sendMessage(chatId, 'Welcome to AiT — jump in and start running inference to earn AiT.', {
    reply_markup: {
      inline_keyboard: [[{ text: 'Launch AiT', web_app: { url: appUrl } }]],
    },
  });
});

// Also set the persistent menu button so users can reopen the app any time.
bot
  .setChatMenuButton({
    menu_button: { type: 'web_app', text: 'Launch AiT', web_app: { url: miniAppUrl } },
  })
  .catch((err) => console.error('[bot] Failed to set menu button:', err.message));

bot.on('polling_error', (err) => console.error('[bot] polling error:', err.message));

console.log('[bot] Telegram bot started (polling)');

module.exports = bot;
