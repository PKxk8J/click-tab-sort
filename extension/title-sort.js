const GENERIC_COLLATOR_OPTIONS = {
  usage: 'sort',
  numeric: false,
  sensitivity: 'accent',
}
const TEXT_COLLATOR_OPTIONS = {
  usage: 'sort',
  numeric: false,
  sensitivity: 'accent',
}
const KANA_COLLATOR_OPTIONS = {
  usage: 'sort',
  numeric: false,
  sensitivity: 'variant',
  caseFirst: 'lower',
}
const OTHER_LETTER_COLLATOR_OPTIONS = {
  usage: 'sort',
  numeric: false,
  sensitivity: 'accent',
}

const TITLE_CATEGORY_ORDER = {
  symbol: 0,
  number: 1,
  latin: 2,
  kana: 3,
  kanji: 4,
  otherLetter: 5,
}

const ASCII_DIGIT_RE = /^[0-9]$/
const FULL_WIDTH_DIGIT_RE = /^[０-９]$/
const DECIMAL_NUMBER_RE = /^\p{Decimal_Number}$/u
const LATIN_RE = /\p{Script=Latin}/u
const HIRAGANA_RE = /\p{Script=Hiragana}/u
const KATAKANA_RE = /\p{Script=Katakana}/u
const HAN_RE = /\p{Script=Han}/u
const HAN_EXTENSION_RE = /\p{Script_Extensions=Han}/u
const LETTER_RE = /\p{Letter}/u
const UPPER_CASE_RE = /\p{Uppercase}/u
const LOWER_CASE_RE = /\p{Lowercase}/u
const FULL_WIDTH_LATIN_RE = /[Ａ-Ｚａ-ｚ]/
const HALF_WIDTH_KATAKANA_RE = /[ｦ-ﾟ]/
const FULL_WIDTH_ASCII_SYMBOL_RE = /^[！-／：-＠［-｀｛-～]$/
const FULL_WIDTH_CURRENCY_SYMBOL_RE = /^[￠-￦]$/
const HALF_WIDTH_JAPANESE_SYMBOL_RE = /^[｡｢｣､･]$/
const FULL_WIDTH_JAPANESE_SYMBOL_RE = /^[。「」、・]$/
const FULL_WIDTH_SPACE = '\u3000'

const HALF_WIDTH_RANK = 0
const FULL_WIDTH_RANK = 1
const OTHER_WIDTH_RANK = 2
const HIRAGANA_RANK = 0
const KATAKANA_RANK = 1
const HALF_WIDTH_KATAKANA_RANK = 2
const UPPER_CASE_RANK = 0
const LOWER_CASE_RANK = 1
const OTHER_CASE_RANK = 2

function addLocale (locales, locale) {
  if (typeof locale !== 'string' || !locale) {
    return
  }

  try {
    for (const canonicalLocale of Intl.getCanonicalLocales(locale)) {
      if (!locales.includes(canonicalLocale)) {
        locales.push(canonicalLocale)
      }
    }
  } catch {
    // Ignore malformed language tags supplied by the environment.
  }
}

export function getTitleSortLocales (
  i18n = globalThis.browser?.i18n,
  navigatorObject = globalThis.navigator,
) {
  const locales = []
  addLocale(locales, i18n?.getUILanguage?.())

  if (Array.isArray(navigatorObject?.languages)) {
    for (const language of navigatorObject.languages) {
      addLocale(locales, language)
    }
  }
  addLocale(locales, navigatorObject?.language)

  return locales.length > 0 ? locales : undefined
}

function createCollator (locales, options) {
  try {
    return new Intl.Collator(locales, options)
  } catch {
    return new Intl.Collator(undefined, options)
  }
}

function createSegmenter (locales) {
  if (typeof Intl.Segmenter !== 'function') {
    return undefined
  }

  try {
    return new Intl.Segmenter(locales, { granularity: 'grapheme' })
  } catch {
    return new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  }
}

function normalizeTitle (title) {
  return String(title ?? '').normalize('NFC')
}

function getTitleUnits (title, segmenter) {
  const normalizedTitle = normalizeTitle(title)
  if (!segmenter) {
    return Array.from(normalizedTitle)
  }
  return Array.from(segmenter.segment(normalizedTitle), ({ segment }) => segment)
}

function getBaseCharacter (unit) {
  for (const character of Array.from(unit)) {
    if (LETTER_RE.test(character) || DECIMAL_NUMBER_RE.test(character)) {
      return character
    }
  }
  return unit
}

