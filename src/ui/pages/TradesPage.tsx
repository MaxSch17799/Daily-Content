import { Briefcase, ChevronDown, ChevronUp, Download, LogOut, Play, RefreshCw, Save, Search, Upload } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  AdviceRun,
  AdviceProgressLog,
  AuditLogListItem,
  ParsedHolding,
  TradeCandidateAsset,
  TradeBrokerFeeModel,
  TradeMarketQuote,
  TradePortfolioInfo,
  TradePortfolioSnapshot,
  TradePosition,
  TradeRecommendation,
  TradeSettings,
  TradeTransaction,
  clearTradesToken,
  commitPortfolioImport,
  confirmTradeAdvice,
  fetchAuditLogs,
  fetchTradeAdvice,
  fetchTradeAdviceProgress,
  fetchTradeTransactions,
  fetchTradesPortfolio,
  fetchTradesSession,
  fetchTradesSettings,
  getTradesToken,
  ignoreTradeAdvice,
  loginTrades,
  logoutTrades,
  parsePortfolioText,
  renderTradePrompt,
  refreshTradeQuotes,
  runTradeAdviceNow,
  saveTradeCandidates,
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
  portfolio: TradePortfolioInfo;
  latestAdvice: AdviceRun | null;
  snapshots: TradePortfolioSnapshot[];
  latestQuotes: TradeMarketQuote[];
}

interface AdviceInputDraft {
  recommendationId: string;
  status: string;
  actualAction: "none" | "buy" | "sell";
  actualQuantity: string;
  actualPrice: string;
  actualFee: string;
  actualCurrency: string;
  actualTradedAt: string;
  notes: string;
}

interface StockCorrectionDraft {
  mode: "buy" | "sell" | "set";
  assetType: "stock" | "etf" | "crypto";
  symbol: string;
  name: string;
  isin: string;
  quantity: string;
  targetQuantity: string;
  price: string;
  fee: string;
  currency: string;
  tradedAt: string;
  notes: string;
}

