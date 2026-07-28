const { createHash } = require('node:crypto');

const {
  NCTB_CATALOGS,
} = require('./registry');
const {
  NCTB_BOOTSTRAP_CATALOGS,
  NCTB_BOOTSTRAP_METADATA,
} = require('./nctb-bootstrap');

const ALLOWED_DOWNLOAD_HOSTS = new Set([
  'drive.egovcloud.gov.bd',
  'drive.google.com',
  'drive.usercontent.google.com',
  'nctb.gov.bd',
]);

class CatalogError extends Error {
  constructor(
    message,
    code,
    status = 502,
    details = {}
  ) {
    super(message);
    this.name = 'CatalogError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function normalizedText(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripHtml(value) {
  return normalizedText(
    decodeHtml(
      String(value || '')
        .replace(
          /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
          ' '
        )
        .replace(/<[^>]+>/g, ' ')
    )
  );
}

function elementContents(html, tagName) {
  const pattern = new RegExp(
    `<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`,
    'gi'
  );

  return [...String(html || '').matchAll(pattern)].map(
    (match) => match[1]
  );
}

function inferSubject(title) {
  const value = normalizedText(title).toLowerCase();
  const mappings = [
    [/math|গণিত/, 'Mathematics'],
    [/science|বিজ্ঞান/, 'Science'],
    [/english/, 'English'],
    [/বাংলা|bangla/, 'Bangla'],
    [/physics|পদার্থ/, 'Physics'],
    [/chemistry|রসায়ন|রসায়ন/, 'Chemistry'],
    [/biology|জীববিজ্ঞান/, 'Biology'],
    [/history|ইতিহাস/, 'History'],
    [/geography|ভূগোল/, 'Geography'],
    [/বাংলাদেশ.*বিশ্ব|bangladesh.*global/, 'Bangladesh and Global Studies'],
    [/ict|information.*communication|তথ্য.*যোগাযোগ/, 'Information and Communication Technology'],
    [/agriculture|কৃষি/, 'Agriculture Studies'],
    [/home science|গার্হস্থ্য/, 'Home Science'],
    [/islam/, 'Islamic Studies'],
    [/hindu/, 'Hindu Religion Studies'],
    [/buddh/, 'Buddhist Religion Studies'],
    [/christ/, 'Christian Religion Studies'],
    [/arts?.*craft|চারু.*কারু/, 'Arts and Crafts'],
  ];

  return (
    mappings.find(([pattern]) =>
      pattern.test(value)
    )?.[1] || normalizedText(title)
  );
}

function toDirectDownloadUrl(value) {
  let url;

  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (!ALLOWED_DOWNLOAD_HOSTS.has(url.hostname)) {
    return null;
  }

  if (url.hostname === 'drive.egovcloud.gov.bd') {
    url.protocol = 'https:';
    const normalizedPath =
      url.pathname.replace(/\/+$/, '');

    url.pathname = normalizedPath.endsWith(
      '/download'
    )
      ? normalizedPath
      : `${normalizedPath}/download`;
    url.search = '';
    return url.toString();
  }

  if (url.hostname === 'drive.google.com') {
    const match = url.pathname.match(
      /\/file\/d\/([^/]+)/
    );

    if (!match) {
      return null;
    }

    return `https://drive.usercontent.google.com/download?id=${encodeURIComponent(
      match[1]
    )}&export=download&confirm=t`;
  }

  url.protocol = 'https:';
  return url.toString();
}

function selectDownloadUrl(cellHtml, baseUrl) {
  const candidates = [
    ...String(cellHtml || '').matchAll(
      /<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi
    ),
  ]
    .map((match) => {
      try {
        return new URL(
          decodeHtml(match[1]),
          baseUrl
        ).toString();
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const preferred =
    candidates.find((url) =>
      url.includes('drive.egovcloud.gov.bd')
    ) || candidates[0];

  return preferred
    ? toDirectDownloadUrl(preferred)
    : null;
}

function catalogItem({
  catalog,
  title,
  language,
  version,
  downloadUrl,
}) {
  const stableId = createHash('sha256')
    .update(`${catalog.id}\n${version}\n${downloadUrl}`)
    .digest('hex')
    .slice(0, 24);

  return {
    id: `nctb-${stableId}`,
    provider: 'NCTB',
    country: 'Bangladesh',
    curriculum: 'NCTB',
    academicYear: catalog.academicYear,
    grade: catalog.grade,
    subject: inferSubject(title),
    title: normalizedText(title),
    language,
    version,
    rights: 'official-public',
    sourceUrl: catalog.url,
    downloadUrl,
  };
}

function inferSingleTablePlacement(title) {
  const value = normalizedText(title);
  const explicitEnglishVersion =
    /english\s*version|ইংলিশ\s*ভার্সন/i.test(
      value
    );
  const mostlyEnglish =
    /[A-Za-z]/.test(value) &&
    !/[\u0980-\u09ff]/.test(value);

  return {
    language:
      explicitEnglishVersion || mostlyEnglish
        ? 'English'
        : 'Bangla',
    version: explicitEnglishVersion
      ? 'English Version'
      : 'Bangla Version',
  };
}

function parseNctbCatalogHtml(html, catalog) {
  const items = [];

  for (const row of elementContents(html, 'tr')) {
    const cells = elementContents(row, 'td');

    if (cells.length >= 5) {
      const banglaTitle = normalizedText(
        stripHtml(cells[1])
      );
      const banglaDownload = selectDownloadUrl(
        cells[2],
        catalog.url
      );
      const englishTitle = normalizedText(
        stripHtml(cells[3])
      );
      const englishDownload = selectDownloadUrl(
        cells[4],
        catalog.url
      );

      if (banglaTitle && banglaDownload) {
        items.push(
          catalogItem({
            catalog,
            title: banglaTitle,
            language: 'Bangla',
            version: 'Bangla Version',
            downloadUrl: banglaDownload,
          })
        );
      }

      if (englishTitle && englishDownload) {
        items.push(
          catalogItem({
            catalog,
            title: englishTitle,
            language: 'English',
            version: 'English Version',
            downloadUrl: englishDownload,
          })
        );
      }
    } else if (cells.length >= 3) {
      const title = normalizedText(
        stripHtml(cells[1])
      );
      const downloadUrl = selectDownloadUrl(
        cells[2],
        catalog.url
      );

      if (title && downloadUrl) {
        const placement =
          inferSingleTablePlacement(title);

        items.push(
          catalogItem({
            catalog,
            title,
            ...placement,
            downloadUrl,
          })
        );
      }
    }
  }

  return [
    ...new Map(
      items.map((item) => [
        `${item.version}\n${item.downloadUrl}`,
        item,
      ])
    ).values(),
  ];
}

function bootstrapItemsForCatalog(catalog) {
  const snapshot =
    NCTB_BOOTSTRAP_CATALOGS.find(
      (item) =>
        item.sourceUrl === catalog.url ||
        item.grade === catalog.grade
    );

  if (!snapshot) {
    return [];
  }

  const snapshotCatalog = {
    ...catalog,
    academicYear:
      snapshot.academicYear ||
      catalog.academicYear,
    url: snapshot.sourceUrl || catalog.url,
  };
  const items = [];

  for (const row of snapshot.rows) {
    if (row.length >= 4) {
      const banglaDownload =
        toDirectDownloadUrl(row[1]);
      const englishDownload =
        toDirectDownloadUrl(row[3]);

      if (row[0] && banglaDownload) {
        items.push(
          catalogItem({
            catalog: snapshotCatalog,
            title: row[0],
            language: 'Bangla',
            version: 'Bangla Version',
            downloadUrl: banglaDownload,
          })
        );
      }

      if (row[2] && englishDownload) {
        items.push(
          catalogItem({
            catalog: snapshotCatalog,
            title: row[2],
            language: 'English',
            version: 'English Version',
            downloadUrl: englishDownload,
          })
        );
      }
    } else if (row.length >= 2) {
      const downloadUrl =
        toDirectDownloadUrl(row[1]);

      if (row[0] && downloadUrl) {
        items.push(
          catalogItem({
            catalog: snapshotCatalog,
            title: row[0],
            ...inferSingleTablePlacement(row[0]),
            downloadUrl,
          })
        );
      }
    }
  }

  return items;
}

function errorDetails(error) {
  const cause = error?.cause;

  return {
    causeCode:
      cause?.code ||
      error?.code ||
      error?.name ||
      'UNKNOWN',
    causeMessage:
      cause?.message ||
      error?.message ||
      'Unknown catalog transport error.',
  };
}

function wait(milliseconds) {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function fetchNctbCatalog(
  catalog,
  {
    fetchImpl = fetch,
    timeoutMs = 20000,
    maxAttempts = 2,
    retryDelayMs = 600,
    waitImpl = wait,
  } = {}
) {
  const attempts = Math.max(
    1,
    Number(maxAttempts) || 1
  );
  let lastError;

  for (
    let attempt = 1;
    attempt <= attempts;
    attempt += 1
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      timeoutMs
    );

    try {
      const response = await fetchImpl(catalog.url, {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language':
            'bn-BD,bn;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new CatalogError(
          `NCTB catalog returned HTTP ${response.status}.`,
          'CATALOG_HTTP_ERROR',
          502,
          {
            attempt,
            httpStatus: response.status,
          }
        );
      }

      const html = await response.text();
      const items = parseNctbCatalogHtml(
        html,
        catalog
      );

      if (items.length === 0) {
        throw new CatalogError(
          'NCTB catalog contained no verified textbook downloads.',
          'CATALOG_EMPTY',
          502,
          { attempt }
        );
      }

      return items;
    } catch (error) {
      lastError =
        error instanceof CatalogError
          ? error
          : new CatalogError(
              'The NCTB catalog could not be downloaded.',
              'CATALOG_UNAVAILABLE',
              502,
              {
                attempt,
                ...errorDetails(error),
              }
            );
    } finally {
      clearTimeout(timeout);
    }

    if (attempt < attempts) {
      await waitImpl(retryDelayMs * attempt);
    }
  }

  throw lastError;
}

async function discoverNctbCatalogs({
  catalogs = NCTB_CATALOGS,
  fetchImpl = fetch,
  onProgress = () => {},
  offline = false,
  allowBootstrap = true,
  timeoutMs = 20000,
  maxAttempts = 1,
} = {}) {
  const books = [];
  const errors = [];
  const warnings = [];
  const sources = {
    live: 0,
    bootstrap: 0,
  };

  for (
    let index = 0;
    index < catalogs.length;
    index += 1
  ) {
    const catalog = catalogs[index];
    onProgress({
      catalog,
      completed: index,
      total: catalogs.length,
    });

    try {
      if (offline) {
        const fallback =
          bootstrapItemsForCatalog(catalog);

        if (fallback.length === 0) {
          throw new CatalogError(
            'No verified bootstrap catalog is available.',
            'CATALOG_BOOTSTRAP_MISSING'
          );
        }

        books.push(...fallback);
        sources.bootstrap += 1;
        continue;
      }

      const liveBooks = await fetchNctbCatalog(
        catalog,
        {
          fetchImpl,
          timeoutMs,
          maxAttempts,
        }
      );

      books.push(...liveBooks);
      sources.live += 1;
    } catch (error) {
      const fallback = allowBootstrap
        ? bootstrapItemsForCatalog(catalog)
        : [];

      if (fallback.length > 0) {
        books.push(...fallback);
        sources.bootstrap += 1;
        warnings.push({
          catalogId: catalog.id,
          grade: catalog.grade,
          url: catalog.url,
          code: 'CATALOG_BOOTSTRAP_USED',
          error:
            'Live NCTB access failed; used the verified official catalog snapshot.',
          liveError: {
            code:
              error.code || 'CATALOG_ERROR',
            message: error.message,
            ...(error.details || {}),
          },
        });
      } else {
        errors.push({
          catalogId: catalog.id,
          grade: catalog.grade,
          url: catalog.url,
          code:
            error.code || 'CATALOG_ERROR',
          error: error.message,
          details: error.details || {},
        });
      }
    }
  }

  onProgress({
    completed: catalogs.length,
    total: catalogs.length,
  });

  return {
    books: [
      ...new Map(
        books.map((book) => [book.id, book])
      ).values(),
    ],
    errors,
    warnings,
    sources,
    bootstrap: NCTB_BOOTSTRAP_METADATA,
  };
}

module.exports = {
  ALLOWED_DOWNLOAD_HOSTS,
  CatalogError,
  bootstrapItemsForCatalog,
  discoverNctbCatalogs,
  elementContents,
  errorDetails,
  fetchNctbCatalog,
  inferSingleTablePlacement,
  inferSubject,
  normalizedText,
  parseNctbCatalogHtml,
  selectDownloadUrl,
  stripHtml,
  toDirectDownloadUrl,
};