function isProlongedSoundMark (unit) {
  return unit === 'ー' || unit === 'ｰ'
}

function getTitleCategory (unit) {
  if (DECIMAL_NUMBER_RE.test(unit)) {
    return 'number'
  }

  const baseCharacter = getBaseCharacter(unit)
  if (LATIN_RE.test(baseCharacter)) {
    return 'latin'
  }
  if (HIRAGANA_RE.test(baseCharacter) ||
      KATAKANA_RE.test(baseCharacter) ||
      isProlongedSoundMark(unit)) {
    return 'kana'
  }
  if (HAN_RE.test(baseCharacter) ||
      (LETTER_RE.test(baseCharacter) && HAN_EXTENSION_RE.test(baseCharacter))) {
    return 'kanji'
  }
  if (LETTER_RE.test(baseCharacter)) {
    return 'otherLetter'
  }
  return 'symbol'
}

function getDigitWidthRank (unit) {
  if (ASCII_DIGIT_RE.test(unit)) {
    return HALF_WIDTH_RANK
  }
  if (FULL_WIDTH_DIGIT_RE.test(unit)) {
    return FULL_WIDTH_RANK
  }
  return OTHER_WIDTH_RANK
}

function getLatinWidthRank (unit) {
  return FULL_WIDTH_LATIN_RE.test(unit) ? FULL_WIDTH_RANK : HALF_WIDTH_RANK
}

function getSymbolWidthRank (unit) {
  if (HALF_WIDTH_JAPANESE_SYMBOL_RE.test(unit)) {
    return HALF_WIDTH_RANK
  }
  if (FULL_WIDTH_ASCII_SYMBOL_RE.test(unit) ||
      FULL_WIDTH_CURRENCY_SYMBOL_RE.test(unit) ||
      unit === FULL_WIDTH_SPACE ||
      FULL_WIDTH_JAPANESE_SYMBOL_RE.test(unit)) {
    return FULL_WIDTH_RANK
  }
  return HALF_WIDTH_RANK
}

function getCaseRank (unit) {
  const baseCharacter = getBaseCharacter(unit)
  if (UPPER_CASE_RE.test(baseCharacter)) {
    return UPPER_CASE_RANK
  }
  if (LOWER_CASE_RE.test(baseCharacter)) {
    return LOWER_CASE_RANK
  }
  return OTHER_CASE_RANK
}

function getKanaRank (unit) {
  if (HALF_WIDTH_KATAKANA_RE.test(unit)) {
    return HALF_WIDTH_KATAKANA_RANK
  }
  if (KATAKANA_RE.test(getBaseCharacter(unit)) || unit === 'ー') {
    return KATAKANA_RANK
  }
  return HIRAGANA_RANK
}

function normalizeSymbolWidth (unit) {
  return Array.from(unit).map((character) => {
    if (FULL_WIDTH_ASCII_SYMBOL_RE.test(character) ||
        FULL_WIDTH_CURRENCY_SYMBOL_RE.test(character) ||
        character === FULL_WIDTH_SPACE ||
        HALF_WIDTH_JAPANESE_SYMBOL_RE.test(character)) {
      return character.normalize('NFKC')
    }
    return character
  }).join('')
}

function normalizeKanaWidth (unit) {
  return HALF_WIDTH_KATAKANA_RE.test(unit) ? unit.normalize('NFKC') : unit
}

function makeTitleUnit (unit) {
  const category = getTitleCategory(unit)
  if (category === 'number') {
    return {
      category,
      primary: unit,
      widthRank: getDigitWidthRank(unit),
    }
  }
  if (category === 'symbol') {
    return {
      category,
      primary: normalizeSymbolWidth(unit),
      widthRank: getSymbolWidthRank(unit),
    }
  }
  if (category === 'latin') {
    return {
      caseRank: getCaseRank(unit),
      category,
      primary: unit,
      widthRank: getLatinWidthRank(unit),
    }
  }
  if (category === 'kana') {
    return {
      category,
      primary: normalizeKanaWidth(unit),
      variantRank: getKanaRank(unit),
    }
  }
  if (category === 'otherLetter') {
    return {
      caseRank: getCaseRank(unit),
      category,
      primary: unit,
    }
  }
  return {
    category,
    primary: unit,
  }
}

function analyzeTitle (title, segmenter) {
  return getTitleUnits(title, segmenter).map(makeTitleUnit)
}

