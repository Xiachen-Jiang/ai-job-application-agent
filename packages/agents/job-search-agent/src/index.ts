import * as cheerio from "cheerio";
import {
  type AgentDefinition,
  type JobInput,
  type JobSearchInput,
  jobInputSchema,
  jobSearchInputSchema,
  detectWorkType,
} from "@job-agent/shared";
import { z } from "zod";
import { scrapeSeekJobs } from "./seek";

const outputSchema = z.object({
  jobs: z.array(jobInputSchema),
  source: z.string(),
  filters: z
    .object({
      states: z.array(z.string()),
      maxAgeDays: z.number(),
      query: z.string(),
    })
    .optional(),
});

export type JobSearchOutput = z.infer<typeof outputSchema>;

async function fetchWithRetry(url: string, retries = 3): Promise<string> {
  let lastError: unknown;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function scrapeApsJobs(query: string, limit: number): Promise<JobInput[]> {
  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://www.apsjobs.gov.au/s/search-jobs?f-keyword=${encodedQuery}`;
  const html = await fetchWithRetry(searchUrl);
  const $ = cheerio.load(html);
  const jobs: JobInput[] = [];

  $("a[href*='/job/']").each((_, el) => {
    if (jobs.length >= limit) return false;
    const href = $(el).attr("href");
    const title = $(el).text().trim();
    if (!href || !title || title.length < 3) return;

    const fullUrl = href.startsWith("http") ? href : `https://www.apsjobs.gov.au${href}`;
    const externalId = href.split("/").filter(Boolean).pop() ?? href;

    jobs.push({
      source: "APS_JOBS",
      externalId,
      title,
      company: "Australian Public Service",
      description: title,
      applyUrl: fullUrl,
      location: "Australia",
      workType: "UNKNOWN",
    });
  });

  const unique = new Map<string, JobInput>();
  for (const job of jobs) {
    unique.set(job.externalId ?? job.title, job);
  }

  const results = [...unique.values()].slice(0, limit);

  for (const job of results) {
    if (!job.applyUrl) continue;
    try {
      await new Promise((r) => setTimeout(r, Number(process.env.SCRAPER_RATE_LIMIT_MS ?? 2000)));
      const detailHtml = await fetchWithRetry(job.applyUrl);
      const detail = cheerio.load(detailHtml);
      const description =
        detail(".job-description, .slds-rich-text-editor__output, article, main")
          .first()
          .text()
          .trim() || job.description;
      const location =
        detail("[class*='location'], [class*='Location']")
          .first()
          .text()
          .trim() || job.location;
      const salary = detail("[class*='salary'], [class*='Salary']").first().text().trim();

      job.description = description.slice(0, 15000);
      job.location = location || "Australia";
      job.salaryRaw = salary || undefined;
      job.workType = detectWorkType(description + " " + location);
    } catch {
      // keep partial data
    }
  }

  return results;
}

export const jobSearchAgent: AgentDefinition<JobSearchInput, JobSearchOutput> = {
  name: "job-search-agent",
  inputSchema: jobSearchInputSchema,
  outputSchema,
  retry: { maxAttempts: 2, backoffMs: 1500 },
  async execute(input, ctx) {
    const source = input.source ?? process.env.JOB_SEARCH_SOURCE ?? "seek";
    ctx.logger.info("Searching jobs", {
      query: input.query,
      source,
      states: input.states,
      maxAgeDays: input.maxAgeDays,
    });

    let jobs: JobInput[] = [];

    try {
      if (source === "seek") {
        jobs = await scrapeSeekJobs({
          query: input.query,
          states: input.states,
          maxAgeDays: input.maxAgeDays,
          limit: input.limit,
          rateLimitMs: Number(process.env.SCRAPER_RATE_LIMIT_MS ?? 1500),
        });
      } else if (source === "aps_jobs") {
        jobs = await scrapeApsJobs(input.query, input.limit);
      }
    } catch (error) {
      ctx.logger.error("Scrape failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return {
      jobs,
      source,
      filters: {
        states: input.states,
        maxAgeDays: input.maxAgeDays,
        query: input.query,
      },
    };
  },
};

export { jobSearchInputSchema, outputSchema as jobSearchOutputSchema, scrapeSeekJobs };
