const { FirewallBlockedError } = require('./errors');

/**
 * Creates Express middleware to intercept prompts before reaching route handlers.
 * Checks req.body.prompt or req.body.message by default.
 * If flagged, returns 400 immediately.
 */
function createMiddleware(fwInstance, options = {}) {
  const extractFn = options.extractPrompt || ((req) => {
    return req.body?.prompt || req.body?.message || (req.body?.messages && req.body.messages[req.body.messages.length - 1]?.content);
  });

  return async (req, res, next) => {
    try {
      const prompt = extractFn(req);

      if (!prompt) {
        if (options.failOnMissingPrompt) {
          return res.status(400).json({
            error: "bad_request",
            detail: "Prompt missing from request body"
          });
        }
        return next();
      }

      const result = await fwInstance.check(prompt);

      if (!result.safe) {
        const errorMsg = `Prompt blocked: ${result.attack_type} (${(result.confidence * 100).toFixed(0)}% confidence)`;
        
        if (typeof fwInstance.options.onBlocked === 'function') {
          fwInstance.options.onBlocked(result);
        }

        return res.status(400).json({
          error: "prompt_blocked",
          message: errorMsg,
          firewall_report: {
            risk_score: result.risk_score,
            attack_type: result.attack_type,
            confidence: result.confidence,
            flagged_layer: result.flagged_layer,
            layers: result.layers,
            processing_time_ms: result.processing_time_ms,
            request_id: result.request_id,
            timestamp: result.timestamp
          }
        });
      }

      next();
    } catch (err) {
      if (typeof fwInstance.options.onError === 'function') {
        fwInstance.options.onError(err);
      }

      if (options.failOnError) {
        return res.status(500).json({
          error: "firewall_error",
          detail: err.message || "Firewall validation failed internally"
        });
      }
      next();
    }
  };
}

module.exports = {
  createMiddleware,
};
