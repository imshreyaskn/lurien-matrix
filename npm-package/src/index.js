const { createMiddleware } = require('./middleware');
const { createProxyClient } = require('./proxy');
const { FirewallBlockedError } = require('./errors');

class LurienMatrix {
  /**
   * Initialize Lurien Matrix SDK
   * @param {Object} options
   * @param {string} options.apiKey - Firewall API Key (required)
   * @param {string} [options.baseUrl] - Base URL (default: "https://imdrizzle-lurien-matrix.hf.space")
   * @param {number} [options.threshold] - Default risk threshold (default: 0.50)
   * @param {string} [options.mode] - Mode: "check" | "proxy" (default: "check")
   * @param {string} [options.provider] - Provider: "openai" | "gemini" | "anthropic" | "groq"
   * @param {string} [options.llmApiKey] - Provider's API key (required if mode is "proxy")
   * @param {number} [options.timeout] - Request timeout in milliseconds (default: 5000)
   * @param {Function} [options.onBlocked] - Optional callback when prompt is blocked
   * @param {Function} [options.onError] - Optional callback when internal/network error occurs
   */
  constructor(options = {}) {
    if (!options.apiKey) {
      throw new Error("apiKey is required");
    }

    this.options = {
      baseUrl: "https://imdrizzle-lurien-matrix-firewall.hf.space",
      threshold: 0.50,
      mode: "check",
      timeout: 5000,
      ...options,
    };

    // Strip trailing slashes from baseUrl
    if (this.options.baseUrl.endsWith('/')) {
      this.options.baseUrl = this.options.baseUrl.slice(0, -1);
    }

    // Set up proxy client if requested
    if (this.options.mode === 'proxy') {
      const client = createProxyClient(this);
      const provider = this.options.provider;
      this[provider] = client;
    }
  }

  /**
   * Helper to perform request with timeout
   */
  async _request(path, body) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.options.timeout);

    try {
      const response = await fetch(`${this.options.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errObj = await response.json().catch(() => ({}));
        throw new Error(errObj.detail || `HTTP Error ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      clearTimeout(timeoutId);
      if (typeof this.options.onError === 'function') {
        this.options.onError(err);
      }
      throw err;
    }
  }

  /**
   * Check a single prompt against the firewall
   * @param {string} prompt
   * @param {Object} [meta] - Optional request metadata
   * @returns {Promise<Object>} Full risk assessment report
   */
  async check(prompt, meta = {}) {
    if (typeof prompt !== 'string') {
      throw new Error("prompt must be a string");
    }
    if (!prompt.trim()) {
      throw new Error("prompt cannot be empty");
    }
    
    return this._request('/v1/check', {
      prompt,
      threshold: this.options.threshold,
      metadata: meta
    });
  }

  /**
   * Check a batch of prompts against the firewall
   * @param {string[]} prompts
   * @returns {Promise<Object>} Batch check results object
   */
  async checkBatch(prompts) {
    if (!Array.isArray(prompts)) {
      throw new Error("prompts must be an array");
    }
    if (prompts.length === 0) {
      throw new Error("prompts array cannot be empty");
    }
    if (prompts.length > 50) {
      throw new Error("batch limit is 50 prompts");
    }

    return this._request('/v1/check/batch', {
      prompts
    });
  }

  /**
   * Returns Express middleware function
   * @param {Object} [options]
   */
  middleware(options = {}) {
    return createMiddleware(this, options);
  }
}

module.exports = {
  LurienMatrix,
  FirewallBlockedError,
};
