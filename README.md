# Gerando Relatórios HTML no K6

## Visão Geral

O K6 gera relatórios no terminal por padrão, mas é possível criar relatórios HTML utilizando a biblioteca **k6-reporter**.

O relatório HTML facilita a análise dos resultados dos testes de carga, apresentando métricas, gráficos e estatísticas em uma interface amigável.

---

## Importando a Biblioteca

Adicione o import abaixo no início do seu script:

```javascript
import {
  htmlReport,
  htmlReportWithOptions
} from "https://raw.githubusercontent.com/RoqueSPP/k6_report/refs/heads/master/k6-html-reporter.js";
```

---

## Exemplo Básico

Utilize a função `generateReport()` para gerar um arquivo HTML ao final da execução:

```javascript
import { htmlReport } from "https://raw.githubusercontent.com/RoqueSPP/k6_report/refs/heads/master/k6-html-reporter.jss";

export function generateReport(data) {
  return {
    "relatorio.html": htmlReport(data),
  };
}
```

### Executando o teste

```bash
k6 run teste.js
```

Ao término da execução, será criado o arquivo:

```text
relatorio.html
```

Abra o arquivo em qualquer navegador para visualizar o relatório.

---

## Exemplo com Personalização

Você pode customizar informações exibidas no relatório:

```javascript
import {
  htmlReportWithOptions
} from "https://raw.githubusercontent.com/RoqueSPP/k6_report/refs/heads/master/k6-html-reporter.js";

export function generateReport(data) {
  return {
    "relatorio.html": htmlReportWithOptions(data, {
      title: "Meu Teste de Carga",
      envName: "Produção",
      vus: 50,
      duration: "2m",
    }),
  };
}
```

### Parâmetros Disponíveis

| Parâmetro  | Descrição                       |
| ---------- | ------------------------------- |
| `title`    | Título do relatório             |
| `envName`  | Nome do ambiente testado        |
| `vus`      | Quantidade de usuários virtuais |
| `duration` | Duração planejada do teste      |

---

## Exemplo Completo

```javascript
import http from "k6/http";
import { sleep } from "k6";
import { htmlReportWithOptions } from "https://raw.githubusercontent.com/RoqueSPP/k6_report/refs/heads/master/k6-html-reporter.js";

export const options = {
  vus: 10,
  duration: "30s",
};

export default function () {
  http.get("https://test.k6.io");
  sleep(1);
}

export function generateReport(data) {
  return {
    "relatorio.html": htmlReportWithOptions(data, {
      title: "Teste Site K6",
      envName: "Homologação",
      vus: 10,
      duration: "30s",
    }),
  };
}
```

---

## Estrutura de Arquivos

```text
Projeto/
│
├── teste.js
├── relatorio.html
└── README.md
```

---

## Resultado

Após executar:

```bash
k6 run teste.js
```

Será gerado:

```text
relatorio.html
```

O arquivo conterá:

* Resumo da execução
* Tempo de resposta
* Taxa de erros
* Requisições por segundo (RPS)
* Percentis (P90, P95, P99)
* Métricas de usuários virtuais (VUs)
* Informações do ambiente configurado

---

## Referência

Projeto oficial do reporter:

https://github.com/benc-uk/k6-reporter
