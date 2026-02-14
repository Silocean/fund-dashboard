#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从 fund.eastmoney.com/js/fundcode_search.js 解析全部基金名称，
提取名称中涉及的板块/主题/行业，作为候选板块列表。
用法：python3 scripts/extract_sector_candidates.py
"""

import re
import json
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent
JS_PATH = BASE / "fundcode_search.js"
OUT_PATH = BASE / "sector-candidates.json"

raw = JS_PATH.read_text(encoding="utf-8")
m = re.search(r"var\s+r\s*=\s*(\[[\s\S]*\])\s*;?\s*$", raw)
if not m:
    raise SystemExit("无法解析 fundcode_search.js 格式")
list_data = json.loads(m.group(1))

count_by_sector = defaultdict(int)

def add(name):
    if not name or len(name) < 2 or len(name) > 12:
        return
    if not re.match(r"^[\u4e00-\u9fa5A-Za-z0-9]+$", name):
        return
    count_by_sector[name] += 1

keywords_extra = [
    "医药", "医疗", "消费", "科技", "新能源", "金融", "军工", "地产", "黄金", "白酒", "芯片", "半导体",
    "银行", "证券", "保险", "有色", "煤炭", "钢铁", "化工", "环保", "农业", "传媒", "游戏", "电力", "电网",
    "光伏", "电池", "储能", "机器人", "港股", "海外", "债券", "指数", "稀土", "养殖", "畜牧", "生物",
    "创新药", "人工智能", "AI", "大数据", "云计算", "数字经济", "ESG", "碳中和", "沪港深", "恒生",
    "纳斯达克", "标普", "卫星", "北斗", "国防", "航空", "航天", "房地产", "家电", "汽车", "旅游", "免税",
    "电子", "通信", "计算机", "互联网", "软件", "建材", "水泥", "纺织", "零售", "食品", "饮料", "中药",
    "医疗器械", "医疗服务", "锂电", "新能车", "电动车", "绿电", "水电", "火电", "输配", "贵金属",
    "工业金属", "高端制造", "自动化", "数控", "影视", "动漫", "手游", "电竞", "种业", "农林牧渔", "生猪", "饲料",
    "化纤", "玻璃", "陶瓷", "污水处理", "节能", "物联网", "区块链", "元宇宙",
    "国企", "央企", "红利", "一带一路", "京津冀", "长三角", "粤港澳", "养老", "教育", "体育", "物流", "交运", "建筑", "基建", "铁路", "港口", "机场",
    "有色金属", "黑色金属", "稀有金属", "石油", "天然气", "油气", "特高压", "智能电网", "核电", "风电",
]

for item in list_data:
    name = item[2] if len(item) > 2 else ""
    if not name or not isinstance(name, str):
        continue

    # 1) 中证XXX指数/ETF/联接/100 等
    for m in re.finditer(r"中证([\u4e00-\u9fa5A-Za-z]+?)(?:指数|ETF|联接|100|200|300|500|800|1000|等)?(?:[A-Z]|$)", name):
        s = m.group(1)
        if len(s) >= 2:
            add(s)

    # 2) XXX主题
    for m in re.finditer(r"([\u4e00-\u9fa5A-Za-z]{2,10})主题", name):
        add(m.group(1))

    # 3) XXX行业
    for m in re.finditer(r"([\u4e00-\u9fa5A-Za-z]{2,10})行业", name):
        add(m.group(1))

    # 4) XXX板块
    for m in re.finditer(r"([\u4e00-\u9fa5A-Za-z]{2,10})板块", name):
        add(m.group(1))

    # 5) XXXETF / XXX联接
    for m in re.finditer(r"(黄金|医药|消费|科技|新能源|金融|军工|地产|白酒|芯片|半导体|5G|银行|证券|保险|有色|煤炭|钢铁|化工|环保|农业|传媒|游戏|电力|电网|光伏|电池|储能|机器人|港股|纳斯达克|标普|恒生|稀土|养殖|畜牧|生物|医疗|创新药|人工智能|AI|大数据|云计算|数字经济|ESG|碳中和|沪港深)(?:ETF|联接)", name):
        add(m.group(1))

    # 6) 跟踪XXX
    for m in re.finditer(r"跟踪([\u4e00-\u9fa5A-Za-z]{2,8})", name):
        add(m.group(1))

    # 7) 关键词出现即计
    for kw in keywords_extra:
        if kw in name:
            add(kw)

# 归一化：同义合并，选代表名（出现次数最多的）
NORMALIZE = {
    "医疗": "医药", "生物": "医药", "创新药": "医药", "中药": "医药", "医疗器械": "医药", "医疗服务": "医药",
    "白酒": "消费", "食品": "消费", "饮料": "消费", "家电": "消费", "汽车": "消费", "旅游": "消费", "免税": "消费", "纺织": "消费", "零售": "消费",
    "半导体": "科技", "芯片": "科技", "电子": "科技", "通信": "科技", "计算机": "科技", "互联网": "科技", "软件": "科技", "人工智能": "科技", "AI": "科技", "数字经济": "科技", "云计算": "科技", "大数据": "科技", "物联网": "科技", "区块链": "科技", "元宇宙": "科技",
    "光伏": "新能源", "电池": "新能源", "锂电": "新能源", "储能": "新能源", "新能车": "新能源", "电动车": "新能源", "碳中和": "新能源", "风电": "新能源", "核电": "新能源",
    "银行": "金融", "证券": "金融", "保险": "金融", "券商": "金融",
    "国防": "军工", "航空": "军工", "航天": "军工", "兵器": "军工",
    "房地产": "地产",
    "贵金属": "黄金",
    "恒生": "港股", "沪港深": "港股", "港股通": "港股",
    "纳斯达克": "海外", "标普": "海外", "美股": "海外", "QDII": "海外",
    "纯债": "债券", "短债": "债券", "中短债": "债券", "信用债": "债券", "利率债": "债券",
    "沪深": "指数", "上证": "指数", "创业板": "指数", "科创": "指数", "宽基": "指数", "中证": "指数",
    "稀土": "有色金属", "工业金属": "有色金属", "稀有金属": "有色金属", "有色": "有色金属",
    "绿电": "电网", "水电": "电网", "火电": "电网", "输配": "电网", "电力": "电网", "特高压": "电网", "智能电网": "电网", "输配电": "电网",
    "高端制造": "机器人", "自动化": "机器人", "智能机器": "机器人", "工业机器人": "机器人", "数控": "机器人", "智能装备": "机器人",
    "游戏": "传媒", "影视": "传媒", "动漫": "传媒", "手游": "传媒", "电竞": "传媒", "文化传播": "传媒", "娱乐": "传媒",
    "养殖": "农业", "畜牧": "农业", "种业": "农业", "农林牧渔": "农业", "生猪": "农业", "饲料": "农业",
    "煤矿": "煤炭", "黑色金属": "钢铁", "化纤": "化工", "化学": "化工", "水泥": "建材", "玻璃": "建材", "陶瓷": "建材",
    "节能": "环保", "污水处理": "环保",
    "北斗": "卫星", "低轨": "卫星", "星链": "卫星", "卫星互联网": "卫星", "卫星导航": "卫星",
}

by_normalized = defaultdict(list)
for sector, count in count_by_sector.items():
    key = NORMALIZE.get(sector, sector)
    by_normalized[key].append((sector, count))

candidates = []
for key, arr in by_normalized.items():
    arr.sort(key=lambda x: -x[1])
    best = arr[0][0]
    total = sum(c for _, c in arr)
    candidates.append({"sector": best, "normalized": key, "count": total})

candidates.sort(key=lambda x: -x["count"])

# 基金公司名等非板块词，不进入精简候选
EXCLUDE = {
    "华夏", "南方", "易方达", "广发", "博时", "嘉实", "招商", "工银", "富国", "汇添富", "华安", "国泰", "鹏华",
    "天弘", "中欧", "诺安", "银河", "平安", "华泰柏瑞", "大成", "交银", "建信", "国联安", "融通", "长城", "新华",
    "兴业", "万家", "申万菱信", "摩根", "金鹰", "东吴", "泰信", "浙商", "国联", "永赢", "创金合信", "前海开源",
    "东方", "中信", "华商", "光大", "民生加银", "中海", "国投瑞银", "财通", "西部利得", "红塔红土", "格林",
    "贝莱德", "山证", "信澳", "华润元大", "中邮", "人保", "太平", "鑫元", "渤海汇金", "同泰", "瑞达", "合煦智远",
    "长信", "长安", "宏利", "农银", "国投", "华宝", "景顺", "上投摩根", "兴全", "银华", "中银", "华泰", "安信",
    "华夏中证", "南方中证", "易方达中证", "鹏华中证", "平安中证", "天弘中证", "嘉实中证", "招商中证",
    "富国中证", "华安中证", "万家中证", "大成中证", "博时中证", "工银中证", "永赢中证", "银河中证", "中欧中证",
    "A股", "G通信", "夏中证", "泰中证", "方中证", "实中证", "家中证", "商中证", "通中证", "安中证",
    "汇安", "价值", "易方达黄金", "易方达全球医药", "汇添富中证电池", "国有企业红利", "中央企业红利",
}

min_count = 2
sector_list = [c["sector"] for c in candidates if c["count"] >= min_count]
if "其他" not in sector_list:
    sector_list.append("其他")
else:
    sector_list = [s for s in sector_list if s != "其他"] + ["其他"]

# 精简候选：出现次数>=min_count、非公司名、排除“全指/发起/国新央企”等非板块长名、取前 100
def ok_curated(s):
    if s in EXCLUDE or s == "其他":
        return False
    if any(len(ex) >= 2 and s.startswith(ex) for ex in EXCLUDE):
        return False
    if "发起" in s or "全指" in s or "国新央企" in s or "指数增强" in s:
        return False
    if len(s) > 8 and s not in (
        "新能源汽车", "云计算与大数据", "人工智能主题", "上海环交所碳中和",
        "云计算与大数据主题", "信息技术应用创新产业", "港股通高股息投资",
    ):
        return False
    return True

curated = []
for c in candidates:
    if c["count"] < min_count:
        continue
    if not ok_curated(c["sector"]):
        continue
    curated.append(c["sector"])
    if len(curated) >= 100:
        break
if "其他" not in curated:
    curated.append("其他")

out = {
    "sectors": sector_list,
    "sectorsCurated": curated,
    "source": "fundcode_search.js",
    "count": len(sector_list),
    "curatedCount": len(curated),
    "minCount": min_count,
    "detail": candidates[:80],
}
OUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print("已写入", OUT_PATH)
print("全量候选板块数:", len(sector_list))
print("精简候选板块数:", len(curated))
print("精简候选:", ", ".join(curated))
