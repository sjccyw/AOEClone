// 遊戲資料定義：資源、時代、國家、建築、單位、科技
export const RES_KEYS = ['food', 'wood', 'stone', 'gold'];
export const RES_NAMES = { food: '糧食', wood: '木材', stone: '石材', gold: '黃金' };
export const RES_ICONS = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙' };

export const CELL = 2;          // 每格世界單位
export const MAX_POP = 150;

export const AGES = [
  { name: '春秋時代', cost: null, req: [], desc: '周室東遷，諸侯坐大。' },
  { name: '戰國時代', cost: { food: 500, wood: 300 }, req: ['granary', 'barracks'],
    desc: '禮崩樂壞，諸侯並起。解鎖劍士、弩兵、騎兵、衝車、學宮與市集。' },
  { name: '七雄爭霸', cost: { food: 900, gold: 500 }, req: ['academy', 'market'],
    desc: '合縱連橫，天下逐鹿。解鎖投石車、鐵兵器與孫子兵法。' },
];

export const FACTIONS = {
  qin: { name: '秦', full: '秦國', color: 0x2f2f33, css: '#3a3a40',
    desc: '商鞅變法，耕戰立國，虎狼之師。', bonus: '步兵攻擊 +15%，「商鞅變法」免費',
    mods: { infantryAtk: 1.15, freeTech: 'shangyang' } },
  chu: { name: '楚', full: '楚國', color: 0xb8322a, css: '#b8322a',
    desc: '地方五千里，帶甲百萬，問鼎中原。', bonus: '木材採集 +25%，戰車成本 -20%',
    mods: { gatherWood: 1.25, chariotCost: 0.8 } },
  qi: { name: '齊', full: '齊國', color: 0xd4a017, css: '#d4a017',
    desc: '魚鹽之利，稷下學宮，百家爭鳴。', bonus: '黃金採集 +20%，學宮科技成本 -25%',
    mods: { gatherGold: 1.2, techCost: 0.75 } },
  yan: { name: '燕', full: '燕國', color: 0x2e6fd0, css: '#2e6fd0',
    desc: '燕昭王築黃金臺，招賢納士。', bonus: '弓兵與弩兵射程 +1，箭樓成本 -30%',
    mods: { archerRange: 1, towerCost: 0.7 } },
  zhao: { name: '趙', full: '趙國', color: 0x1f9e8a, css: '#1f9e8a',
    desc: '趙武靈王胡服騎射，鐵騎縱橫。', bonus: '騎兵耐久 +20%，「胡服騎射」免費',
    mods: { cavalryHp: 1.2, freeTech: 'hufu' } },
  wei: { name: '魏', full: '魏國', color: 0x3f8f2f, css: '#3f8f2f',
    desc: '李悝變法，魏武卒天下無敵。', bonus: '劍士耐久 +20%，步兵訓練速度 +25%',
    mods: { swordHp: 1.2, infantryTrain: 1.25 } },
  han: { name: '韓', full: '韓國', color: 0xe07b1c, css: '#e07b1c',
    desc: '天下強弓勁弩皆從韓出。', bonus: '弩兵攻擊 +20%，「韓國勁弩」免費',
    mods: { crossbowAtk: 1.2, freeTech: 'hanbow' } },
};
export const FACTION_KEYS = Object.keys(FACTIONS);

