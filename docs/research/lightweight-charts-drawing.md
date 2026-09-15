# Pesquisa — o que o TradingView Lightweight Charts consegue desenhar

- **Ticket**: [#7 — Pesquisa: o que o Lightweight Charts consegue desenhar](https://github.com/renatonmag/playbook/issues/7)
- **Mapa**: [#1](https://github.com/renatonmag/playbook/issues/1) · **Destrava**: [#8](https://github.com/renatonmag/playbook/issues/8)
- **Data**: 2026-08-09
- **Natureza**: levantamento de fato. Não há recomendação de arquitetura aqui.

## Versão consultada

- **`lightweight-charts@5.2.0`** — última versão publicada no npm (`dist-tags.latest`), lançada em
  2026-04-24 (tag `v5.2.0` no repositório).
- A documentação oficial consultada (`tradingview.github.io/lightweight-charts/docs`) declara
  **5.2** no cabeçalho de todas as páginas usadas.
- Código-fonte lido no branch `master` do repositório `tradingview/lightweight-charts`.

Marcos de versão relevantes para este levantamento:

| Recurso | Desde |
|---|---|
| Whitespace data (pontos sem valor) | 3.1.0 |
| Plugins: Custom Series e Drawing Primitives (`ISeriesPrimitive`) | 4.1.0 |
| Multi-pane, Pane Primitives, Series Markers como plugin | 5.0.0 |
| Marcadores posicionados por preço (`atPriceTop`/`atPriceBottom`/`atPriceMiddle`) | 5.0.x (PR #1826) |
| `autoScale` em `SeriesMarkersOptions` | 5.0.x (PR #1940) |
| `zOrder` nos marcadores | 5.0.x (PR #1876) |
| Data conflation (`enableConflation`) | 5.1.0 |
| Hit testing de séries (`hoveredItem`/`hoveredTarget`) | 5.2.0 |

## Resumo executivo

| O que | Custo | API |
|---|---|---|
| Marcador ancorado numa barra (seta, círculo, quadrado, texto) | **de graça** | `createSeriesMarkers` |
| Linha horizontal de preço | **de graça** | `series.createPriceLine` |
| Série sobreposta (média móvel como linha) | **de graça** | `chart.addSeries(LineSeries, …)` |
| Dado esparso (valor só em alguns timestamps) | **de graça** | `setData` aceita menos pontos; `WhitespaceData` para buracos explícitos |
| **Segmento de reta inclinado entre dois (tempo, preço)** | **exige plugin** (~190 linhas) *ou* uma série sobreposta de 2 pontos | `ISeriesPrimitive` + `attachPrimitive` |
| Preenchimento entre duas retas (corpo da cunha) | **exige plugin** (~210 linhas no exemplo oficial) | `ISeriesPrimitive` com `drawBackground` |

---

## 1. Marcadores em Candles específicos

Desde a 5.0.0 os marcadores deixaram de ser um método da série e viraram um plugin. O guia de
migração v4→v5 é explícito:

- **Antes**: `series.setMarkers([{ time: '2019-04-09', position: 'aboveBar' }])`
- **Depois**: `const seriesMarkers = createSeriesMarkers(series, [...])`, e depois
  `seriesMarkers.setMarkers([...])`

Assinatura oficial:

```ts
createSeriesMarkers<HorzScaleItem>(
  series,
  markers?,
  options?
): ISeriesMarkersPluginApi<HorzScaleItem>
```

Exemplo da própria documentação:

```js
import { createSeriesMarkers } from 'lightweight-charts';

const seriesMarkers = createSeriesMarkers(series, [
  {
    color: 'green',
    position: 'inBar',
    shape: 'arrowDown',
    time: 1556880900,
  },
]);

seriesMarkers.setMarkers([]);
seriesMarkers.markers();
```

### Forma exata do marcador

De `src/plugins/series-markers/types.ts` (verbatim do fonte):

```ts
export type SeriesMarkerBarPosition   = 'aboveBar' | 'belowBar' | 'inBar';
export type SeriesMarkerPricePosition = 'atPriceTop' | 'atPriceBottom' | 'atPriceMiddle';
export type SeriesMarkerPosition      = SeriesMarkerBarPosition | SeriesMarkerPricePosition;

export type SeriesMarkerShape = 'circle' | 'square' | 'arrowUp' | 'arrowDown';

interface SeriesMarkerBase<TimeType> {
  time: TimeType;
  position: SeriesMarkerPosition;
  shape: SeriesMarkerShape;
  color: string;
  id?: string;
  text?: string;   // opcional
  size?: number;   // opcional, default 1
  price?: number;  // obrigatório quando position é 'atPrice*'
}
```

**Limites levantados:**

- **Formas**: só quatro — `circle`, `square`, `arrowUp`, `arrowDown`. Não há forma customizada,
  não há ícone, não há SVG.
- **Posicionamento**: três posições relativas à barra (`aboveBar`, `belowBar`, `inBar`) e três
  relativas a um preço exato (`atPriceTop`, `atPriceBottom`, `atPriceMiddle`), estas últimas
  exigindo `price`.
- **Texto**: campo `text` livre, sem opções de formatação documentadas (sem cor de texto
  própria, sem quebra de linha documentada).
- **Quantidade**: **a documentação não declara um limite numérico de marcadores.** O que existe
  é histórico de performance: a 5.0.x corrigiu "degradação de performance ao adicionar
  marcadores em gráficos com grandes conjuntos de dados (15.000+ pontos)" (PR #1835). Ou seja,
  milhares de marcadores são um problema de performance conhecido e tratado, não um erro.
- **Âncora temporal**: o marcador se ancora num `time`. Um release note da 5.0.x registra a
  correção de "uma exceção quando o dado da série necessário para marcadores individuais não
  podia ser encontrado (por exemplo quando o dado é limpo ou trocado via `setData`)" (PR #1845),
  e a 3.x já registrava que `setMarkers` "requer ao menos um ponto de dado" (issue #372). Isso
  indica que o marcador depende de o `time` existir na série — **mas a documentação não afirma
  isso de forma normativa, e eu não confirmei o comportamento exato para um `time` que não
  corresponde a nenhuma barra.**
- **Autoescala**: por padrão os marcadores entram no cálculo de autoescala do eixo de preço
  (`autoScale`, default `true`).
- **Empilhamento**: `zOrder` controla a ordem de renderização.

**Conclusão**: seta, círculo e rótulo ancorados numa barra são de graça, sem custom code.

---

## 2. Linhas horizontais de preço

`ISeriesApi.createPriceLine(options)` cria uma linha horizontal e devolve um `IPriceLine`;
`removePriceLine(line)` remove; `priceLines()` lista todas (este último adicionado na 5.0.0).

`PriceLineOptions`:

| Propriedade | Tipo | Default |
|---|---|---|
| `id?` | `string` | — |
| `price` | `number` | `0` |
| `color` | `string` | `''` |
| `lineWidth` | `LineWidth` | `1` |
| `lineStyle` | `LineStyle` | `LineStyle.Solid` |
| `lineVisible` | `boolean` | `true` |
| `axisLabelVisible` | `boolean` | `true` |
| `title` | `string` | `''` |
| `axisLabelColor` | `string` | `''` |
| `axisLabelTextColor` | `string` | `''` |

**Limites**: a price line é definida por um único `price` — é horizontal e atravessa toda a
largura do pane. Não há `from`/`to` temporal. Um suporte que só vale de um trecho do gráfico
para a frente **não** é uma price line; o exemplo oficial `partial-price-line` existe
justamente como plugin para esse caso.

De graça: linha horizontal cheia, com estilo, espessura, tracejado, título e rótulo no eixo.

---

## 3. Segmentos de reta arbitrários entre dois pontos (tempo, preço) — o caso da cunha

**Esta é a pergunta que decide o contrato, e a resposta tem duas metades.**

### 3.1 Não existe primitiva nativa de trendline

Não há, na API pública do core, nada como `chart.addLine(p1, p2)`. As duas únicas formas de
linha embutidas são a **price line** (horizontal, seção 2) e a **line series** (uma polilinha
sobre pontos de dado, seção 5). Qualquer segmento inclinado ligando dois pares (tempo, preço)
arbitrários sai por um destes dois caminhos:

### 3.2 Caminho A — Series Primitive (o caminho canônico)

O repositório oficial traz um exemplo pronto e nomeado exatamente para isto:
`plugin-examples/src/plugins/trend-line/trend-line.ts`. **189 linhas de TypeScript**
(5.092 bytes) — e isso já incluindo rótulos de preço nas pontas e cálculo de autoescala.
O núcleo do desenho, sem os enfeites, é da ordem de **60 a 80 linhas**.

**O que a API pede.** Um Series Primitive é um objeto que implementa `ISeriesPrimitive` e é
anexado com `series.attachPrimitive(primitive)` (removível com `detachPrimitive`). A biblioteca
chama os getters de views — `paneViews`, `priceAxisPaneViews`, `timeAxisPaneViews`,
`priceAxisViews`, `timeAxisViews` — e os métodos de ciclo de vida:

- `attached()` — recebe `chart`, `series` e um callback `requestUpdate`
- `detached()`
- `updateAllViews()` — atualiza as views para os renderers desenharem com dado fresco
- `autoscaleInfo()` — opcional; a doc avisa que "será invocado com muita frequência durante
  scroll e zoom"

Cada pane view devolve um renderer que implementa `IPrimitivePaneRenderer`: um método `draw()`
que recebe um `CanvasRenderingTarget2D` (da lib `fancy-canvas`) e, opcionalmente,
`drawBackground()` para desenhar abaixo dos demais elementos.

Ou seja, **você desenha no canvas com mão própria**. A biblioteca não te dá geometria; ela te dá
o canvas e as funções de conversão. As duas conversões que interessam:

- `series.priceToCoordinate(price)` → coordenada Y
- `chart.timeScale().timeToCoordinate(time)` → coordenada X

**Esboço concreto** (extraído verbatim de `trend-line.ts`, reduzido ao essencial):

```ts
class TrendLinePaneView implements IPrimitivePaneView {
  update() {
    const series = this._source._series;
    const y1 = series.priceToCoordinate(this._source._p1.price);
    const y2 = series.priceToCoordinate(this._source._p2.price);
    const timeScale = this._source._chart.timeScale();
    const x1 = timeScale.timeToCoordinate(this._source._p1.time);
    const x2 = timeScale.timeToCoordinate(this._source._p2.time);
    this._p1 = { x: x1, y: y1 };
    this._p2 = { x: x2, y: y2 };
  }
  renderer() { return new TrendLinePaneRenderer(this._p1, this._p2, /* … */); }
}

class TrendLinePaneRenderer implements IPrimitivePaneRenderer {
  draw(target: CanvasRenderingTarget2D) {
    target.useBitmapCoordinateSpace(scope => {
      if (this._p1.x === null || this._p1.y === null ||
          this._p2.x === null || this._p2.y === null) return;
      const ctx = scope.context;
      const x1Scaled = Math.round(this._p1.x * scope.horizontalPixelRatio);
      const y1Scaled = Math.round(this._p1.y * scope.verticalPixelRatio);
      const x2Scaled = Math.round(this._p2.x * scope.horizontalPixelRatio);
      const y2Scaled = Math.round(this._p2.y * scope.verticalPixelRatio);
      ctx.lineWidth = this._options.width;
      ctx.strokeStyle = this._options.lineColor;
      ctx.beginPath();
      ctx.moveTo(x1Scaled, y1Scaled);
      ctx.lineTo(x2Scaled, y2Scaled);
      ctx.stroke();
    });
  }
}

export class TrendLine implements ISeriesPrimitive<Time> {
  constructor(chart: IChartApi, series: ISeriesApi<SeriesType>,
              p1: Point, p2: Point, options?: Partial<TrendLineOptions>) { /* … */ }

  updateAllViews() { this._paneViews.forEach(pw => pw.update()); }
  paneViews()      { return this._paneViews; }

  autoscaleInfo(startTimePoint: Logical, endTimePoint: Logical): AutoscaleInfo | null {
    const p1Index = this._pointIndex(this._p1);
    const p2Index = this._pointIndex(this._p2);
    if (p1Index === null || p2Index === null) return null;
    if (endTimePoint < p1Index || startTimePoint > p2Index) return null;
    return { priceRange: { minValue: this._minPrice, maxValue: this._maxPrice } };
  }
}
```

Onde `Point` é, literalmente, o que o motor precisaria emitir:

```ts
interface Point {
  time: Time;
  price: number;
}
```

**Detalhes que custam caro se ignorados:**

- **Espaço de coordenadas de bitmap.** `useBitmapCoordinateSpace` e a multiplicação por
  `horizontalPixelRatio`/`verticalPixelRatio` não são opcionais — sem elas o traço fica borrado
  em telas HiDPI. A doc tem uma página inteira sobre isso (`plugins/pixel-perfect-rendering`).
- **`timeToCoordinate` devolve `null`.** A doc é explícita: "X coordinate of that time or `null`
  if no time found on time scale". O renderer do exemplo simplesmente aborta quando qualquer
  coordenada é `null`. Consequência prática: **as pontas do segmento precisam cair em timestamps
  que existem na escala de tempo do gráfico.** Para o caso da cunha isso é natural — os
  extremos são Pivots, que são Candles reais. Mas uma reta *projetada para o futuro*, ou uma
  reta cuja ponta caia num timestamp sem barra, não desenha.
- **Autoescala é trabalho seu.** Sem `autoscaleInfo`, uma reta que saia da faixa de preço
  visível é simplesmente cortada.
- **Dependência externa**: o tipo `CanvasRenderingTarget2D` vem de `fancy-canvas`, que é
  dependência do próprio `lightweight-charts`.
- Os exemplos oficiais usam uma classe utilitária `PluginBase`
  (`plugin-examples/src/plugins/plugin-base.ts`, 53 linhas) que centraliza `attached`/`detached`
  e `requestUpdate`. `trend-line.ts` **não** a usa; `bands-indicator.ts` usa.

### 3.3 Caminho B — uma line series sobreposta de dois pontos

Uma `LineSeries` com exatamente dois pontos de dado desenha um segmento reto entre eles, sem
nenhum custom code. Isso decorre da definição da line series ("connected data points via
straight line segments") combinada com o fato de que `setData` não exige um valor por barra
(seção 6).

Limites que consegui estabelecer:

- Cada segmento inclinado independente exige **uma série própria** (uma line series é uma
  polilinha única; duas retas desconexas não cabem numa só, a menos que se use `WhitespaceData`
  entre elas para quebrar a linha).
- As pontas continuam presas a timestamps da escala; não há projeção fora do dado.
- Cada série adiciona um item de legenda/escala de preço a gerenciar.
- **Não confirmei em fonte primária** um número máximo de séries por gráfico nem o custo de
  performance de dezenas de séries de 2 pontos. A doc não fala disso.

### 3.4 Veredito de fato

O desenho de **um segmento inclinado arbitrário como anotação** (isto é, algo que não é uma
série de dados) **exige a API de Series Primitives**. Não há atalho nativo. Pane Primitives
não servem melhor aqui: a doc diz que eles "não podem desenhar nas escalas de preço e tempo" e
são para "recursos abrangentes do gráfico que não estão ligados a uma série em particular" —
uma trendline ancorada em preços de uma série é exatamente o caso de Series Primitive.

O custo é conhecido e limitado: **~190 linhas para a versão completa com rótulos e autoescala,
~70 para o núcleo**, e existe implementação de referência oficial que pode ser copiada.

---

## 4. Regiões sombreadas / preenchimento entre duas retas

**Não existe recurso nativo para preencher a área entre duas linhas arbitrárias.** O que a
biblioteca dá de graça é:

- **Area series** — preenche entre a linha e a escala de tempo (a base do gráfico), não entre
  duas linhas.
- **Baseline series** — preenche entre a linha e um `baseValue` **constante**. Não serve para o
  corpo de uma cunha, cujas duas fronteiras são inclinadas.

Para preencher entre duas fronteiras arbitrárias há dois exemplos oficiais:

- **`bands-indicator`** (211 linhas) — implementa `ISeriesPrimitive<Time>` (via `PluginBase`) e
  preenche a região entre uma banda superior e uma inferior. O `drawBackground` do renderer
  monta um `Path2D`: percorre os pontos traçando a fronteira superior, volta pela inferior em
  ordem reversa, fecha o caminho e preenche. Mapeia tempo para X com
  `timeScale.timeToCoordinate(d.time) ?? -100`. **É o análogo mais próximo do corpo da cunha**:
  a diferença é só que as fronteiras da cunha são retas de dois pontos em vez de séries densas.
- **`rectangle-drawing-tool`** (514 linhas) — retângulo desenhável pelo usuário, com mouse
  handlers e preview; boa referência de ferramenta interativa, mas bem mais código porque
  inclui interação.

Usar `drawBackground()` em vez de `draw()` é o que coloca o preenchimento **abaixo** dos candles.

**Custo**: mesma API do item 3, mesmo ciclo de vida, mais a geometria do polígono. Se as duas
retas da cunha já forem primitivas, o preenchimento é o mesmo primitivo com mais um caminho de
canvas — não é um segundo sistema.

---

## 5. Séries sobrepostas (média móvel como linha) — confirmado, trivial

Confirmado. A v5 unificou a criação de séries:

- **Antes (v4)**: `chart.addLineSeries({ color: 'red' })`
- **Depois (v5)**: `chart.addSeries(LineSeries, { color: 'red' })`, com
  `import { createChart, LineSeries } from 'lightweight-charts'`

Sete tipos de série disponíveis: Area, Bar, Baseline, Candlestick, Histogram, Line e Custom
Series (plugin, via `ICustomSeriesPaneView`). Múltiplas séries convivem no mesmo pane e
compartilham a escala de tempo — a doc do time scale diz que "o logical range começa no
primeiro ponto de dado **através de todas as séries**".

Uma média móvel sobre os candles é uma `LineSeries` a mais no mesmo pane. Zero custom code.

Desde a 5.0.0 também existe multi-pane (`chart.panes()`, `chart.addPane()`), caso um indicador
deva ir para um painel separado em vez de sobreposto.

---

## 6. Dado esparso — a biblioteca **não** exige um valor por barra

Duas confirmações independentes:

1. **Todos os tipos de série aceitam dois formatos de dado**: o formato específico
   (`SingleValueData`, `BarData`, `CandlestickData`) **ou `WhitespaceData`**. `WhitespaceData` é
   "um ponto de dado sem valor", com apenas `time` (e um `customValues` opcional que a
   biblioteca ignora mas plugins podem usar). Suporte a whitespace existe desde a **3.1.0**. O
   exemplo da doc: `{ time: '2018-12-04' }, // whitespace`.

2. **`setData` só exige ordenação**, não densidade. A doc: os dados devem ser "Ordered (earlier
   time point goes first)". Para `update()`, "o tempo do novo item deve ser maior ou igual ao
   último ponto de tempo existente". Não há exigência declarada de que uma série tenha um ponto
   para cada barra de outra série.

Portanto: uma série pode ter valores em alguns timestamps e não em todos. Duas nuances:

- **Omitir um ponto** e **incluir um whitespace** não são a mesma coisa em intenção: o
  whitespace serve para *reservar* o slot de tempo na escala (criando um buraco explícito na
  linha) mesmo quando nenhuma série tem valor ali. Omitir simplesmente não contribui com aquele
  timestamp.
- **Não confirmei em fonte primária** como uma line series renderiza entre dois pontos separados
  por barras onde ela não tem dado: se ela liga os dois pontos com um segmento reto atravessando
  o vazio (o comportamento que o Caminho B da seção 3.3 assume) ou se quebra a linha. A doc
  afirma que a line series conecta os pontos de dado com segmentos retos, o que sustenta a
  primeira leitura, e o whitespace existe justamente como mecanismo *explícito* de quebra — o
  que reforça que a omissão não quebra. Mas isso é inferência, não citação; **vale um teste de
  30 segundos antes de qualquer decisão depender disso.**

Relacionado: a 5.1.0 introduziu **data conflation** (`enableConflation`, desligado por padrão),
que funde pontos quando o zoom fica pequeno demais. Fica desligado por padrão, mas é relevante
saber que existe caso o gráfico ganhe históricos longos.

---

## 7. O que não consegui confirmar

Registrado explicitamente para não virar suposição em #8:

1. **Limite numérico de marcadores.** Não há limite documentado. Há apenas evidência de que
   15.000+ pontos de dado com marcadores já foi um gargalo corrigido.
2. **Comportamento de um marcador cujo `time` não existe na série.** Os release notes sugerem
   dependência do dado da série, mas nenhuma página da doc declara a regra.
3. **Renderização de uma line series entre pontos não adjacentes** (ver seção 6).
4. **Número máximo de séries por gráfico e custo de muitas séries de 2 pontos** — a doc não
   trata do assunto.
5. **Detalhes de z-order de primitivas.** A página de introdução aos plugins fala em "renderizar
   em níveis diferentes da pilha visual", e existe o tipo `PrimitivePaneViewZOrder`, mas não
   levantei os valores possíveis nem a semântica exata.
6. **Hit testing / interatividade de primitivas customizadas.** A 5.2.0 adicionou hit testing
   para séries e custom series (`ICustomSeriesPaneRenderer.hitTest()`); existe um `hitTest` no
   contrato de primitivas, mas não confirmei seu comportamento.

---

## Fontes

Todas primárias, consultadas em 2026-08-09.

**Documentação oficial** (`https://tradingview.github.io/lightweight-charts/docs/…`, versão 5.2)

- `/plugins/intro` — os dois tipos de plugin, o que primitivas podem fazer
- `/plugins/series-primitives` — `ISeriesPrimitive`, views, ciclo de vida, `IPrimitivePaneRenderer`
- `/plugins/pane-primitives` — `IPanePrimitive`, `pane.attachPrimitive`, limitações
- `/series-types` — os sete tipos de série e o aceite de `WhitespaceData`
- `/time-scale` — logical range através de todas as séries
- `/release-notes` — histórico de versões
- `/migrations/from-v4-to-v5` — `addSeries`, `createSeriesMarkers`, renomeação de interfaces
- `/api/functions/createSeriesMarkers` — assinatura e exemplo
- `/api/interfaces/ISeriesApi` — `createPriceLine`, `setData`, `attachPrimitive`, `priceToCoordinate`
- `/api/interfaces/ITimeScaleApi` — `timeToCoordinate` e o `null`
- `/api/interfaces/PriceLineOptions` — propriedades e defaults
- `/api/interfaces/WhitespaceData` — definição e uso

**Repositório** (`github.com/tradingview/lightweight-charts`, branch `master`)

- `src/plugins/series-markers/types.ts` — tipos de marcador (citado verbatim)
- `plugin-examples/src/plugins/trend-line/trend-line.ts` — 189 linhas (citado verbatim)
- `plugin-examples/src/plugins/bands-indicator/bands-indicator.ts` — 211 linhas
- `plugin-examples/src/plugins/rectangle-drawing-tool/rectangle-drawing-tool.ts` — 514 linhas
- `plugin-examples/src/plugins/plugin-base.ts` — 53 linhas
- `website/docs/release-notes.md` — marcos de versão
- Releases e npm registry — versão 5.2.0 como `latest`
