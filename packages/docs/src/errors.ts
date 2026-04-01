/**
 * Base error class for documentation source errors.
 */
export class DocSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocSourceError';
  }
}

/**
 * Error thrown when an HTTP fetch to the documentation source fails.
 */
export class DocFetchError extends DocSourceError {
  public readonly url: string;
  public readonly status: number;
  public readonly statusText: string;

  constructor(url: string, status: number, statusText: string) {
    super(`Failed to fetch ${url}: ${status} ${statusText}`);
    this.name = 'DocFetchError';
    this.url = url;
    this.status = status;
    this.statusText = statusText;
  }
}

/**
 * Error thrown when documentation content cannot be parsed.
 */
export class DocParseError extends DocSourceError {
  constructor(message: string) {
    super(message);
    this.name = 'DocParseError';
  }
}

/**
 * Error thrown when a requested page or section is not found.
 */
export class DocNotFoundError extends DocSourceError {
  constructor(identifier: string) {
    super(`Not found: ${identifier}`);
    this.name = 'DocNotFoundError';
  }
}
