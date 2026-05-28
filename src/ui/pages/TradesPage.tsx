import { Bell, Briefcase, Download, LogOut, Play, RefreshCw, Save, Search, Settings, Upload } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  AdviceRun,
  AuditLogListItem,
  ParsedHolding,
  TradePosition,
  TradeRecommendation,
  TradeSettings,
  clearTradesToken,
  commitPortfolioImport,
  confirmTradeAdvice,
  fetchAuditLogs,
  fetchTradeAdvice,
  fetchTradeTransactions,
  fetchTradesPortfolio,
  fetchTradesSession,
  fetchTradesSettings,
  getTradesToken,
  loginTrades,
  logoutTrades,
  parsePortfolioText,
  renderTradePrompt,
  runTradeAdviceNow,
  saveTradePrompt,
  saveTradeTransaction,
  saveTradesSettings,
  setTradesToken
} from "../../trades/api";
import { navigate } from "../../router";
import { ErrorPanel, LoadingPanel } from "../components/StatusPanel";

type TradesSection = "dashboard" | "import" | "advice" | "portfolio" | "settings" | "audit";

interface TradesPageProps {
  section?: string;
}

interface PortfolioState {
  cash: Array<{ currency: string; amount: number }>;
  positions: TradePosition[];
  settings: TradeSettings;
  latestAdvice: AdviceRun | null;
}

export function TradesPage({ section = "dashboard" }: TradesPageProps) {
  const activeSection = normalizeSection(section);
  const [unlocked, setUnlocked] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [advice, setAdvice] = useState<{ run: AdviceRun | null; recommendations: TradeRecommendation[] }>({
    run: null,
    recommendations: []
  });
  const [transactions, setTransactions] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<TradeSettings | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogListItem[]>([]);
  const [auditQuery, setAuditQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll() {
    setLoading(true);
    setError(null);
    try {
      const [portfolioResult, adviceResult, transactionResult, settingsResult] = await Promise.all([
        fetchTradesPortfolio(),
        fetchTradeAdvice(),
        fetchTradeTransactions(),
        fetchTradesSettings()
      ]);
      setPortfolio(portfolioResult);
      setAdvice(adviceResult);
      setTransactions(transactionResult.transactions);
      setSettings(settingsResult.settings);
      setUnlocked(true);
    } catch (err) {
      if (getTradesToken()) {
        clearTradesToken();
      }
      setUnlocked(false);
      setError(err instanceof Error ? err.message : "Could not load trading area.");
    } finally {
      setLoading(false);
    }
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const result = await loginTrades(loginPassword);
      setTradesToken(result.token);
      setLoginPassword("");
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trading login failed.");
    }
  }

  async function logout() {
    try {
      await logoutTrades();
    } finally {
      clearTradesToken();
      setUnlocked(false);
      navigate("/trades");
    }
  }

  useEffect(() => {
    if (!getTradesToken()) {
      return;
    }
    fetchTradesSession()
      .then(() => loadAll())
      .catch(() => {
        clearTradesToken();
        setUnlocked(false);
      });
  }, []);

  if (!unlocked) {
    return (
      <section className="page-section narrow trades-login">
        <div className="section-heading">
          <h1>Trades</h1>
          <Briefcase size={28} aria-hidden />
        </div>
        <form className="form-stack" onSubmit={(event) => void login(event)}>
          <label>
            Trading password
            <input
              type="password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="Password"
            />
          </label>
          <button className="primary-button" type="submit" disabled={!loginPassword}>
            Unlock trades
          </button>
        </form>
        {error && <ErrorPanel message={error} />}
      </section>
    );
  }

  return (
    <section className="page-section trades-page">
      <div className="section-heading trades-heading">
        <div>
          <h1>Trades</h1>
          <p>Portfolio advice, actual trade tracking, prompts, and audit logs.</p>
        </div>
        <div className="trades-heading-actions">
          <button className="icon-button" type="button" onClick={() => void loadAll()} aria-label="Refresh trades">
            <RefreshCw size={18} aria-hidden />
          </button>
          <button className="secondary-button" type="button" onClick={() => void logout()}>
            <LogOut size={16} aria-hidden />
            Different user
          </button>
        </div>
      </div>

      <nav className="trades-tabs" aria-label="Trading">
        <TradeTab section="dashboard" active={activeSection} label="Dashboard" />
        <TradeTab section="advice" active={activeSection} label="Advice" />
        <TradeTab section="portfolio" active={activeSection} label="Portfolio" />
        <TradeTab section="import" active={activeSection} label="Import" />
        <TradeTab section="settings" active={activeSection} label="System" />
        <TradeTab section="audit" active={activeSection} label="Audit" />
      </nav>

      {error && <ErrorPanel message={error} />}
      {message && <div className="success-panel">{message}</div>}
      {loading && <LoadingPanel label="Loading trades" />}

      {activeSection === "dashboard" && portfolio && <TradesDashboard portfolio={portfolio} advice={advice} />}
      {activeSection === "import" && (
        <TradesImport
          onSaved={async () => {
            setMessage("Portfolio import saved.");
            await loadAll();
          }}
          onError={setError}
        />
      )}
      {activeSection === "advice" && (
        <TradesAdvice
          advice={advice}
          onRun={async () => {
            await runTradeAdviceNow();
            setMessage("Trade advice workflow dispatched.");
          }}
          onSaved={async () => {
            setMessage("Actual trades saved.");
            await loadAll();
          }}
          onError={setError}
        />
      )}
      {activeSection === "portfolio" && portfolio && (
        <TradesPortfolio
          portfolio={portfolio}
          transactions={transactions}
          onSaved={async () => {
            setMessage("Transaction saved.");
            await loadAll();
          }}
          onError={setError}
        />
      )}
      {activeSection === "settings" && settings && (
        <TradesSystemEditor
          settings={settings}
          onSaved={async () => {
            setMessage("Trading settings saved.");
            await loadAll();
          }}
          onError={setError}
        />
      )}
      {activeSection === "audit" && (
        <TradesAudit
          logs={auditLogs}
          query={auditQuery}
          onQueryChange={setAuditQuery}
          onSearch={async () => {
            const result = await fetchAuditLogs(auditQuery);
            setAuditLogs(result.logs);
          }}
          onError={setError}
        />
      )}
    </section>
  );
}

