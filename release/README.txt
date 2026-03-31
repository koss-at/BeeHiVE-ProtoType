BeeHiVE Prototype 2.0.x – Quick Start

- Open Folder → 対象ファイルを追加（画面にドラッグ＆ドロップも可）
- RegExp / Serial を設定 → Apply
- Dry Run で衝突チェック
- Execute でリネーム実行（ログは自動保存）
- Revert で直前の変更を戻す

RegExp:
  - pattern: 置換対象の正規表現
  - flags: 置換時のフラグ
  - replacement: 置換後の文字列

Serial:
  - mode: none | prefix | suffix（シリアル番号の追加）
  - start: 開始数
  - width: 桁数
  - separator: ファイル名とシリアルの間の文字
  - step: 増分

Notes:
- mac: 初回は警告が出る場合あり → 右クリック「開く」
- Windows: SmartScreen 警告が出る場合あり → 「詳細情報」→「実行」
