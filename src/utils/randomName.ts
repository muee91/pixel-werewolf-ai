// 随机起名:狼人杀村庄风格的中文昵称,全部 ≤5 字(兼容联机昵称长度限制)。
const PREFIXES = ['村口', '月下', '篝火', '夜雾', '麦田', '钟楼', '老橡', '酒馆', '石桥', '雾谷', '打更', '井边', '晒谷', '猎户', '教堂'];
const SUFFIXES = ['老王', '猎人', '阿狼', '村民', '守夜', '骑士', '医师', '学者', '游侠', '诗人', '小满', '铁匠', '面包师', '占星家', '说书人'];
const FULL_NAMES = ['午夜屠夫', '白狼骑士', '雾镇旅人', '月蚀先知', '沉默寡言', '吃瓜村民', '熬夜冠军', '推理狂魔', '划水大师', '带刀侍卫'];

export const randomVillagerName = (avoid?: string): string => {
  for (let attempt = 0; attempt < 8; attempt++) {
    const name = Math.random() < 0.35
      ? FULL_NAMES[Math.floor(Math.random() * FULL_NAMES.length)]
      : `${PREFIXES[Math.floor(Math.random() * PREFIXES.length)]}${SUFFIXES[Math.floor(Math.random() * SUFFIXES.length)]}`;
    if (name !== avoid) return name;
  }
  return FULL_NAMES[Math.floor(Math.random() * FULL_NAMES.length)];
};
