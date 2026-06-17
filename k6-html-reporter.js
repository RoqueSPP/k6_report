/**
 * k6-html-reporter.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo K6 para gerar relatório HTML no handleSummary.
 *
 * USO BÁSICO (sem opções)
 * ───────────────────────
 *   import { htmlReport } from "./k6-html-reporter.js";
 *
 *   export function handleSummary(data) {
 *     return {
 *       "relatorio.html": htmlReport(data),
 *     };
 *   }
 *
 * USO COM OPÇÕES
 * ──────────────
 *   import { htmlReportWithOptions } from "./k6-html-reporter.js";
 *
 *   export function handleSummary(data) {
 *     return {
 *       "relatorio.html": htmlReportWithOptions(data, {
 *         nome:      "GET buscar todos usuarios",
 *         metodo:    "GET",
 *         url:       "https://gorest.co.in/public/v2/users",
 *         ambiente:  "Homologação",
 *       }),
 *     };
 *   }
 *
 * OPÇÕES DISPONÍVEIS
 * ──────────────────
 *   nome      {string}  Nome legível do teste          (padrão: "Teste K6")
 *   metodo    {string}  Método HTTP                    (padrão: "GET")
 *   url       {string}  URL testada                    (padrão: "—")
 *   ambiente  {string}  Ambiente (ex: "Homologação")   (padrão: "—")
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ms(v) {
  return v == null ? "—" : String(Math.round(v));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(d) {
  return (
    pad2(d.getDate()) + "/" +
    pad2(d.getMonth() + 1) + "/" +
    d.getFullYear() + ", " +
    pad2(d.getHours()) + ":" +
    pad2(d.getMinutes()) + ":" +
    pad2(d.getSeconds())
  );
}

function badgeClass(method) {
  const m = (method || "get").toLowerCase();
  const allowed = ["get","post","put","patch","delete","head"];
  return "badge-" + (allowed.includes(m) ? m : "get");
}

function colorClass(value, limAmber, limRed) {
  if (value >= limRed)   return "red";
  if (value >= limAmber) return "amber";
  return "green";
}

// Largura da barra relativa ao tempo total médio (máx 95%)
function barWidth(part, total) {
  if (!part || !total || total === 0) return "0%";
  const pct = Math.round((part / total) * 95);
  return Math.min(pct, 95) + "%";
}

// ─── Extração de dados do objeto `data` do K6 ────────────────────────────────

function extrairDados(data) {
  const m   = data.metrics || {};
  const dur = (m["http_req_duration"] || {}).values || {};
  const fal = (m["http_req_failed"]   || {}).values || {};
  const vus = (m["vus"]               || {}).values || {};
  const wai = (m["http_req_waiting"]  || {}).values || {};
  const snd = (m["http_req_sending"]  || {}).values || {};
  const rcv = (m["http_req_receiving"]|| {}).values || {};
  const itr = (m["iterations"]        || {}).values || {};
  const rps  = (m["http_reqs"]         || {}).values || {};
  const vusM = (m["vus_max"]           || {}).values || {};
  const drcv = (m["data_received"]     || {}).values || {};
  const dsnt = (m["data_sent"]         || {}).values || {};

  return {
    // Duração
    avg:    dur.avg    ?? null,
    min:    dur.min    ?? null,
    max:    dur.max    ?? null,
    med:    dur.med    ?? null,
    p90:    dur["p(90)"] ?? null,
    p95:    dur["p(95)"] ?? null,
    p99:    dur["p(99)"] ?? null,
    count:  dur.count  ?? (rps.count ?? 0),

    // Sub-tempos
    ttfb:   wai.avg ?? null,
    send:   snd.avg ?? null,
    recv:   rcv.avg ?? null,

    // Falhas  (rate = 0..1)
    failRate: fal.rate != null ? fal.rate * 100 : 0,

    // VUs
    vusMax:  vus.max ?? (data.options && data.options.vus ? data.options.vus : 1),
    vusCurr: vus.value ?? null,
    vusMin:  vus.min  ?? null,
    vusMaxMetric: vusM.max ?? null,

    // Outras métricas
    dataRecvCount: drcv.count ?? null,
    dataRecvRate:  drcv.rate  ?? null,
    dataSentCount: dsnt.count ?? null,
    dataSentRate:  dsnt.rate  ?? null,
    iterCount:     itr.count  ?? null,
    iterRate:      itr.rate   ?? null,

    // Duração do teste
    testDurationMs: (data.state && data.state.testRunDurationMs) || null,

    // Metadados opcionais injetados via data.__reporter no script K6
    nomeTeste: (data.__reporter && data.__reporter.nome)     || null,
    metodo:    (data.__reporter && data.__reporter.metodo)   || null,
    url:       (data.__reporter && data.__reporter.url)      || null,
    ambiente:  (data.__reporter && data.__reporter.ambiente) || null,
  };
}

// ─── Classificação geral ──────────────────────────────────────────────────────

function classificar(avg, p95, failRate) {
  if (failRate > 5 || p95 > 2000 || avg > 1500) {
    return { cor: "#dc2626", label: "CRÍTICO",  msg: "🔴 Alta taxa de falhas ou latência crítica — ação imediata necessária." };
  }
  if (failRate > 0 || p95 > 1000 || avg > 800) {
    return { cor: "#ca8a04", label: "ATENÇÃO",  msg: "⚠️ Algumas falhas detectadas — revisar capacidade do servidor." };
  }
  if (p95 > 500 || avg > 400) {
    return { cor: "#d97706", label: "MODERADO", msg: "🟡 Tempos aceitáveis, mas há margem para otimização." };
  }
  return { cor: "#16a34a", label: "BOM",       msg: "✅ Todos os indicadores dentro do esperado." };
}


// ─── Formatadores de bytes e taxa ────────────────────────────────────────────

function fmtBytes(bytes) {
  if (bytes == null) return "—";
  if (bytes >= 1_000_000) return (bytes / 1_000_000).toFixed(3) + " MB";
  if (bytes >= 1_000)     return (bytes / 1_000).toFixed(3) + " KB";
  return bytes + " B";
}

function fmtRate(rate) {
  if (rate == null) return "—";
  if (rate >= 1_000_000) return (rate / 1_000_000).toFixed(2) + " MB/s";
  if (rate >= 1_000)     return (rate / 1_000).toFixed(2) + " KB/s";
  return rate.toFixed(2) + " B/s";
}

// ─── Geração do HTML ──────────────────────────────────────────────────────────

function buildHtml(d, opts) {
  const nome     = esc(opts.nome     || d.nomeTeste || "Teste K6");
  const metodo   = (opts.metodo      || d.metodo    || "GET").toUpperCase();
  const url      = esc(opts.url      || d.url       || "—");
  const ambiente = esc(opts.ambiente || d.ambiente || "—");
  const ts       = formatDate(new Date());

  const classif      = classificar(d.avg, d.p95, d.failRate);
  const successRate  = (100 - d.failRate).toFixed(1);
  const failStr      = d.failRate.toFixed(1) + "%";

  const avgMs  = ms(d.avg);
  const p90Ms  = ms(d.p90);
  const p95Ms  = ms(d.p95);
  const p99Ms  = ms(d.p99);
  const minMs  = ms(d.min);
  const maxMs  = ms(d.max);
  const ttfbMs = ms(d.ttfb);
  const sendMs = ms(d.send);
  const recvMs = ms(d.recv);

  const avgNum = d.avg || 0;
  const bwTTFB = barWidth(d.ttfb, avgNum);
  const bwSend = barWidth(d.send, avgNum);
  const bwRecv = barWidth(d.recv, avgNum);
  const bwTotal= barWidth(avgNum, avgNum);   // sempre ~95%

  const avgClass = colorClass(avgNum, 400, 800);
  const p95Class = colorClass(d.p95 || 0, 500, 1000);

  // Duração total do teste formatada
  let duracaoStr = "—";
  if (d.testDurationMs) {
    const sec = Math.round(d.testDurationMs / 1000);
    duracaoStr = sec >= 60
      ? Math.floor(sec / 60) + "m " + (sec % 60) + "s"
      : sec + "s";
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Relatório K6 — ${nome}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"><\/script>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',Arial,sans-serif;background:#f8fafc;color:#1e293b;line-height:1.6}
  .header{background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);color:#fff;padding:2rem 2.5rem}
  .header h1{font-size:1.5rem;font-weight:700;margin-bottom:.4rem}
  .header .meta{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem;font-size:.86rem;opacity:.9;margin-top:.5rem}
  .header .url{margin-top:.6rem;font-family:monospace;font-size:.78rem;opacity:.7;word-break:break-all}
  .badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.78rem;font-weight:700;vertical-align:middle}
  .badge-get{background:#dbeafe;color:#1d4ed8}
  .badge-post{background:#dcfce7;color:#166534}
  .badge-put{background:#fef3c7;color:#92400e}
  .badge-patch{background:#ede9fe;color:#5b21b6}
  .badge-delete{background:#fee2e2;color:#991b1b}
  .badge-head{background:#f1f5f9;color:#475569}
  .pill{background:rgba(255,255,255,.2);border-radius:20px;padding:1px 10px;font-weight:600}
  .container{max-width:1150px;margin:0 auto;padding:1.5rem}
  .score-bar{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:1.5rem 2rem;margin-bottom:1.5rem;display:flex;align-items:center;gap:2rem;flex-wrap:wrap}
  .score-circle{width:88px;height:88px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:.78rem;color:#fff;flex-shrink:0;text-align:center;line-height:1.3}
  .score-info h2{font-size:1.05rem;margin-bottom:.3rem}
  .score-info p{color:#64748b;font-size:.88rem;max-width:640px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(195px,1fr));gap:1rem;margin-bottom:1.5rem}
  .card{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:1.25rem 1.5rem}
  .card .label{font-size:.74rem;text-transform:uppercase;letter-spacing:.05em;color:#94a3b8;margin-bottom:.3rem}
  .card .value{font-size:1.9rem;font-weight:700;line-height:1.1}
  .card .unit{font-size:.8rem;color:#64748b;margin-top:.1rem}
  .card .hint{font-size:.74rem;color:#94a3b8;margin-top:.4rem;border-top:1px solid #f1f5f9;padding-top:.4rem}
  .green{color:#16a34a}.red{color:#dc2626}.amber{color:#ca8a04}
  .section{background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);padding:1.5rem;margin-bottom:1.5rem}
  .section h3{font-size:.93rem;font-weight:600;margin-bottom:1rem;color:#1e293b;border-bottom:1px solid #f1f5f9;padding-bottom:.5rem}
  .chart-wrap{position:relative;height:230px}
  .timing-bars{display:grid;gap:.55rem}
  .tbar-row{display:flex;align-items:center;gap:.75rem;font-size:.84rem}
  .tbar-label{width:220px;color:#475569;flex-shrink:0}
  .tbar-track{flex:1;height:9px;background:#f1f5f9;border-radius:6px;overflow:hidden}
  .tbar-fill{height:100%;border-radius:6px;background:#2563eb}
  .tbar-val{width:68px;text-align:right;font-weight:600;color:#1e293b}
  .glossary{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:.75rem}
  .gitem{background:#f8fafc;border-radius:8px;padding:.75rem 1rem;border-left:3px solid #2563eb}
  .gitem .gkey{font-family:monospace;font-size:.79rem;font-weight:600;color:#1d4ed8;margin-bottom:2px}
  .gitem .gval{font-size:.79rem;color:#475569;line-height:1.4}
  .metric-name{font-family:monospace;font-size:.82rem;color:#1d4ed8;font-weight:600}
  .footer{text-align:center;padding:1.5rem;color:#94a3b8;font-size:.78rem}
  table{width:100%;border-collapse:collapse;font-size:.87rem}
  th{text-align:left;padding:8px 12px;background:#f8fafc;color:#64748b;font-weight:600;border-bottom:1px solid #e2e8f0}
  td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
  tr:last-child td{border-bottom:none}
  @media(max-width:600px){
    .header{padding:1.5rem 1rem}
    .score-bar{flex-direction:column}
    .card .value{font-size:1.5rem}
    .tbar-label{width:140px}
  }
</style>
</head>
<body>
<div class="header">
  <h1><span class="badge ${badgeClass(metodo)}">${metodo}</span>&nbsp;${nome}</h1>
  <div class="meta">
    <span>🌍 <span class="pill">Ambiente ${ambiente}</span></span>
    <span>🕐 ${ts}</span>
    ${duracaoStr !== "—" ? `<span>⏳ Duração: <strong>${duracaoStr}</strong></span>` : ""}
    <span>👥 VUs: <strong>${d.vusMax}</strong></span>
  </div>
  <div class="url">${url}</div>
</div>

<div class="container">

  <!-- Score -->
  <div class="score-bar">
    <div class="score-circle" style="background:${classif.cor}">${classif.label}</div>
    <div class="score-info">
      <h2>Resumo do Teste</h2>
      <p>
        Simulados <strong>${d.vusMax} usuário${d.vusMax !== 1 ? "s" : ""} simultâneo${d.vusMax !== 1 ? "s" : ""}</strong>
        ${duracaoStr !== "—" ? `durante <strong>${duracaoStr}</strong>` : ""}.
        Taxa de sucesso: <strong>${successRate}%</strong>.
        ${classif.msg}
      </p>
    </div>
  </div>

  <!-- Cards -->
  <div class="grid">
    <div class="card">
      <div class="label">Total de requisições</div>
      <div class="value">${d.count}</div>
      <div class="hint">Chamadas feitas ao endpoint durante o teste</div>
    </div>
    <div class="card">
      <div class="label">Taxa de sucesso</div>
      <div class="value ${d.failRate > 0 ? "amber" : "green"}">${successRate}%</div>
      <div class="hint">Percentual de respostas corretas (status 2xx)</div>
    </div>
    <div class="card">
      <div class="label">Tempo médio</div>
      <div class="value ${avgClass}">${avgMs}</div>
      <div class="unit">milissegundos (ms)</div>
      <div class="hint">Tempo típico que o servidor levou para responder</div>
    </div>
    <div class="card">
      <div class="label">P95 — pior caso real</div>
      <div class="value ${p95Class}">${p95Ms} ms</div>
      <div class="hint">95% das requisições responderam abaixo deste tempo</div>
    </div>
  </div>

  <!-- Gráfico placeholder (sem série temporal no handleSummary) -->
  <div class="section">
    <h3>📊 Distribuição dos tempos de resposta</h3>
    <div class="chart-wrap"><canvas id="chartDur"></canvas></div>
  </div>

  <!-- Timing bars -->
  <div class="section">
    <h3>⏱️ Detalhamento dos tempos (média)</h3>
    <div class="timing-bars">
      <div class="tbar-row" title="Tempo até o servidor começar a responder">
        <span class="tbar-label">Aguardando servidor (TTFB)</span>
        <div class="tbar-track"><div class="tbar-fill" style="width:${bwTTFB}"></div></div>
        <span class="tbar-val">${ttfbMs} ms</span>
      </div>
      <div class="tbar-row" title="Tempo para enviar os dados ao servidor">
        <span class="tbar-label">Enviando requisição</span>
        <div class="tbar-track"><div class="tbar-fill" style="width:${bwSend}"></div></div>
        <span class="tbar-val">${sendMs} ms</span>
      </div>
      <div class="tbar-row" title="Tempo para baixar a resposta completa">
        <span class="tbar-label">Recebendo resposta</span>
        <div class="tbar-track"><div class="tbar-fill" style="width:${bwRecv}"></div></div>
        <span class="tbar-val">${recvMs} ms</span>
      </div>
      <div class="tbar-row" title="Duração completa da requisição">
        <span class="tbar-label">Tempo total</span>
        <div class="tbar-track"><div class="tbar-fill" style="width:${bwTotal}"></div></div>
        <span class="tbar-val">${avgMs} ms</span>
      </div>
    </div>
  </div>

  <!-- Tabela de estatísticas -->
  <div class="section">
    <h3>🔢 Estatísticas detalhadas</h3>
    <table>
      <tr><th>Métrica</th><th>Valor</th><th>O que significa</th></tr>
      <tr><td>Mínimo</td><td>${minMs} ms</td><td>Resposta mais rápida registrada</td></tr>
      <tr><td>Média</td><td>${avgMs} ms</td><td>Tempo típico de resposta</td></tr>
      <tr><td>Mediana</td><td>${ms(d.med)} ms</td><td>Valor central — 50% das requisições ficaram abaixo</td></tr>
      <tr><td>P90</td><td>${p90Ms} ms</td><td>90% das requisições responderam abaixo deste valor</td></tr>
      <tr><td>P95</td><td>${p95Ms} ms</td><td>Referência padrão para "pior caso aceitável"</td></tr>
      <tr><td>P99</td><td>${p99Ms} ms</td><td>Apenas 1% das requisições foram mais lentas que isso</td></tr>
      <tr><td>Máximo</td><td>${maxMs} ms</td><td>Pior tempo registrado (pode ser anomalia pontual)</td></tr>
      <tr><td>Falhas</td><td>${failStr}</td><td>Requisições que retornaram erro</td></tr>
      <tr><td>Usuários simulados (pico)</td><td>${d.vusMax}</td><td>Pico de usuários simultâneos</td></tr>
    </table>
  </div>


  <!-- Usuários Virtuais -->
  <div class="section">
    <h3>👥 Usuários Virtuais</h3>
    <table>
      <tr><th>Métrica</th><th>min</th><th>max</th><th>O que significa</th></tr>
      <tr>
        <td><span class="metric-name">vus</span></td>
        <td>${d.vusMin != null ? d.vusMin : "—"}</td>
        <td>${d.vusMax}</td>
        <td>Virtual Users — usuários simultâneos ativos no momento</td>
      </tr>
      <tr>
        <td><span class="metric-name">vus_max</span></td>
        <td>${d.vusMaxMetric != null ? d.vusMaxMetric : d.vusMax}</td>
        <td>${d.vusMaxMetric != null ? d.vusMaxMetric : d.vusMax}</td>
        <td>Pico máximo de usuários virtuais durante o teste</td>
      </tr>
    </table>
  </div>

  <!-- Outras Métricas -->
  <div class="section">
    <h3>📦 Outras Métricas</h3>
    <table>
      <tr><th>Métrica</th><th>count</th><th>rate</th><th>O que significa</th></tr>
      ${d.dataRecvCount != null ? `<tr>
        <td><span class="metric-name">data_received</span></td>
        <td>${fmtBytes(d.dataRecvCount)}</td>
        <td>${fmtRate(d.dataRecvRate)}</td>
        <td>Volume total de dados recebidos do servidor</td>
      </tr>` : ""}
      ${d.dataSentCount != null ? `<tr>
        <td><span class="metric-name">data_sent</span></td>
        <td>${fmtBytes(d.dataSentCount)}</td>
        <td>${fmtRate(d.dataSentRate)}</td>
        <td>Volume total de dados enviados ao servidor</td>
      </tr>` : ""}
      ${d.iterCount != null ? `<tr>
        <td><span class="metric-name">iterations</span></td>
        <td>${d.iterCount}</td>
        <td>${d.iterRate != null ? d.iterRate.toFixed(2) : "—"}</td>
        <td>Número de iterações completas do script executadas</td>
      </tr>` : ""}
    </table>
  </div>

  <!-- Glossário -->
  <div class="section">
    <h3>📖 Glossário — o que cada termo significa</h3>
    <div class="glossary">
      <div class="gitem"><div class="gkey">http_req_blocked</div><div class="gval">Tempo na fila antes de iniciar (limite de conexões simultâneas)</div></div>
      <div class="gitem"><div class="gkey">http_req_connecting</div><div class="gval">Tempo para criar a conexão TCP com o servidor</div></div>
      <div class="gitem"><div class="gkey">http_req_duration</div><div class="gval">Duração total — da conexão ao fim do download</div></div>
      <div class="gitem"><div class="gkey">http_req_receiving</div><div class="gval">Tempo para baixar os dados da resposta</div></div>
      <div class="gitem"><div class="gkey">http_req_sending</div><div class="gval">Tempo para enviar os dados da requisição</div></div>
      <div class="gitem"><div class="gkey">http_req_tls_handshaking</div><div class="gval">Handshake SSL/TLS em conexões HTTPS</div></div>
      <div class="gitem"><div class="gkey">http_req_waiting</div><div class="gval">Tempo até a primeira resposta do servidor (TTFB)</div></div>
      <div class="gitem"><div class="gkey">iteration_duration</div><div class="gval">Tempo total de um ciclo completo do script</div></div>
      <div class="gitem"><div class="gkey">vus</div><div class="gval">Virtual Users — usuários simultâneos simulados</div></div>
      <div class="gitem"><div class="gkey">p(95)</div><div class="gval">Percentil 95 — 95% das respostas foram mais rápidas que este valor</div></div>
    </div>
  </div>

</div>
<div class="footer">Gerado por K6 Collection Tester &bull; ${ts}</div>

<script>
(function () {
  // Gráfico de barras com os percentis disponíveis no summary
  var labels = ["Mín", "Média", "Mediana", "P90", "P95", "P99", "Máx"];
  var values = [${d.min == null ? 0 : Math.round(d.min)}, ${d.avg == null ? 0 : Math.round(d.avg)}, ${d.med == null ? 0 : Math.round(d.med)}, ${d.p90 == null ? 0 : Math.round(d.p90)}, ${d.p95 == null ? 0 : Math.round(d.p95)}, ${d.p99 == null ? 0 : Math.round(d.p99)}, ${d.max == null ? 0 : Math.round(d.max)}];
  var colors = values.map(function(v) {
    if (v >= 1000) return "rgba(220,38,38,0.75)";
    if (v >= 500)  return "rgba(202,138,4,0.75)";
    return "rgba(37,99,235,0.75)";
  });
  new Chart(document.getElementById("chartDur"), {
    type: "bar",
    data: {
      labels: labels,
      datasets: [{
        label: "Tempo (ms)",
        data: values,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { font: { size: 12 } } },
        y: { ticks: { font: { size: 11 } }, title: { display: true, text: "ms" } }
      }
    }
  });
})();
<\/script>
</body>
</html>`;
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Gera o relatório HTML com configurações padrão.
 * @param {Object} data  Objeto `data` recebido pelo handleSummary do K6.
 * @returns {string}     Conteúdo HTML do relatório.
 */
export function htmlReport(data) {
  return htmlReportWithOptions(data, {});
}

/**
 * Gera o relatório HTML com opções personalizadas.
 * @param {Object} data   Objeto `data` recebido pelo handleSummary do K6.
 * @param {Object} opts   Opções: { nome, metodo, url, ambiente }
 * @returns {string}      Conteúdo HTML do relatório.
 */
export function htmlReportWithOptions(data, opts) {
  const d = extrairDados(data);
  return buildHtml(d, opts || {});
}