// 建築：size 以格為單位
export const BUILDINGS = {
  towncenter: { name: '都城', icon: '🏯', cost: { wood: 350, stone: 150 }, hp: 2600, size: 4, age: 1, pop: 10, time: 120,
    dropoff: ['food', 'wood', 'stone', 'gold'], trains: ['villager'], atk: 8, range: 9, hotkey: 'N',
    desc: '國之中心。訓練農民、存放所有資源、研究時代進階。可射箭防禦。' },
  house: { name: '民居', icon: '🏠', cost: { wood: 30 }, hp: 450, size: 2, age: 1, pop: 5, time: 20, hotkey: 'Q',
    desc: '提供 5 人口上限。' },
  granary: { name: '糧倉', icon: '🌾', cost: { wood: 100 }, hp: 700, size: 2, age: 1, time: 30, dropoff: ['food'], hotkey: 'W',
    desc: '糧食存放點。' },
  lumber: { name: '伐木場', icon: '🪵', cost: { wood: 100 }, hp: 700, size: 2, age: 1, time: 30, dropoff: ['wood'], hotkey: 'E',
    desc: '木材存放點。' },
  mine: { name: '礦場', icon: '⛏️', cost: { wood: 100 }, hp: 700, size: 2, age: 1, time: 30, dropoff: ['stone', 'gold'], hotkey: 'R',
    desc: '石材與黃金存放點。' },
  farm: { name: '農田', icon: '🌱', cost: { wood: 60 }, hp: 300, size: 3, age: 1, time: 15, resource: 'food', hotkey: 'F',
    desc: '可持續耕作的糧食來源，建議建於糧倉或都城旁。' },
  barracks: { name: '兵營', icon: '⚔️', cost: { wood: 150 }, hp: 1200, size: 3, age: 1, time: 45, trains: ['ge', 'sword'], hotkey: 'B',
    desc: '訓練步兵。' },
  archery: { name: '弓弩坊', icon: '🏹', cost: { wood: 150 }, hp: 1100, size: 3, age: 1, time: 45, trains: ['archer', 'crossbow'], hotkey: 'A',
    desc: '訓練遠程部隊。' },
  stable: { name: '馬廄', icon: '🐎', cost: { wood: 170 }, hp: 1100, size: 3, age: 1, time: 45, trains: ['chariot', 'cavalry'], hotkey: 'L',
    desc: '訓練戰車與騎兵。' },
  siege: { name: '攻城坊', icon: '🛠️', cost: { wood: 200, stone: 100 }, hp: 1300, size: 3, age: 2, time: 55, trains: ['ram', 'catapult'], hotkey: 'G',
    desc: '製造攻城器械。' },
  academy: { name: '學宮', icon: '📜', cost: { wood: 200, stone: 150 }, hp: 1200, size: 3, age: 2, time: 60,
    techs: ['irontools', 'shangyang', 'hufu', 'mohist', 'hanbow', 'ironweapon', 'sunzi'], hotkey: 'X',
    desc: '研究科技，百家爭鳴。' },
  market: { name: '市集', icon: '⚖️', cost: { wood: 150 }, hp: 1000, size: 3, age: 2, time: 45, market: true, hotkey: 'M',
    desc: '以黃金買賣資源。' },
  tower: { name: '箭樓', icon: '🗼', cost: { wood: 60, stone: 120 }, hp: 950, size: 1, age: 1, time: 35, atk: 9, range: 9, hotkey: 'T',
    desc: '防禦箭樓，自動射擊靠近的敵人。' },
  wall: { name: '城牆', icon: '🧱', cost: { stone: 8 }, hp: 900, size: 1, age: 1, time: 8, hotkey: 'C', repeat: true,
    desc: '阻擋敵軍。建造模式會持續，右鍵或 Esc 結束。' },
};
export const BUILD_ORDER = ['house', 'farm', 'granary', 'lumber', 'mine', 'barracks', 'archery', 'stable', 'tower', 'wall', 'siege', 'academy', 'market', 'towncenter'];

