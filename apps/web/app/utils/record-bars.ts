/**
 * Barras recordistas — as duas perguntas de *tamanho* que `/rules` e `/two-bar-reversal` não fazem.
 *
 * Aquelas duas bancadas medem **forma**: uma Candle contra os próprios pavios, um par contra si
 * mesmo. Nenhuma pergunta se a barra é grande, e forma é idêntica em qualquer escala — um corpo
 * dominante de 40 pontos e um de 500 são a mesma Shape. Este arquivo faz a pergunta que falta, em
 * duas versões:
 *
 * - `ascents` — esta barra entrou no pódio **do dia**?
 * - `streaks` — esta barra é a maior da sua cor há quantas barras?
 *
 * Puro — sem Vue, sem fetch — pelo mesmo motivo que `two-bar-reversal.ts` é: é a aritmética que a
 * bancada mostra, e tem de ser legível ao lado dos números que produz.
 *
 * **Tudo aqui é sequencial, e isso é a exigência e não um detalhe.** Nenhuma função carrega o
 * pregão e tira um `Math.max`: o estado avança barra a barra e só lê o passado, porque o número
 * que a tela mostra tem de ser o número que um processador rodando ao vivo naquela barra veria.
 * Um récorde calculado com o dia inteiro na mão é uma afirmação sobre o passado; um récorde
 * calculado sequencialmente é uma afirmação sobre aquele instante, e só a segunda vira regra.
 *
 * Um dial só, `k`, e ele não é a régua — é o porteiro. A régua é sempre `amplitude`.
 */

import type { Shape } from '~/types/shape'
import { dominates } from '~/utils/two-bar-reversal'

/**
 * Quantos lugares cada direção guarda por pregão.
 *
 * Dois, e não um, porque a segunda colocada é o que dá sentido à primeira: uma barra que lidera
 * sozinha pode ser a única dominante do dia. Não é um dial — o pedido é "a maior e a segunda
 * maior", e um terceiro lugar responde a outra pergunta.
 */
export const TOP = 2

/**
 * O streak mínimo para a área 2 emitir um item.
 *
 * Constante, não dial, e o motivo é aritmético: o pregão do `WIN@N` tem 113 barras de `5m`, então
 * 10 é um recorte curto o bastante para acontecer várias vezes por dia e longo o bastante para não
 * ser ruído. Num timeframe cujo pregão tem 10 barras isto seria inatingível, e é por isso que esta
 * bancada é só `5m` — ver o comentário de `streaks`.
 */
export const MINIMUM_STREAK = 10

/**
 * O quanto o corpo tem de dominar o maior pavio para a barra poder disputar.
 *
 * `1` — corpo pelo menos do tamanho do maior pavio. Deixa passar 52% das barras do `5m`, o que faz
 * dele um porteiro brando; o dial existe para achar onde ele aperta.
 *
 * Não se chama `DEFAULT_K` como o de `two-bar-reversal.ts`, apesar de alimentar o mesmo
 * `dominates` com o mesmo valor: o Nuxt auto-importa os utilitários num espaço de nomes só, e dois
 * `DEFAULT_K` fazem um vencer o outro em silêncio conforme a ordem do registro. São constantes de
 * regras diferentes que hoje coincidem — mexer numa não pode mexer na outra.
 */
export const DEFAULT_DOMINANCE = 1

/** Onde o passeio para trás de `streaks` parou. */
export interface Streak {
  /** A barra que fez o récorde. */
  shape: Shape
  /**
   * Quantas barras ela superou, andando para trás — **de ambas as cores**.
   *
   * A disputa é só entre iguais, mas a contagem é de relógio: se as últimas 10 barras têm 3 de
   * baixa, uma candidata de baixa compete com essas 3 e o número mostrado é 10. Isso é o que faz
   * o streak significar "há quanto tempo", em vez de "há quantas barras da mesma cor" — que
   * poderia cobrir quatro vezes mais pregão.
   */
  beaten: number
  /**
   * Se o passeio alcançou a abertura do pregão sem ser interrompido.
   *
   * Ou seja: a barra é a maior da sua cor no dia inteiro **até ali**. É a interseção das duas
   * áreas desta bancada, e vale um selo na tela porque é o caso mais forte que existe aqui.
   */
  whole: boolean
}

/** O lugar que uma barra tomou no pódio do dia. */
export type Place = 1 | 2

/**
 * Como ela chegou lá.
 *
 * `estreia` é slot vazio — a direção ainda não tinha dois ocupantes, então a barra não superou
 * ninguém. `destronou` é o contrário. A distinção existe porque as duas contam como "entrou no
 * top-2" e só uma delas é conquista.
 */
export type Entry = 'estreia' | 'destronou'

/** Um ingresso no pódio do dia. */
export interface Ascent {
  /** A barra que entrou. */
  shape: Shape
  place: Place
  entry: Entry
  /**
   * A barra empurrada para *fora* do top-2, quando houve uma — nunca a que apenas escorregou de
   * primeira para segunda. `null` em toda estreia.
   */
  dethroned: Shape | null
}

