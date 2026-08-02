/**
 * Saved Emoji Palette
 * Saved from user input for custom chat status badges, reactions, and tool mappings.
 */

export const USER_EMOJI_PALETTE = {
  // Expressions & Reactions
  celebration: "🥳",
  love: "🥰",
  happy: "😊",
  smile: "🙂",
  starry: "🤩",
  cool: "😎",
  sad: "🙁",
  weary: "😩",
  salute: "🫡",
  alien: "👾",
  thumbsUp: "👍🏻",
  victory: "✌🏻",
  lion: "🦁",
  okHand: "👌🏻",
  coderMan: "🧑‍💻",
  coderWoman: "👩🏻‍💻",
  shrug: "🤷🏻‍♂️",
  hammer: "🔨",

  // Energy & Signals
  fire: "🔥",
  moon: "🌙",
  sun: "🌞",
  sprout: "🌱",
  boom: "💥",
  dizzy: "💫",
  zap: "⚡️",
  exclamation: "❕",
  question: "❔",
  clock: "🕑",

  // Business & Metrics
  moneyBag: "💰",
  moneyFlying: "💸",
  emailSend: "📤",
  emailInbox: "📩",
  email: "📧",
  chartUp: "📈",
  chartDown: "📉",
  heartRed: "❤️",
  heartPink: "🩷",
  infinity: "♾️",
} as const;

export const EMOJI_LIST = [
  "🥳", "🥰", "😊", "🙂", "🤩", "😎", "🙁", "😩", "🫡", "👾", 
  "👍🏻", "✌🏻", "🦁", "👌🏻", "🧑‍💻", "👩🏻‍💻", "🤷🏻‍♂️", "🔨",
  "🔥", "🌙", "🌞", "🌱", "💥", "💫", "⚡️", "❕", "❔", "🕑",
  "💰", "💸", "📤", "📩", "📧", "📈", "📉", "❤️", "🩷", "♾️"
];

/**
 * Maps tools and status types to saved custom emojis
 */
export const TOOL_EMOJI_MAPPING: Record<string, string> = {
  getAccountDetails: USER_EMOJI_PALETTE.chartUp,
  getAllAccounts: USER_EMOJI_PALETTE.lion,
  getStripeAccountState: USER_EMOJI_PALETTE.moneyBag,
  getPostHogAccountUsage: USER_EMOJI_PALETTE.chartUp,
  getGmailThreadsForAccount: USER_EMOJI_PALETTE.emailInbox,
  getMyInbox: USER_EMOJI_PALETTE.emailInbox,
  generateFollowUpDraft: USER_EMOJI_PALETTE.emailSend,
  webSearchTool: USER_EMOJI_PALETTE.starry,
  createRescueDiscountTool: USER_EMOJI_PALETTE.fire,
  updateAccountRisk: USER_EMOJI_PALETTE.chartDown,
  deliverSlackBriefTool: USER_EMOJI_PALETTE.zap,
};
