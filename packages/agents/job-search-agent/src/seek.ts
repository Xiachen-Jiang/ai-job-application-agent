import {
  type JobInput,
  detectWorkType,
} from "@job-agent/shared";

const SEEK_SEARCH_API = "https://www.seek.com.au/api/jobsearch/v5/search";
const SEEK_JOB_BASE = "https://www.seek.com.au/job";

/** Seek `where` values that return good coverage per state */
export const SEEK_STATE_WHERE: Record<string, string> = {
  VIC: "Melbourne VIC",
  WA: "Perth WA",
  SA: "Adelaide SA",
  NSW: "Sydney NSW",
  QLD: "Brisbane QLD",
  ACT: "Canberra ACT",
  TAS: "Hobart TAS",
  NT: "Darwin NT",
};

export interface SeekSearchOptions {
  query: string;
  states: string[];
  maxAgeDays: number;
  limit: number;
  rateLimitMs: number;
}

interface SeekListing {
  id: string;
  title: string;
  companyName?: string;
  teaser?: string;
  bulletPoints?: string[];
  salaryLabel?: string;
  listingDate?: string;
  listingDateDisplay?: string;
  locations?: { label: string; seoHierarchy?: { contextualName: string }[] }[];
  workTypes?: string[];
  workArrangements?: { displayText?: string; data?: { label?: { text?: string } }[] };
  classifications?: { classification?: { description?: string }; subclassification?: { description?: string } }[];
}

interface SeekSearchResponse {
  data?: SeekListing[];
  totalCount?: number;
}

export function locationMatchesState(locationLabel: string, state: string): boolean {
  const label = locationLabel.toUpperCase();
  const code = state.toUpperCase();

  if (code === "VIC") {
    return label.includes(" VIC") || label.endsWith("VIC") || label.includes("VICTORIA");
  }
  if (code === "WA") {
    return label.includes(" WA") || label.includes("WESTERN AUSTRALIA");
  }
  if (code === "SA") {
    return label.includes(" SA") || label.includes("SOUTH AUSTRALIA");
  }
  return label.includes(` ${code}`) || label.endsWith(code);
}

function isWithinMaxAge(listingDate: string | undefined, maxAgeDays: number): boolean {
  if (!listingDate) return true;
  const posted = new Date(listingDate);
  if (Number.isNaN(posted.getTime())) return true;
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
  return posted.getTime() >= cutoff;
}

function mapWorkType(listing: SeekListing): JobInput["workType"] {
  const arrangement =
    listing.workArrangements?.displayText ??
    listing.workArrangements?.data?.map((d) => d.label?.text).join(" ") ??
    "";
  return detectWorkType(`${arrangement} ${listing.teaser ?? ""}`);
}

function buildDescription(listing: SeekListing): string {
  const parts: string[] = [];
  if (listing.teaser) parts.push(listing.teaser);
  if (listing.bulletPoints?.length) {
    parts.push("\nKey points:");
    parts.push(...listing.bulletPoints.map((b) => `• ${b}`));
  }
  if (listing.classifications?.length) {
    const cls = listing.classifications
      .map((c) => `${c.classification?.description ?? ""} / ${c.subclassification?.description ?? ""}`)
      .join("; ");
    parts.push(`\nClassification: ${cls}`);
  }
  if (listing.workTypes?.length) {
    parts.push(`Work type: ${listing.workTypes.join(", ")}`);
  }
  return parts.join("\n").slice(0, 15000);
}

function listingToJob(listing: SeekListing, state: string): JobInput {
  const location = listing.locations?.[0]?.label ?? state;
  return {
    source: "SEEK",
    externalId: String(listing.id),
    title: listing.title,
    company: listing.companyName ?? "Unknown",
    salaryRaw: listing.salaryLabel || undefined,
    location,
    workType: mapWorkType(listing),
    description: buildDescription(listing),
    applyUrl: `${SEEK_JOB_BASE}/${listing.id}`,
  };
}

async function fetchSeekPage(
  query: string,
  where: string,
  maxAgeDays: number,
  page: number,
  pageSize: number
): Promise<SeekListing[]> {
  const params = new URLSearchParams({
    keywords: query,
    where,
    daterange: String(maxAgeDays),
    page: String(page),
    pageSize: String(pageSize),
  });

  const res = await fetch(`${SEEK_SEARCH_API}?${params.toString()}`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
      Referer: "https://www.seek.com.au/",
    },
  });

  if (!res.ok) {
    throw new Error(`Seek API HTTP ${res.status} for where=${where} page=${page}`);
  }

  const body = (await res.json()) as SeekSearchResponse;
  return body.data ?? [];
}

async function scrapeSeekState(
  query: string,
  state: string,
  options: SeekSearchOptions
): Promise<JobInput[]> {
  const where = SEEK_STATE_WHERE[state] ?? state;
  const perStateLimit = Math.max(5, Math.ceil(options.limit / options.states.length));
  const jobs: JobInput[] = [];
  const seen = new Set<string>();
  let page = 1;
  const pageSize = 22;

  while (jobs.length < perStateLimit && page <= 5) {
    const listings = await fetchSeekPage(query, where, options.maxAgeDays, page, pageSize);
    if (listings.length === 0) break;

    for (const listing of listings) {
      if (seen.has(listing.id)) continue;
      const location = listing.locations?.[0]?.label ?? "";
      if (!locationMatchesState(location, state)) continue;
      if (!isWithinMaxAge(listing.listingDate, options.maxAgeDays)) continue;

      seen.add(listing.id);
      jobs.push(listingToJob(listing, state));
      if (jobs.length >= perStateLimit) break;
    }

    page += 1;
    if (page <= 5 && jobs.length < perStateLimit) {
      await new Promise((r) => setTimeout(r, options.rateLimitMs));
    }
  }

  return jobs;
}

export async function scrapeSeekJobs(options: SeekSearchOptions): Promise<JobInput[]> {
  const all = new Map<string, JobInput>();

  for (const state of options.states) {
    const stateJobs = await scrapeSeekState(options.query, state, options);
    for (const job of stateJobs) {
      all.set(job.externalId ?? job.title, job);
    }
    if (options.states.indexOf(state) < options.states.length - 1) {
      await new Promise((r) => setTimeout(r, options.rateLimitMs));
    }
  }

  return [...all.values()].slice(0, options.limit);
}
