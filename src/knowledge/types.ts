export type KnowledgePublicationStatus = "draft" | "reviewed" | "published";
export type KnowledgeCompleteness = "basic" | "complete";
export type KnowledgePeriodKey = "baroque" | "classical" | "romantic" | "modern" | "twentieth" | "contemporary" | "other";
export type KnowledgeGenreFamily = "orchestral" | "concerto" | "chamber" | "solo" | "vocal" | "stage" | "other";
export type KnowledgeLibraryView = "explore" | "collections" | "composers" | "works";

export type KnowledgeGeneration = {
  method: "deepseek";
  model: string;
  skillVersion: string;
  promptHash: string;
  generatedAt: string;
  score: number;
  sourceEventIds: string[];
  evidenceIds: string[];
};

export type KnowledgeSource = {
  id: string;
  title: string;
  url: string;
  publisher: string;
  accessedAt: string;
  supports: string[];
};

export type KnowledgeComposer = {
  id: string;
  name: string;
  originalName?: string;
  aliases: string[];
  birthYear?: number;
  deathYear?: number;
  nationality?: string;
  period?: string;
  introduction: string;
  styleSummary?: string;
  completeness?: KnowledgeCompleteness;
  generation?: KnowledgeGeneration;
  status: KnowledgePublicationStatus;
  reviewedAt?: string;
  updatedAt: string;
  sources: KnowledgeSource[];
};

export type KnowledgeListeningPoint = {
  title: string;
  description: string;
  movement?: number;
};

export type KnowledgeMovement = {
  number: number;
  title: string;
  tempo?: string;
  description: string;
};

export type KnowledgeRecording = {
  label: string;
  performers: string;
  year?: number;
  note: string;
  sourceId: string;
};

export type KnowledgeWork = {
  id: string;
  composerId: string;
  title: string;
  originalTitle?: string;
  aliases: string[];
  opus?: string;
  key?: string;
  genre?: string;
  period?: string;
  composedYears?: string;
  durationMinutes?: number;
  instrumentation?: string;
  difficulty?: "第一次听" | "容易进入" | "需要专注" | "适合深入";
  tags: string[];
  summary: string;
  whyListen?: string;
  firstListen?: string;
  listeningPoints: KnowledgeListeningPoint[];
  movements: KnowledgeMovement[];
  recordings: KnowledgeRecording[];
  relatedWorkIds: string[];
  completeness?: KnowledgeCompleteness;
  generation?: KnowledgeGeneration;
  status: KnowledgePublicationStatus;
  reviewedAt?: string;
  updatedAt: string;
  sources: KnowledgeSource[];
};

export type KnowledgeWorkMappingRule = {
  id: string;
  workId: string;
  composers: string[];
  titles: string[];
  opus?: string[];
  method: "reviewed-exact" | "automated-exact";
  reviewedAt: string;
};

export type KnowledgeWorkMappingFile = {
  schemaVersion: 1;
  rules: KnowledgeWorkMappingRule[];
};

export type KnowledgeWorkSummary = Pick<KnowledgeWork,
  "id" | "composerId" | "title" | "originalTitle" | "opus" | "genre" | "durationMinutes" | "difficulty" | "tags" | "summary"
> & {
  composerName: string;
  periodKey: KnowledgePeriodKey;
  genreFamily: KnowledgeGenreFamily;
  upcomingEventIds: string[];
  upcomingEventCount: number;
};

export type KnowledgeComposerSummary = Pick<KnowledgeComposer,
  "id" | "name" | "originalName" | "period" | "birthYear" | "deathYear"
> & {
  periodKey: KnowledgePeriodKey;
  workCount: number;
  upcomingEventCount: number;
};

export type PublishedKnowledgeWork = KnowledgeWork & {
  composer: KnowledgeComposerSummary;
  upcomingEventIds: string[];
  upcomingEventCount: number;
};

export type PublishedKnowledgeComposer = KnowledgeComposer & {
  works: KnowledgeWorkSummary[];
  upcomingEventIds: string[];
  upcomingEventCount: number;
};

export type KnowledgeIndex = {
  schemaVersion: 1;
  generatedAt: string | null;
  works: KnowledgeWorkSummary[];
  composers: KnowledgeComposerSummary[];
};