export function TradesPage({ section = "dashboard" }: TradesPageProps) {
  const activeSection = normalizeSection(section);
  const [unlocked, setUnlocked] = useState(false);
  const [loginPassword, setLoginPassword] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioState | null>(null);
  const [advice, setAdvice] = useState<{ run: AdviceRun | null; runs: AdviceRun[]; recommendations: TradeRecommendation[] }>({
    run: null,
    runs: [],
    recommendations: []
  });
  const [transactions, setTransactions] = useState<unknown[]>([]);
  const [settings, setSettings] = useState<TradeSettings | null>(null);
  const [tradePortfolio, setTradePortfolio] = useState<TradePortfolioInfo | null>(null);
  const [candidateAssets, setCandidateAssets] = useState<TradeCandidateAsset[]>([]);
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
      setTradePortfolio(settingsResult.portfolio || portfolioResult.portfolio);
      setCandidateAssets(settingsResult.candidateAssets || []);
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
          portfolio={portfolio}
          onRun={async () => {
            const result = await runTradeAdviceNow("normal");
            setMessage(result.alreadyRunning ? "Trade advice is already running." : "Trade advice workflow dispatched.");
            return result;
          }}
          onDeployCash={async () => {
            const result = await runTradeAdviceNow("deploy_all_cash");
            setMessage(result.alreadyRunning ? "Trade advice is already running." : "Deploy-all-cash advice workflow dispatched.");
            return result;
          }}
          onSaved={async () => {
            setMessage("Advice interaction saved.");
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
            setMessage("Portfolio saved.");
            await loadAll();
          }}
          onError={setError}
        />
      )}
      {activeSection === "settings" && settings && tradePortfolio && (
        <TradesSystemEditor
          settings={settings}
          portfolio={tradePortfolio}
          candidateAssets={candidateAssets}
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
  const { holdingsValue, cashValue, totalValue } = calculatePortfolioTotals(portfolio);
  const buys = advice.recommendations.filter((rec) => rec.action === "buy").length;
  const sells = advice.recommendations.filter((rec) => rec.action === "sell").length;

  return (
    <div className="trades-stack">
      <div className="metric-grid">
        <Metric label="Total value" value={formatMoney(totalValue, portfolio.portfolio.base_currency)} />
        <Metric label="Cash" value={formatMoney(cashValue, portfolio.portfolio.base_currency)} />
        <Metric label="Holdings" value={formatMoney(holdingsValue, portfolio.portfolio.base_currency)} />
        <Metric label="Latest advice" value={advice.run ? `${buys} buy / ${sells} sell` : "None"} />
      </div>
      <section className="trades-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Portfolio value</h2>
            <p>{portfolio.snapshots.length ? `Tracking ${portfolio.snapshots.length} saved snapshots.` : "Refresh prices to start a value chart."}</p>
          </div>
        </div>
        <PortfolioValueChart snapshots={portfolio.snapshots} currency={portfolio.portfolio.base_currency} />
      </section>
      <section className="trades-panel">
        <h2>Allocation</h2>
        <AllocationBreakdown portfolio={portfolio} />
      </section>
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

function PortfolioValueChart({ snapshots, currency }: { snapshots: TradePortfolioSnapshot[]; currency: string }) {
  const points = snapshots
    .filter((snapshot) => Number.isFinite(Number(snapshot.total_value)))
    .map((snapshot) => ({ ...snapshot, total_value: Number(snapshot.total_value) }));
  if (points.length === 0) {
    return <div className="empty-chart">No portfolio snapshots yet.</div>;
  }

  const width = 720;
  const height = 220;
  const padding = 28;
  const values = points.map((point) => point.total_value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.max(max, 1);
  const xStep = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const svgPoints = points
    .map((point, index) => {
      const x = points.length > 1 ? padding + index * xStep : width / 2;
      const y = height - padding - ((point.total_value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const change = last.total_value - first.total_value;

  return (
    <div className="portfolio-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio value over time">
        <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
        <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        <polyline points={svgPoints} />
        {points.map((point, index) => {
          const [x, y] = svgPoints.split(" ")[index].split(",").map(Number);
          return <circle key={point.id || `${point.created_at}-${index}`} cx={x} cy={y} r={4} />;
        })}
      </svg>
      <div className="chart-meta">
        <span>{formatDate(first.created_at)}</span>
        <strong>{formatMoney(last.total_value, currency)}</strong>
        <span className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{formatMoney(change, currency)}</span>
        <span>{formatDate(last.created_at)}</span>
      </div>
    </div>
  );
}

function AllocationBreakdown({ portfolio }: { portfolio: PortfolioState }) {
  const { cashValue, totalValue } = calculatePortfolioTotals(portfolio);
  const items = [
    { key: "cash", label: "Cash", value: cashValue, type: "cash" },
    ...portfolio.positions.map((position) => ({
      key: position.id,
      label: `${position.symbol} ${position.name}`,
      value: Number(position.current_value || 0),
      type: position.asset_type
    }))
  ].filter((item) => item.value > 0);

  if (items.length === 0) {
    return <p>No allocation data yet.</p>;
  }

  return (
    <div className="allocation-list">
      {items.map((item) => {
        const weight = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
        return (
          <div className="allocation-row" key={item.key}>
            <div className="allocation-label">
              <strong>{item.label}</strong>
              <span>{formatMoney(item.value, portfolio.portfolio.base_currency)} - {weight.toFixed(1)}%</span>
            </div>
            <div className="allocation-track" aria-hidden>
              <span className={`allocation-fill ${item.type}`} style={{ width: `${Math.max(2, Math.min(100, weight))}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LatestQuotesTable({ quotes }: { quotes: TradeMarketQuote[] }) {
  if (quotes.length === 0) {
    return <p>No saved quotes yet. Use Refresh prices after adding positions.</p>;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Symbol</th>
            <th>Price</th>
            <th>Provider</th>
            <th>Market time</th>
            <th>Fetched</th>
          </tr>
        </thead>
        <tbody>
          {quotes.map((quote) => (
            <tr key={quote.id}>
              <td>{quote.symbol}</td>
              <td>{formatMoney(quote.price, quote.currency)}</td>
              <td>{quote.provider_symbol} via {quote.provider}</td>
              <td>{quote.market_time ? formatDate(quote.market_time) : "-"}</td>
              <td>{formatDate(quote.fetched_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function calculatePortfolioTotals(portfolio: PortfolioState) {
  const holdingsValue = portfolio.positions.reduce((sum, position) => sum + Number(position.current_value || 0), 0);
  const cashValue = portfolio.cash.reduce((sum, cash) => sum + Number(cash.amount || 0), 0);
  return {
    holdingsValue,
    cashValue,
    totalValue: holdingsValue + cashValue
  };
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
  portfolio,
  onRun,
  onDeployCash,
  onSaved,
  onError
}: {
  advice: { run: AdviceRun | null; runs: AdviceRun[]; recommendations: TradeRecommendation[] };
  portfolio: PortfolioState | null;
  onRun: () => Promise<{ runId: string; status: string; alreadyRunning: boolean }>;
  onDeployCash: () => Promise<{ runId: string; status: string; alreadyRunning: boolean }>;
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [drafts, setDrafts] = useState(() => advice.recommendations.map((recommendation) => recommendationToDraft(recommendation)));
  const [running, setRunning] = useState(advice.run?.status === "queued" || advice.run?.status === "running");
  const [progressRunId, setProgressRunId] = useState(advice.run?.status === "queued" || advice.run?.status === "running" ? advice.run.id : "");
  const [progress, setProgress] = useState<{
    run: AdviceRun | null;
    logs: AdviceProgressLog[];
    recommendations: TradeRecommendation[];
    inputBatch: { id: string; status: string; submitted_at: string; updated_at: string; notes: string | null } | null;
    inputTransactions: TradeTransaction[];
  }>({ run: null, logs: [], recommendations: [], inputBatch: null, inputTransactions: [] });
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState(advice.run?.id || "");
  const [inputMode, setInputMode] = useState<"edit" | "view" | "ignore">("edit");
  const [adviceNote, setAdviceNote] = useState("");

  useEffect(() => {
    setDrafts(advice.recommendations.map((recommendation) => recommendationToDraft(recommendation)));
  }, [advice.recommendations]);

  useEffect(() => {
    if (advice.run?.id && !selectedRunId) {
      setSelectedRunId(advice.run.id);
    }
  }, [advice.run, selectedRunId]);

  useEffect(() => {
    if (progress.recommendations.length > 0) {
      setDrafts(progress.recommendations.map((recommendation) => recommendationToDraft(recommendation, progress.inputTransactions)));
    }
  }, [progress.inputTransactions, progress.recommendations]);

  useEffect(() => {
    const selectedRun = advice.runs.find((run) => run.id === selectedRunId) || advice.run;
    setAdviceNote(progress.inputBatch?.notes || selectedRun?.input_notes || "");
  }, [advice.run, advice.runs, progress.inputBatch, selectedRunId]);

  useEffect(() => {
    const activeRunId = advice.run && ["queued", "running"].includes(advice.run.status) ? advice.run.id : "";
    if (activeRunId && !progressRunId) {
      setProgressRunId(activeRunId);
      setRunning(true);
    }
  }, [advice.run, progressRunId]);

  useEffect(() => {
    if (!progressRunId || !running) {
      return;
    }
    let cancelled = false;
    async function poll() {
      try {
        const result = await fetchTradeAdviceProgress(progressRunId);
        if (cancelled) {
          return;
        }
        setProgress(result);
        if (result.run && ["success", "failed"].includes(result.run.status)) {
          setRunning(false);
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Could not load advice progress.");
        }
      }
    }
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [onError, progressRunId, running]);

  useEffect(() => {
    const runId = selectedRunId || advice.run?.id || "";
    if (!runId || running || progress.run?.id === runId) {
      return;
    }
    let cancelled = false;
    fetchTradeAdviceProgress(runId)
      .then((result) => {
        if (!cancelled) {
          setProgress(result);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Could not load advice details.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [advice.run?.id, onError, progress.run?.id, running, selectedRunId]);

  async function saveConfirmations() {
    const runForConfirm = progress.run || advice.run;
    if (!runForConfirm) {
      return;
    }
    try {
      await confirmTradeAdvice(
        runForConfirm.id,
        drafts.map((draft) => ({
          recommendationId: draft.recommendationId,
          status: draft.status,
          actualAction: draft.actualAction,
          actualQuantity: parseOptionalNumber(draft.actualQuantity),
          actualPrice: parseOptionalNumber(draft.actualPrice),
          actualFee: parseOptionalNumber(draft.actualFee),
          actualCurrency: draft.actualCurrency,
          actualTradedAt: draft.actualTradedAt,
          notes: draft.notes
        })),
        adviceNote
      );
      setConfirming(false);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save actual trades.");
    }
  }

  async function saveIgnoredAdvice() {
    const runForIgnore = progress.run || advice.run;
    if (!runForIgnore) {
      return;
    }
    try {
      await ignoreTradeAdvice(runForIgnore.id, adviceNote);
      setConfirming(false);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not ignore advice.");
    }
  }

  async function runNow(mode: "normal" | "deploy_all_cash") {
    setRunning(true);
    setDetailsOpen(true);
    setProgress({
      run: {
        id: "pending-dispatch",
        run_date: "",
        status: "queued",
        summary: null,
        benchmark_json: "{}",
        output_json: "{}",
        started_at: new Date().toISOString(),
        finished_at: null,
        message: mode === "deploy_all_cash" ? "Dispatching deploy-all-cash advice workflow." : "Dispatching GitHub workflow."
      },
      logs: [],
      recommendations: [],
      inputBatch: null,
      inputTransactions: []
    });
    try {
      const result = mode === "deploy_all_cash" ? await onDeployCash() : await onRun();
      setProgressRunId(result.runId);
      setSelectedRunId(result.runId);
      setProgress((current) => ({
        ...current,
        run: {
          ...(current.run || {
            run_date: "",
            summary: null,
            benchmark_json: "{}",
            output_json: "{}",
            started_at: new Date().toISOString(),
            finished_at: null
          }),
          id: result.runId,
          status: result.status,
          message: result.alreadyRunning
            ? "Existing advice run is already in progress."
            : mode === "deploy_all_cash"
              ? "Deploy-all-cash workflow queued. Waiting for GitHub Actions."
              : "Workflow queued. Waiting for GitHub Actions."
        } as AdviceRun
      }));
    } catch (err) {
      setRunning(false);
      onError(err instanceof Error ? err.message : "Could not start advice generation.");
    }
  }

  const visibleRun = progress.run || advice.run;
  const visibleRecommendations = progress.recommendations.length > 0 ? progress.recommendations : advice.recommendations;
  const steps = buildAdviceSteps(visibleRun, progress.logs, visibleRecommendations);
  const completedSteps = steps.filter((step) => step.state === "done").length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);
  const inputButtonLabel = visibleRun ? getInputButtonLabel(visibleRun, progress.inputBatch) : "Input actual trades";
  const inputStatus = progress.inputBatch?.status || visibleRun?.input_status || "";
  const inputIgnored = inputStatus === "ignored";
  const inputReadOnly = inputButtonLabel === "View input" || inputButtonLabel === "View ignored";
  const canIgnoreAdvice = Boolean(visibleRun && !inputReadOnly && !progress.inputBatch && !visibleRun.input_batch_id);
  const adviceInputSummary = calculateAdviceInputSummary(drafts, visibleRecommendations, portfolio);

  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <div className="panel-heading-row">
          <h2>Advice</h2>
          <button className="primary-button" type="button" onClick={() => void runNow("normal")} disabled={running}>
            <Play size={16} aria-hidden />
            {running ? "Generating advice..." : "Run advice now"}
          </button>
          <button className="secondary-button" type="button" onClick={() => void runNow("deploy_all_cash")} disabled={running}>
            <Play size={16} aria-hidden />
            Deploy all cash advice
          </button>
        </div>
        {advice.runs.length > 0 && (
          <div className="advice-history">
            {advice.runs.map((run) => (
              <button
                className={run.id === (visibleRun?.id || selectedRunId) ? "nav-button active" : "nav-button"}
                type="button"
                key={run.id}
                onClick={() => {
                  setSelectedRunId(run.id);
                  setProgressRunId("");
                  setRunning(["queued", "running"].includes(run.status));
                  setConfirming(false);
                  setProgress({ run, logs: [], recommendations: [], inputBatch: null, inputTransactions: [] });
                }}
              >
                {formatDate(run.started_at)}
                <small>{getInputButtonLabel(run, null)}</small>
              </button>
            ))}
          </div>
        )}
        {visibleRun && (running || progress.logs.length > 0 || detailsOpen) && (
          <AdviceProgressPanel
            run={visibleRun}
            logs={progress.logs}
            steps={steps}
            progressPercent={progressPercent}
            detailsOpen={detailsOpen}
            onToggleDetails={() => setDetailsOpen((current) => !current)}
          />
        )}
        {!visibleRun && <p>No advice has been generated yet.</p>}
        {visibleRun?.status === "failed" && <ErrorPanel message={visibleRun.message || "Advice generation failed."} />}
        {visibleRun && visibleRun.status !== "queued" && visibleRun.status !== "running" && (
          <>
            <p className="meta-line compact">
              <span>Advice date: {formatDate(visibleRun.started_at)}</span>
              {visibleRun.finished_at && <span>Completed: {formatDate(visibleRun.finished_at)}</span>}
            </p>
            <p>{visibleRun.summary || "Advice generated."}</p>
            <RunOutputSummary run={visibleRun} />
            <div className="recommendation-grid">
              {visibleRecommendations.map((rec) => (
                <article className="recommendation-card" key={rec.id}>
                  <span className={`trade-action ${rec.action}`}>{rec.action}</span>
                  <h3>
                    {rec.user_display_title || rec.symbol} <small>{rec.name}</small>
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
                    <div>
                      <dt>Cash math</dt>
                      <dd>{rec.cash_math || "-"}</dd>
                    </div>
                  </dl>
                  <RecommendationSources recommendation={rec} />
                </article>
              ))}
            </div>
            <div className="button-row">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setInputMode(inputReadOnly ? "view" : "edit");
                  setConfirming((current) => !current);
                }}
                disabled={inputButtonLabel === "No input"}
              >
                {inputButtonLabel}
              </button>
              {canIgnoreAdvice && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setInputMode("ignore");
                    setAdviceNote("");
                    setConfirming(true);
                  }}
                >
                  Ignore advice
                </button>
              )}
            </div>
          </>
        )}
      </section>
      {confirming && visibleRun && (
        <section className="trades-panel">
          <h2>{getInputPanelTitle(inputMode, inputIgnored, progress.inputBatch)}</h2>
          <label>
            {inputMode === "ignore" || inputIgnored ? "Ignore reason" : "Advice comment"}
            <textarea
              rows={3}
              disabled={inputMode === "view"}
              value={adviceNote}
              onChange={(event) => setAdviceNote(event.target.value)}
              placeholder={inputMode === "ignore" ? "Optional reason" : "Optional comment about what was actually done"}
            />
          </label>
          {inputMode !== "ignore" && !inputIgnored && (
            <div className="trades-stack">
              <div className="metric-grid compact-metrics">
                <Metric label="Cash before input" value={formatMoney(adviceInputSummary.cashBefore, adviceInputSummary.currency)} />
                <Metric label="Total buys" value={formatMoney(adviceInputSummary.buyGross, adviceInputSummary.currency)} />
                <Metric label="Total sells" value={formatMoney(adviceInputSummary.sellGross, adviceInputSummary.currency)} />
                <Metric label="Fees" value={formatMoney(adviceInputSummary.fees, adviceInputSummary.currency)} />
                <Metric label="Cash after input" value={formatMoney(adviceInputSummary.cashAfter, adviceInputSummary.currency)} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Symbol</th>
                      <th>Actual action</th>
                      <th>Qty</th>
                      <th>Price</th>
                      <th>Fee</th>
                      <th>Cash effect</th>
                      <th>Trade time</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((draft, index) => {
                      const rowMath = calculateAdviceDraftCashEffect(draft);
                      return (
                        <tr key={draft.recommendationId}>
                          <td>
                            <select
                              value={draft.status}
                              disabled={inputMode === "view"}
                              onChange={(event) => updateDraft(index, "status", event.target.value)}
                            >
                              <option value="accepted">Done</option>
                              <option value="edited">Edited</option>
                              <option value="partial">Partial</option>
                              <option value="skipped">Skipped</option>
                              <option value="unavailable">Unavailable</option>
                            </select>
                          </td>
                          <td>{visibleRecommendations[index]?.symbol}</td>
                          <td>
                            <select
                              value={draft.actualAction}
                              disabled={inputMode === "view"}
                              onChange={(event) => updateDraft(index, "actualAction", event.target.value as AdviceInputDraft["actualAction"])}
                            >
                              <option value="none">No trade</option>
                              <option value="buy">Buy</option>
                              <option value="sell">Sell</option>
                            </select>
                          </td>
                          <td>
                            <input
                              type="number"
                              inputMode="decimal"
                              disabled={inputMode === "view" || draft.actualAction === "none"}
                              value={draft.actualQuantity}
                              onChange={(event) => updateDraft(index, "actualQuantity", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              inputMode="decimal"
                              disabled={inputMode === "view" || draft.actualAction === "none"}
                              value={draft.actualPrice}
                              onChange={(event) => updateDraft(index, "actualPrice", event.target.value)}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              inputMode="decimal"
                              disabled={inputMode === "view" || draft.actualAction === "none"}
                              value={draft.actualFee}
                              onChange={(event) => updateDraft(index, "actualFee", event.target.value)}
                            />
                          </td>
                          <td>{formatMoney(rowMath.cashEffect, draft.actualCurrency || adviceInputSummary.currency)}</td>
                          <td>
                            <input
                              type="datetime-local"
                              disabled={inputMode === "view"}
                              value={toDateTimeLocal(draft.actualTradedAt)}
                              onChange={(event) => updateDraft(index, "actualTradedAt", fromDateTimeLocal(event.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              disabled={inputMode === "view"}
                              value={draft.notes ?? ""}
                              onChange={(event) => updateDraft(index, "notes", event.target.value)}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {inputMode === "ignore" && (
            <button className="primary-button" type="button" onClick={() => void saveIgnoredAdvice()}>
              Save ignored advice
            </button>
          )}
          {inputMode === "edit" && (
            <button className="primary-button" type="button" onClick={() => void saveConfirmations()}>
              Save actual trades
            </button>
          )}
        </section>
      )}
    </div>
  );

  function updateDraft<K extends keyof AdviceInputDraft>(index: number, key: K, value: AdviceInputDraft[K]) {
    setDrafts((current) => current.map((draft, currentIndex) => (currentIndex === index ? { ...draft, [key]: value } : draft)));
  }
}

function AdviceProgressPanel({
  run,
  logs,
  steps,
  progressPercent,
  detailsOpen,
  onToggleDetails
}: {
  run: AdviceRun | null;
  logs: AdviceProgressLog[];
  steps: Array<{ label: string; description: string; state: "done" | "active" | "pending" }>;
  progressPercent: number;
  detailsOpen: boolean;
  onToggleDetails: () => void;
}) {
  return (
    <div className="advice-progress">
      <div className="progress-bar" aria-label="Advice generation progress">
        <span style={{ width: `${progressPercent}%` }} />
      </div>
      <div className="progress-steps">
        {steps.map((step) => (
          <div className={`progress-step ${step.state}`} key={step.label}>
            <strong>{step.label}</strong>
            <span>{step.description}</span>
          </div>
        ))}
      </div>
      <div className="progress-current">
        <strong>Waiting on</strong>
        <span>{run?.message || "Waiting for the next generator update."}</span>
      </div>
      <button className="secondary-button" type="button" onClick={onToggleDetails}>
        {detailsOpen ? <ChevronUp size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
        {detailsOpen ? "Hide AI details" : "Show AI details"}
      </button>
      {detailsOpen && (
        <div className="ai-live-details">
          {logs.length === 0 && <p>The AI prompt will appear here as soon as the generator starts the OpenAI call.</p>}
          {logs.map((log) => (
            <article className="ai-log-card" key={log.id}>
              <div className="panel-heading-row">
                <h3>{log.call_type}</h3>
                <span className={`trade-action ${log.status}`}>{log.status}</span>
              </div>
              <label>
                Prompt sent
                <textarea rows={8} readOnly value={log.prompt_text || ""} />
              </label>
              <label>
                Response received
                <textarea rows={8} readOnly value={formatJsonText(log.parsed_output_json || log.raw_response_json)} />
              </label>
              {log.validation_error && <ErrorPanel message={log.validation_error} />}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function RunOutputSummary({ run }: { run: AdviceRun }) {
  const output = parseJsonObject(run.output_json);
  const executionOrder = Array.isArray(output.execution_order) ? output.execution_order : [];
  const cashAfterPlan = typeof output.cash_after_plan === "number" ? output.cash_after_plan : null;
  const cashReason = typeof output.cash_position_reason === "string" ? output.cash_position_reason : "";
  const benchmark = output.benchmark && typeof output.benchmark === "object" ? (output.benchmark as Record<string, unknown>) : null;
  return (
    <div className="advice-summary-grid">
      <Metric label="Cash after plan" value={cashAfterPlan === null ? "-" : formatMoney(cashAfterPlan)} />
      <Metric label="Fees" value={typeof output.estimated_total_fees === "number" ? formatMoney(output.estimated_total_fees) : "-"} />
      {cashReason && (
        <div className="summary-note">
          <strong>Cash reserve</strong>
          <span>{cashReason}</span>
        </div>
      )}
      {benchmark && (
        <div className="summary-note">
          <strong>Benchmark</strong>
          <span>{String(benchmark.comparison_summary || "No benchmark summary.")}</span>
        </div>
      )}
      {executionOrder.length > 0 && (
        <div className="summary-note wide">
          <strong>Execution order</strong>
          <span>{executionOrder.join(" -> ")}</span>
        </div>
      )}
    </div>
  );
}

function RecommendationSources({ recommendation }: { recommendation: TradeRecommendation }) {
  const sources = parseJsonArray(recommendation.sources_json);
  if (sources.length === 0) {
    return null;
  }
  return (
    <div className="source-list">
      <strong>Sources</strong>
      {sources.slice(0, 3).map((source, index) => {
        const item = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
        const url = String(item.url || "");
        return (
          <a key={`${url}-${index}`} href={url || undefined} target="_blank" rel="noreferrer">
            {String(item.title || url || "Source")}
          </a>
        );
      })}
    </div>
  );
}

function buildAdviceSteps(
  run: AdviceRun | null,
  logs: AdviceProgressLog[],
  recommendations: TradeRecommendation[]
): Array<{ label: string; description: string; state: "done" | "active" | "pending" }> {
  const status = run?.status || "pending";
  const hasWebPrompt = logs.some((log) => log.call_type === "web_context");
  const webDone = logs.some((log) => log.call_type === "web_context" && log.status === "success");
  const hasAdvicePrompt = logs.some((log) => log.call_type === "advice_json");
  const adviceDone = logs.some((log) => log.call_type === "advice_json" && log.status === "success");
  const done = status === "success";
  const failed = status === "failed";

  return [
    {
      label: "Dispatch",
      description: "Queue the GitHub Actions workflow and create a D1 run.",
      state: run ? "done" : "active"
    },
    {
      label: "Portfolio",
      description: "Load cash, positions, and quote data.",
      state: hasWebPrompt || hasAdvicePrompt || done ? "done" : run ? "active" : "pending"
    },
    {
      label: "News",
      description: "Ask OpenAI for current market context using the configured web-search mode.",
      state: webDone ? "done" : hasWebPrompt ? "active" : "pending"
    },
    {
      label: "Quote ideas",
      description: "Extract tickers from the web brief and fetch free public quotes for possible buys.",
      state: hasAdvicePrompt ? "done" : webDone ? "active" : "pending"
    },
    {
      label: "Prompt",
      description: "Build the structured recommendation prompt with settings, cash, discovered quotes, history, and unavailable assets.",
      state: hasAdvicePrompt ? "done" : webDone ? "active" : "pending"
    },
    {
      label: "Advice JSON",
      description: "Wait for strict buy/sell/hold JSON with quantities, cash math, reasons, and sources.",
      state: adviceDone ? "done" : hasAdvicePrompt ? "active" : "pending"
    },
    {
      label: "Save",
      description: "Save recommendations and notify the phone.",
      state: done ? "done" : adviceDone || recommendations.length > 0 ? "active" : failed ? "done" : "pending"
    }
  ];
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
  const [cashAmount, setCashAmount] = useState("");
  const [cashType, setCashType] = useState("deposit");
  const [refreshingPrices, setRefreshingPrices] = useState(false);
  const [stockDraft, setStockDraft] = useState<StockCorrectionDraft>(() => defaultStockCorrectionDraft());
  const stockMath = calculateStockCorrection(stockDraft, portfolio);

  async function saveCash(event: FormEvent) {
    event.preventDefault();
    const amount = parseNumberInput(cashAmount);
    try {
      await saveTradeTransaction({
        type: cashType,
        gross_amount: amount,
        cash_effect: cashType === "withdrawal" ? -Math.abs(amount) : Math.abs(amount),
        currency: "EUR",
        notes: "Manual cash correction"
      });
      setCashAmount("");
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save cash transaction.");
    }
  }

  async function saveStockCorrection(event: FormEvent) {
    event.preventDefault();
    if (!stockMath.action || stockMath.quantity <= 0) {
      onError("Stock correction needs a non-zero quantity change.");
      return;
    }
    if (stockMath.price <= 0) {
      onError("Stock correction needs an actual price.");
      return;
    }
    try {
      await saveTradeTransaction({
        type: stockMath.action,
        asset_type: stockDraft.assetType,
        symbol: stockDraft.symbol.trim().toUpperCase(),
        name: stockDraft.name.trim() || stockMath.existing?.name || stockDraft.symbol.trim().toUpperCase(),
        isin: stockDraft.isin.trim() || stockMath.existing?.isin || undefined,
        quantity: stockMath.quantity,
        price: stockMath.price,
        gross_amount: stockMath.gross,
        fee: stockMath.fee,
        currency: stockDraft.currency || portfolio.portfolio.base_currency,
        cash_effect: stockMath.cashEffect,
        notes: stockDraft.notes || `Stock correction: ${stockDraft.mode}`,
        traded_at: stockDraft.tradedAt
      });
      setStockDraft(defaultStockCorrectionDraft());
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save stock correction.");
    }
  }

  async function refreshPrices() {
    try {
      setRefreshingPrices(true);
      await refreshTradeQuotes();
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not refresh prices.");
    } finally {
      setRefreshingPrices(false);
    }
  }

  return (
    <div className="trades-stack">
      <section className="trades-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Portfolio chart</h2>
            <p>Snapshots are saved when advice runs and when prices are refreshed.</p>
          </div>
          <button className="primary-button" type="button" onClick={() => void refreshPrices()} disabled={refreshingPrices}>
            <RefreshCw size={16} aria-hidden />
            {refreshingPrices ? "Refreshing..." : "Refresh prices"}
          </button>
        </div>
        <PortfolioValueChart snapshots={portfolio.snapshots} currency={portfolio.portfolio.base_currency} />
      </section>
      <section className="trades-panel">
        <h2>Allocation</h2>
        <AllocationBreakdown portfolio={portfolio} />
      </section>
      <section className="trades-panel">
        <h2>Positions</h2>
        <PositionsTable positions={portfolio.positions} />
      </section>
      <section className="trades-panel">
        <h2>Latest quotes</h2>
        <LatestQuotesTable quotes={portfolio.latestQuotes} />
      </section>
      <section className="trades-panel">
        <h2>Cash correction</h2>
        <form className="inline-form" onSubmit={(event) => void saveCash(event)}>
          <select value={cashType} onChange={(event) => setCashType(event.target.value)}>
            <option value="deposit">Deposit</option>
            <option value="withdrawal">Withdrawal</option>
          </select>
          <input type="number" inputMode="decimal" value={cashAmount} onChange={(event) => setCashAmount(event.target.value)} />
          <button className="primary-button" type="submit">
            Save
          </button>
        </form>
      </section>
      <section className="trades-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Stock correction</h2>
            <p>Add a buy, reduce with a sell, or set the final quantity for a holding.</p>
          </div>
        </div>
        <form className="stock-correction-grid" onSubmit={(event) => void saveStockCorrection(event)}>
          <label>
            Correction
            <select value={stockDraft.mode} onChange={(event) => setStockField("mode", event.target.value as StockCorrectionDraft["mode"])}>
              <option value="buy">Buy / add</option>
              <option value="sell">Sell / reduce</option>
              <option value="set">Set final quantity</option>
            </select>
          </label>
          <label>
            Type
            <select
              value={stockDraft.assetType}
              onChange={(event) => setStockField("assetType", event.target.value as StockCorrectionDraft["assetType"])}
            >
              <option value="stock">Stock</option>
              <option value="etf">ETF</option>
              <option value="crypto">Crypto</option>
            </select>
          </label>
          <label>
            Symbol
            <input value={stockDraft.symbol} onChange={(event) => updateStockSymbol(event.target.value)} placeholder="SAP" />
          </label>
          <label>
            Name
            <input value={stockDraft.name} onChange={(event) => setStockField("name", event.target.value)} placeholder="SAP SE" />
          </label>
          <label>
            ISIN
            <input value={stockDraft.isin} onChange={(event) => setStockField("isin", event.target.value.toUpperCase())} />
          </label>
          {stockDraft.mode === "set" ? (
            <label>
              Final quantity
              <input
                type="number"
                inputMode="decimal"
                value={stockDraft.targetQuantity}
                onChange={(event) => setStockField("targetQuantity", event.target.value)}
              />
            </label>
          ) : (
            <label>
              Quantity
              <input
                type="number"
                inputMode="decimal"
                value={stockDraft.quantity}
                onChange={(event) => setStockField("quantity", event.target.value)}
              />
            </label>
          )}
          <label>
            Price
            <input type="number" inputMode="decimal" value={stockDraft.price} onChange={(event) => setStockField("price", event.target.value)} />
          </label>
          <label>
            Fee
            <input type="number" inputMode="decimal" value={stockDraft.fee} onChange={(event) => setStockField("fee", event.target.value)} />
          </label>
          <label>
            Currency
            <input value={stockDraft.currency} onChange={(event) => setStockField("currency", event.target.value.toUpperCase())} />
          </label>
          <label>
            Trade time
            <input
              type="datetime-local"
              value={toDateTimeLocal(stockDraft.tradedAt)}
              onChange={(event) => setStockField("tradedAt", fromDateTimeLocal(event.target.value))}
            />
          </label>
          <label className="settings-wide">
            Notes
            <input value={stockDraft.notes} onChange={(event) => setStockField("notes", event.target.value)} />
          </label>
          <div className="settings-wide metric-grid compact-metrics">
            <Metric label="Current quantity" value={formatNumber(stockMath.currentQuantity)} />
            <Metric label="Quantity change" value={`${stockMath.action === "sell" ? "-" : stockMath.action === "buy" ? "+" : ""}${formatNumber(stockMath.quantity)}`} />
            <Metric label="Gross amount" value={formatMoney(stockMath.gross, stockDraft.currency || portfolio.portfolio.base_currency)} />
            <Metric label="Cash effect" value={formatMoney(stockMath.cashEffect, stockDraft.currency || portfolio.portfolio.base_currency)} />
            <Metric label="Cash after" value={formatMoney(stockMath.cashAfter, stockDraft.currency || portfolio.portfolio.base_currency)} />
          </div>
          {stockMath.warning && (
            <div className="settings-wide">
              <ErrorPanel message={stockMath.warning} />
            </div>
          )}
          <button className="primary-button" type="submit">
            <Save size={16} aria-hidden />
            Save stock correction
          </button>
        </form>
      </section>
      <section className="trades-panel">
        <h2>Transactions</h2>
        <pre className="json-preview">{JSON.stringify(transactions.slice(0, 30), null, 2)}</pre>
      </section>
    </div>
  );

  function setStockField<K extends keyof StockCorrectionDraft>(key: K, value: StockCorrectionDraft[K]) {
    setStockDraft((current) => ({ ...current, [key]: value }));
  }

  function updateStockSymbol(value: string) {
    const symbol = value.toUpperCase();
    const existing = portfolio.positions.find((position) => position.symbol.toUpperCase() === symbol);
    setStockDraft((current) => ({
      ...current,
      symbol,
      name: current.name || existing?.name || "",
      isin: current.isin || existing?.isin || "",
      assetType: (existing?.asset_type as StockCorrectionDraft["assetType"]) || current.assetType,
      currency: existing?.currency || current.currency
    }));
  }
}

function defaultStockCorrectionDraft(): StockCorrectionDraft {
  return {
    mode: "buy",
    assetType: "stock",
    symbol: "",
    name: "",
    isin: "",
    quantity: "",
    targetQuantity: "",
    price: "",
    fee: "1",
    currency: "EUR",
    tradedAt: new Date().toISOString(),
    notes: ""
  };
}

function calculateStockCorrection(draft: StockCorrectionDraft, portfolio: PortfolioState) {
  const symbol = draft.symbol.trim().toUpperCase();
  const existing = portfolio.positions.find((position) => position.symbol.toUpperCase() === symbol);
  const currentQuantity = Number(existing?.quantity || 0);
  const cashBefore = portfolio.cash.reduce((sum, cash) => sum + Number(cash.amount || 0), 0);
  const price = parseNumberInput(draft.price);
  const fee = parseNumberInput(draft.fee);
  let action: "buy" | "sell" | null = draft.mode === "buy" ? "buy" : draft.mode === "sell" ? "sell" : null;
  let quantity = parseNumberInput(draft.quantity);

  if (draft.mode === "set") {
    const targetQuantity = parseNumberInput(draft.targetQuantity);
    const delta = targetQuantity - currentQuantity;
    action = delta > 0 ? "buy" : delta < 0 ? "sell" : null;
    quantity = Math.abs(delta);
  }

  const gross = quantity * price;
  const cashEffect = action === "buy" ? -(gross + fee) : action === "sell" ? gross - fee : 0;
  const warning =
    action === "sell" && quantity > currentQuantity
      ? "This sell/reduction is larger than the current position."
      : action === "buy" && cashBefore + cashEffect < 0
        ? "This buy would make the cash balance negative."
        : "";

  return {
    existing,
    currentQuantity,
    action,
    quantity,
    price,
    fee: action ? fee : 0,
    gross,
    cashEffect,
    cashAfter: cashBefore + cashEffect,
    warning
  };
}

function TradesSystemEditor({
  settings,
  portfolio,
  candidateAssets,
  onSaved,
  onError
}: {
  settings: TradeSettings;
  portfolio: TradePortfolioInfo;
  candidateAssets: TradeCandidateAsset[];
  onSaved: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [portfolioDraft, setPortfolioDraft] = useState(portfolio);
  const [candidateDrafts, setCandidateDrafts] = useState(candidateAssets);
  const [promptText, setPromptText] = useState(settings.prompt_text || "");
  const [promptMode, setPromptMode] = useState<"settings" | "manual">(hasManualPrompt(settings) ? "manual" : "settings");
  const [renderingPrompt, setRenderingPrompt] = useState(false);

  useEffect(() => {
    setDraft(settings);
    setPortfolioDraft(portfolio);
    setCandidateDrafts(candidateAssets);
    setPromptMode(hasManualPrompt(settings) ? "manual" : "settings");
    setPromptText(settings.prompt_text || "");
  }, [candidateAssets, portfolio, settings]);

  useEffect(() => {
    if (promptMode !== "settings") {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setRenderingPrompt(true);
        const result = await renderTradePrompt(draft, portfolioDraft);
        if (!cancelled) {
          setPromptText(result.promptText);
        }
      } catch (err) {
        if (!cancelled) {
          onError(err instanceof Error ? err.message : "Could not render prompt.");
        }
      } finally {
        if (!cancelled) {
          setRenderingPrompt(false);
        }
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [draft, onError, portfolioDraft, promptMode]);

  async function renderPromptNow() {
    try {
      setRenderingPrompt(true);
      const result = await renderTradePrompt(draft, portfolioDraft);
      setPromptText(result.promptText);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not render prompt.");
    } finally {
      setRenderingPrompt(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      if (promptMode === "settings") {
        await saveTradesSettings({ ...draft, prompt_text: "", overridden_settings_json: [], portfolio: portfolioDraft });
      } else {
        await saveTradePrompt(promptText, ["manual_prompt"]);
      }
      await saveTradeCandidates(candidateDrafts);
      await onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save settings.");
    }
  }

  return (
    <form className="trades-stack" onSubmit={(event) => void save(event)}>
      <fieldset className={`trades-panel settings-grid ${promptMode === "manual" ? "disabled-panel" : ""}`} disabled={promptMode === "manual"}>
        <legend>Settings</legend>
        <label>
          Trading platform
          <select value={portfolioDraft.broker_key || "trade_republic"} onChange={(event) => applyBrokerPreset(event.target.value)}>
            <option value="trade_republic">Trade Republic</option>
            <option value="etoro">eToro</option>
            <option value="custom">Custom</option>
          </select>
        </label>
        <label>
          Broker name
          <input value={portfolioDraft.broker || ""} onChange={(event) => setPortfolioDraftField("broker", event.target.value)} />
        </label>
        <label>
          Base currency
          <input value={portfolioDraft.base_currency || "EUR"} onChange={(event) => setPortfolioDraftField("base_currency", event.target.value.toUpperCase())} />
        </label>
        <label>
          Fixed order fee
          <input
            type="number"
            value={Number(parseBrokerFeeModel(portfolioDraft).fixed_order_fee ?? portfolioDraft.fee_per_trade ?? 0)}
            onChange={(event) => setBrokerFeeField("fixed_order_fee", Number(event.target.value))}
          />
        </label>
        <label>
          Percent fee
          <input
            type="number"
            value={Number(parseBrokerFeeModel(portfolioDraft).percent_order_fee ?? 0)}
            onChange={(event) => setBrokerFeeField("percent_order_fee", Number(event.target.value))}
          />
        </label>
        <label>
          Minimum fee
          <input
            type="number"
            value={Number(parseBrokerFeeModel(portfolioDraft).minimum_order_fee ?? 0)}
            onChange={(event) => setBrokerFeeField("minimum_order_fee", Number(event.target.value))}
          />
        </label>
        <label>
          Crypto fee %
          <input
            type="number"
            value={Number(parseBrokerFeeModel(portfolioDraft).crypto_percent_fee ?? 0)}
            onChange={(event) => setBrokerFeeField("crypto_percent_fee", Number(event.target.value))}
          />
        </label>
        <label>
          Pricing source
          <input value={portfolioDraft.broker_pricing_url || ""} onChange={(event) => setPortfolioDraftField("broker_pricing_url", event.target.value)} />
        </label>
        <label className="settings-wide">
          Broker notes
          <textarea
            rows={3}
            value={String(parseBrokerFeeModel(portfolioDraft).notes || "")}
            onChange={(event) => setBrokerFeeField("notes", event.target.value)}
          />
        </label>
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
            checked={Number(draft.stocks_enabled) === 1}
            onChange={(event) => setDraftField("stocks_enabled", event.target.checked ? 1 : 0)}
          />
          Stocks
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Number(draft.etfs_enabled) === 1}
            onChange={(event) => setDraftField("etfs_enabled", event.target.checked ? 1 : 0)}
          />
          ETFs
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Number(draft.crypto_enabled) === 1}
            onChange={(event) => setDraftField("crypto_enabled", event.target.checked ? 1 : 0)}
          />
          Crypto
        </label>
      </fieldset>
      <section className="trades-panel">
        <div className="panel-heading-row">
          <div>
            <h2>{promptMode === "settings" ? "Settings prompt" : "Manual prompt"}</h2>
            <p>{renderingPrompt ? "Updating prompt preview..." : "This is the instruction prompt used before runtime portfolio/news data is appended."}</p>
          </div>
          <button className="secondary-button" type="button" onClick={() => void renderPromptNow()} disabled={promptMode === "manual"}>
            Update prompt
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setPromptMode((current) => (current === "settings" ? "manual" : "settings"));
            }}
          >
            {promptMode === "settings" ? "Manual prompt" : "Settings prompt"}
          </button>
        </div>
        <textarea rows={18} value={promptText} readOnly={promptMode === "settings"} onChange={(event) => setPromptText(event.target.value)} />
      </section>
      <section className="trades-panel">
        <div className="panel-heading-row">
          <div>
            <h2>Seed ideas</h2>
            <p>Optional watchlist seeds with quotes/manual prices. The AI can still suggest other enabled assets and mark availability as needs_check.</p>
          </div>
          <button className="secondary-button" type="button" onClick={addCandidate}>
            Add seed
          </button>
        </div>
        <div className="table-wrap candidate-table">
          <table>
            <thead>
              <tr>
                <th>On</th>
                <th>Type</th>
                <th>Symbol</th>
                <th>Name</th>
                <th>Provider symbol</th>
                <th>TR</th>
                <th>Manual price</th>
                <th>Notes</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidateDrafts.map((candidate, index) => (
                <tr key={candidate.id || index}>
                  <td>
                    <input
                      type="checkbox"
                      checked={Number(candidate.enabled) === 1}
                      onChange={(event) => updateCandidate(index, "enabled", event.target.checked ? 1 : 0)}
                    />
                  </td>
                  <td>
                    <select
                      value={candidate.asset_type}
                      onChange={(event) => updateCandidate(index, "asset_type", event.target.value as TradeCandidateAsset["asset_type"])}
                    >
                      <option value="stock">Stock</option>
                      <option value="etf">ETF</option>
                      <option value="crypto">Crypto</option>
                    </select>
                  </td>
                  <td>
                    <input value={candidate.symbol} onChange={(event) => updateCandidate(index, "symbol", event.target.value.toUpperCase())} />
                  </td>
                  <td>
                    <input value={candidate.name} onChange={(event) => updateCandidate(index, "name", event.target.value)} />
                  </td>
                  <td>
                    <input value={candidate.provider_symbol || ""} onChange={(event) => updateCandidate(index, "provider_symbol", event.target.value)} />
                  </td>
                  <td>
                    <select
                      value={candidate.trade_republic_availability}
                      onChange={(event) => updateCandidate(index, "trade_republic_availability", event.target.value)}
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="likely">Likely</option>
                      <option value="needs_check">Needs check</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={candidate.manual_price ?? ""}
                      onChange={(event) => updateCandidate(index, "manual_price", event.target.value ? Number(event.target.value) : null)}
                    />
                  </td>
                  <td>
                    <input value={candidate.notes || ""} onChange={(event) => updateCandidate(index, "notes", event.target.value)} />
                  </td>
                  <td>
                    <button className="secondary-button" type="button" onClick={() => removeCandidate(index)}>
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <button className="primary-button" type="submit">
        <Save size={16} aria-hidden />
        {promptMode === "settings" ? "Save settings" : "Save manual prompt"}
      </button>
    </form>
  );

  function setDraftField<K extends keyof TradeSettings>(key: K, value: TradeSettings[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setPortfolioDraftField<K extends keyof TradePortfolioInfo>(key: K, value: TradePortfolioInfo[K]) {
    setPortfolioDraft((current) => ({ ...current, [key]: value }));
  }

  function setBrokerFeeField(key: keyof TradeBrokerFeeModel, value: string | number) {
    setPortfolioDraft((current) => {
      const feeModel = { ...parseBrokerFeeModel(current), [key]: value };
      const nextFixedFee = Number(feeModel.fixed_order_fee ?? current.fee_per_trade ?? 0);
      return {
        ...current,
        fee_per_trade: Number.isFinite(nextFixedFee) ? nextFixedFee : current.fee_per_trade,
        fee_model_json: JSON.stringify(feeModel),
        broker_pricing_url:
          key === "pricing_source_url" && typeof value === "string" ? value : current.broker_pricing_url
      };
    });
  }

  function applyBrokerPreset(key: string) {
    const preset = clientBrokerPreset(key);
    setPortfolioDraft((current) => ({
      ...current,
      broker_key: preset.broker_key,
      broker: preset.broker,
      fee_per_trade: preset.fee_per_trade,
      fee_model_json: JSON.stringify(preset.fee_model),
      broker_pricing_url: preset.broker_pricing_url,
      broker_updated_at: new Date().toISOString()
    }));
  }

  function addCandidate() {
    setCandidateDrafts((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        portfolio_id: settings.portfolio_id,
        enabled: 1,
        asset_type: "stock",
        symbol: "",
        name: "",
        isin: null,
        provider: "stooq",
        provider_symbol: "",
        trade_republic_availability: "needs_check",
        source: "manual",
        manual_price: null,
        price_currency: "EUR",
        manual_price_updated_at: null,
        notes: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ]);
  }

  function updateCandidate<K extends keyof TradeCandidateAsset>(index: number, key: K, value: TradeCandidateAsset[K]) {
    setCandidateDrafts((current) =>
      current.map((candidate, candidateIndex) => (candidateIndex === index ? { ...candidate, [key]: value } : candidate))
    );
  }

  function removeCandidate(index: number) {
    setCandidateDrafts((current) => current.filter((_, candidateIndex) => candidateIndex !== index));
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

function recommendationToDraft(rec: TradeRecommendation, inputTransactions: TradeTransaction[] = []): AdviceInputDraft {
  const input = inputTransactions.find((transaction) => transaction.recommendation_id === rec.id);
  const status = input ? "accepted" : rec.status && rec.status !== "pending" ? rec.status : rec.action === "buy" || rec.action === "sell" ? "accepted" : "skipped";
  const actualAction = input?.type === "buy" || input?.type === "sell" ? input.type : rec.action === "buy" || rec.action === "sell" ? rec.action : "none";
  return {
    recommendationId: rec.id,
    status,
    actualAction,
    actualQuantity: input?.quantity === null || input?.quantity === undefined ? numberInputValue(rec.suggested_quantity) : numberInputValue(input.quantity),
    actualPrice: input?.price === null || input?.price === undefined ? numberInputValue(rec.suggested_price) : numberInputValue(input.price),
    actualFee: input?.fee === null || input?.fee === undefined ? numberInputValue(rec.suggested_fee ?? 1) : numberInputValue(input.fee),
    actualCurrency: input?.currency || rec.price_currency || "EUR",
    actualTradedAt: input?.traded_at || new Date().toISOString(),
    notes: input?.notes || ""
  };
}

function calculateAdviceInputSummary(
  drafts: AdviceInputDraft[],
  recommendations: TradeRecommendation[],
  portfolio: PortfolioState | null
) {
  const currency = portfolio?.portfolio.base_currency || "EUR";
  const cashBefore = portfolio?.cash.reduce((sum, cash) => sum + Number(cash.amount || 0), 0) ?? 0;
  const rows = drafts.map((draft, index) => ({
    recommendation: recommendations[index],
    ...calculateAdviceDraftCashEffect(draft)
  }));
  const buyGross = rows.filter((row) => row.action === "buy").reduce((sum, row) => sum + row.gross, 0);
  const sellGross = rows.filter((row) => row.action === "sell").reduce((sum, row) => sum + row.gross, 0);
  const fees = rows.reduce((sum, row) => sum + row.fee, 0);
  const cashEffect = rows.reduce((sum, row) => sum + row.cashEffect, 0);
  return {
    currency,
    cashBefore,
    buyGross,
    sellGross,
    fees,
    cashEffect,
    cashAfter: cashBefore + cashEffect
  };
}

function calculateAdviceDraftCashEffect(draft: AdviceInputDraft): {
  action: "buy" | "sell" | "none";
  quantity: number;
  price: number;
  fee: number;
  gross: number;
  cashEffect: number;
} {
  if (!["accepted", "edited", "partial"].includes(draft.status) || draft.actualAction === "none") {
    return { action: "none", quantity: 0, price: 0, fee: 0, gross: 0, cashEffect: 0 };
  }
  const quantity = parseNumberInput(draft.actualQuantity);
  const price = parseNumberInput(draft.actualPrice);
  const fee = parseNumberInput(draft.actualFee);
  const gross = quantity * price;
  return {
    action: draft.actualAction,
    quantity,
    price,
    fee,
    gross,
    cashEffect: draft.actualAction === "buy" ? -(gross + fee) : gross - fee
  };
}

function getInputButtonLabel(
  run: AdviceRun,
  inputBatch: { id: string; status: string; submitted_at: string; updated_at: string; notes: string | null } | null
): "Input actual trades" | "Edit input" | "View input" | "View ignored" | "No input" {
  const status = inputBatch?.status || run.input_status || "";
  if (status === "ignored") {
    return "View ignored";
  }
  const hasInput = Boolean(inputBatch || run.input_batch_id);
  const hasNewerInput = Number(run.has_newer_input || 0) === 1;
  if (hasInput && hasNewerInput) {
    return "View input";
  }
  if (hasInput) {
    return "Edit input";
  }
  if (hasNewerInput) {
    return "No input";
  }
  return "Input actual trades";
}

function getInputPanelTitle(
  inputMode: "edit" | "view" | "ignore",
  inputIgnored: boolean,
  inputBatch: { id: string; status: string; submitted_at: string; updated_at: string; notes: string | null } | null
): string {
  if (inputMode === "ignore") {
    return "Ignore advice";
  }
  if (inputIgnored) {
    return "Ignored advice";
  }
  if (inputMode === "view") {
    return "View input";
  }
  return inputBatch ? "Edit input" : "Input actual trades";
}

function toDateTimeLocal(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string {
  if (!value) {
    return new Date().toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function normalizeSection(section: string): TradesSection {
  return ["dashboard", "import", "advice", "portfolio", "settings", "audit"].includes(section)
    ? (section as TradesSection)
    : "dashboard";
}

function formatMoney(value: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(Number(value || 0));
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency || "EUR"}`;
  }
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 6 }).format(Number(value || 0));
}

function numberInputValue(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    return "";
  }
  return String(Number(value));
}

function parseNumberInput(value: string | number | null | undefined): number {
  if (value === "" || value === null || value === undefined) {
    return 0;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function parseOptionalNumber(value: string | number | null | undefined): number | undefined {
  if (value === "" || value === null || value === undefined) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatJsonText(value: string): string {
  if (!value) {
    return "";
  }
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value: string | null): unknown[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasManualPrompt(settings: TradeSettings): boolean {
  return parseJsonArray(settings.overridden_settings_json).includes("manual_prompt");
}

function parseBrokerFeeModel(portfolio: Partial<TradePortfolioInfo>): Partial<TradeBrokerFeeModel> {
  try {
    const parsed = JSON.parse(portfolio.fee_model_json || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Partial<TradeBrokerFeeModel>) : {};
  } catch {
    return {};
  }
}

function clientBrokerPreset(key: string): {
  broker_key: string;
  broker: string;
  fee_per_trade: number;
  broker_pricing_url: string;
  fee_model: TradeBrokerFeeModel;
} {
  if (key === "etoro") {
    return {
      broker_key: "etoro",
      broker: "eToro",
      fee_per_trade: 0,
      broker_pricing_url: "https://www.etoro.com/trading/fees/",
      fee_model: {
        fixed_order_fee: 0,
        fixed_order_fee_currency: "EUR",
        percent_order_fee: 0,
        minimum_order_fee: 0,
        crypto_percent_fee: 1,
        notes:
          "eToro default in this app: ETF trades are modelled as zero commission; stock commission can vary by country/exchange and may be 1 or 2 USD per open/close; crypto uses 1% as the standard Bronze/Silver/Gold assumption. Market spreads, FX conversion, CFD, withdrawal, and tax costs can still apply.",
        pricing_source_url: "https://www.etoro.com/trading/fees/",
        updated_from_source_at: "2026-06-04"
      }
    };
  }

  if (key === "custom") {
    return {
      broker_key: "custom",
      broker: "Custom broker",
      fee_per_trade: 0,
      broker_pricing_url: "",
      fee_model: {
        fixed_order_fee: 0,
        fixed_order_fee_currency: "EUR",
        percent_order_fee: 0,
        minimum_order_fee: 0,
        notes: "Custom broker fee model. Edit this to match the platform execution screen.",
        pricing_source_url: "",
        updated_from_source_at: "2026-06-04"
      }
    };
  }

  return {
    broker_key: "trade_republic",
    broker: "Trade Republic",
    fee_per_trade: 1,
    broker_pricing_url: "https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post",
    fee_model: {
      fixed_order_fee: 1,
      fixed_order_fee_currency: "EUR",
      percent_order_fee: 0,
      minimum_order_fee: 1,
      notes:
        "Trade Republic default: no order commission for securities; 1 EUR external settlement cost per single trade. Product costs, spreads, and third-party costs can still apply.",
      pricing_source_url: "https://support.traderepublic.com/en-de/809-Cosa-sono-le-informazioni-sui-costi-ex_post",
      updated_from_source_at: "2026-06-04"
    }
  };
}

const defaultImportExample = `Cash: 1250 EUR

Apple | AAPL | US0378331005 | 3.5 shares | value 650 EUR
iShares Core MSCI World ETF | EUNL | IE00B4L5Y983 | 12 shares | value 1033 EUR`;
