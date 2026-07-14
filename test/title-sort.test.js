import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createTitleComparator,
  getTitleSortLocales,
} from '../extension/title-sort.js'

function createTextComparator (locale = 'ja-JP', reverse = false) {
  const comparator = createTitleComparator(reverse, [locale])
  return (title1, title2) => comparator(
    { title: title1 },
    { title: title2 },
  )
}

function sortTitles (titles, locale = 'ja-JP', reverse = false) {
  return [...titles].sort(createTextComparator(locale, reverse))
}

function compareSign (value) {
  return value === 0 ? 0 : Math.sign(value)
}

// This table is also the readable specification for Japanese title order.
const JAPANESE_CHARACTER_TYPE_ORDER = [
  {
    type: '空文字',
    titles: [''],
  },
  {
    type: '半角空白、全角空白',
    titles: [' ', '　'],
  },
  {
    type: 'ASCII 記号、全角記号、縦書き記号、互換記号、絵文字',
    titles: [
      '!', '！',
      '#', '＃',
      '$', '＄',
      '(', '（', '︵',
      '-', '－',
      '_', '＿',
      '{', '｛', '︷',
      '~', '～',
      '¥', '￥',
      '©', '²', '¼', '①', 'Ⓐ',
      '❤', '❤︎', '❤️',
      '､', '、',
      '｡', '。',
      '｢', '「',
      '｣', '」',
      '･', '・',
      '㍿',
      '😀',
    ],
  },
  {
    type: '各文字体系の十進数字',
    titles: [
      '0', '０', '٠',
      '02', '０２',
      '1', '１', '١', '۱', '१', '𝟙',
      '10', '１０', '١٠',
      '2', '２', '٢',
      '٣', // Arabic-Indic
      '۴', // Extended Arabic-Indic
      '५', // Devanagari
      '৬', // Bengali
      '๗', // Thai
      '៨', // Khmer
      '၉', // Myanmar
    ],
  },
  {
    type: 'ラテン文字、全角ラテン文字、アクセント、合字、ローマ数字',
    titles: [
      'A', 'a', 'Ａ', 'ａ',
      'Á', 'á',
      'B', 'b', 'Ｂ', 'ｂ',
      'Ǆ', 'ǅ', 'ǆ',
      'F', 'f', 'Ｆ', 'ｆ',
      'ff', 'ﬀ',
      'I', 'i', 'Ｉ', 'ｉ',
      'IV', 'Ⅳ',
      'J', 'j', 'Ｊ', 'ｊ',
      'Z', 'z', 'Ｚ', 'ｚ',
    ],
  },
  {
    type: '平仮名、片仮名、半角片仮名、拡張かな',
    titles: [
      'ゝ', 'ヽ',
      'ー', 'ｰ',
      'ぁ', 'ァ', 'ｧ',
      'あ', 'ア', 'ｱ',
      'か', 'カ', 'ｶ',
      'が', 'ガ', 'ｶﾞ',
      'ㇰ', 'く', 'ク', 'ｸ',
      'こと', 'ヿ',
    ],
  },
  {
    type: '漢字、漢字の繰返し記号、漢数字、CJK 統合漢字拡張',
    titles: ['々', '〇', '〆', '亜', '漢', '𠮷'],
  },
  {
    type: 'その他の文字体系',
    titles: [
      '𝔄', // Mathematical letter (Common script)
      'Α', // Greek
      'Б', // Cyrillic
      'ა', // Georgian
      'Ա', // Armenian
      'א', // Hebrew
      'ا', // Arabic
      'ب', 'ﺏ', 'ﺐ', 'ﺑ', 'ﺒ', // Arabic presentation forms
      'ሀ', // Ethiopic
      'क', // Devanagari
      'ক', // Bengali
      'ก', // Thai
      'ກ', // Lao
      'ཀ', // Tibetan
      'Ꭰ', // Cherokee
      'ᐁ', // Canadian Aboriginal
      '가', // Hangul
      'ㄅ', // Bopomofo
      '𒀀', // Cuneiform
    ],
  },
]

test('日本語の文字種順一覧を仕様として固定する', () => {
  const expected = JAPANESE_CHARACTER_TYPE_ORDER.
    flatMap(({ titles }) => titles)

  assert.deepEqual(sortTitles([...expected].reverse()), expected)
  for (const { type, titles } of JAPANESE_CHARACTER_TYPE_ORDER) {
    assert.deepEqual(sortTitles([...titles].reverse()), titles, type)
  }
})

