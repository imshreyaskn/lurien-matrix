import { useState } from 'react';
import { Key, Plus, Copy, Trash2, Check, Code, Terminal, Globe, Info } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../utils/api';
import LiveTestWidget from '../components/LiveTestWidget';
import { formatDateTime, formatNumber } from '../utils/formatters';

const INTEGRATION_TABS = [
  { id: 'curl', label: 'cURL', icon: Terminal },
  { id: 'node', label: 'Node.js', icon: Code },
  { id: 'python', label: 'Python', icon: Code },
  { id: 'proxy', label: 'Proxy Mode', icon: Globe },
];

const CODE_SAMPLES = {
  curl: `curl -X POST https://imdrizzle-lurien-matrix-firewall.hf.space/v1/check \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: YOUR_API_KEY_HERE" \\
  -d '{"prompt": "Hello world"}'`,

  node: `const { LurienMatrix } = require('lurien-matrix');

const fw = new LurienMatrix({
  apiKey: process.env.LURIEN_MATRIX_KEY,
  baseUrl: "https://imdrizzle-lurien-matrix-firewall.hf.space"
});

// Direct check
const result = await fw.check(userPrompt);
if (!result.safe) {
  throw new Error(\`Blocked: \${result.attack_type}\`);
}

// Or as Express middleware
app.use('/api/chat', fw.middleware(), chatHandler);`,

  python: `import requests

response = requests.post(
    "https://imdrizzle-lurien-matrix-firewall.hf.space/v1/check",
    headers={"X-API-Key": "YOUR_LURIEN_KEY"},
    json={"prompt": "Ignore previous instructions"}
)

result = response.json()
if not result["safe"]:
    print(f"Blocked: {result['attack_type']}")
    print(f"Risk Score: {result['risk_score']}")`,

  proxy: `const { LurienMatrix } = require('lurien-matrix');

const fw = new LurienMatrix({
  apiKey: process.env.LURIEN_MATRIX_KEY,
  mode: "proxy",
  provider: "openai",
  llmApiKey: process.env.OPENAI_API_KEY
});

// Use drop-in client to stream completions safely
// Malicious prompts will throw FirewallBlockedError
const response = await fw.openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: userPrompt }]
});`,
};