/** Como a área 1 se divide, para a tela que precisa explicar o que está mostrando. */
export interface AscentCounts {
  total: number
  /** Ingressos em slot vazio: a barra não superou nada. */
  debuts: number
  /** Ingressos que empurraram alguém para fora. */
  dethronings: number
  /** Do total, quantos foram de barras de alta e de baixa. */
  bull: number
  bear: number
}

/** Uma faixa do histograma de streaks. */
export interface Bucket {
  label: string
  from: number
  /** Aberto no topo quando `null`. */
  to: number | null
  howMany: number
}

/** Como a área 2 se divide. */
export interface StreakCounts {
  total: number
  /** Quantos alcançaram a abertura do pregão. */
  whole: number
  buckets: Bucket[]
}

/**
 * As faixas do histograma, em barras superadas.
 *
 * Estreitas embaixo e largas em cima porque a distribuição é assim: o streak mediano é 17 e a
 * cauda vai a 112, então faixas de tamanho igual dariam uma primeira barra enorme e trinta vazias.
 */
const BUCKETS: readonly [number, number | null][] = [
  [10, 14],
  [15, 19],
  [20, 29],
  [30, null],
]

/**
 * O dia UTC em que a Candle abriu.
 *
 * **UTC, não o dia do navegador**, exatamente como em `two-bar-reversal.ts`: os timestamps caem
 * nas horas UTC 09–18, e um navegador em UTC+9 os leria como 18:00–03:00, partindo o pregão ao
 * meio. As contagens desta bancada passariam a depender de onde está sentado quem a lê.
 *
 * Duplicado de `two-bar-reversal.ts`, onde é privado. Sai daqui quando as primitivas sem escala
 * (`dominates`, `impliedBodyMin`, isto) forem para um módulo comum — o que não foi feito agora
 * para não mexer num arquivo com trabalho em andamento.
 */
function utcDay(time: number): number {
  return Math.floor(time / 86_400)
}

/**
 * Todo ingresso no pódio do dia, na ordem em que aconteceram.
 *
 * O estado é quatro lugares — dois por direção — zerados na virada do dia UTC. Uma passada só,
 * para frente, e o pódio nunca é recalculado: ele é *mantido*. Essa é a diferença entre esta
 * função e um `sort` por pregão, e é a razão de ela existir.
 *
 * **Rankings separados por direção.** Uma barra de alta disputa com barras de alta, e o pódio de
 * baixa segue intocado — é o pedido, e faz sentido: a maior compra do dia e a maior venda do dia
 * são dois fatos, não um.
 *
 * **Empate não destrona.** Quem chegou primeiro fica, porque "maior" é estritamente maior. O
 * `WIN@N` cota em pontos inteiros e empates exatos de amplitude são às centenas no histórico, então
 * isto decide o conteúdo de muitos itens e não é uma sutileza de ponto flutuante.
 *
 * **Estreias são emitidas junto com destronamentos**, distinguidas por `entry`. Filtrar as
 * estreias fora aqui pareceria mais limpo e apagaria o caso mais interessante do dia: a barra de
 * abertura gigantesca que assume a liderança na primeira Candle e nunca cai não destrona ninguém,
 * nunca, e sumiria da bancada inteira.
 */
export function ascents(shapes: Shape[], k: number): Ascent[] {
  const found: Ascent[] = []

  // Índice 0 é o pódio de alta, 1 o de baixa — indexado por `Number(bear)`, cada um ordenado do
  // maior para o menor e com no máximo `TOP` barras.
  let podium: [Shape[], Shape[]] = [[], []]
  let day: number | null = null

  for (const shape of shapes) {
    const today = utcDay(shape.time)
    if (today !== day) {
      day = today
      podium = [[], []]
    }

    // O porteiro. A barra rejeitada aqui não entra no pódio — mas continua existindo no pregão, e
    // `streaks` a conta. Só o pódio é reservado às dominantes.
    if (!dominates(shape, k)) continue

    const slots = podium[shape.bear ? 1 : 0]!

    // Onde ela entra: o primeiro lugar cujo ocupante ela supera. `>` e não `>=` — empate não
    // destrona.
    let place = slots.findIndex(held => shape.amplitude > held.amplitude)
    if (place === -1) {
      // Não superou ninguém. Só entra se sobrou lugar.
      if (slots.length >= TOP) continue
      place = slots.length
    }

    // Cheio antes da inserção significa que alguém vai cair fora — e é sempre o último, mesmo
    // quando `place` é 0 e o líder apenas escorregou para segundo.
    const full = slots.length >= TOP
    const dethroned = full ? slots[TOP - 1]! : null

    slots.splice(place, 0, shape)
    slots.length = Math.min(slots.length, TOP)

    found.push({
      shape,
      place: (place + 1) as Place,
      entry: full ? 'destronou' : 'estreia',
      dethroned,
    })
  }

  return found
}

