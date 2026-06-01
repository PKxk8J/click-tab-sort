# click-tab-sort

タブ右クリックからタブをソートする Firefox 専用アドオン。

https://addons.mozilla.org/addon/clicktabsort/

## 機能

- URL、タイトル、開いた日時、最後に見た日時でタブをソート
- 昇順、降順、ランダム、現在順の反転に対応
- 固定タブから実行した場合のみ、固定タブ同士をソート
- タブグループはトップレベルでは 1 つのまとまりとしてソート
- 分割ビューは内部順を保った 1 つのまとまりとしてソート
- コンテナは区別せずにソート
- 設定で右クリックメニューの表示場所と項目を選択
- ソート項目ごとに「クリック先の範囲」と「トップレベルと全グループ」を選択
- 通知は設定で有効にした場合のみ使用

開いた日時は Firefox 起動中のタブ ID 順です。

「クリック先の範囲」は、グループ内のタブから実行するとそのグループ内だけをソートし、
トップレベルのタブから実行するとトップレベルだけをソートします。
「トップレベルと全グループ」は、各グループ内をそれぞれソートしたあと、
トップレベルでグループを 1 つのまとまりとしてソートします。

## 動作要件

- Firefox 142 以降
- Node.js 現行 LTS

## 開発

```sh
npm install
npm run lint
npm run test
npm run test:e2e
npm run build
```

アドオンのバージョンは `extension/manifest.json` で管理します。
`npm run build` は `web-ext-artifacts/clicktabsort-<version>.zip` を作成します。

`npm run run` は、この拡張機能を一時的に読み込んだ Firefox を起動します。
`npm run test:e2e` は、Geckodriver で Firefox を起動して実ブラウザ上の拡張機能を検証します。
拡張機能のソースは `extension/` にあります。

## プライバシー

この拡張機能はユーザーデータを収集または送信しません。
