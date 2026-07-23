export type ProgramItem = {
  composer?: string;
  title: string;
  opus?: string;
  movements?: Array<{
    number?: string;
    title: string;
  }>;
  confidence: "title-inferred" | "official" | "ai" | "manual";
};

export type ConcertEvent = {
  id: string;
  title: string;
  city: string;
  venue: string;
  hall?: string;
  startTime: string;
  endTime?: string;
  weekday: string;
  dateLabel: string;
  timeLabel: string;
  price?: string;
  priceTiers?: number[];
  description?: string;
  status: "scheduled" | "cancelled" | "unknown";
  ticketUrl?: string;
  sourceName: string;
  sourceUrl: string;
  scrapedAt: string;
  ensemble?: string;
  conductor?: string;
  performers: string[];
  composers: string[];
  program: ProgramItem[];
  tags: string[];
  dataQuality: "scraped" | "ai-enhanced" | "needs-review";
};

export type ConcertDataset = {
  generatedAt: string | null;
  city: string;
  events: ConcertEvent[];
  sources: Array<{
    id: string;
    name: string;
    url: string;
    ok: boolean;
    eventCount: number;
    message?: string;
  }>;
  stats: {
    rawEvents: number;
    normalizedEvents: number;
    aiEnhancedEvents: number;
    errors: string[];
  };
};