test('タイトルソート言語は UI 言語とブラウザー言語から正規化する', () => {
  assert.deepEqual(getTitleSortLocales(
    { getUILanguage: () => 'ja-jp' },
    { languages: ['sv', 'ja-JP'], language: 'en-us' },
  ), ['ja-JP', 'sv', 'en-US'])

  assert.deepEqual(getTitleSortLocales(
    { getUILanguage: () => 'invalid_locale' },
    { languages: ['ru'], language: 'ru' },
  ), ['ru'])
})

test('正準等価なタイトルは同じ順序として比較する', () => {
  const compare = createTextComparator()

  assert.equal(compare('é', 'e\u0301'), 0)
  assert.equal(compare('が', 'か\u3099'), 0)
  assert.equal(compare('ガ', 'カ\u3099'), 0)
})

test('日本語では合意した文字種順の後にその他の文字を置く', () => {
  const titles = ['Б', '漢', 'あ', 'A', '1', '😀', '!']

  assert.deepEqual(sortTitles(titles.reverse()), [
    '!',
    '😀',
    '1',
    'A',
    'あ',
    '漢',
    'Б',
  ])
})

test('各言語の十進数字も一文字ずつ比較する', () => {
  assert.deepEqual(sortTitles([
    '١٠',
    '１０',
    '10',
    '٢',
    '２',
    '2',
  ]), [
    '10',
    '１０',
    '١٠',
    '2',
    '２',
    '٢',
  ])
})

test('連続する文字種をまとめず、各位置の文字種順で比較する', () => {
  const compare = createTextComparator()

  assert.equal(compare('あ |', 'あ 2 |') < 0, true)
  assert.equal(compare('ab', 'aあ') < 0, true)
})

test('UUID を数値の連続として扱わない', () => {
  const expected = [
    '10000000-0000-4000-8000-000000000000',
    '12340000-0000-4000-8000-000000000000',
    '123e0000-0000-4000-8000-000000000000',
    '2fffffff-0000-4000-8000-000000000000',
  ]

  assert.deepEqual(sortTitles([...expected].reverse()), expected)
})

test('大文字小文字・全角半角・かな種は主比較の後で区別する', () => {
  const compare = createTextComparator()

  assert.equal(compare('aB', 'Ac') < 0, true)
  assert.equal(compare('ＡB', 'aC') < 0, true)
  assert.equal(compare('アA', 'あB') < 0, true)

  assert.deepEqual(sortTitles(['Ａb', 'ab', 'Ab', 'aB']), [
    'Ab', 'aB', 'ab', 'Ａb',
  ])
  assert.deepEqual(sortTitles(['アイ', 'あイ', 'あい']), [
    'あい', 'あイ', 'アイ',
  ])
  assert.deepEqual(sortTitles(['１２', '1２', '１2', '12']), [
    '12', '1２', '１2', '１２',
  ])
})

test('タイトルケースは大文字と小文字の間に置く', () => {
  const compare = createTextComparator()

  assert.equal(compare('ǆA', 'ǄB') < 0, true)
  assert.deepEqual(sortTitles(['ǆ', 'ǅ', 'Ǆ']), ['Ǆ', 'ǅ', 'ǆ'])
})

test('十進数字は数字体系の違いを主比較の後で区別する', () => {
  const compare = createTextComparator()
  const expected = ['1', '１', '١', '۱', '१', '𝟙']

  assert.equal(compare('١0', '１2') < 0, true)
  assert.deepEqual(sortTitles([...expected].reverse()), expected)
})

test('絵文字の表示セレクターは主比較の後で区別する', () => {
  const compare = createTextComparator()

  assert.equal(compare('❤️A', '❤B') < 0, true)
  assert.deepEqual(sortTitles(['❤️', '❤︎', '❤']), [
    '❤', '❤︎', '❤️',
  ])
})

test('Arabic の位置別字形は主比較の後で区別する', () => {
  const compare = createTextComparator()

  assert.equal(compare('ﺒا', 'بب') < 0, true)
  assert.deepEqual(sortTitles(['ﺒ', 'ﺑ', 'ﺐ', 'ﺏ', 'ب']), [
    'ب', 'ﺏ', 'ﺐ', 'ﺑ', 'ﺒ',
  ])
})

test('縦書き互換形は対応する記号の後で区別する', () => {
  assert.deepEqual(sortTitles(['︷', '｛', '{', '︵', '（', '(']), [
    '(', '（', '︵', '{', '｛', '︷',
  ])
})

test('複数文字に展開される互換形は同一視しない', () => {
  const compare = createTextComparator()

  assert.notEqual(compare('ﻻ', 'لا'), 0)
  assert.notEqual(compare('︙', '...'), 0)
})