/**
 * Toda barra que é a maior da sua cor há pelo menos `MINIMUM_STREAK` barras, na ordem do histórico.
 *
 * Da candidata, anda para trás contando **todas** as barras e parando na primeira **da mesma cor**
 * com amplitude maior ou igual à dela. As duas metades dessa frase fazem trabalhos diferentes: a
 * cor decide *contra quem* ela compete, e a contagem ignora cor porque o número tem de ser um
 * intervalo de tempo. Uma candidata de baixa cujas 10 barras anteriores contêm 3 de baixa venceu
 * 3 disputas e o streak mostrado é 10.
 *
 * **O passeio para na abertura do pregão.** Custa as primeiras 10 barras de cada dia, que nunca
 * podem qualificar — e é o que mantém "as últimas 10 barras" significando dez barras de negociação
 * contínua, em vez de dez barras que atravessam uma noite e um fim de semana.
 *
 * A fronteira é `utcDay` e **não** `adjacent`, ao contrário de `averageAmplitude` em
 * `two-bar-reversal.ts`. Lá a contiguidade importa porque a regra lê Candles coladas; aqui a
 * pergunta é de tamanho, e uma Candle sem amplitude que `/shapes` tenha omitido no meio do pregão
 * não é motivo para declarar o récorde interrompido.
 *
 * Consequência de projeto, dita porque não é óbvia: num timeframe cujo pregão tem menos de
 * `MINIMUM_STREAK + 1` barras esta função devolve lista vazia **sempre**. O pregão `1h` do `WIN@N`
 * tem 10 barras, então o streak máximo possível ali é 9. Não é raro — é impossível. Por isso a
 * bancada é `5m` e diz que é.
 *
 * Custo: O(n · pregão). O passeio é limitado pelas 113 barras de um pregão de `5m`, então mesmo o
 * pior caso sobre as 20 mil barras do histórico são poucos milissegundos — medido, não estimado, e
 * é o que permite rodar isto a cada tecla no dial.
 */
export function streaks(shapes: Shape[], k: number): Streak[] {
  const found: Streak[] = []

  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i]!
    if (!dominates(shape, k)) continue

    const day = utcDay(shape.time)
    let beaten = 0
    let whole = true

    for (let j = i - 1; j >= 0 && utcDay(shapes[j]!.time) === day; j--) {
      // `>=` — empate interrompe, porque "maior" é estritamente maior.
      if (shapes[j]!.bear === shape.bear && shapes[j]!.amplitude >= shape.amplitude) {
        whole = false
        break
      }
      beaten++
    }

    if (beaten >= MINIMUM_STREAK) found.push({ shape, beaten, whole })
  }

  return found
}

/** Como a área 1 se divide — o que faz mexer no dial `k` significar alguma coisa. */
export function ascentCounts(found: Ascent[]): AscentCounts {
  let debuts = 0
  let bear = 0

  for (const one of found) {
    if (one.entry === 'estreia') debuts++
    if (one.shape.bear) bear++
  }

  return {
    total: found.length,
    debuts,
    dethronings: found.length - debuts,
    bull: found.length - bear,
    bear,
  }
}

/** Como a área 2 se divide. */
export function streakCounts(found: Streak[]): StreakCounts {
  const buckets: Bucket[] = BUCKETS.map(([from, to]) => ({
    label: to === null ? `${from}+` : `${from}–${to}`,
    from,
    to,
    howMany: 0,
  }))

  let whole = 0

  for (const one of found) {
    if (one.whole) whole++
    const bucket = buckets.find(({ from, to }) => one.beaten >= from && (to === null || one.beaten <= to))
    if (bucket) bucket.howMany++
  }

  return { total: found.length, whole, buckets }
}

/**
 * A amplitude em que a escala de desenho satura — o percentil 95 das barras mostradas.
 *
 * A escala aqui é **global à página**, e isso contradiz frontalmente `two-bar-reversal.vue`, onde
 * ela é interna a cada ocorrência. A proibição de lá é específica e não se aplica: o `WIN@N` mudou
 * de patamar entre 2021 e 2026, e o histórico `1h` daquela bancada atravessa os cinco anos, então
 * uma escala comum desenharia 2021 inteiro como fiapos. O histórico `5m` cobre 179 pregões — cerca
 * de nove meses — e dentro dele as amplitudes são comparáveis. Sem escala comum, uma bancada
 * inteiramente sobre *tamanho* desenharia todas as barras do mesmo tamanho.
 *
 * O percentil 95 em vez do máximo porque a cauda de amplitude é longa: a maior barra do histórico
 * tem 2670 pontos contra uma mediana de 210, então ancorar nela achataria milhares de barras
 * contra o chão para desenhar bem uma. As acima do teto saturam no topo e são lidas pelo número em
 * pontos que o card carrega ao lado.
 *
 * Recebe as barras **que a página está listando**, e não o histórico inteiro. Recordistas são
 * grandes por definição: o p95 do histórico é 565 pontos e satura 945 dos 3735 cards — um quarto
 * da tela desenhado grudado no teto. O p95 dos listados é 920 e satura 5%. O custo é que o teto se
 * move quando o dial `k` se move, e é por isso que a tela o imprime em vez de escondê-lo.
 */
export function scaleCeiling(shapes: Shape[]): number {
  if (shapes.length === 0) return 0
  const sorted = shapes.map(shape => shape.amplitude).sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!
}