function TradesDashboard({
  portfolio,
  advice
}: {
  portfolio: PortfolioState;
  advice: { run: AdviceRun | null; recommendations: TradeRecommendation[] };
}) {
  const holdingsValue = portfolio.positions.reduce((sum, position) => sum + Number(position.current_value || 0), 0);
  const cashValue = portfolio.cash.reduce((sum, cash) => sum + Number(cash.amount || 0), 0);
  const buys = advice.recommendations.filter((rec) => rec.action === "buy").length;
  const sells = advice.recommendations.filter((rec) => rec.action === "sell").length;

  return (
    <div className="trades-stack">
      <div className="metric-grid">
        <Metric label="Total value" value={formatMoney(holdingsValue + cashValue)} />
        <Metric label="Cash" value={formatMoney(cashValue)} />
        <Metric label="Holdings" value={formatMoney(holdingsValue)} />
        <Metric label="Latest advice" value={advice.run ? `${buys} buy / ${sells} sell` : "None"} />
      </div>
      <section className="trades-panel">
        <h2>Current holdings</h2>
        <PositionsTable positions={portfolio.positions} />
      </section>
      {advice.run && (
        <section className="trades-panel">
          <h2>Latest advice</h2>
          <p>{advice.run.summary || "Advice generated."}</p>
          <button className="secondary-button" type="button" onClick={() => navigate("/trades/advice")}>
            View advice
          </button>
        </section>
      )}
    </div>
  );
}