function compareCodePointString (value1, value2) {
  const characters1 = Array.from(value1)
  const characters2 = Array.from(value2)
  const length = Math.min(characters1.length, characters2.length)
  for (let index = 0; index < length; index++) {
    const difference = characters1[index].codePointAt(0) -
      characters2[index].codePointAt(0)
    if (difference !== 0) {
      return difference
    }
  }
  return characters1.length - characters2.length
}

function compareTextPrimary (unit1, unit2, collators) {
  if (unit1.category === 'symbol') {
    return compareCodePointString(unit1.primary, unit2.primary)
  }
  if (unit1.category === 'kana') {
    return collators.kana.compare(unit1.primary, unit2.primary)
  }
  if (unit1.category === 'otherLetter') {
    return collators.otherLetter.compare(unit1.primary, unit2.primary)
  }
  return collators.text.compare(unit1.primary, unit2.primary)
}

function compareTextVariant (unit1, unit2) {
  if (unit1.category === 'latin') {
    const widthResult = unit1.widthRank - unit2.widthRank
    if (widthResult !== 0) {
      return widthResult
    }
    return unit1.caseRank - unit2.caseRank
  }
  if (unit1.category === 'kana') {
    return unit1.variantRank - unit2.variantRank
  }
  if (unit1.category === 'number' || unit1.category === 'symbol') {
    return unit1.widthRank - unit2.widthRank
  }
  if (unit1.category === 'otherLetter') {
    return unit1.caseRank - unit2.caseRank
  }
  return 0
}

function compareTitleUnitPrimary (unit1, unit2, collators) {
  const categoryDifference = TITLE_CATEGORY_ORDER[unit1.category] -
    TITLE_CATEGORY_ORDER[unit2.category]
  if (categoryDifference !== 0) {
    return categoryDifference
  }
  return compareTextPrimary(unit1, unit2, collators)
}

function compareTitleUnits (units1, units2, collators) {
  const length = Math.min(units1.length, units2.length)
  for (let index = 0; index < length; index++) {
    const primaryResult = compareTitleUnitPrimary(
      units1[index],
      units2[index],
      collators,
    )
    if (primaryResult !== 0) {
      return primaryResult
    }
  }

  if (units1.length !== units2.length) {
    return units1.length - units2.length
  }

  for (let index = 0; index < units1.length; index++) {
    const variantResult = compareTextVariant(units1[index], units2[index])
    if (variantResult !== 0) {
      return variantResult
    }
  }
  return 0
}

function createStructuredTitleCompare (locales) {
  const segmenter = createSegmenter(locales)
  const collators = {
    kana: createCollator(locales, KANA_COLLATOR_OPTIONS),
    otherLetter: createCollator(locales, OTHER_LETTER_COLLATOR_OPTIONS),
    text: createCollator(locales, TEXT_COLLATOR_OPTIONS),
  }
  const unitCache = new Map()
  const getUnits = (title) => {
    const normalizedTitle = normalizeTitle(title)
    if (!unitCache.has(normalizedTitle)) {
      unitCache.set(normalizedTitle, analyzeTitle(normalizedTitle, segmenter))
    }
    return unitCache.get(normalizedTitle)
  }

  return (tab1, tab2) => compareTitleUnits(
    getUnits(tab1.title),
    getUnits(tab2.title),
    collators,
  )
}

function createGenericTitleCompare (collator, tieBreaker) {
  const titleCache = new Map()
  const getTitle = (title) => {
    const titleText = String(title ?? '')
    if (!titleCache.has(titleText)) {
      titleCache.set(titleText, normalizeTitle(titleText))
    }
    return titleCache.get(titleText)
  }
  return (tab1, tab2) => {
    const result = collator.compare(
      getTitle(tab1.title),
      getTitle(tab2.title),
    )
    return result !== 0 ? result : tieBreaker(tab1, tab2)
  }
}

export function createTitleComparator (
  reverse = false,
  locales = getTitleSortLocales(),
) {
  const genericCollator = createCollator(locales, GENERIC_COLLATOR_OPTIONS)
  const structuredCompare = createStructuredTitleCompare(locales)
  const compare = genericCollator.resolvedOptions().locale === 'ja' ||
    genericCollator.resolvedOptions().locale.startsWith('ja-')
    ? structuredCompare
    : createGenericTitleCompare(genericCollator, structuredCompare)

  return reverse
    ? (tab1, tab2) => compare(tab2, tab1)
    : compare
}
