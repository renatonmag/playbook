<script setup lang="ts">
import type { Shape } from '~/types/shape'
import {
  type Ascent,
  ascentCounts,
  ascents,
  DEFAULT_DOMINANCE,
  MINIMUM_STREAK,
  scaleCeiling,
  type Streak,
  streakCounts,
  streaks,
  TOP,
} from '~/utils/record-bars'
import { dominates, impliedBodyMin } from '~/utils/two-bar-reversal'

/**
 * A bancada de tamanho — a terceira, ao lado de `/rules` e `/two-bar-reversal`.
 *
 * As outras duas medem forma e são cegas para escala de propósito. Esta faz as duas perguntas de
 * tamanho que sobram: *esta barra entrou no pódio do dia?* e *ela é a maior da sua cor há quantas
 * barras?* — e as faz **sequencialmente**, com estado que só olha para trás, porque o número na
 * tela tem de ser o número que uma regra rodando ao vivo naquela barra veria.
 *
 * Mesmo negócio das vizinhas: as Shapes são buscadas uma vez e a regra é avaliada no navegador a
 * cada tecla, então nenhum parâmetro de regra chega ao servidor. A chave de payload
 * `shapes:WIN@N:5m` é a mesma de `/two-bar-reversal`, então navegar entre as duas não refaz nada.
 */

const SYMBOL = 'WIN@N'

/**
 * `5m` e só, sem seletor — e isso é aritmética, não preferência.
 *
 * O pregão `1h` do `WIN@N` tem 10 barras. Com o streak parando na abertura e o mínimo em 10, a
 * área 2 seria **vazia por construção** ali — o máximo possível é 9. E a área 1 seria 88% estreia,
 * porque um pregão de 10 barras mal enche os quatro slots antes de acabar. Um seletor que oferece
 * uma aba onde metade da tela é zero por definição é uma armadilha, não uma opção.
 */
const TIMEFRAME = '5m' as const

/** Cards por página. Maior que os 24 de `/two-bar-reversal`: lá um item tem até 8 barras, aqui uma. */
const PAGE_SIZE = 60

/** A altura em que uma barra no teto da escala é desenhada, em pixels. */
const ROW_HEIGHT = 72

/** O mínimo que uma barra desenha, como fração de `ROW_HEIGHT`, para não virar um traço invisível. */
const MIN_SCALE = 0.14

const route = useRoute()
const router = useRouter()

/**
 * O dial, lido da URL — que carrega a regra, então um estado da bancada é um link, o mesmo
 * contrato das outras duas. Duplicado de `two-bar-reversal.vue` em vez de extraído, para não mexer
 * num arquivo com trabalho em andamento.
 */
function dial(key: string, fallback: number) {
  return computed(() => {
    const raw = route.query[key]
    const parsed = Number(raw)
    return typeof raw === 'string' && raw !== '' && !Number.isNaN(parsed) && parsed >= 0
      ? parsed
      : fallback
  })
}

/** O porteiro: `corpo ≥ k · maior pavio`. Não é a régua — a régua é sempre a amplitude. */
const k = dial('k', DEFAULT_DOMINANCE)

/** Qual metade da área 1 mostrar. */
const kind = computed(() => {
  const raw = route.query.tipo
  return raw === 'estreia' || raw === 'destronou' ? raw : 'todos'
})

/** Mais recentes primeiro: a página que ninguém rola até o fim deve ter o mercado que existe hoje. */
const newestFirst = computed(() => route.query.ordem !== 'antigas')

function update(patch: Record<string, string | undefined>) {
  router.replace({
    query: {
      k: String(k.value),
      tipo: kind.value === 'todos' ? undefined : kind.value,
      ordem: newestFirst.value ? undefined : 'antigas',
      ...patch,
    },
  })
}

const { data, pending: loading, error: failure } = useShapes(SYMBOL, TIMEFRAME)

const shapes = computed<Shape[]>(() => data.value ?? [])

/** Quantas barras passam pelo porteiro — o denominador honesto das duas áreas. */
const eligible = computed(() => shapes.value.filter(shape => dominates(shape, k.value)).length)

const allAscents = computed(() => ascents(shapes.value, k.value))
const allStreaks = computed(() => streaks(shapes.value, k.value))

const ascentTotals = computed(() => ascentCounts(allAscents.value))
const streakTotals = computed(() => streakCounts(allStreaks.value))

/**
 * O teto da escala de desenho — comum às duas áreas, calculado sobre tudo o que está listado.
 *
 * Comum de propósito: um card da área 1 e um da área 2 ficam a uma rolagem de distância, e duas
 * escalas vizinhas fariam barras do mesmo tamanho parecerem diferentes.
 */