function TradesImport({ onSaved, onError }: { onSaved: () => Promise<void>; onError: (message: string) => void }) {
  const [text, setText] = useState(defaultImportExample);
  const [cash, setCash] = useState(0);
  const [holdings, setHoldings] = useState<ParsedHolding[]>([]);

  async function parse() {
    try {
      const result = await parsePortfolioText(text);
      setCash(result.cash);
      setHoldings(result.holdings);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import parse failed.");
    }
  }

  async function save() {
    try {
      await commitPortfolioImport(text, cash, holdings);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import save failed.");
    }
  }

  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <h2>Paste portfolio</h2>
        <p>Use one line per holding. Asset type can be omitted; the parser will infer it and let you review.</p>
        <textarea rows={9} value={text} onChange={(event) => setText(event.target.value)} />
        <div className="button-row">
          <button className="primary-button" type="button" onClick={() => void parse()}>
            <Upload size={16} aria-hidden />
            Parse
          </button>
        </div>
      </section>
      {holdings.length > 0 && (
        <section className="trades-panel">
          <h2>Review import</h2>
          <label>
            Cash EUR
            <input type="number" value={cash} onChange={(event) => setCash(Number(event.target.value))} />
          </label>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Symbol</th>
                  <th>Name</th>
                  <th>Qty</th>
                  <th>Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((holding, index) => (
                  <tr key={holding.id}>
                    <td>
                      <select value={holding.asset_type} onChange={(event) => updateHolding(index, "asset_type", event.target.value)}>
                        <option value="stock">Stock</option>
                        <option value="etf">ETF</option>
                        <option value="crypto">Crypto</option>
                      </select>
                    </td>
                    <td>
                      <input value={holding.symbol} onChange={(event) => updateHolding(index, "symbol", event.target.value)} />
                    </td>
                    <td>
                      <input value={holding.name} onChange={(event) => updateHolding(index, "name", event.target.value)} />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={holding.quantity}
                        onChange={(event) => updateHolding(index, "quantity", Number(event.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={holding.current_value ?? 0}
                        onChange={(event) => updateHolding(index, "current_value", Number(event.target.value))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="primary-button" type="button" onClick={() => void save()}>
            Save portfolio
          </button>
        </section>
      )}
    </div>
  );

  function updateHolding(index: number, key: keyof ParsedHolding, value: unknown) {
    setHoldings((current) => current.map((holding, currentIndex) => (currentIndex === index ? { ...holding, [key]: value } : holding)));
  }
}

function TradesAdvice({
  advice,
  onRun,
  onSaved,
  onError
}: {
  advice: { run: AdviceRun | null; recommendations: TradeRecommendation[] };
  onRun: () => Promise<void>;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [drafts, setDrafts] = useState(() => advice.recommendations.map(recommendationToDraft));

  useEffect(() => {
    setDrafts(advice.recommendations.map(recommendationToDraft));
  }, [advice.recommendations]);

  async function saveConfirmations() {
    if (!advice.run) {
      return;
    }
    try {
      await confirmTradeAdvice(advice.run.id, drafts);
      setConfirming(false);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save actual trades.");
    }
  }

  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <div className="panel-heading-row">
          <h2>Advice</h2>
          <button className="primary-button" type="button" onClick={() => void onRun()}>
            <Play size={16} aria-hidden />
            Run advice now
          </button>
        </div>
        {!advice.run && <p>No advice has been generated yet.</p>}
        {advice.run && (
          <>
            <p>{advice.run.summary || "Advice generated."}</p>
            <div className="recommendation-grid">
              {advice.recommendations.map((rec) => (
                <article className="recommendation-card" key={rec.id}>
                  <span className={`trade-action ${rec.action}`}>{rec.action}</span>
                  <h3>
                    {rec.symbol} <small>{rec.name}</small>
                  </h3>
                  <p>{rec.reason}</p>
                  <dl>
                    <div>
                      <dt>Quantity</dt>
                      <dd>{rec.suggested_quantity ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Price</dt>
                      <dd>{rec.suggested_price ? formatMoney(rec.suggested_price, rec.price_currency) : "-"}</dd>
                    </div>
                    <div>
                      <dt>Availability</dt>
                      <dd>{rec.trade_republic_availability}</dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
            <button className="secondary-button" type="button" onClick={() => setConfirming((current) => !current)}>
              Input actual trades
            </button>
          </>
        )}
      </section>
      {confirming && advice.run && (
        <section className="trades-panel">
          <h2>Confirm actual trades</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Symbol</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Fee</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft, index) => (
                  <tr key={draft.recommendationId}>
                    <td>
                      <select value={draft.status} onChange={(event) => updateDraft(index, "status", event.target.value)}>
                        <option value="accepted">Done</option>
                        <option value="edited">Edited</option>
                        <option value="partial">Partial</option>
                        <option value="skipped">Skipped</option>
                        <option value="unavailable">Unavailable</option>
                      </select>
                    </td>
                    <td>{advice.recommendations[index]?.symbol}</td>
                    <td>
                      <input
                        type="number"
                        value={draft.actualQuantity ?? 0}
                        onChange={(event) => updateDraft(index, "actualQuantity", Number(event.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={draft.actualPrice ?? 0}
                        onChange={(event) => updateDraft(index, "actualPrice", Number(event.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        value={draft.actualFee ?? 1}
                        onChange={(event) => updateDraft(index, "actualFee", Number(event.target.value))}
                      />
                    </td>
                    <td>
                      <input value={draft.notes ?? ""} onChange={(event) => updateDraft(index, "notes", event.target.value)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="primary-button" type="button" onClick={() => void saveConfirmations()}>
            Save actual trades
          </button>
        </section>
      )}
    </div>
  );

  function updateDraft(index: number, key: keyof ReturnType<typeof recommendationToDraft>, value: unknown) {
    setDrafts((current) => current.map((draft, currentIndex) => (currentIndex === index ? { ...draft, [key]: value } : draft)));
  }
}

function TradesPortfolio({
  portfolio,
  transactions,
  onSaved,
  onError
}: {
  portfolio: PortfolioState;
  transactions: unknown[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [cashAmount, setCashAmount] = useState(0);
  const [cashType, setCashType] = useState("deposit");

  async function saveCash(event: FormEvent) {
    event.preventDefault();
    try {
      await saveTradeTransaction({
        type: cashType,
        gross_amount: cashAmount,
        cash_effect: cashType === "withdrawal" ? -Math.abs(cashAmount) : Math.abs(cashAmount),
        currency: "EUR",
        notes: "Manual cash correction"
      });
      setCashAmount(0);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save cash transaction.");
    }
  }

  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <h2>Positions</h2>
        <PositionsTable positions={portfolio.positions} />
      </section>
      <section className="trades-panel">
        <h2>Cash correction</h2>
        <form className="inline-form" onSubmit={(event) => void saveCash(event)}>
          <select value={cashType} onChange={(event) => setCashType(event.target.value)}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="number" value={cashAmount} onChange={(event) => setCashAmount(Number(event.target.value))} />
          <button className="primary-button" type="submit">
            Save
          </button>
        </form>
      </section>
      <section className="trades-panel">
        <h2>Transactions</h2>
        <pre className="json-preview">{JSON.stringify(transactions.slice(0, 30), null, 2)}</pre>
      </section>
    </div>
  );
}

function TradesSystemEditor({
  settings,
  onSaved,
  onError
}: {
  settings: TradeSettings;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [promptText, setPromptText] = useState(settings.prompt_text || "");

  async function renderPrompt() {
    try {
      const result = await renderTradePrompt();
      setPromptText(result.promptText);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not render prompt.");
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      await saveTradesSettings(draft);
      await saveTradePrompt(promptText, []);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  return (
    <form className="trades-stack" onSubmit={(event) => void save(event)}>
      <section className="trades-panel settings-grid">
        <label>
          Advice time
          <input value={draft.advice_time} onChange={(event) => setDraftField("advice_time", event.target.value)} />
        </label>
        <label>
          Web search
          <select value={draft.web_search_mode} onChange={(event) => setDraftField("web_search_mode", event.target.value)}>
            <option value="none">None</option>
            <option value="light">Light</option>
            <option value="normal">Normal</option>
            <option value="heavy">Heavy</option>
          </select>
        </label>
        <label>
          Risk
          <select value={draft.risk_profile} onChange={(event) => setDraftField("risk_profile", event.target.value)}>
            <option value="balanced">Balanced</option>
            <option value="conservative">Conservative</option>
            <option value="aggressive">Aggressive</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          Max cash deploy %
          <input
            type="number"
            value={draft.max_cash_deploy_pct}
            onChange={(event) => setDraftField("max_cash_deploy_pct", Number(event.target.value))}
          />
        </label>
        <label>
          Min trade EUR
          <input
            type="number"
            value={draft.min_trade_value}
            onChange={(event) => setDraftField("min_trade_value", Number(event.target.value))}
          />
        </label>
        <label>
          Fraction increment
          <input
            type="number"
            value={draft.fractional_increment}
            onChange={(event) => setDraftField("fractional_increment", Number(event.target.value))}
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.stocks_enabled === 1}
            onChange={(event) => setDraftField("stocks_enabled", event.target.checked ? 1 : 0)}
          />
          Stocks
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.etfs_enabled === 1}
            onChange={(event) => setDraftField("etfs_enabled", event.target.checked ? 1 : 0)}
          />
          ETFs
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={draft.crypto_enabled === 1}
            onChange={(event) => setDraftField("crypto_enabled", event.target.checked ? 1 : 0)}
          />
          Crypto
        </label>
      </section>
      <section className="trades-panel">
        <div className="panel-heading-row">
          <h2>Prompt</h2>
          <button className="secondary-button" type="button" onClick={() => void renderPrompt()}>
            Reset all
          </button>
        </div>
        <textarea rows={18} value={promptText} onChange={(event) => setPromptText(event.target.value)} />
      </section>
      <button className="primary-button" type="submit">
        <Save size={16} aria-hidden />
        Save system
      </button>
    </form>
  );

  function setDraftField<K extends keyof TradeSettings>(key: K, value: TradeSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }
}

function TradesAudit({
  logs,
  query,
  onQueryChange,
  onSearch,
  onError
}: {
  logs: AuditLogListItem[];
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: () => Promise<void>;
  onError: (message: string) => void;
}) {
  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <h2>AI audit</h2>
        <div className="inline-form">
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search prompts and responses" />
          <button className="primary-button" type="button" onClick={() => void onSearch()}>
            <Search size={16} aria-hidden />
            Search
          </button>
          <button className="secondary-button" type="button" onClick={() => void downloadAuditExport()}>
            <Download size={16} aria-hidden />
            Export
          </button>
        </div>
      </section>
      <section className="trades-panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Type</th>
                <th>Model</th>
                <th>Status</th>
                <th>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td>{formatDate(log.created_at)}</td>
                  <td>{log.call_type}</td>
                  <td>{log.model}</td>
                  <td>{log.status}</td>
                  <td>{log.input_tokens + log.output_tokens}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  async function downloadAuditExport() {
    try {
      const response = await fetch("/api/trades/audit/export", {
        headers: {
          "x-trades-session": getTradesToken()
        }
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "trade-audit-export.md";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Audit export failed.");
    }
  }
}

function PositionsTable({ positions }: { positions: TradePosition[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Type</th>
            <th>Symbol</th>
            <th>Name</th>
            <th>Qty</th>
            <th>Value</th>
            <th>P/L basis</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((position) => (
            <tr key={position.id}>
              <td>{position.asset_type}</td>
              <td>{position.symbol}</td>
              <td>{position.name}</td>
              <td>{formatNumber(position.quantity)}</td>
              <td>{formatMoney(position.current_value || 0, position.currency)}</td>
              <td>{formatMoney(position.starting_cost_basis || 0, position.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TradeTab({ section, active, label }: { section: TradesSection; active: TradesSection; label: string }) {
  return (
    <button
      className={active === section ? "nav-button active" : "nav-button"}
      type="button"
      onClick={() => navigate(section === "dashboard" ? "/trades" : `/trades/${section}`)}
    >
      {label}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function recommendationToDraft(rec: TradeRecommendation) {
  return {
    recommendationId: rec.id,
    status: rec.action === "buy" || rec.action === "sell" ? "accepted" : "skipped",
    actualQuantity: rec.suggested_quantity ?? 0,
    actualPrice: rec.suggested_price ?? 0,
    actualFee: rec.suggested_fee ?? 1,
    actualCurrency: rec.price_currency || "EUR",
    notes: ""
  };
}

function normalizeSection(section: string): TradesSection {
  return ["dashboard", "import", "advice", "portfolio", "settings", "audit"].includes(section)
    ? (section as TradesSection)
    : "dashboard";
}

function formatMoney(value: number, currency = "EUR"): string {
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value || 0));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(Number(value || 0));
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

const defaultImportExample = `Cash: 1250 EUR

Apple | AAPL | US0378331005 | 3.5 shares | value 650 EUR
iShares Core MSCI World ETF | EUNL | IE00B4L5Y983 | 12 shares | value 1033 EUR`;
