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
const TITLE_CASE_RE = /^\p{General_Category=Titlecase_Letter}$/u
const FULL_WIDTH_LATIN_RE = /[Ａ-Ｚａ-ｚ]/
const HALF_WIDTH_KATAKANA_RE = /[ｦ-ﾟ]/
const FULL_WIDTH_ASCII_SYMBOL_RE = /^[！-／：-＠［-｀｛-～]$/
const FULL_WIDTH_CURRENCY_SYMBOL_RE = /^[￠-￦]$/
const HALF_WIDTH_JAPANESE_SYMBOL_RE = /^[｡｢｣､･]$/
const FULL_WIDTH_JAPANESE_SYMBOL_RE = /^[。「」、・]$/
const FULL_WIDTH_SPACE = '\u3000'
const TEXT_PRESENTATION_SELECTOR = '\ufe0e'
const EMOJI_PRESENTATION_SELECTOR = '\ufe0f'

const HALF_WIDTH_RANK = 0
const FULL_WIDTH_RANK = 1
const OTHER_WIDTH_RANK = 2
const HIRAGANA_RANK = 0
const KATAKANA_RANK = 1
const HALF_WIDTH_KATAKANA_RANK = 2
const UPPER_CASE_RANK = 0
const TITLE_CASE_RANK = 1
const LOWER_CASE_RANK = 2
const OTHER_CASE_RANK = 3
const BASE_FORM_RANK = 0
const COMPATIBILITY_FORM_RANK = 1
const DEFAULT_PRESENTATION_RANK = 0
const TEXT_PRESENTATION_RANK = 1
const EMOJI_PRESENTATION_RANK = 2

function isArabicPresentationForm (codePoint) {
  return (codePoint >= 0xfb50 && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfefc)
}

function isVerticalForm (codePoint) {
  return (codePoint >= 0xfe10 && codePoint <= 0xfe1f) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f)
}

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

function getTitleUnits (normalizedTitle, segmenter) {
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

function getTitleCategory (unit, baseCharacter) {
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
      isVerticalForm(unit.codePointAt(0)) ||
      unit === FULL_WIDTH_SPACE ||
      FULL_WIDTH_JAPANESE_SYMBOL_RE.test(unit)) {
    return FULL_WIDTH_RANK
  }
  return HALF_WIDTH_RANK
}

function getCaseRank (baseCharacter) {
  if (UPPER_CASE_RE.test(baseCharacter)) {
    return UPPER_CASE_RANK
  }
  if (TITLE_CASE_RE.test(baseCharacter)) {
    return TITLE_CASE_RANK
  }
  if (LOWER_CASE_RE.test(baseCharacter)) {
    return LOWER_CASE_RANK
  }
  return OTHER_CASE_RANK
}

