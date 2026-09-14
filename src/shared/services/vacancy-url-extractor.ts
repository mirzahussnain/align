import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { htmlToReadableText } from "@/shared/services/job-description-html";

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

export type VacancyExtraction = {
  sourceUrl: string;
  finalUrl: string;
  title: string;
  employerName: string;
  locationText: string;
  description: string;
  source: "JOB_POSTING_JSON_LD" | "PAGE_METADATA";
  warnings: string[];
};

export class VacancyExtractionError extends Error {
  constructor(
    readonly code:
      | "INVALID_URL"
      | "UNSAFE_URL"
      | "PAGE_UNAVAILABLE"
      | "PAGE_TOO_LARGE"
      | "UNSUPPORTED_CONTENT"
      | "NO_VACANCY_FOUND",
    message: string,
    readonly status = 422,
  ) {
    super(message);
    this.name = "VacancyExtractionError";
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    const parts = address.split(".").map(Number);
    const [a, b] = parts;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 0) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (version === 6) {
    const compact = address.toLowerCase().split("%")[0];
    return (
      compact === "::" ||
      compact === "::1" ||
      compact.startsWith("fc") ||
      compact.startsWith("fd") ||
      /^fe[89ab]/.test(compact) ||
      compact.startsWith("ff") ||
      compact.startsWith("2001:db8:") ||
      compact.startsWith("::ffff:127.") ||
      compact.startsWith("::ffff:10.") ||
      compact.startsWith("::ffff:192.168.") ||
      /^::ffff:172\.(1[6-9]|2\d|3[01])\./.test(compact)
    );
  }
  return true;
}

function parsePublicHttpsUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VacancyExtractionError("INVALID_URL", "Enter a valid job URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    !url.hostname
  ) {
    throw new VacancyExtractionError(
      "INVALID_URL",
      "Only public HTTPS job URLs can be imported.",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new VacancyExtractionError(
      "UNSAFE_URL",
      "That URL cannot be fetched.",
    );
  }
  return url;
}

async function resolvePublicAddress(hostname: string) {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new VacancyExtractionError(
      "PAGE_UNAVAILABLE",
      "The job page could not be reached. Paste the description instead.",
      502,
    );
  }
  const publicAddresses = addresses.filter(
    (entry) => !isPrivateOrReservedIp(entry.address),
  );
  if (!publicAddresses.length || publicAddresses.length !== addresses.length) {
    throw new VacancyExtractionError(
      "UNSAFE_URL",
      "That URL cannot be fetched.",
    );
  }
  return publicAddresses[0];
}

function fetchHtmlOnce(url: URL): Promise<{
  status: number;
  location?: string;
  contentType: string;
  html: string;
}> {
  return resolvePublicAddress(url.hostname).then(
    (resolved) =>
      new Promise((resolve, reject) => {
        const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
          if (typeof options === "object" && options.all) {
            callback(null, [resolved]);
            return;
          }
          callback(null, resolved.address, resolved.family);
        };
        const request = httpsRequest(
          url,
          {
            method: "GET",
            headers: {
              Accept: "text/html,application/xhtml+xml",
              "Accept-Encoding": "identity",
              "User-Agent": "Align-Vacancy-Importer/1.0",
            },
            lookup: pinnedLookup,
          },
          (response) => {
            const status = response.statusCode ?? 502;
            const location =
              typeof response.headers.location === "string"
                ? response.headers.location
                : undefined;
            const contentType = String(
              response.headers["content-type"] ?? "",
            ).toLowerCase();
            const declaredLength = Number(
              response.headers["content-length"] ?? 0,
            );
            if (declaredLength > MAX_HTML_BYTES) {
              response.destroy();
              reject(
                new VacancyExtractionError(
                  "PAGE_TOO_LARGE",
                  "That page is too large to import safely. Paste the description instead.",
                ),
              );
              return;
            }

            const chunks: Buffer[] = [];
            let received = 0;
            let failed = false;
            response.on("data", (chunk: Buffer) => {
              received += chunk.length;
              if (received > MAX_HTML_BYTES) {
                failed = true;
                response.destroy();
                reject(
                  new VacancyExtractionError(
                    "PAGE_TOO_LARGE",
                    "That page is too large to import safely. Paste the description instead.",
                  ),
                );
                return;
              }
              chunks.push(chunk);
            });
            response.on("end", () => {
              if (failed) return;
              resolve({
                status,
                location,
                contentType,
                html: Buffer.concat(chunks).toString("utf8"),
              });
            });
          },
        );
        request.setTimeout(REQUEST_TIMEOUT_MS, () => {
          request.destroy(
            new VacancyExtractionError(
              "PAGE_UNAVAILABLE",
              "The job page took too long to respond. Paste the description instead.",
              504,
            ),
          );
        });
        request.on("error", (error) => {
          reject(
            error instanceof VacancyExtractionError
              ? error
              : new VacancyExtractionError(
                  "PAGE_UNAVAILABLE",
                  "The job page could not be read. Paste the description instead.",
                  502,
                ),
          );
        });
        request.end();
      }),
  );
}

