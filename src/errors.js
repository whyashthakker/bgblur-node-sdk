export class PrivacyBlurError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "PrivacyBlurError";
  }
}

export class AuthenticationError extends PrivacyBlurError {
  constructor(message, options) {
    super(message, options);
    this.name = "AuthenticationError";
  }
}

export class InsufficientCreditsError extends PrivacyBlurError {
  constructor(message, options) {
    super(message, options);
    this.name = "InsufficientCreditsError";
  }
}

export class RateLimitError extends PrivacyBlurError {
  constructor(message, options) {
    super(message, options);
    this.name = "RateLimitError";
  }
}

export class ServerError extends PrivacyBlurError {
  constructor(message, options) {
    super(message, options);
    this.name = "ServerError";
  }
}
