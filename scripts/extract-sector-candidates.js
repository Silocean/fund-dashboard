#!/usr/bin/env node
/**
 * 从 fund.eastmoney.com/js/fundcode_search.js 解析全部基金名称，
 * 提取名称中涉及的板块/主题/行业，作为候选板块列表。
 * 用法：node scripts/extract-sector-candidates.js
 */

const fs = require('fs');
const path = require('path');

const jsPath = path.join(__dirname, '..', 'fundcode_search.js');
const raw = fs.readFileSync(jsPath, 'utf8');

// 解析 var r = [...];
const match = raw.match(/var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
if (!match) {
  console.error('无法解析 fundcode_search.js 格式');
  process.exit(1);
}
const list = JSON.parse(match[1]);

const countBySector = new Map();

function add(name) {
  if (!name || name.length < 2 || name.length > 12) return;
  // 只保留以中文为主、或常见英文缩写
  if (!/^[\u4e00-\u9fa5A-Za-z0-9]+$/.test(name)) return;
  const n = (countBySector.get(name) || 0) + 1;
  countBySector.set(name, n);
}

for (const item of list) {
  const name = item[2]; // 基金名称
  if (!name || typeof name !== 'string') continue;

  // 1) 中证XXX指数 / 中证XXXETF / 中证XXX100 等
  const zz = name.match(/中证([\u4e00-\u9fa5A-Za-z]+?)(?:指数|ETF|联接|100|200|300|500|800|1000|等)?(?:[A-Z]|$)/g);
  if (zz) {
    zz.forEach(s => {
      const m = s.match(/中证([\u4e00-\u9fa5A-Za-z]+?)(?:指数|ETF|联接|100|200|300|500|800|1000|等)?/);
      if (m && m[1].length >= 2) add(m[1]);
    });
  }

  // 2) XXX主题
  const theme = name.match(/[\u4e00-\u9fa5A-Za-z]{2,10}主题/g);
  if (theme) theme.forEach(s => add(s.replace(/主题$/, '')));

  // 3) XXX行业
  const industry = name.match(/[\u4e00-\u9fa5A-Za-z]{2,10}行业/g);
  if (industry) industry.forEach(s => add(s.replace(/行业$/, '')));

  // 4) XXX板块（少见但可能有）
  const sector = name.match(/[\u4e00-\u9fa5A-Za-z]{2,10}板块/g);
  if (sector) sector.forEach(s => add(s.replace(/板块$/, '')));

  // 5) 非宽基的 XXXETF、XXX联接（如 黄金ETF、医药ETF、消费ETF）
  const etf = name.match(/(黄金|医药|消费|科技|新能源|金融|军工|地产|白酒|芯片|半导体|5G|银行|证券|保险|有色|煤炭|钢铁|化工|环保|农业|传媒|游戏|电力|电网|光伏|电池|储能|机器人|港股|纳斯达克|标普|恒生|稀土|养殖|畜牧|生物|医疗|创新药|人工智能|AI|大数据|云计算|数字经济|ESG|碳中和|沪港深)(?:ETF|联接)/g);
  if (etf) etf.forEach(s => add(s.replace(/(?:ETF|联接)$/, '')));

  // 6) 跟踪XXX
  const track = name.match(/跟踪([\u4e00-\u9fa5A-Za-z]{2,8})/g);
  if (track) track.forEach(s => { const m = s.match(/跟踪(.+)/); if (m) add(m[1]); });

  // 7) 常见 2～4 字行业/主题词（单独出现或带“精选/龙头/成长”等后缀前的词）
  const keywords = [
    '医药', '医疗', '消费', '科技', '新能源', '金融', '军工', '地产', '黄金', '白酒', '芯片', '半导体',
    '银行', '证券', '保险', '有色', '煤炭', '钢铁', '化工', '环保', '农业', '传媒', '游戏', '电力', '电网',
    '光伏', '电池', '储能', '机器人', '港股', '海外', '债券', '指数', '稀土', '养殖', '畜牧', '生物',
    '创新药', '人工智能', 'AI', '大数据', '云计算', '数字经济', 'ESG', '碳中和', '沪港深', '恒生',
    '纳斯达克', '标普', '卫星', '北斗', '国防', '航空', '航天', '房地产', '家电', '汽车', '旅游', '免税',
    '电子', '通信', '计算机', '互联网', '软件', '建材', '水泥', '纺织', '零售', '食品', '饮料', '中药',
    '医疗器械', '医疗服务', '锂电', '新能车', '电动车', '绿电', '水电', '火电', '输配', '贵金属',
    '工业金属', '高端制造', '自动化', '数控', '影视', '动漫', '手游', '电竞', '种业', '农林牧渔', '生猪', '饲料',
    '煤炭', '钢铁', '化纤', '水泥', '玻璃', '陶瓷', '污水处理', '节能', '物联网', '区块链', '元宇宙',
    '国企', '央企', '红利', '价值', '成长', '质量', '低波', '稳健', '均衡', '宽基', '创业板', '科创',
    '上证', '沪深', '中证', '港股通', '一带一路', '京津冀', '长三角', '粤港澳', '京津冀', '长江经济带',
    '养老', '教育', '体育', '物流', '交运', '建筑', '基建', '铁路', '港口', '航空', '机场',
    '有色金属', '黑色金属', '稀有金属', '工业金属', '煤炭', '石油', '天然气', '油气',
    '电网', '电力', '输配电', '特高压', '智能电网', '核电', '风电'
  ];
  keywords.forEach(kw => {
    if (name.includes(kw)) add(kw);
  });
}

// 合并同义/简写（可选）：医药100→医药、消费升级→消费 等，这里只做简单归一
const normalize = (s) => {
  const map = {
    '医疗': '医药', '生物': '医药', '创新药': '医药', '中药': '医药', '医疗器械': '医药', '医疗服务': '医药',
    '白酒': '消费', '食品': '消费', '饮料': '消费', '家电': '消费', '汽车': '消费', '旅游': '消费', '免税': '消费', '纺织': '消费', '零售': '消费',
    '半导体': '科技', '芯片': '科技', '电子': '科技', '通信': '科技', '计算机': '科技', '互联网': '科技', '软件': '科技', '人工智能': '科技', 'AI': '科技', '数字经济': '科技', '云计算': '科技', '大数据': '科技', '物联网': '科技', '区块链': '科技', '元宇宙': '科技',
    '光伏': '新能源', '电池': '新能源', '锂电': '新能源', '储能': '新能源', '新能车': '新能源', '电动车': '新能源', '碳中和': '新能源', '风电': '新能源', '核电': '新能源',
    '银行': '金融', '证券': '金融', '保险': '金融', '券商': '金融',
    '国防': '军工', '航空': '军工', '航天': '军工', '兵器': '军工',
    '房地产': '地产',
    '贵金属': '黄金',
    '恒生': '港股', '沪港深': '港股', '港股通': '港股',
    '纳斯达克': '海外', '标普': '海外', '美股': '海外', 'QDII': '海外',
    '纯债': '债券', '短债': '债券', '中短债': '债券', '信用债': '债券', '利率债': '债券',
    '沪深': '指数', '上证': '指数', '创业板': '指数', '科创': '指数', '宽基': '指数', '中证': '指数',
    '稀土': '有色金属', '工业金属': '有色金属', '稀有金属': '有色金属', '有色': '有色金属',
    '绿电': '电网', '水电': '电网', '火电': '电网', '输配': '电网', '电力': '电网', '特高压': '电网', '智能电网': '电网', '输配电': '电网',
    '高端制造': '机器人', '自动化': '机器人', '智能机器': '机器人', '工业机器人': '机器人', '数控': '机器人', '智能装备': '机器人',
    '游戏': '传媒', '影视': '传媒', '动漫': '传媒', '手游': '传媒', '电竞': '传媒', '文化传播': '传媒', '娱乐': '传媒',
    '养殖': '农业', '畜牧': '农业', '种业': '农业', '农林牧渔': '农业', '生猪': '农业', '饲料': '农业',
    '煤矿': '煤炭', '黑色金属': '钢铁', '化纤': '化工', '化学': '化工', '水泥': '建材', '玻璃': '建材', '陶瓷': '建材',
    '节能': '环保', '污水处理': '环保',
    '北斗': '卫星', '低轨': '卫星', '星链': '卫星', '卫星互联网': '卫星', '卫星导航': '卫星',
  };
  return map[s] || s;
};

// 去重：同一归一化下的多个词只保留“代表名”（选出现次数最多的或最短的）
const byNormalized = new Map();
countBySector.forEach((count, sector) => {
  const key = normalize(sector);
  if (!byNormalized.has(key)) byNormalized.set(key, []);
  byNormalized.get(key).push({ sector, count });
});

const candidates = [];
byNormalized.forEach((arr, key) => {
  arr.sort((a, b) => b.count - a.count);
  const best = arr[0].sector;
  const total = arr.reduce((s, x) => s + x.count, 0);
  candidates.push({ sector: best, normalized: key, count: total });
});

candidates.sort((a, b) => b.count - a.count);

// 最终候选：取出现次数 >= 2 的（过滤单次噪声），再按可读性排序
const minCount = 2;
const sectorList = candidates
  .filter(c => c.count >= minCount)
  .map(c => c.sector);

// 保证“其他”在最后
const other = '其他';
const hasOther = sectorList.includes(other);
const withoutOther = sectorList.filter(s => s !== other);
const final = hasOther ? [...withoutOther, other] : [...withoutOther, other];

const outPath = path.join(__dirname, '..', 'sector-candidates.json');
fs.writeFileSync(outPath, JSON.stringify({ sectors: final, source: 'fundcode_search.js', count: final.length, minCount }, null, 2), 'utf8');
console.log('已写入', outPath);
console.log('候选板块数:', final.length);
console.log(final.join(', '));