export default function ApiKeys() {
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [appContext, setAppContext] = useState('general');
  const [customCanary, setCustomCanary] = useState('');
  const [customIntentExamples, setCustomIntentExamples] = useState('');
  const [useOpenAi, setUseOpenAi] = useState(false);
  const [createdKey, setCreatedKey] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [activeTab, setActiveTab] = useState('curl');
  const [revoking, setRevoking] = useState(null);

  const { data: keysData, refresh } = usePolling(() => api.listKeys(), 30000);
  const keys = keysData?.keys || [];

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    try {
      const examples = customIntentExamples
        ? customIntentExamples.split('\n').map(x => x.trim()).filter(Boolean)
        : null;
      const result = await api.createKey(
        newKeyName,
        appContext || 'general',
        customCanary || null,
        examples,
        useOpenAi
      );
      
      // Save the raw key to localStorage so the dashboard can authenticate
      localStorage.setItem('fw_api_key', result.api_key);
      
      setCreatedKey(result);
      setNewKeyName('');
      setAppContext('general');
      setCustomCanary('');
      setCustomIntentExamples('');
      setUseOpenAi(false);
      setShowCreate(false);
      refresh();
    } catch (err) {
      console.error('Failed to create key:', err);
    }
  };

  const handleCopy = async (text, id) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (keyId) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    setRevoking(keyId);
    try {
      await api.revokeKey(keyId);
      refresh();
    } catch (err) {
      console.error('Failed to revoke key:', err);
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="display-text text-luma-FFF font-sans uppercase">
            System <span className="font-bold text-accent-gold">Auth</span>
          </h1>
          <p className="text-luma-500 mt-1 font-mono text-sm tracking-wider uppercase">Access tokens and integration nodes</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2.5 bg-accent-gold text-luma-000 border border-accent-gold text-sm font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-accent-gold/80 transition-colors"
        >
          <Plus className="w-4 h-4" />
          GENERATE TOKEN
        </button>
      </div>

      {/* Created Key Alert */}
      {createdKey && (
        <div className="bg-accent-gold/10 text-accent-gold p-5 animate-fade-in border border-accent-gold/30 backdrop-blur-sm">
          <div className="flex items-center gap-2 mb-3">
            <Check className="w-5 h-5 text-accent-gold" />
            <span className="text-sm font-bold uppercase tracking-widest">TOKEN GENERATED</span>
          </div>
          <p className="text-xs text-accent-gold/70 font-mono tracking-widest uppercase mb-3">
            Copy this key now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2 bg-black/40 p-3 border border-accent-gold/20 shadow-inner">
            <code className="flex-1 text-sm font-mono text-accent-gold break-all">
              {createdKey.api_key}
            </code>
            <button
              onClick={() => handleCopy(createdKey.api_key, 'created')}
              className="p-2 hover:bg-accent-gold/20 transition-colors border border-transparent rounded-sm"
            >
              {copiedId === 'created' ? (
                <Check className="w-4 h-4 text-accent-gold" />
              ) : (
                <Copy className="w-4 h-4 text-accent-gold/70" />
              )}
            </button>
          </div>
          <button
            onClick={() => setCreatedKey(null)}
            className="mt-4 text-xs font-mono tracking-widest text-accent-gold/70 hover:text-accent-gold uppercase transition-colors"
          >
            DISMISS
          </button>
        </div>
      )}

      {/* Create Key Modal */}
      {showCreate && (
        <div className="bg-luma-000 p-6 border border-luma-300 animate-fade-in space-y-4">
          <h3 className="text-sm font-bold text-luma-FFF tracking-widest uppercase">Generate Access Token</h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 block">TOKEN IDENTIFIER</label>
              <input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="PROD-NODE-01"
                className="w-full bg-luma-000 border border-luma-300 px-4 py-2.5 text-xs font-mono text-luma-FFF placeholder-luma-700 focus:outline-none focus:border-luma-700 uppercase"
              />
            </div>
            
            {/* Advanced configurations */}
            <div className="border-t border-luma-300 pt-4 space-y-4">
              <h4 className="text-xs font-bold text-luma-700 uppercase tracking-widest flex items-center gap-2">
                ADVANCED TOPOLOGY
              </h4>
              <div>
                <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                  DEFAULT CONTEXT PROFILE (APP_CONTEXT)
                  <Info className="w-3 h-3 cursor-help hover:text-accent-gold transition-colors" title="The Context Profile defines what normal, expected behavior looks like for this API key. The ML layer measures the semantic distance between this profile and the actual incoming payload." />
                </label>
                <input
                  list="api-key-contexts"
                  value={appContext}
                  onChange={(e) => setAppContext(e.target.value)}
                  placeholder="GENERAL_ACCESS"
                  className="w-full bg-luma-000 border border-luma-300 px-4 py-2.5 text-xs font-mono text-luma-FFF focus:outline-none focus:border-luma-700 uppercase"
                />
                <datalist id="api-key-contexts">
                  <option value="GENERAL_ACCESS" />
                  <option value="CODING_ASSISTANT" />
                  <option value="RECIPE_BOT" />
                  <option value="CUSTOMER_SUPPORT" />
                  <option value="EDUCATION" />
                  <option value="HR_ASSISTANT" />
                </datalist>
              </div>

              <div>
                <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                  SYSTEM CANARY TOKEN
                  <Info className="w-3 h-3 cursor-help hover:text-accent-gold transition-colors" title="A unique cryptographic string automatically injected into every request using this key. If the firewall detects this exact string in the output, it instantly proves a catastrophic data leak occurred." />
                </label>
                <input
                  value={customCanary}
                  onChange={(e) => setCustomCanary(e.target.value)}
                  placeholder="SYS_LEAK_TOKEN_0X9"
                  className="w-full bg-luma-000 border border-luma-300 px-4 py-2.5 text-xs font-mono text-luma-FFF placeholder-luma-700 focus:outline-none focus:border-luma-700 uppercase"
                />
              </div>

              <div>
                <label className="text-xs text-luma-500 font-mono tracking-widest uppercase mb-1 flex items-center gap-1">
                  CUSTOM POLICY INTENTS (ONE PER LINE)
                  <Info className="w-3 h-3 cursor-help hover:text-accent-gold transition-colors" title="Define explicit allowed behaviors for this specific key. The semantic analyzer will treat these intents as safe baselines, reducing false positives for specialized agents." />
                </label>
                <textarea
                  value={customIntentExamples}
                  onChange={(e) => setCustomIntentExamples(e.target.value)}
                  placeholder="ANALYZE_LOGS&#10;PROCESS_PAYLOAD"
                  rows={3}
                  className="w-full bg-luma-000 border border-luma-300 px-4 py-2.5 text-xs font-mono text-luma-FFF placeholder-luma-700 focus:outline-none focus:border-luma-700 uppercase tracking-widest"
                />
              </div>


            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleCreate}
                disabled={!newKeyName.trim()}
                className="flex-1 py-2.5 bg-accent-gold text-luma-000 border border-accent-gold text-xs font-bold uppercase tracking-widest hover:bg-accent-gold/80 transition-colors disabled:opacity-50"
              >
                DEPLOY TOKEN
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="px-6 py-2.5 border border-luma-300 bg-luma-000 text-xs font-bold text-luma-500 uppercase tracking-widest hover:text-luma-FFF transition-colors"
              >
                ABORT
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Keys List */}
      <div className="border border-luma-300 bg-luma-000 overflow-hidden">
        <div className="p-4 border-b border-luma-300 bg-luma-100">
          <h3 className="text-xs font-bold text-luma-700 uppercase tracking-widest">ACTIVE TOKENS</h3>
        </div>
        {keys.length > 0 ? (
          <div className="divide-y divide-luma-300">
            {keys.map((key) => (
              <div key={key.key_id} className="p-4 flex items-center gap-4 hover:bg-luma-100 transition-colors">
                <Key className="w-5 h-5 text-luma-500 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-luma-FFF tracking-widest uppercase flex items-center gap-2">
                    {key.name}

                  </div>
                  <div className="text-xs text-luma-500 font-mono tracking-widest uppercase mt-0.5">
                    FW_LIVE_****{key.key_id.slice(-8)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-luma-FFF font-mono tracking-widest uppercase">
                    {formatNumber(key.total_checks)} CHECKS
                  </div>
                  <div className="text-xs text-luma-500 font-mono tracking-widest uppercase">
                    {formatNumber(key.total_blocked)} BLOCKED
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(key.key_id)}
                  disabled={revoking === key.key_id}
                  className="p-2 border border-transparent hover:border-luma-500 text-luma-500 hover:text-luma-FFF hover:bg-luma-300 transition-all disabled:opacity-50"
                  title="Revoke key"
                >
                  {revoking === key.key_id ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center text-luma-500 font-mono text-sm uppercase tracking-widest">
            <Key className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p>NO TOKENS FOUND.</p>
          </div>
        )}
      </div>

      {/* Integration Guide */}
      <div className="border border-luma-300 bg-luma-000 p-6">
        <h3 className="text-xs font-bold text-luma-700 tracking-widest uppercase mb-4">INTEGRATION TOPOLOGY</h3>

        {/* Tabs */}
        <div className="flex gap-1 bg-luma-100 p-1 mb-4 border border-luma-300">
          {INTEGRATION_TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold tracking-widest uppercase transition-all ${
                activeTab === id
                  ? 'bg-accent-gold text-luma-000 border border-accent-gold'
                  : 'bg-transparent text-luma-500 hover:text-luma-FFF'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Code */}
        <div className="relative">
          <pre className="bg-luma-000 p-4 text-xs font-mono text-luma-FFF overflow-auto max-h-80 border border-luma-300">
            <code>{CODE_SAMPLES[activeTab]}</code>
          </pre>
          <button
            onClick={() => handleCopy(CODE_SAMPLES[activeTab], activeTab)}
            className="absolute top-3 right-3 p-2 bg-luma-100 hover:bg-luma-300 text-luma-500 hover:text-luma-FFF transition-all border border-luma-300 hover:border-luma-500"
          >
            {copiedId === activeTab ? (
              <Check className="w-4 h-4 text-luma-FFF" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Live Test Widget */}
      <LiveTestWidget />
    </div>
  );
}