const ceiling = computed(() =>
  scaleCeiling([
    ...allAscents.value.map(one => one.shape),
    ...allStreaks.value.map(one => one.shape),
  ]),
)

/** A área 1, filtrada e em ordem de leitura. */
const foundAscents = computed(() => {
  const all = kind.value === 'todos'
    ? allAscents.value
    : allAscents.value.filter(one => one.entry === kind.value)
  return newestFirst.value ? [...all].reverse() : all
})

/** A área 2, em ordem de leitura. */
const foundStreaks = computed(() =>
  newestFirst.value ? [...allStreaks.value].reverse() : allStreaks.value,
)

const ascentPage = ref(1)
const streakPage = ref(1)

// Qualquer mudança no que está sendo listado invalida onde você estava dentro dele.
watch([k, kind, newestFirst], () => {
  ascentPage.value = 1
  streakPage.value = 1
})

const ascentPages = computed(() => Math.max(1, Math.ceil(foundAscents.value.length / PAGE_SIZE)))
const streakPages = computed(() => Math.max(1, Math.ceil(foundStreaks.value.length / PAGE_SIZE)))

const shownAscents = computed(() => page(foundAscents.value, ascentPage.value))
const shownStreaks = computed(() => page(foundStreaks.value, streakPage.value))

function page<T>(all: T[], which: number): T[] {
  return all.slice((which - 1) * PAGE_SIZE, which * PAGE_SIZE)
}

/**
 * A altura de uma barra — sua amplitude contra o teto da página.
 *
 * Escala **global**, ao contrário de `/two-bar-reversal`, onde ela é interna a cada ocorrência. A
 * proibição de lá é específica àquele histórico: o `1h` atravessa cinco anos de patamares do
 * `WIN@N`, e uma escala comum desenharia 2021 inteiro como fiapos. O `5m` cobre 179 pregões, cerca
 * de nove meses, e dentro disso as amplitudes se comparam. Sem escala comum, uma bancada
 * inteiramente sobre tamanho desenharia todas as barras do mesmo tamanho.
 *
 * Continua sem *deslocamento* vertical, como nas outras: `/shapes` não carrega preço, então a
 * posição de uma barra na escala é desconhecida daqui. Só as alturas significam algo.
 */
function heightOf(shape: Shape): number {
  if (ceiling.value <= 0) return ROW_HEIGHT
  return Math.round(ROW_HEIGHT * Math.min(1, Math.max(MIN_SCALE, shape.amplitude / ceiling.value)))
}

/** O link de janela fixada que `/monitor` entende, terminando naquela Candle. */
function inContext(shape: Shape) {
  return {
    path: '/monitor',
    query: { symbol: SYMBOL, timeframe: TIMEFRAME, to: new Date(shape.time * 1000).toISOString() },
  }
}

/**
 * `timeZone: 'UTC'` em toda formatação de data desta página, e isso **não** é uma decisão de
 * exibir em UTC — é o que faz a hora sair certa em São Paulo.
 *
 * Os timestamps guardados caem nas horas UTC 09–18, e o pregão da B3 vai das 09:00 às 18:00 de
 * São Paulo. Os dois fatos só coexistem de um jeito: o epoch codifica hora de parede paulistana
 * **rotulada** como UTC. Converter para o fuso do navegador subtrai três horas de um número que
 * já é local, e a abertura das 09:00 aparece como 06:00.
 *
 * Formatar em UTC desfaz exatamente essa conversão, e o rótulo passa a ser a hora do pregão.
 * Enquanto essa convenção valer no banco, isto está certo em qualquer navegador do mundo — e é
 * a mesma leitura em que `utcDay` se apoia para não partir um pregão ao meio.
 *
 * Consequência boa: o rótulo deixa de depender do relógio de quem lê, então esta página não
 * precisa do `ClientOnly` que `/rules` e `/two-bar-reversal` põem em volta dos deles.
 */
const ZONE = 'UTC'

/**
 * Dia e hora. O ano vai por extenso porque o histórico cobre pregões de mais de um ano civil e
 * truncá-lo torna janeiro de anos diferentes idêntico.
 */
