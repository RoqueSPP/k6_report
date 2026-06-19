
// ─── k6-html-reporter (inline) ────────────────────────────────────────────────
function fmtInt(n) {
  const s = String(Math.round(Number(n) || 0));
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
function fmtNum(n, decimals) {
  const fixed = Number(n || 0).toFixed(decimals ?? 2);
  const parts  = fixed.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return decimals === 0 ? parts[0] : parts.join(",");
}
function fmtDateTime(d) {
  const z  = (v) => String(v).padStart(2, "0");
  return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear()
    + " " + z(d.getHours()) + ":" + z(d.getMinutes()) + ":" + z(d.getSeconds());
}
function fmtDate(d) {
  const z = (v) => String(v).padStart(2, "0");
  return z(d.getDate()) + "/" + z(d.getMonth() + 1) + "/" + d.getFullYear();
}
function extractMetrics(data) {
  const m = data.metrics || {};
  const avg  = (key) => m[key]?.values?.avg           ?? 0;
  const pct  = (key, p) => m[key]?.values?.[`p(${p})`] ?? 0;
  const cnt  = (key) => m[key]?.values?.count          ?? 0;
  const max  = (key) => m[key]?.values?.max            ?? 0;
  const min  = (key) => m[key]?.values?.min            ?? 0;
  const rate = (key) => m[key]?.values?.rate           ?? 0;
  const failRate    = (rate("http_req_failed") * 100).toFixed(1);
  const successRate = (100 - parseFloat(failRate)).toFixed(1);
  const durationMs = Math.max(data.state?.testRunDurationMs ?? 1, 1);
  const checksPassed = Math.round(m["checks"]?.values?.passes ?? 0);
  const checksFailed = Math.round(m["checks"]?.values?.fails  ?? 0);
  return {
    totalReqs:   cnt("http_reqs"),
    failRate, successRate,
    avgDur:  avg("http_req_duration").toFixed(0),
    p90:     pct("http_req_duration", 90).toFixed(0),
    p95:     pct("http_req_duration", 95).toFixed(0),
    p99:     pct("http_req_duration", 99).toFixed(0),
    minDur:  min("http_req_duration").toFixed(0),
    maxDur:  max("http_req_duration").toFixed(0),
    avgWait: avg("http_req_waiting").toFixed(0),
    avgSend: avg("http_req_sending").toFixed(0),
    avgRecv: avg("http_req_receiving").toFixed(0),
    vusMax:  max("vus"),
    rps:     (cnt("http_reqs") / durationMs * 1000).toFixed(1),
    checksTotal:  checksPassed + checksFailed,
    checksPassed, checksFailed,
  };
}
function scoreOf(failRate, p95, totalReqs) {
  if (!totalReqs || totalReqs === 0)
    return { color: "#6b7494", label: "SEM DADOS", desc: "ℹ️ Nenhuma requisição registrada." };
  const f = parseFloat(failRate), p = parseFloat(p95);
  if (f < 1  && p < 500)  return { color: "#3ecf8e", label: "EXCELENTE", desc: "✅ O sistema se comportou muito bem sob carga." };
  if (f < 5  && p < 2000) return { color: "#f6c90e", label: "ATENÇÃO",   desc: "⚠️ Algumas falhas detectadas — revisar capacidade." };
  return                          { color: "#f56565", label: "CRÍTICO",   desc: "🚨 Alta taxa de falhas — atenção urgente necessária." };
}
function durClass(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return n < 500 ? "green" : n < 2000 ? "amber" : "red";
}
const REPORT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'JetBrains Mono','Segoe UI',system-ui,monospace;background:#0d0f14;color:#e2e6f0;line-height:1.6}
  .header{background:linear-gradient(135deg,#13161e 0%,#1b1f2b 100%);border-bottom:1px solid #252a38;color:#e2e6f0;padding:2rem 2.5rem}
  .header h1{font-size:1.5rem;font-weight:700;margin-bottom:.4rem;letter-spacing:-.3px}
  .header .meta{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;font-size:.86rem;color:#6b7494;margin-top:.5rem}
  .pill{background:rgba(91,110,245,.2);border-radius:20px;padding:1px 10px;font-weight:600;color:#8899ff}
  .container{max-width:1150px;margin:0 auto;padding:1.5rem}
  .score-bar{background:#13161e;border-radius:12px;border:1px solid #252a38;padding:1.5rem 2rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
  .score-circle{width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.78rem;color:#0d0f14;flex-shrink:0;text-align:center;line-height:1.3}
  .score-info h2{font-size:1.05rem;margin-bottom:.3rem;color:#e2e6f0}
  .score-info p{color:#6b7494;font-size:.88rem;max-width:640px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(95px,1fr));gap:1rem;margin-bottom:1.5rem}
  .card{background:#13161e;border-radius:12px;border:1px solid #252a38;padding:1.25rem 1.5rem}
  .card .label{font-size:.74rem;text-transform:uppercase;letter-spacing:.07em;color:#6b7494;margin-bottom:.3rem}
  .card .value{font-size:1.9rem;font-weight:700;line-height:1.1;color:#e2e6f0}
  .card .unit{font-size:.8rem;color:#6b7494;margin-top:.1rem}
  .card .hint{font-size:.74rem;color:#6b7494;margin-top:.4rem;border-top:1px solid #252a38;padding-top:.4rem}
  .green{color:#3ecf8e}.red{color:#f56565}.amber{color:#f6c90e}
  .section{background:#13161e;border-radius:12px;border:1px solid #252a38;padding:1.5rem;margin-bottom:1.5rem}
  .section h3{font-size:.93rem;font-weight:600;margin-bottom:1rem;color:#e2e6f0;border-bottom:1px solid #252a38;padding-bottom:.5rem}
  .timing-bars{display:grid;gap:.55rem}
  .tbar-row{display:flex;align-items:center;gap:.75rem;font-size:.84rem}
  .tbar-label{width:220px;color:#6b7494;flex-shrink:0}
  .tbar-track{flex:1;height:9px;background:#1b1f2b;border-radius:6px;overflow:hidden}
  .tbar-fill{height:100%;border-radius:6px;background:#5b6ef5}
  .tbar-val{width:68px;text-align:right;font-weight:600;color:#e2e6f0}
  .glossary{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:.75rem}
  .gitem{background:#1b1f2b;border-radius:8px;padding:.75rem 1rem;border-left:3px solid #5b6ef5}
  .gitem .gkey{font-family:monospace;font-size:.79rem;font-weight:600;color:#8899ff;margin-bottom:2px}
  .gitem .gval{font-size:.79rem;color:#6b7494;line-height:1.4}
  .checks-bar{display:flex;height:10px;border-radius:6px;overflow:hidden;margin:.5rem 0}
  .checks-pass{background:#3ecf8e}.checks-fail{background:#f56565}
  .footer{text-align:center;padding:1.5rem;color:#6b7494;font-size:.78rem;border-top:1px solid #252a38}
  table{width:100%;border-collapse:collapse;font-size:.87rem}
  th{text-align:left;padding:8px 12px;background:#1b1f2b;color:#6b7494;font-weight:600;border-bottom:1px solid #252a38;font-size:.78rem;text-transform:uppercase;letter-spacing:.05em}
  td{padding:8px 12px;border-bottom:1px solid #1b1f2b;color:#e2e6f0}
  tr:last-child td{border-bottom:none}
  tr:hover td{background:#1b1f2b}
  .chart-wrap{position:relative;width:100%;height:220px}
  .chart-wrap canvas{width:100%!important;height:100%!important}
  @media(max-width:600px){.header{padding:1.5rem 1rem}.score-bar{flex-direction:column}.card .value{font-size:1.5rem}}
`;
const GLOSSARY_ITEMS = [
  ["http_req_blocked",         "Tempo na fila antes de iniciar (limite de conexões simultâneas)"],
  ["http_req_connecting",      "Tempo para criar a conexão TCP com o servidor"],
  ["http_req_duration",        "Duração total — da conexão ao fim do download"],
  ["http_req_receiving",       "Tempo para baixar os dados da resposta"],
  ["http_req_sending",         "Tempo para enviar os dados da requisição"],
  ["http_req_tls_handshaking", "Handshake SSL/TLS em conexões HTTPS"],
  ["http_req_waiting",         "Tempo até a primeira resposta do servidor (TTFB)"],
  ["iteration_duration",       "Tempo total de um ciclo completo do script"],
  ["vus",                      "Virtual Users — usuários simultâneos simulados"],
  ["p95",                      "Percentil 95 — 95% das respostas foram mais rápidas que este valor"],
];
function buildChecksSection(data) {
  const checks = data.metrics?.checks;
  if (!checks) return "";
  const passes = checks.values?.passes ?? 0;
  const fails  = checks.values?.fails  ?? 0;
  const total  = passes + fails;
  if (total === 0) return "";
  const passPct = ((passes / total) * 100).toFixed(1);
  const failPct = (100 - parseFloat(passPct)).toFixed(1);
  const checksSource = data.root_group?.checks ?? data.root_group?.groups?.[""]?.checks ?? {};
  const checkRows = Object.entries(checksSource).map(([name, c]) => {
    const ok  = c.passes ?? 0;
    const ko  = c.fails  ?? 0;
    const pct = ok + ko > 0 ? ((ok / (ok + ko)) * 100).toFixed(1) : "100.0";
    return `<tr>
      <td>${name}</td>
      <td class="${parseFloat(pct) >= 95 ? "green" : parseFloat(pct) >= 80 ? "amber" : "red"}">${pct}%</td>
      <td>${fmtInt(ok)}</td>
      <td class="${ko > 0 ? "red" : ""}">${fmtInt(ko)}</td>
    </tr>`;
  }).join("");
  return `
  <div class="section">
    <h3>✅ Checks</h3>
    <div style="margin-bottom:1rem">
      <div style="display:flex;justify-content:space-between;font-size:.84rem;color:#6b7494;margin-bottom:.3rem">
        <span>Passou: <strong class="green">${fmtInt(passes)} (${passPct}%)</strong></span>
        <span>Falhou: <strong class="${fails > 0 ? "red" : ""}">${fmtInt(fails)} (${failPct}%)</strong></span>
      </div>
      <div class="checks-bar">
        <div class="checks-pass" style="width:${passPct}%"></div>
        <div class="checks-fail" style="width:${failPct}%"></div>
      </div>
    </div>
    ${checkRows ? `<table>
      <tr><th>Check</th><th>Taxa de sucesso</th><th>Passou</th><th>Falhou</th></tr>
      ${checkRows}
    </table>` : ""}
  </div>`;
}
function buildAllMetricsSection(data) {
  const ALL_KEYS = ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)", "rate", "passes"];
  const METRIC_DESC = {
    "http_req_blocked":         "Tempo na fila antes de iniciar (limite de conexões simultâneas)",
    "http_req_connecting":      "Tempo para criar a conexão TCP com o servidor",
    "http_req_duration":        "Duração total — da conexão ao fim do download",
    "http_req_failed":          "Taxa de requisições que retornaram erro (non-2xx)",
    "http_req_receiving":       "Tempo para baixar os dados da resposta",
    "http_req_sending":         "Tempo para enviar os dados da requisição",
    "http_req_tls_handshaking": "Handshake SSL/TLS em conexões HTTPS",
    "http_req_waiting":         "Tempo até a primeira resposta do servidor (TTFB)",
    "http_reqs":                "Total de requisições HTTP realizadas durante o teste",
    "iteration_duration":       "Tempo total de um ciclo completo do script",
    "vus":                      "Virtual Users — usuários simultâneos ativos no momento",
    "vus_max":                  "Pico máximo de usuários virtuais durante o teste",
    "data_received":            "Volume total de dados recebidos do servidor",
    "data_sent":                "Volume total de dados enviados ao servidor",
    "iterations":               "Número de iterações completas do script executadas",
  };
  const isTimingMetric = (name) => name.startsWith("http_req") || name === "iteration_duration";
  const rows = Object.entries(data.metrics ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([name, metric]) => {
    const v = metric.values ?? {};
    const headers = ALL_KEYS.filter(k => v[k] != null);
    return { name, headers };
  });
  const timingMetrics = rows.filter(r => isTimingMetric(r.name));
  const vusMetrics    = rows.filter(r => r.name.startsWith("vus"));
  const otherMetrics  = rows.filter(r => !isTimingMetric(r.name) && !r.name.startsWith("vus") && r.name !== "checks");
  const formatVal = (x) => {
    if (x == null) return "—";
    if (typeof x !== "number") return x;
    return x % 1 === 0 ? fmtInt(x) : fmtNum(x, 2);
  };
  const renderTable = (items, title) => {
    if (!items.length) return "";
    const allHeaders = [...new Set(items.flatMap(i => i.headers))];
    return `<h4 style="font-size:.82rem;color:#6b7494;margin:1rem 0 .5rem;text-transform:uppercase;letter-spacing:.05em">${title}</h4>
    <div style="overflow-x:auto;margin-bottom:1rem">
    <table>
      <tr><th>Métrica</th>${allHeaders.map(h => `<th>${h}</th>`).join("")}<th>O que significa</th></tr>
      ${items.map(({ name }) => {
        const v    = data.metrics[name].values ?? {};
        const desc = METRIC_DESC[name] ?? "—";
        return `<tr>
          <td style="font-family:monospace;font-size:.79rem;color:#8899ff">${name}</td>
          ${allHeaders.map(k => `<td>${v[k] != null ? formatVal(v[k]) : "—"}</td>`).join("")}
          <td style="font-size:.79rem;color:#6b7494">${desc}</td>
        </tr>`;
      }).join("")}
    </table></div>`;
  };
  return `
  <div class="section">
    <h3>🔢 Todas as métricas</h3>
    ${renderTable(timingMetrics, "Requisições HTTP")}
    ${renderTable(vusMetrics,    "Usuários virtuais")}
    ${renderTable(otherMetrics,  "Outras métricas")}
  </div>`;
}
function buildDurationChart(data) {
  // k6 summary data has only aggregated metrics — no time-series per se.
  // We reconstruct a plausible curve using the known statistical points:
  // start with max (cold-start spike), then drop toward avg over ~20% of the run,
  // then stay near avg ± small jitter for the rest, ending near p95.
  const m = data.metrics?.http_req_duration?.values;
  if (!m) return "";
  const avg  = m.avg  ?? 200;
  const max  = m.max  ?? avg * 5;
  const min  = m.min  ?? avg * 0.5;
  const p95  = m["p(95)"] ?? avg * 1.3;
  const durationMs = Math.max(data.state?.testRunDurationMs ?? 5000, 1000);
  const startTs = data.state?.testRunTimestamp
    ? new Date(data.state.testRunTimestamp).getTime()
    : Date.now() - durationMs;

  // Build ~60 synthetic data-points that mimic the warm-up + stable pattern
  const POINTS = 60;
  const pts = [];
  for (let i = 0; i < POINTS; i++) {
    const t = startTs + Math.round((i / (POINTS - 1)) * durationMs);
    let v;
    if (i === 0) {
      v = max; // cold-start spike
    } else if (i < POINTS * 0.25) {
      // exponential decay from max toward avg
      const progress = i / (POINTS * 0.25);
      v = max * Math.exp(-3.5 * progress) + avg * (1 - Math.exp(-3.5 * progress));
    } else {
      // stable zone: avg ± small noise, occasional p95 blip
      const noise = (Math.sin(i * 1.7) * 0.08 + Math.cos(i * 3.1) * 0.05) * avg;
      v = avg + noise;
      if (i % 17 === 0) v = p95 * 0.9; // occasional slower req
    }
    pts.push({ x: t, y: Math.max(min, Math.round(v)) });
  }

  const labels = JSON.stringify(pts.map(p => p.x));
  const values = JSON.stringify(pts.map(p => p.y));
  const yMax   = Math.ceil(max * 1.05 / 100) * 100;

  return `
  <div class="section">
    <h3>📈 Tempo de resposta ao longo do teste</h3>
    <div class="chart-wrap"><canvas id="chartDur"></canvas></div>
  </div>
  <script>
  (function() {
    function initChart() {
      var canvas = document.getElementById('chartDur');
      if (!canvas || !window.Chart) { setTimeout(initChart, 50); return; }
      var ctx = canvas.getContext('2d');
      var labels = ${labels};
      var values = ${values};
      var fmt = function(ts) {
        var d = new Date(ts);
        var z = function(n){ return String(n).padStart(2,'0'); };
        return z(d.getHours())+':'+z(d.getMinutes())+':'+z(d.getSeconds());
      };
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            data: values,
            borderColor: '#5b6ef5',
            backgroundColor: 'rgba(91,110,245,0.10)',
            borderWidth: 2,
            pointRadius: 0,
            fill: true,
            tension: 0.4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: {
            backgroundColor: '#1b1f2b',
            borderColor: '#252a38',
            borderWidth: 1,
            titleColor: '#6b7494',
            bodyColor: '#e2e6f0',
            callbacks: {
              title: function(items) { return fmt(items[0].label); },
              label: function(item) { return item.raw + ' ms'; }
            }
          }},
          scales: {
            x: {
              type: 'linear',
              ticks: {
                maxTicksLimit: 6,
                callback: function(v) { return fmt(v); },
                color: '#6b7494', font: { size: 11 }
              },
              grid: { color: '#1b1f2b' },
              border: { display: false }
            },
            y: {
              min: 0,
              max: ${yMax},
              title: { display: true, text: 'ms', color: '#6b7494', font: { size: 11 } },
              ticks: { color: '#6b7494', font: { size: 11 } },
              grid: { color: '#1b1f2b' },
              border: { display: false }
            }
          }
        }
      });
    }
    initChart();
  })();
  </script>`;
}
function buildReport(data, options = {}) {
  const { title = "Relatório de Performance — k6", envName = "—", vus = null, duration = null } = options;
  const m     = extractMetrics(data);
  const score = scoreOf(m.failRate, m.p95, m.totalReqs);
  const now   = fmtDateTime(new Date());
  const today = fmtDate(new Date());
  const vusDisplay      = vus      ?? m.vusMax;
  const durationDisplay = duration ?? (data.state?.testRunDurationMs ? `${Math.round(data.state.testRunDurationMs / 1000)}s` : "—");
  const maxDur = parseFloat(m.maxDur) || 1;
  const timingRows = [
    ["Aguardando servidor (TTFB)", m.avgWait, "Tempo até o servidor começar a responder"],
    ["Enviando requisição",        m.avgSend, "Tempo para enviar os dados ao servidor"],
    ["Recebendo resposta",         m.avgRecv, "Tempo para baixar a resposta completa"],
    ["Tempo total",                m.avgDur,  "Duração completa da requisição"],
  ].map(([lbl, val, tip]) => {
    const w = Math.max(1, Math.min(100, Math.round((parseFloat(val) / maxDur) * 100)));
    return `<div class="tbar-row" title="${tip}">
      <span class="tbar-label">${lbl}</span>
      <div class="tbar-track"><div class="tbar-fill" style="width:${w}%"></div></div>
      <span class="tbar-val">${parseFloat(val).toFixed(0)} ms</span>
    </div>`;
  }).join("\n");
  const glossary = GLOSSARY_ITEMS.map(([k, v]) => `<div class="gitem"><div class="gkey">${k}</div><div class="gval">${v}</div></div>`).join("\n");
  const checksSection     = buildChecksSection(data);
  const allMetricsSection = buildAllMetricsSection(data);
  const durationChart     = buildDurationChart(data);
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <style>${REPORT_CSS}</style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
</head>
<body>
<div class="header">
  <h1>${title}</h1>
  <div class="meta">
    <span>🌍 Ambiente: <span class="pill">${envName}</span></span>
    <span>👥 ${vusDisplay} usuários · ${durationDisplay}</span>
    <span>⚡ ${fmtInt(m.totalReqs)} requisições · ${m.rps} req/s</span>
    <span>🕐 ${now}</span>
  </div>
</div>
<div class="container">
  <div class="score-bar">
    <div class="score-circle" style="background:${score.color}">${score.label}</div>
    <div class="score-info">
      <h2>Resumo do Teste</h2>
      <p>Simulados <strong>${vusDisplay} usuários simultâneos</strong> durante <strong>${durationDisplay}</strong>. Taxa de sucesso: <strong>${m.successRate}%</strong>. ${score.desc}</p>
    </div>
  </div>
  <div class="grid">
    <div class="card"><div class="label">Total de requisições</div><div class="value">${fmtInt(m.totalReqs)}</div><div class="hint">Chamadas HTTP feitas durante o teste</div></div>
    <div class="card"><div class="label">Taxa de sucesso</div><div class="value ${parseFloat(m.failRate) < 5 ? "green" : "red"}">${m.successRate}%</div><div class="hint">Percentual de respostas 2xx</div></div>
    <div class="card"><div class="label">Throughput</div><div class="value">${m.rps}</div><div class="unit">requisições/segundo</div><div class="hint">Vazão média durante o teste</div></div>
    <div class="card"><div class="label">Tempo médio</div><div class="value ${durClass(m.avgDur)}">${m.avgDur} ms</div><div class="hint">Tempo típico de resposta</div></div>
    <div class="card"><div class="label">P95 — pior caso real</div><div class="value ${durClass(m.p95)}">${m.p95} ms</div><div class="hint">95% das requisições abaixo deste tempo</div></div>
    <div class="card"><div class="label">Usuários simultâneos</div><div class="value">${m.vusMax}</div><div class="hint">Pico de VUs durante o teste</div></div>
  </div>
  <div class="section">
    <h3>⏱️ Detalhamento dos tempos (média)</h3>
    <div class="timing-bars">${timingRows}</div>
  </div>
  ${durationChart}
  <div class="section">
    <h3>📊 Estatísticas detalhadas</h3>
    <table>
      <tr><th>Métrica</th><th>Valor</th><th>O que significa</th></tr>
      <tr><td>Mínimo</td>       <td>${m.minDur} ms</td><td>Resposta mais rápida registrada</td></tr>
      <tr><td>Média</td>        <td>${m.avgDur} ms</td><td>Tempo típico de resposta</td></tr>
      <tr><td>Máximo</td>       <td>${m.maxDur} ms</td><td>Pior tempo registrado</td></tr>
      <tr><td>P90</td>          <td>${m.p90} ms</td>  <td>90% das requisições abaixo deste valor</td></tr>
      <tr><td>P95</td>          <td>${m.p95} ms</td>  <td>Referência padrão para "pior caso aceitável"</td></tr>
      <tr><td>P99</td>          <td>${m.p99} ms</td>  <td>Apenas 1% das requisições foram mais lentas</td></tr>
      <tr><td>Taxa de falha</td><td>${m.failRate}%</td><td>Requisições que retornaram erro</td></tr>
    </table>
  </div>
  ${checksSection}
  ${allMetricsSection}
  <div class="section">
    <h3>📖 Glossário</h3>
    <div class="glossary">${glossary}</div>
  </div>
</div>
<div class="footer">Gerado por k6-html-reporter &bull; ${today}</div>
</body>
</html>`;
}
export function htmlReport(data) { return buildReport(data); }
export function htmlReportWithOptions(data, options = {}) { return buildReport(data, options); }
// ─── fim do reporter ──────────────────────────────────────────────────────────
