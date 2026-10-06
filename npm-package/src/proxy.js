const { FirewallBlockedError } = require('./errors');

/**
 * Custom drop-in client builder that forwards requests directly
 * through the Firewall's true proxy endpoint instead of OpenAI/Gemini/Anthropic/Groq.
 */
function createProxyClient(fwInstance) {
  const provider = fwInstance.options.provider;
  const llmApiKey = fwInstance.options.llmApiKey;
  
  if (!provider) {
    throw new Error("Provider must be specified for proxy mode");
  }
  if (!llmApiKey) {
    throw new Error("llmApiKey must be specified for proxy mode");
  }

  if (provider === 'openai' || provider === 'groq') {
    return {
      chat: {
        completions: {
          create: async (body) => {
            const url = `${fwInstance.options.baseUrl}/v1/proxy/${provider}`;
            
            const response = await fetch(url, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-API-Key': fwInstance.options.apiKey,
                'X-LLM-API-Key': llmApiKey
              },
              body: JSON.stringify(body)
            });

            if (response.status === 403) {
              const result = await response.json();
              const error = new FirewallBlockedError(
                `Prompt blocked: ${result.firewall_report.attack_type} (${(result.firewall_report.confidence * 100).toFixed(0)}% confidence)`,
                result.firewall_report
              );
              if (typeof fwInstance.options.onBlocked === 'function') {
                fwInstance.options.onBlocked(result.firewall_report);
              }
              throw error;
            }

            if (!response.ok) {
              const errBody = await response.text();
              throw new Error(`LLM Firewall Proxy Error (${response.status}): ${errBody}`);
            }

            if (body.stream) {
              return response.body;
            }
            return response.json();
          }
        }
      }
    };
  }

  if (provider === 'anthropic') {
    return {
      messages: {
        create: async (body) => {
          const url = `${fwInstance.options.baseUrl}/v1/proxy/anthropic`;
          
          const response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': fwInstance.options.apiKey,
              'X-LLM-API-Key': llmApiKey
            },
            body: JSON.stringify(body)
          });

          if (response.status === 403) {
            const result = await response.json();
            const error = new FirewallBlockedError(
              `Prompt blocked: ${result.firewall_report.attack_type} (${(result.firewall_report.confidence * 100).toFixed(0)}% confidence)`,
              result.firewall_report
            );
            if (typeof fwInstance.options.onBlocked === 'function') {
              fwInstance.options.onBlocked(result.firewall_report);
            }
            throw error;
          }

          if (!response.ok) {
            const errBody = await response.text();
            throw new Error(`LLM Firewall Proxy Error (${response.status}): ${errBody}`);
          }

          if (body.stream) {
            return response.body;
          }
          return response.json();
        }
      }
    };
  }

  if (provider === 'gemini') {
    return {
      generateContent: async (body) => {
        const url = `${fwInstance.options.baseUrl}/v1/proxy/gemini`;
        
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': fwInstance.options.apiKey,
            'X-LLM-API-Key': llmApiKey
          },
          body: JSON.stringify(body)
        });

        if (response.status === 403) {
          const result = await response.json();
          const error = new FirewallBlockedError(
            `Prompt blocked: ${result.firewall_report.attack_type} (${(result.firewall_report.confidence * 100).toFixed(0)}% confidence)`,
            result.firewall_report
          );
          if (typeof fwInstance.options.onBlocked === 'function') {
            fwInstance.options.onBlocked(result.firewall_report);
          }
          throw error;
        }

        if (!response.ok) {
          const errBody = await response.text();
          throw new Error(`LLM Firewall Proxy Error (${response.status}): ${errBody}`);
        }

        return response.json();
      }
    };
  }

  throw new Error(`Proxy client not implemented for provider: ${provider}`);
}

module.exports = {
  createProxyClient,
};
