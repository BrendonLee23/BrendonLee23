/**
 * Gera `assets/commits.svg`: o calendário de contribuições dos últimos 12 meses,
 * nas cores deste perfil.
 *
 * Existe porque nenhum serviço público serve esse card com cor customizável nos
 * dias vazios — o `ghchart` crava `#EEEEEE`, que vira um bloco branco no tema
 * escuro, e o `github-readme-activity-graph` está fora do ar. Gerando aqui, o
 * SVG é servido pelo próprio repositório: sem terceiro para cair, e a paleta é
 * a mesma do resto do README.
 *
 * Dado: github-contributions-api.jogruber.de (API pública, sem token). Se ela
 * sair do ar, o arquivo anterior continua no repositório — o README não quebra,
 * só para de atualizar, e a Action falha avisando.
 */

import { writeFile, mkdir } from 'node:fs/promises'

const USUARIO = 'BrendonLee23'

/**
 * Do mais fraco ao mais forte: #8A3FFC misturado com o fundo do GitHub escuro.
 * O nível 0 não entra aqui — ele é pintado por classe, para poder trocar no
 * modo claro (`fill` inline venceria o CSS).
 */
const CORES = [null, '#2c1d50', '#45267e', '#6531b7', '#8A3FFC']

const VAZIO_ESCURO = '#161b22'
const VAZIO_CLARO = '#ebedf0'

const COR_TEXTO = '#8b949e'
const COR_TEXTO_CLARO = '#57606a'
const FONTE = "'Segoe UI', Ubuntu, sans-serif"

const LADO = 11 // lado do quadradinho
const PASSO = 14 // lado + respiro
const MARGEM_ESQUERDA = 30 // espaço dos rótulos Mon/Wed/Fri
const MARGEM_TOPO = 20 // espaço dos rótulos dos meses

const MESES = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

async function buscarContribuicoes() {
  const resposta = await fetch(
    `https://github-contributions-api.jogruber.de/v4/${USUARIO}?y=last`,
  )

  if (!resposta.ok) {
    throw new Error(
      `A API de contribuições respondeu ${resposta.status}. SVG não regenerado.`,
    )
  }

  const { contributions } = await resposta.json()

  if (!Array.isArray(contributions) || contributions.length === 0) {
    throw new Error('A API respondeu sem dias de contribuição.')
  }

  return contributions
}

/**
 * Quebra os dias em semanas de domingo a sábado.
 *
 * A primeira semana quase nunca começa no domingo, então ela nasce com buracos
 * — `null` em vez de dia. Sem isso o calendário inteiro sai deslocado de alguns
 * dias, e o erro só aparece quando alguém confere a data de um quadradinho.
 */
function emSemanas(dias) {
  const semanas = []
  let semana = new Array(7).fill(null)

  for (const dia of dias) {
    const dataUtc = new Date(`${dia.date}T00:00:00Z`)
    const diaDaSemana = dataUtc.getUTCDay()

    if (diaDaSemana === 0 && semana.some(Boolean)) {
      semanas.push(semana)
      semana = new Array(7).fill(null)
    }

    semana[diaDaSemana] = { ...dia, data: dataUtc }
  }

  if (semana.some(Boolean)) semanas.push(semana)

  return semanas
}

/** Rótulo do mês na primeira semana em que ele aparece, sem repetir o anterior. */
function rotulosDeMes(semanas) {
  const rotulos = []
  let ultimoMes = -1

  semanas.forEach((semana, indice) => {
    const primeiroDia = semana.find(Boolean)
    if (!primeiroDia) return

    const mes = primeiroDia.data.getUTCMonth()
    if (mes === ultimoMes) return

    ultimoMes = mes

    // Mês que só aparece na última semana não cabe: o texto vaza do SVG.
    if (indice > semanas.length - 3) return

    rotulos.push({ x: MARGEM_ESQUERDA + indice * PASSO, texto: MESES[mes] })
  })

  return rotulos
}

function montarSvg(semanas, total) {
  const largura = MARGEM_ESQUERDA + semanas.length * PASSO
  const altura = MARGEM_TOPO + 7 * PASSO

  const meses = rotulosDeMes(semanas)
    .map(
      ({ x, texto }) =>
        `<text x="${x}" y="12" class="rotulo">${texto}</text>`,
    )
    .join('\n  ')

  const diasDaSemana = [
    { linha: 1, texto: 'Seg' },
    { linha: 3, texto: 'Qua' },
    { linha: 5, texto: 'Sex' },
  ]
    .map(
      ({ linha, texto }) =>
        `<text x="0" y="${MARGEM_TOPO + linha * PASSO + 9}" class="rotulo">${texto}</text>`,
    )
    .join('\n  ')

  const quadrados = semanas
    .flatMap((semana, coluna) =>
      semana.map((dia, linha) => {
        if (!dia) return null

        const x = MARGEM_ESQUERDA + coluna * PASSO
        const y = MARGEM_TOPO + linha * PASSO
        const cor = CORES[Math.min(dia.level, CORES.length - 1)]
        const plural = dia.count === 1 ? 'contribuição' : 'contribuições'
        const pintura = cor ? `fill="${cor}"` : 'class="vazio"'

        return (
          `<rect x="${x}" y="${y}" width="${LADO}" height="${LADO}" rx="2" ${pintura}>` +
          `<title>${dia.count} ${plural} em ${dia.date}</title></rect>`
        )
      }),
    )
    .filter(Boolean)
    .join('\n  ')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largura}" height="${altura}" viewBox="0 0 ${largura} ${altura}" role="img" aria-label="${total} contribuições de ${USUARIO} nos últimos 12 meses">
  <style>
    .rotulo { font: 10px ${FONTE}; fill: ${COR_TEXTO}; }
    .vazio { fill: ${VAZIO_ESCURO}; }
    /* No tema claro do GitHub o quadrado escuro vira um bloco preto. */
    @media (prefers-color-scheme: light) {
      .vazio { fill: ${VAZIO_CLARO}; }
      .rotulo { fill: ${COR_TEXTO_CLARO}; }
    }
  </style>
  ${meses}
  ${diasDaSemana}
  ${quadrados}
</svg>
`
}

const dias = await buscarContribuicoes()
const total = dias.reduce((soma, dia) => soma + dia.count, 0)
const svg = montarSvg(emSemanas(dias), total)

await mkdir(new URL('../assets/', import.meta.url), { recursive: true })
await writeFile(new URL('../assets/commits.svg', import.meta.url), svg, 'utf8')

console.log(
  `assets/commits.svg gerado: ${dias.length} dias, ${total} contribuições.`,
)
