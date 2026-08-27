const programRoleLabels = new Set([
  "指挥",
  "钢琴",
  "小提琴",
  "中提琴",
  "大提琴",
  "低音提琴",
  "长笛",
  "短笛",
  "双簧管",
  "单簧管",
  "大管",
  "圆号",
  "小号",
  "长号",
  "大号",
  "竖琴",
  "二胡",
  "京胡",
  "京二胡",
  "古筝",
  "琵琶",
  "笛子",
  "箫",
  "唢呐",
  "扬琴",
  "打击乐",
  "大阮",
  "中阮",
  "柳琴",
  "阮",
  "笙",
  "板胡",
  "女高音",
  "女中音",
  "男高音",
  "男中音",
  "男低音",
  "独唱",
  "领唱",
  "合唱",
  "混声合唱",
  "男声合唱",
  "女声合唱",
  "童声合唱",
  "演奏",
  "演唱",
  "独奏",
  "领奏",
  "伴奏",
  "朗诵",
  "导聆",
  "乐队",
  "管弦乐",
  "民族管弦乐",
  "交响乐团",
  "作曲家",
]);

export function isProgramRoleLabel(value: string | undefined) {
  if (!value) return false;
  const normalized = value.normalize("NFKC").replace(/[\p{P}\p{S}\s]/gu, "");
  if (programRoleLabels.has(normalized)) return true;
  if (/^第[一二三四五六七八九十百\d]+乐章$/.test(normalized)) return true;
  const vocalForce = "(?:(?:男|女|童|混|男女)声)?(?:独唱|领唱|合唱|对唱|齐唱|重唱|演唱)";
  return new RegExp(`^${vocalForce}(?:[与及和]${vocalForce})*$`).test(normalized);
}

const performanceForceSuffixPattern = /(?:低音提琴|大提琴|中提琴|小提琴|钢琴|管风琴|双簧管|单簧管|长笛|大管|圆号|小号|长号|竖琴|吉他|二胡|古筝|琵琶|笛子|唢呐|指挥|独奏|独唱|领奏|领唱|演唱|演奏|二重奏|三重奏|四重奏|五重奏|重奏)+$/;

export function stripPerformanceForceSuffix(value: string) {
  return value.replace(performanceForceSuffixPattern, "");
}
