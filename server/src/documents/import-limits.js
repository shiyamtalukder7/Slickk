'use strict';

const MEBIBYTE = 1024 * 1024;
const DEFAULT_LOCAL_TEXTBOOK_MAX_MB = 256;
const ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB = 512;

class LocalTextbookImportLimitError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LocalTextbookImportLimitError';
    this.code = 'PDF_LOCAL_LIMIT_INVALID';
    this.status = 400;
  }
}

function resolveLocalTextbookMaximumBytes(value) {
  const raw = String(value ?? '').trim();
  const maximumMb =
    raw === ''
      ? DEFAULT_LOCAL_TEXTBOOK_MAX_MB
      : Number(raw);

  if (
    !Number.isInteger(maximumMb) ||
    maximumMb < 1 ||
    maximumMb > ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB
  ) {
    throw new LocalTextbookImportLimitError(
      `--max-mb must be a whole number from 1 to ${ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB}.`
    );
  }

  return maximumMb * MEBIBYTE;
}

module.exports = {
  ABSOLUTE_LOCAL_TEXTBOOK_MAX_MB,
  DEFAULT_LOCAL_TEXTBOOK_MAX_MB,
  LocalTextbookImportLimitError,
  MEBIBYTE,
  resolveLocalTextbookMaximumBytes,
};
