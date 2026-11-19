export class BrowseGateError extends Error {
  constructor(message, { cause, code = "BROWSEGATE_ERROR" } = {}) {
    super(message, { cause });
    this.name = "BrowseGateError";
    this.code = code;
  }
}

export function readableError(error, fallback = "Something went wrong. Please try again.") {
  return error instanceof Error && error.message ? error.message : fallback;
}