// 單位。range < 1 視為近戰。
export const UNITS = {
  villager: { name: '農民', icon: '👨‍🌾', cls: 'villager', cost: { food: 50 }, hp: 45, atk: 3, armor: 0, range: 0.5, speed: 4.2, time: 14, cd: 1.5, hotkey: 'V',
    desc: '採集資源、建造與修理建築。' },
  ge: { name: '戈兵', icon: '🪖', cls: 'infantry', cost: { food: 50, wood: 25 }, hp: 70, atk: 8, armor: 1, range: 0.6, speed: 4.0, time: 16, cd: 1.5, age: 1, hotkey: 'Z',
    bonus: { cavalry: 2.0 }, desc: '持戈步兵，克制騎兵與戰車。' },
  sword: { name: '劍士', icon: '🗡️', cls: 'infantry', cost: { food: 60, gold: 25 }, hp: 95, atk: 12, armor: 2, range: 0.6, speed: 4.0, time: 18, cd: 1.4, age: 2, hotkey: 'X',
    desc: '精銳近戰步兵，正面作戰的中堅。' },
  archer: { name: '弓兵', icon: '🏹', cls: 'archer', cost: { wood: 40, gold: 20 }, hp: 40, atk: 6, armor: 0, range: 8, speed: 4.2, time: 16, cd: 2.0, age: 1, hotkey: 'Z',
    desc: '遠程部隊，克制步兵。' },
  crossbow: { name: '弩兵', icon: '🎯', cls: 'archer', cost: { wood: 45, gold: 40 }, hp: 50, atk: 10, armor: 0, range: 9, speed: 4.0, time: 20, cd: 2.2, age: 2, hotkey: 'X',
    desc: '勁弩穿甲，射程更遠。' },
  chariot: { name: '戰車', icon: '🛞', cls: 'cavalry', cost: { wood: 90, food: 60 }, hp: 130, atk: 11, armor: 1, range: 0.9, speed: 6.5, time: 24, cd: 1.6, age: 1, hotkey: 'Z',
    bonus: { archer: 1.5 }, desc: '春秋時代的戰場主力，快速衝擊遠程部隊。' },
  cavalry: { name: '騎兵', icon: '🐎', cls: 'cavalry', cost: { food: 80, gold: 60 }, hp: 140, atk: 13, armor: 2, range: 0.7, speed: 7.5, time: 24, cd: 1.5, age: 2, hotkey: 'X',
    bonus: { archer: 1.5, siege: 2.0 }, desc: '胡服騎射後的新興兵種，機動性極高。' },
  ram: { name: '衝車', icon: '🪵', cls: 'siege', cost: { wood: 170 }, hp: 240, atk: 6, armor: 5, range: 0.9, speed: 3.0, time: 30, cd: 2.5, age: 2, hotkey: 'Z',
    bonus: { building: 10 }, desc: '攻城利器，對建築造成巨大傷害。' },
  catapult: { name: '投石車', icon: '🪨', cls: 'siege', cost: { wood: 200, gold: 120 }, hp: 120, atk: 40, armor: 1, range: 11, speed: 2.6, time: 40, cd: 4.5, age: 3, hotkey: 'X',
    bonus: { building: 3 }, splash: 2.2, desc: '遠距投石，範圍傷害。' },
};

export const TECHS = {
  irontools: { name: '鐵器農具', icon: '⚒️', cost: { wood: 150, food: 100 }, age: 2, time: 35, desc: '農民採集速度 +20%。' },
  shangyang: { name: '商鞅變法', icon: '📕', cost: { food: 200, gold: 150 }, age: 2, time: 40, desc: '農田產量 +30%，農民訓練時間 -30%。' },
  hufu: { name: '胡服騎射', icon: '🏇', cost: { food: 150, gold: 150 }, age: 2, time: 40, desc: '騎兵與戰車攻擊 +3、速度 +15%。' },
  mohist: { name: '墨家守城', icon: '🏰', cost: { wood: 200, stone: 200 }, age: 2, time: 40, desc: '建築耐久 +25%，箭樓與都城射程 +2。' },
  hanbow: { name: '韓國勁弩', icon: '🏹', cost: { wood: 200, gold: 200 }, age: 2, time: 40, desc: '弓兵與弩兵攻擊 +3。' },
  ironweapon: { name: '鐵兵器', icon: '⚔️', cost: { gold: 250, stone: 100 }, age: 3, time: 50, desc: '近戰單位攻擊 +3、護甲 +1。' },
  sunzi: { name: '孫子兵法', icon: '📜', cost: { gold: 300, food: 200 }, age: 3, time: 60, desc: '所有軍事單位攻擊 +15%。' },
};

export const RESOURCE_NODES = {
  tree: { name: '樹木', res: 'wood', amount: 120, radius: 0.9 },
  berry: { name: '漿果叢', res: 'food', amount: 160, radius: 1.0 },
  stone: { name: '石礦', res: 'stone', amount: 400, radius: 1.5 },
  gold: { name: '金礦', res: 'gold', amount: 450, radius: 1.5 },
};

export const GATHER_RATE = { food: 0.55, wood: 0.55, stone: 0.45, gold: 0.45, farm: 0.42 };
export const CARRY_CAP = 10;

export const MARKET = { buyCost: 100, buyAmount: 100, sellAmount: 100, sellGain: 55 };

export const DIFFICULTY = {
  easy: { name: '簡單', gather: 0.8, attackInterval: 240, firstAttack: 360, armyMul: 0.7 },
  normal: { name: '普通', gather: 1.0, attackInterval: 180, firstAttack: 270, armyMul: 1.0 },
  hard: { name: '困難', gather: 1.35, attackInterval: 140, firstAttack: 210, armyMul: 1.4 },
};

export const MAP_SIZES = { small: 160, medium: 200, large: 260 };

export function costText(cost) {
  if (!cost) return '';
  return RES_KEYS.filter(k => cost[k]).map(k => `${RES_ICONS[k]}${cost[k]}`).join(' ');
}