function label(shape: Shape) {
  return new Date(shape.time * 1000).toLocaleString('pt-BR', {
    timeZone: ZONE,
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function when(time: number) {
  return new Date(time * 1000).toLocaleString('pt-BR', {
    timeZone: ZONE,
    dateStyle: 'short',
    timeStyle: 'short',
  })
}

function count(value: number) {
  return value.toLocaleString('pt-BR')
}

/** O que o card da área 1 diz no canto, em uma linha. */
function ascentTitle(one: Ascent) {
  const place = `${one.place}ª ${one.shape.bear ? 'baixa' : 'alta'} do dia`
  return one.dethroned
    ? `${when(one.shape.time)} — ${place}, destronou ${count(one.dethroned.amplitude)} pts`
    : `${when(one.shape.time)} — ${place}, slot vazio`
}

function streakTitle(one: Streak) {
  return one.whole
    ? `${when(one.shape.time)} — maior ${one.shape.bear ? 'baixa' : 'alta'} do pregão até aqui`
    : `${when(one.shape.time)} — maior ${one.shape.bear ? 'baixa' : 'alta'} das últimas ${one.beaten} barras`
}

function share(part: number, whole: number) {
  return whole ? `${((part / whole) * 100).toFixed(1)}%` : '0,0%'
}
</script>

<template>
  <main class="mx-auto max-w-7xl p-8">
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">Barras recordistas</h1>
        <p class="mt-1 text-sm text-gray-500">
          {{ SYMBOL }} · {{ TIMEFRAME }} ·
          <NuxtLink to="/rules" class="underline">bancada de uma barra</NuxtLink> ·
          <NuxtLink to="/two-bar-reversal" class="underline">de duas barras</NuxtLink>
        </p>
      </div>
      <!-- Dito no lugar mais alto da página, porque uma lista de milhares de linhas se lê como
           lista de sinais a menos que seja avisado o contrário. -->
      <p class="max-w-md text-xs text-gray-500">
        Isto é um <b>filtro de tamanho, não um detector de sinal</b>. Nada aqui pergunta
        <i>onde</i> a barra aconteceu — só o quanto ela é grande para o dia e para o momento. As
        duas áreas são calculadas <b>sequencialmente</b>: o estado avança barra a barra e nunca lê
        o futuro, então o número é o que uma regra ao vivo veria naquele instante.
      </p>
    </header>

    <p v-if="loading" class="mt-8 rounded border border-gray-200 p-8 text-center text-sm text-gray-500">
      Medindo as Candles…
    </p>

    <div v-else-if="failure" class="mt-8 rounded border border-gray-200 p-8 text-center text-sm">
      <p class="text-red-600">Não foi possível ler as formas.</p>
      <p class="mt-1 font-mono text-xs text-gray-500">{{ failure.message }}</p>
    </div>

    <template v-else>
      <!-- zona 1 — a regra -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <h2 class="text-sm font-semibold">A regra</h2>
        <p class="mt-1 text-xs text-gray-500">
          A régua é sempre a <b>amplitude</b> em pontos. O dial abaixo é só o porteiro: quem não
          domina o próprio pavio não disputa récorde — mas continua contando como barra passada.
        </p>

        <div class="mt-3 flex flex-wrap items-start gap-x-10 gap-y-4 text-sm">
          <div>
            <label class="flex items-center gap-2">
              <span class="text-gray-500"><code class="font-mono">k</code> — corpo contra o pavio</span>
              <input
                type="number" step="0.1" min="0"
                class="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                :value="k"
                @change="update({ k: ($event.target as HTMLInputElement).value })"
              >
            </label>
            <p class="mt-1 text-xs text-gray-500">
              garante <code class="font-mono">corpo ≥ {{ impliedBodyMin(k).toFixed(3) }}</code> ·
              {{ count(eligible) }} de {{ count(shapes.length) }} barras passam
              ({{ share(eligible, shapes.length) }})
            </p>
          </div>

          <div class="max-w-sm">
            <p class="text-gray-500">Por que só <code class="font-mono">5m</code></p>
            <!-- Não é preferência, é aritmética, e sem isto escrito a ausência do seletor parece
                 esquecimento. -->
            <p class="mt-1 text-xs text-gray-500">
              O pregão <code class="font-mono">1h</code> do {{ SYMBOL }} tem 10 barras. Com o streak
              parando na abertura e o mínimo em {{ MINIMUM_STREAK }}, a segunda área seria
              <b>vazia por construção</b> ali, e a primeira seria quase toda estreia.
            </p>
          </div>

          <div>
            <p class="text-gray-500">Ordem</p>
            <select
              class="mt-1 rounded border border-gray-300 px-2 py-1 text-xs"
              :value="newestFirst ? 'recentes' : 'antigas'"
              @change="update({ ordem: ($event.target as HTMLSelectElement).value === 'antigas' ? 'antigas' : undefined })"
            >
              <option value="recentes">mais recentes</option>
              <option value="antigas">mais antigas</option>
            </select>
          </div>
        </div>
      </section>

      <!-- zona 2 — récorde do dia -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <h2 class="text-sm font-semibold">Récorde do dia</h2>
        <p class="mt-1 text-xs text-gray-500">
          Cada pregão guarda {{ TOP }} lugares para barras de alta e {{ TOP }} para barras de baixa,
          zerados na abertura. Um item nasce toda vez que uma barra entra nesse pódio — seja
          superando alguém, seja ocupando um lugar que ainda estava vazio.
        </p>

        <div class="mt-3 flex flex-wrap gap-10">
          <div>
            <p class="text-2xl font-semibold tabular-nums">{{ count(ascentTotals.total) }}</p>
            <p class="text-xs text-gray-500">ingressos no pódio</p>
          </div>
          <div>
            <p class="text-2xl font-semibold tabular-nums">{{ count(ascentTotals.dethronings) }}</p>
            <p class="text-xs text-gray-500 tabular-nums">
              destronamentos · {{ share(ascentTotals.dethronings, ascentTotals.total) }}
            </p>
          </div>
          <div>
            <p class="text-2xl font-semibold tabular-nums">{{ count(ascentTotals.debuts) }}</p>
            <!-- Separado porque uma estreia não superou nada: é o pódio se enchendo, não conquista. -->
            <p class="text-xs text-gray-500 tabular-nums">
              estreias · {{ share(ascentTotals.debuts, ascentTotals.total) }}
            </p>
          </div>
          <div>
            <p class="text-2xl font-semibold tabular-nums">
              {{ count(ascentTotals.bull) }} / {{ count(ascentTotals.bear) }}
            </p>
            <p class="text-xs text-gray-500">alta / baixa</p>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-baseline justify-between gap-3 border-t border-gray-200 pt-3">
          <label class="text-xs">
            <span class="mr-2 text-gray-500">Mostrar</span>
            <select
              class="rounded border border-gray-300 px-2 py-1 text-xs"
              :value="kind"
              @change="update({ tipo: ($event.target as HTMLSelectElement).value })"
            >
              <option value="todos">tudo</option>
              <option value="destronou">só destronamentos</option>
              <option value="estreia">só estreias</option>
            </select>
          </label>
          <p class="text-xs text-gray-500 tabular-nums">
            {{ count(foundAscents.length) }} itens · página {{ ascentPage }} de {{ count(ascentPages) }}
          </p>
        </div>

        <p v-if="!foundAscents.length" class="mt-4 text-sm text-gray-500">
          Nada com <code class="font-mono">k = {{ k }}</code>.
        </p>

        <!-- Sem `ClientOnly`, ao contrário de `/rules` e `/two-bar-reversal`: os rótulos aqui são
             formatados em UTC e não leem o relógio de quem acessa, então servidor e cliente
             produzem o mesmo texto e a lista pode vir renderizada do SSR. Ver `ZONE`. -->
        <template v-else>
          <ul class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            <li v-for="one in shownAscents" :key="one.shape.time">
              <NuxtLink
                :to="inContext(one.shape)"
                class="flex h-full flex-col rounded border border-gray-100 p-2 hover:border-gray-300 hover:bg-gray-50"
                :title="ascentTitle(one)"
              >
                <span class="flex items-end justify-center" :style="{ height: `${ROW_HEIGHT}px` }">
                  <ShapeCandle :shape="one.shape" :width="24" :height="heightOf(one.shape)" />
                </span>
                <span class="mt-1.5 flex items-baseline justify-between gap-1">
                  <span class="font-semibold tabular-nums text-[11px]">
                    {{ one.place }}ª {{ one.shape.bear ? 'baixa' : 'alta' }}
                  </span>
                  <span class="tabular-nums text-[10px] text-gray-500">
                    {{ count(one.shape.amplitude) }} pts
                  </span>
                </span>
                <span class="mt-0.5 flex items-baseline justify-between gap-1">
                  <span class="font-mono text-[10px] text-gray-400">{{ label(one.shape) }}</span>
                  <span
                    class="shrink-0 text-[10px]"
                    :class="one.entry === 'estreia' ? 'text-gray-400' : 'text-amber-700'"
                  >{{ one.entry }}</span>
                </span>
              </NuxtLink>
            </li>
          </ul>

          <div v-if="ascentPages > 1" class="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              :disabled="ascentPage === 1"
              @click="ascentPage--"
            >
              anterior
            </button>
            <span class="tabular-nums text-gray-500">{{ ascentPage }} / {{ count(ascentPages) }}</span>
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              :disabled="ascentPage === ascentPages"
              @click="ascentPage++"
            >
              próxima
            </button>
          </div>
        </template>
      </section>

      <!-- zona 3 — maior das últimas N -->
      <section class="mt-6 rounded border border-gray-200 p-4">
        <h2 class="text-sm font-semibold">Maior das últimas {{ MINIMUM_STREAK }}+</h2>
        <p class="mt-1 text-xs text-gray-500">
          A barra compete <b>só com as da mesma cor</b>, mas a contagem inclui <b>as duas</b>: se as
          últimas 10 barras têm 3 de baixa, uma candidata de baixa venceu 3 disputas e o número
          mostrado é 10 — o streak é um intervalo de relógio. O passeio para trás para na abertura
          do pregão, nunca atravessa a noite.
        </p>

        <div class="mt-3 flex flex-wrap gap-10">
          <div>
            <p class="text-2xl font-semibold tabular-nums">{{ count(streakTotals.total) }}</p>
            <p class="text-xs text-gray-500">barras recordistas</p>
          </div>
          <div>
            <p class="text-2xl font-semibold tabular-nums">{{ count(streakTotals.whole) }}</p>
            <!-- A interseção das duas áreas, e o caso mais forte que esta bancada produz. -->
            <p class="text-xs text-gray-500 tabular-nums">
              maiores do pregão inteiro · {{ share(streakTotals.whole, streakTotals.total) }}
            </p>
          </div>
          <div>
            <p class="mb-1 text-xs font-semibold text-gray-500">Barras superadas</p>
            <table class="text-xs tabular-nums">
              <tbody>
                <tr v-for="bucket in streakTotals.buckets" :key="bucket.label" class="border-t border-gray-100">
                  <td class="py-0.5 pr-4 text-gray-500">{{ bucket.label }}</td>
                  <td class="py-0.5 pr-4 text-right">{{ count(bucket.howMany) }}</td>
                  <td class="py-0.5 text-gray-400">{{ share(bucket.howMany, streakTotals.total) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <p v-if="!foundStreaks.length" class="mt-4 text-sm text-gray-500">
          Nada com <code class="font-mono">k = {{ k }}</code>.
        </p>

        <template v-else>
          <p class="mt-4 border-t border-gray-200 pt-3 text-xs text-gray-500 tabular-nums">
            {{ count(foundStreaks.length) }} itens · página {{ streakPage }} de {{ count(streakPages) }} ·
            alturas proporcionais à amplitude numa escala comum às duas áreas, saturando em
            {{ count(ceiling) }} pts
          </p>

          <ul class="mt-3 grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
            <li v-for="one in shownStreaks" :key="one.shape.time">
              <NuxtLink
                :to="inContext(one.shape)"
                class="flex h-full flex-col rounded border border-gray-100 p-2 hover:border-gray-300 hover:bg-gray-50"
                :title="streakTitle(one)"
              >
                <span class="flex items-end justify-center" :style="{ height: `${ROW_HEIGHT}px` }">
                  <ShapeCandle :shape="one.shape" :width="24" :height="heightOf(one.shape)" />
                </span>
                <span class="mt-1.5 flex items-baseline justify-between gap-1">
                  <span class="font-semibold tabular-nums text-[13px]">{{ count(one.beaten) }}</span>
                  <span class="tabular-nums text-[10px] text-gray-500">
                    {{ count(one.shape.amplitude) }} pts
                  </span>
                </span>
                <span class="mt-0.5 flex items-baseline justify-between gap-1">
                  <span class="font-mono text-[10px] text-gray-400">{{ label(one.shape) }}</span>
                  <span v-if="one.whole" class="shrink-0 text-[10px] text-amber-700">pregão</span>
                </span>
              </NuxtLink>
            </li>
          </ul>

          <div v-if="streakPages > 1" class="mt-4 flex items-center justify-center gap-3 text-sm">
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              :disabled="streakPage === 1"
              @click="streakPage--"
            >
              anterior
            </button>
            <span class="tabular-nums text-gray-500">{{ streakPage }} / {{ count(streakPages) }}</span>
            <button
              type="button"
              class="rounded border border-gray-300 px-3 py-1 disabled:opacity-40"
              :disabled="streakPage === streakPages"
              @click="streakPage++"
            >
              próxima
            </button>
          </div>
        </template>
      </section>
    </template>
  </main>
</template>
