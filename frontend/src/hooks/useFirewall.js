import { useCallback } from 'react';
import { api } from '../utils/api';

export function useFirewall() {
  const checkPrompt = useCallback(async (prompt, threshold) => {
    return api.check(prompt, threshold);
  }, []);

  const checkBatch = useCallback(async (prompts) => {
    return api.checkBatch(prompts);
  }, []);

  const getStats = useCallback(async () => {
    return api.getStats();
  }, []);

  const getLogs = useCallback(async (params) => {
    return api.getLogs(params);
  }, []);

  const getLogDetail = useCallback(async (requestId) => {
    return api.getLogDetail(requestId);
  }, []);

  const createKey = useCallback(async (name, tier) => {
    return api.createKey(name, tier);
  }, []);

  const listKeys = useCallback(async () => {
    return api.listKeys();
  }, []);

  const revokeKey = useCallback(async (keyId) => {
    return api.revokeKey(keyId);
  }, []);

  const healthCheck = useCallback(async () => {
    return api.health();
  }, []);

  return {
    checkPrompt,
    checkBatch,
    getStats,
    getLogs,
    getLogDetail,
    createKey,
    listKeys,
    revokeKey,
    healthCheck,
  };
}
