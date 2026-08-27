import type { ConcertEvent, ProgramItem } from "../../src/types";
import { extractLines, parseHarbinMaitixProgram, sliceProgramSection } from "./harbin-maitix";

export type PolytProduct = {
  productId: string;
  name: string;
  category: string;
  subCategory: string;
  place: string;
  minPrice?: number;
  maxPrice?: number;
  showTimeText: string;
};

export function parsePolytRecommendList(raw: string): { total: number; products: PolytProduct[] } {
  const parsed = JSON.parse(raw) as {
    code?: string;
    errors?: string[];
    data?: { total?: number; records?: Array<Record<string, any>> };
  };
  if (parsed.code !== "200" || !parsed.data) {
    throw new Error(`保利推荐接口 ${parsed.code ?? "unknown"}：${parsed.errors?.[0] ?? "请求失败"}`);
  }
  const records = Array.isArray(parsed.data.records) ? parsed.data.records : [];
  const products = records
    .map((record) => ({
      productId: String(record.productId ?? record.id ?? ""),
      // 列表名带「[武汉]」城市前缀，展示时去掉。
      name: String(record.productNameShort ?? "").replace(/^\[[^\]]+\]\s*/, "").trim(),
      category: String(record.categoryName ?? ""),
      subCategory: String(record.subCategoryName ?? ""),
      place: String(record.placeCname ?? ""),
      minPrice: Number(record.minPrice) || undefined,
      maxPrice: Number(record.maxPrice) || undefined,
      showTimeText: String(record.productShowTime ?? ""),
    }))
    .filter((product) => product.productId);
  return { total: Number(parsed.data.total ?? products.length), products };
}

export type PolytShow = {
  showId: string;
  happenAt: Date;
  venueName?: string;
  showStatusName?: string;
  priceTiers: number[];
};

export function parsePolytShowList(raw: string): PolytShow[] {
  const parsed = JSON.parse(raw) as {
    code?: string;
    errors?: string[];
    data?: { showInfoDetailList?: Array<Record<string, any>> };
  };
  if (parsed.code !== "200" || !parsed.data) {
    throw new Error(`保利场次接口 ${parsed.code ?? "unknown"}：${parsed.errors?.[0] ?? "请求失败"}`);
  }
  const records = Array.isArray(parsed.data.showInfoDetailList) ? parsed.data.showInfoDetailList : [];
  return records
    .map((show) => ({
      showId: String(show.showId ?? ""),
      happenAt: new Date(Number(show.happenTime)),
      venueName: show.venueName ? String(show.venueName) : undefined,
      showStatusName: show.showStatusName ? String(show.showStatusName) : undefined,
      priceTiers: [...new Set(
        (Array.isArray(show.ticketPriceList) ? show.ticketPriceList : [])
          .map((price) => Number(price.price))
          .filter((price) => Number.isFinite(price) && price > 0),
      )].sort((left, right) => left - right),
    }))
    .filter((show) => show.showId && !Number.isNaN(show.happenAt.getTime()));
}

export function mapPolytTicketStatus(show: Pick<PolytShow, "showStatusName">): ConcertEvent["ticketStatus"] {
  const status = (show.showStatusName ?? "").trim();
  if (/售罄|售完/.test(status)) return "sold-out";
  if (/停售|已结束|下架/.test(status)) return "off-sale";
  if (/未开售|待开售|预售/.test(status)) return "pre-sale";
  if (/售票中|销售中/.test(status)) return "on-sale";
  return undefined;
}

export function extractPolytProgram(detail: { introduces?: unknown }): ProgramItem[] {
  const sections = Array.isArray(detail.introduces) ? (detail.introduces as Array<Record<string, any>>) : [];
  const html = sections
    .map((section) => String(section?.introduceContent ?? section?.content ?? section?.text ?? ""))
    .join("\n");
  if (!html.trim()) return [];
  return parseHarbinMaitixProgram(sliceProgramSection(extractLines(html)));
}