async function fetchVacancyHtml(sourceUrl: string) {
  let current = parsePublicHttpsUrl(sourceUrl);
  for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
    const response = await fetchHtmlOnce(current);
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirect === MAX_REDIRECTS) {
        throw new VacancyExtractionError(
          "PAGE_UNAVAILABLE",
          "The job page redirected too many times. Paste the description instead.",
          502,
        );
      }
      current = parsePublicHttpsUrl(
        new URL(response.location, current).toString(),
      );
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new VacancyExtractionError(
        "PAGE_UNAVAILABLE",
        "The job site did not allow this page to be imported. Paste the description instead.",
        502,
      );
    }
    if (
      !response.contentType.includes("text/html") &&
      !response.contentType.includes("application/xhtml+xml")
    ) {
      throw new VacancyExtractionError(
        "UNSUPPORTED_CONTENT",
        "That URL is not an HTML job page. Paste the description instead.",
      );
    }
    return { html: response.html, finalUrl: current.toString() };
  }
  throw new VacancyExtractionError(
    "PAGE_UNAVAILABLE",
    "The job page could not be imported.",
    502,
  );
}

function valuesOfType(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(valuesOfType);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  return [
    record,
    ...valuesOfType(record["@graph"]),
    ...valuesOfType(record.mainEntity),
  ];
}

function isJobPosting(value: Record<string, unknown>) {
  const type = value["@type"];
  return Array.isArray(type)
    ? type.some((item) => item === "JobPosting")
    : type === "JobPosting";
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function organisationName(value: unknown): string {
  if (!value || typeof value !== "object") return "";
  return text((value as Record<string, unknown>).name);
}

function locationLabel(value: unknown): string {
  const first = Array.isArray(value) ? value[0] : value;
  if (!first || typeof first !== "object") return "";
  const location = first as Record<string, unknown>;
  const address =
    location.address && typeof location.address === "object"
      ? (location.address as Record<string, unknown>)
      : location;
  return [
    text(address.addressLocality),
    text(address.addressRegion),
    text(address.addressCountry),
  ]
    .filter(Boolean)
    .join(", ");
}

function metaContent(html: string, key: string): string {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta\\b[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta\\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];
  return htmlToReadableText(patterns.map((pattern) => html.match(pattern)?.[1]).find(Boolean));
}

function titleContent(html: string): string {
  return htmlToReadableText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]);
}

function mainContent(html: string): string {
  const article =
    html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    "";
  return htmlToReadableText(article);
}

/** Pure HTML parser, exported so provider-shaped pages can be tested offline. */
export function extractVacancyFromHtml(
  html: string,
  sourceUrl: string,
  finalUrl = sourceUrl,
): VacancyExtraction {
  const scripts = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json(?:;\s*charset=[^"']+)?["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script[1].trim()) as unknown;
      const posting = valuesOfType(parsed).find(isJobPosting);
      if (!posting) continue;
      const description = htmlToReadableText(text(posting.description));
      const title = text(posting.title) || text(posting.name);
      const employerName = organisationName(posting.hiringOrganization);
      const locationText =
        locationLabel(posting.jobLocation) ||
        text(
          (
            posting.jobLocationType &&
            String(posting.jobLocationType).includes("TELECOMMUTE")
          )
            ? "Remote"
            : "",
        );
      if (title || description) {
        const warnings: string[] = [];
        if (!title) warnings.push("The page did not expose a job title.");
        if (!employerName)
          warnings.push("The page did not expose the hiring organisation.");
        if (description.length < 400)
          warnings.push(
            "The extracted description looks incomplete; paste the full advert before analysing.",
          );
        return {
          sourceUrl,
          finalUrl,
          title,
          employerName,
          locationText,
          description,
          source: "JOB_POSTING_JSON_LD",
          warnings,
        };
      }
    } catch {
      // One malformed JSON-LD block must not hide a later valid JobPosting block.
    }
  }

  const title =
    metaContent(html, "og:title") ||
    metaContent(html, "twitter:title") ||
    titleContent(html);
  const employerName = metaContent(html, "og:site_name");
  const description =
    mainContent(html) ||
    metaContent(html, "description") ||
    metaContent(html, "og:description");
  if (!title && description.length < 100) {
    throw new VacancyExtractionError(
      "NO_VACANCY_FOUND",
      "No readable vacancy was found on that page. Paste the full description instead.",
    );
  }
  return {
    sourceUrl,
    finalUrl,
    title,
    employerName,
    locationText: "",
    description,
    source: "PAGE_METADATA",
    warnings: [
      "This site did not expose structured JobPosting data; review every imported field.",
      ...(description.length < 400
        ? [
            "The extracted description looks incomplete; paste the full advert before analysing.",
          ]
        : []),
    ],
  };
}

export async function extractVacancyFromUrl(
  sourceUrl: string,
): Promise<VacancyExtraction> {
  const { html, finalUrl } = await fetchVacancyHtml(sourceUrl);
  return extractVacancyFromHtml(html, sourceUrl, finalUrl);
}