function getKanaRank (unit, baseCharacter) {
  if (HALF_WIDTH_KATAKANA_RE.test(unit)) {
    return HALF_WIDTH_KATAKANA_RANK
  }
  if (KATAKANA_RE.test(baseCharacter) || unit === 'ー') {
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

function getCompatibilityRank (unit) {
  const codePoint = unit.codePointAt(0)
  return isArabicPresentationForm(codePoint) || isVerticalForm(codePoint)
    ? COMPATIBILITY_FORM_RANK
    : BASE_FORM_RANK
}

function getPresentationRank (unit) {
  if (unit.length < 2) {
    return DEFAULT_PRESENTATION_RANK
  }
  if (unit.includes(TEXT_PRESENTATION_SELECTOR)) {
    return TEXT_PRESENTATION_RANK
  }
  if (unit.includes(EMOJI_PRESENTATION_SELECTOR)) {
    return EMOJI_PRESENTATION_RANK
  }
  return DEFAULT_PRESENTATION_RANK
}

function normalizeCompatibilityPresentation (unit, compatibilityRank) {
  if (compatibilityRank === BASE_FORM_RANK) {
    return unit
  }

  const normalized = unit.normalize('NFKC')
  // Keep compatibility ligatures and other multi-character expansions distinct.
  return Array.from(normalized).length === 1 ? normalized : unit
}

function normalizeTitleUnitPrimary (
  unit,
  category,
  compatibilityRank,
  presentationRank,
) {
  const withoutPresentation = presentationRank === DEFAULT_PRESENTATION_RANK
    ? unit
    : unit.replaceAll(TEXT_PRESENTATION_SELECTOR, '').
      replaceAll(EMOJI_PRESENTATION_SELECTOR, '')
  const normalized = normalizeCompatibilityPresentation(
    withoutPresentation,
    compatibilityRank,
  )
  if (category === 'symbol') {
    return normalizeSymbolWidth(normalized)
  }
  if (category === 'kana') {
    return normalizeKanaWidth(normalized)
  }
  return normalized
}

function makeTitleUnit (unit) {
  const baseCharacter = getBaseCharacter(unit)
  const category = DECIMAL_NUMBER_RE.test(unit)
    ? 'number'
    : getTitleCategory(unit, baseCharacter)
  const compatibilityRank = getCompatibilityRank(unit)
  const presentationRank = getPresentationRank(unit)
  const titleUnit = {
    category,
    compatibilityRank,
    original: unit,
    presentationRank,
    primary: normalizeTitleUnitPrimary(
      unit,
      category,
      compatibilityRank,
      presentationRank,
    ),
  }
  if (category === 'number') {
    titleUnit.widthRank = getDigitWidthRank(unit)
  } else if (category === 'symbol') {
    titleUnit.widthRank = getSymbolWidthRank(unit)
  } else if (category === 'latin') {
    titleUnit.caseRank = getCaseRank(baseCharacter)
    titleUnit.widthRank = getLatinWidthRank(unit)
  } else if (category === 'kana') {
    titleUnit.variantRank = getKanaRank(unit, baseCharacter)
  } else if (category === 'otherLetter') {
    titleUnit.caseRank = getCaseRank(baseCharacter)
  }
  return titleUnit
}

function analyzeTitle (normalizedTitle, segmenter) {
  return getTitleUnits(normalizedTitle, segmenter).map(makeTitleUnit)
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
  return collators.text.compare(unit1.primary, unit2.primary)
}

function compareTitleUnitVariant (unit1, unit2) {
  let categoryResult = 0
  if (unit1.category === 'latin') {
    categoryResult = unit1.widthRank - unit2.widthRank
    if (categoryResult === 0) {
      categoryResult = unit1.caseRank - unit2.caseRank
    }
  } else if (unit1.category === 'kana') {
    categoryResult = unit1.variantRank - unit2.variantRank
  } else if (unit1.category === 'number' || unit1.category === 'symbol') {
    categoryResult = unit1.widthRank - unit2.widthRank
  } else if (unit1.category === 'otherLetter') {
    categoryResult = unit1.caseRank - unit2.caseRank
  }
  if (categoryResult !== 0) {
    return categoryResult
  }

  const compatibilityResult = unit1.compatibilityRank -
    unit2.compatibilityRank
  if (compatibilityResult !== 0) {
    return compatibilityResult
  }

  const presentationResult = unit1.presentationRank - unit2.presentationRank
  return presentationResult !== 0
    ? presentationResult
    : compareCodePointString(unit1.original, unit2.original)
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
    const variantResult = compareTitleUnitVariant(
      units1[index],
      units2[index],
    )
    if (variantResult !== 0) {
      return variantResult
    }
  }
  return 0
}

function createStructuredTitleCompare (locales, textCollator) {
  const segmenter = createSegmenter(locales)
  const collators = {
    kana: createCollator(locales, KANA_COLLATOR_OPTIONS),
    text: textCollator,
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
      titleCache.set(titleText, titleText.normalize('NFC'))
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
  const textCollator = createCollator(locales, TEXT_COLLATOR_OPTIONS)
  const structuredCompare = createStructuredTitleCompare(locales, textCollator)
  const resolvedLocale = textCollator.resolvedOptions().locale
  const compare = resolvedLocale === 'ja' || resolvedLocale.startsWith('ja-')
    ? structuredCompare
    : createGenericTitleCompare(textCollator, structuredCompare)

  return reverse
    ? (tab1, tab2) => compare(tab2, tab1)
    : compare
}