test('拡張かなを発音、小書き、かな種の順で比較する', () => {
  const expected = [
    'ぁ', 'ァ', 'ｧ', 'あ', 'ア', 'ｱ',
    'う', 'ウ', 'ｳ', 'ゔ', 'ヴ', 'ｳﾞ',
    'え', 'エ', 'ｴ',
    'ゕ', 'ヵ', 'か', 'カ', 'ｶ', 'が', 'ガ', 'ｶﾞ',
    'ㇰ', 'く', 'ク', 'ｸ',
    'ゖ', 'ヶ', 'け', 'ケ', 'ｹ',
    'わ', 'ワ', 'ﾜ', 'ヷ',
    'ゐ', 'ヰ', 'ヸ',
    'ゑ', 'ヱ', 'ヹ',
    'を', 'ヲ', 'ｦ', 'ヺ',
  ]

  assert.deepEqual(sortTitles([...expected].reverse()), expected)
})

test('長音記号と繰返し記号も独立した一文字として比較する', () => {
  const compare = createTextComparator()

  assert.equal(compare('カー', 'カア') < 0, true)
  assert.equal(compare('キー', 'キア') < 0, true)
  assert.equal(compare('くゝ', 'くく') < 0, true)
  assert.equal(compare('くゞ', 'くぐ') < 0, true)
})

test('日本語の漢字は CLDR の日本語照合順で比較する', () => {
  assert.deepEqual(sortTitles([
    '乙',
    '一',
    '案',
    '悪',
    '愛',
    '亜',
  ]), [
    '亜',
    '愛',
    '悪',
    '案',
    '一',
    '乙',
  ])
})

test('日本語の半角記号と対応する全角記号を近くに置く', () => {
  const expected = [
    '!', '！',
    '#', '＃',
    '-', '－',
    '_', '＿',
    '｡', '。',
    '｢', '「',
    '･', '・',
  ]

  assert.deepEqual(sortTitles([...expected].reverse()), expected)
})

test('日本語以外では UI 言語の照合順を優先する', () => {
  assert.deepEqual(sortTitles([
    'äta',
    'zoo',
    'apple',
  ], 'sv'), [
    'apple',
    'zoo',
    'äta',
  ])

  assert.deepEqual(sortTitles([
    'В',
    'Б',
    'А',
    '1',
    '!',
  ], 'ru'), [
    '!',
    '1',
    'А',
    'Б',
    'В',
  ])

  assert.deepEqual(sortTitles(['다', '나', '가'], 'ko'), ['가', '나', '다'])

  assert.deepEqual(sortTitles(['ǆ', 'ǅ', 'Ǆ'], 'en'), ['Ǆ', 'ǅ', 'ǆ'])
  assert.deepEqual(sortTitles(['❤️', '❤︎', '❤'], 'en'), ['❤', '❤︎', '❤️'])
  assert.deepEqual(sortTitles(['ﺒ', 'ﺑ', 'ﺐ', 'ﺏ', 'ب'], 'ar'), [
    'ب', 'ﺏ', 'ﺐ', 'ﺑ', 'ﺒ',
  ])
  assert.deepEqual(sortTitles(['𝟙', '१', '۱', '١', '１', '1'], 'ar'), [
    '1', '１', '١', '۱', '१', '𝟙',
  ])
})

test('逆順でも自然順の比較結果を反転する', () => {
  assert.deepEqual(sortTitles([
    'Page 10',
    'Page 2',
    'Page 1',
  ], 'en-US', true), [
    'Page 2',
    'Page 10',
    'Page 1',
  ])
})

test('タイトル比較は反対称性と推移律を満たす', () => {
  const compare = createTextComparator()
  const titles = [
    '', '!', '！', '1', '１', '01', 'A', 'a', 'Ａ', 'ａ',
    '١', '۱', '१', '𝟙', 'Ǆ', 'ǅ', 'ǆ', '❤', '❤︎', '❤️',
    '(', '（', '︵', 'ぁ', 'あ', 'ア', 'ｱ', 'が', 'ガ', 'ｶﾞ', '漢',
    'Б', 'ب', 'ﺏ', 'ﺐ', 'ﺑ', 'ﺒ', '가', '😀',
  ]

  for (const title1 of titles) {
    for (const title2 of titles) {
      assert.equal(
        compareSign(compare(title1, title2)),
        compareSign(-compare(title2, title1)),
      )
    }
  }

  for (const title1 of titles) {
    for (const title2 of titles) {
      for (const title3 of titles) {
        if (compare(title1, title2) <= 0 && compare(title2, title3) <= 0) {
          assert.equal(compare(title1, title3) <= 0, true)
        }
      }
    }
  }
})
