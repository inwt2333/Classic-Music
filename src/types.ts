export type ProgramCredit = {
  name: string;
  role: string;
};

export type ProgramItem = {
  id?: string;
  workId?: string;
  composer?: string;
  title: string;
  alternateTitles?: string[];
  opus?: string;
  credits?: ProgramCredit[];
  movements?: Array<{
    number?: string;
    title: string;
    alternateTitles?: string[];
  }>;
  confidence: "title-inferred" | "official" | "ocr" | "ai" | "manual";
};

export type EventSourceReference = {
  sourceId: string;
  sourceName: string;
  sourceRecordId: string;
  sourceUrl: string;
  ticketUrl?: string;
  scrapedAt: string;
};

export type EventExtraction = {
  method: "ocr" | "ai";
  provider?: string;
  confidence?: number;
  imageCount?: number;
  accepted?: boolean;
  reasons?: string[];
  reviewRequired: boolean;
};

export type EventReview = {
  status: "approved" | "rejected";
  reviewedAt: string;
  note?: string;
};

export type ConcertEvent = {
  id: string;
  projectId?: string;
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
  sources?: EventSourceReference[];
  ensemble?: string;
  conductor?: string;
  performers: string[];
  composers: string[];
  program: ProgramItem[];
  tags: string[];
  dataQuality:
    | "scraped"
    | "manual-reviewed"
    | "ocr-assisted"
    | "ai-enhanced"
    | "needs-review";
  extraction?: EventExtraction;
  review?: EventReview;
};

export type ConcertEventSummary = {
  id: string;
  projectId?: string;
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
  status: ConcertEvent["status"];
  ensemble?: string;
  mainPerson?: string;
  genres: string[];
  dataQuality: ConcertEvent["dataQuality"];
  detailPath: string;
  hasProgram: boolean;
  programPreview: Array<Pick<ProgramItem, "workId" | "composer" | "title" | "alternateTitles" | "opus" | "credits">>;
  searchText: string;
  sourceCount: number;
};

export type EntityRecord = {
  id: string;
  type: "person" | "work";
  name: string;
  subtitle?: string;
  aliases: string[];
  eventIds: string[];
  upcomingEventCount: number;
};

export type DatasetChange = {
  id: string;
  eventId: string;
  type: "added" | "removed" | "rescheduled" | "cancelled" | "lineup" | "program" | "price";
  detectedAt: string;
  summary: string;
};

export type ConcertDataset = {
  schemaVersion?: number;
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

export type ConcertIndexDataset = Omit<ConcertDataset, "events"> & {
  schemaVersion: 2;
  events: ConcertEventSummary[];
};

export type ManualReviewDecision = {
  eventId: string;
  sourceRecordIds: string[];
  status: EventReview["status"];
  program: ProgramItem[];
  note?: string;
  reviewedAt: string;
};

export type ReviewQueueItem = {
  event: ConcertEvent;
  reason: string;
  sourceRecordIds: string[];
  ocr?: {
    projectId: string;
    rawText: string;
    reasons: string[];
    images: string[];
    confidence: number;
    accepted: boolean;
    program: ProgramItem[];
  };
};

export type EntityDataset = {
  generatedAt: string;
  entities: EntityRecord[];
};

export type ChangeDataset = {
  generatedAt: string;
  changes: DatasetChange[];
};
