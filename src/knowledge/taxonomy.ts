import type { KnowledgeGenreFamily, KnowledgePeriodKey, KnowledgeWork } from "./types";

export const knowledgePeriods: Array<{
  key: KnowledgePeriodKey;
  label: string;
  range: string;
  description: string;
}> = [
  { key: "baroque", label: "巴洛克", range: "约 1600–1750", description: "复调、舞曲与清晰的和声方向" },
  { key: "classical", label: "古典主义", range: "约 1750–1820", description: "均衡结构与主题之间的清楚对话" },
  { key: "romantic", label: "浪漫主义", range: "约 1820–1900", description: "扩展的音响、叙事与个人表达" },
  { key: "modern", label: "现代主义", range: "约 1890–1945", description: "重新组织音色、节奏与调性语言" },
  { key: "twentieth", label: "二十世纪", range: "约 1900–2000", description: "多种传统与新语言并行发展" },
  { key: "contemporary", label: "当代", range: "1945 至今", description: "持续变化的写作方式与声音观念" },
  { key: "other", label: "其他时期", range: "", description: "时期信息仍待进一步整理" },
];

export const knowledgeGenreFamilies: Array<{
  key: KnowledgeGenreFamily;
  label: string;
  description: string;
}> = [
  { key: "orchestral", label: "管弦乐", description: "交响曲、交响诗与管弦乐作品" },
  { key: "concerto", label: "协奏曲", description: "独奏者与乐队之间的对话" },
  { key: "chamber", label: "室内乐", description: "重奏、奏鸣曲与小型合奏" },
  { key: "solo", label: "独奏与键盘", description: "钢琴、管风琴与无伴奏作品" },
  { key: "vocal", label: "声乐与合唱", description: "艺术歌曲、合唱与大型声乐作品" },
  { key: "stage", label: "舞台音乐", description: "歌剧、芭蕾与戏剧配乐" },
  { key: "other", label: "其他体裁", description: "尚未归入主要体裁的作品" },
];

export function classifyKnowledgePeriod(period?: string, birthYear?: number): KnowledgePeriodKey {
  const value = (period ?? "").replace(/\s+/g, "").toLocaleLowerCase("zh-CN");
  if (/当代|二十一世纪|21世纪|contemporary/.test(value)) return "contemporary";
  if (/巴洛克|baroque/.test(value)) return "baroque";
  if (/古典.*浪漫.*过渡|classical.*romantic/.test(value)) {
    return birthYear && birthYear >= 1790 ? "romantic" : "classical";
  }
  if (/现代|modern|二十世纪早期|20世纪早期/.test(value)) return "modern";
  if (/二十世纪|20世纪|twentieth/.test(value)) return "twentieth";
  if (/浪漫|romantic/.test(value)) return "romantic";
  if (/古典|classical/.test(value)) return "classical";
  if (birthYear) {
    if (birthYear >= 1945) return "contemporary";
    if (birthYear >= 1880) return "twentieth";
    if (birthYear >= 1790) return "romantic";
    if (birthYear >= 1680) return "classical";
    if (birthYear >= 1550) return "baroque";
  }
  return "other";
}

export function classifyKnowledgeGenre(
  work: Pick<KnowledgeWork, "title" | "genre" | "tags" | "instrumentation">,
): KnowledgeGenreFamily {
  const primary = [work.genre, work.title]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");
  const value = [primary, work.instrumentation, ...work.tags]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("zh-CN");

  if (/歌剧|芭蕾|戏剧配乐|舞剧|opera|ballet|incidental/.test(primary)) return "stage";
  if (/协奏曲|大协奏曲|concerto/.test(primary)) return "concerto";
  if (/四重奏|五重奏|三重奏|六重奏|八重奏|二重奏|室内乐|奏鸣曲|quartet|quintet|trio|sextet|octet|sonata/.test(primary)) return "chamber";
  if (/独奏|无伴奏|键盘|管风琴|托卡塔|练习曲|前奏曲|变奏曲|solo|keyboard|organ|toccata/.test(primary)) return "solo";
  if (/交响曲|交响诗|管弦乐|序曲|狂想曲|舞曲|orchestra|symphony|overture/.test(primary)) return "orchestral";
  if (/声乐|合唱|艺术歌曲|清唱剧|康塔塔|弥撒|安魂曲|歌曲|vocal|choral|oratorio|cantata|mass|requiem|lied/.test(primary)) return "vocal";
  if (/独奏|无伴奏|钢琴|键盘|管风琴|solo|piano|keyboard|organ/.test(value)) return "solo";
  if (/管弦乐|orchestra/.test(value)) return "orchestral";
  return "other";
}

export function periodDefinition(key: KnowledgePeriodKey) {
  return knowledgePeriods.find((item) => item.key === key) ?? knowledgePeriods[knowledgePeriods.length - 1];
}

export function genreFamilyDefinition(key: KnowledgeGenreFamily) {
  return knowledgeGenreFamilies.find((item) => item.key === key) ?? knowledgeGenreFamilies[knowledgeGenreFamilies.length - 1];
}
