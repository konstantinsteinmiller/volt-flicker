// English source bundle. Single source of truth for translation keys — every
// new player-facing string gets a key here first; the per-language files in
// this folder mirror the shape. Vite ships each non-English locale as its own
// lazy chunk (see `src/i18n/index.ts`).
export default {
  'gameName': 'Epicancer',
  'cancel': 'Cancel',
  'close': 'Close',
  'ok': 'Ok',
  'continue': 'Continue',
  'tapToContinue': 'Tap to continue',
  'clickToContinue': 'Click to continue',
  'stage': 'Stage',
  'rewards': 'REWARDS',
  'tip': 'Tip',
  'crazyGamesOnly': 'This game is only available on',
  'startTouch': 'Tap to Start',
  'startDesktop': 'Click to Start',
  'startSubhint': 'Roll upward — change direction to dodge the gaps and obstacles!',
  'hints': {
    'tapToTurn': 'Tap to change direction',
    'clickToTurn': 'Click / Space to change direction'
  },
  'powerups': {
    'invuln': 'Invincible',
    'magnet': 'Coin Magnet',
    'dodge': 'Dodge Master',
    'slowmo': 'Slow Motion',
    'push': 'Push Force'
  },
  'secondChance': {
    'title': 'Keep rolling?',
    'body': 'Watch a short ad to revive and continue your run.',
    'watch': 'Watch & Continue',
    'skip': 'Skip'
  },
  'result': {
    'win': 'STAGE CLEAR!',
    'lose': 'GAME OVER',
    'fell': 'You fell into a gap!',
    'crashed': 'You crashed into an obstacle!',
    'tiles': 'Tiles',
    'winReward': 'incl. +{n} stage bonus',
    'double': 'Double coins',
    'firstRunDouble': '2× — first run today!'
  },
  'missions': {
    'title': 'Daily Missions',
    'subtitle': 'Complete goals each day for coins.',
    'claim': 'Claim',
    'done': 'Claimed',
    'types': {
      'coins': 'Collect {n} coins today',
      'tiles': 'Travel {n} tiles in one run',
      'items': 'Grab {n} item boxes today',
      'clears': 'Clear {n} stages today'
    }
  },
  'endless': {
    'badge': 'Endless',
    'toEndless': 'Endless Mode',
    'toCampaign': 'Campaign',
    'best': 'Best: {n}'
  },
  'boon': {
    'title': 'Choose a boon',
    'names': {
      'secondChance': 'Second Chance',
      'startPowerup': 'Head Start',
      'coinBoost': 'Coin Rush'
    },
    'descriptions': {
      'secondChance': 'Begin the next stage with a Second Chance shield.',
      'startPowerup': 'Begin the next stage with a random power-up.',
      'coinBoost': '1.2× coins for the whole next stage.'
    }
  },
  'upgrades': {
    'title': 'Upgrades',
    'subtitle': 'Spend coins to power up permanently.',
    'level': 'Lv.{n}',
    'maxedOut': 'MAXED',
    'sellBack': 'Sell +{n}',
    'spotlight': 'Spend!',
    'unlocksAtStage': '🔒 Stage {n}',
    'names': {
      'powerupDuration': 'Power Boost',
      'magnetRange': 'Magnet Range',
      'coinValue': 'Coin Value',
      'itemLuck': 'Lucky Boxes',
      'dodgeApprentice': 'Dodge Apprentice',
      'deathMagnet': 'Death Magnet',
      'autoCollect': 'Auto-Collect',
      'rollingBoulder': 'Rolling Boulder'
    },
    'descriptions': {
      'powerupDuration': 'All power-ups last longer (+0.75s per level).',
      'magnetRange': 'The Coin Magnet reaches further.',
      'coinValue': 'Each coin you grab is worth more.',
      'itemLuck': 'Item boxes appear more often.',
      'dodgeApprentice': 'Auto-dodge one deadly tile, then recharge (10s; −0.5s per level).',
      'deathMagnet': 'On death, grab every coin within 4 tiles — bank what you would have lost.',
      'autoCollect': 'Always collect coins from nearby tiles — a permanent 1-tile magnet.',
      'rollingBoulder': 'Roll straight through box obstacles, unharmed.'
    },
    'secondChance': {
      'name': 'Second Chance',
      'description': 'Start each run with angel wings — survive one crash or fall. Active until used.',
      'active': 'ACTIVE',
      'watch': 'Free'
    }
  },
  'battlePass': {
    'title': 'Battle Pass',
    'progress': '{current} / {total}',
    'daysLeft': '{n}d left',
    'maxed': 'BATTLE PASS COMPLETE',
    'xpProgress': '{current} / {total} XP',
    'howToEarn': 'How to earn XP',
    'perAttempt': 'per run',
    'perStageFinish': 'per stage clear',
    'unlockHint': 'Reach {n} XP to unlock the next reward — unclaimed rewards stay until you tap them.'
  },
  'dailyRewards': {
    'title': 'Daily Rewards',
    'subtitle': 'Sign in every day to keep your streak.',
    'day': 'Day {n}',
    'dayShort': 'D{n}'
  },
  'skins': {
    'title': 'Ball Skins',
    'subtitle': 'Spend coins to unlock and equip new looks.',
    'equip': 'Equip',
    'equipped': 'Equipped'
  },
  'options': {
    'title': 'Options',
    'general': 'General',
    'audio': 'Audio',
    'language': 'Language',
    'difficulty': 'Difficulty',
    'soundEffects': 'Sound Effects',
    'music': 'Music',
    'musicTrack': 'Music Track',
    'musicTracks': {
      'cozy': 'Cozy Harmony',
      'trance': 'Trance Tunnel'
    },
    'close': 'Save & Close',
    'difficulties': {
      'easy': 'Easy',
      'medium': 'Medium',
      'hard': 'Hard'
    },
    'difficultyHints': {
      'easy': 'Slower travel speed — more time to react.',
      'medium': 'The standard, balanced pace.',
      'hard': 'Faster travel speed — tighter, more precise timing.'
    }
  }
}
