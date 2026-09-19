# 稚魚搬入管理アプリ（ginzake-chigyo-hannyu）セットアップ手順

## 1. プロジェクトの土台を作る

PowerShellで以下を実行してください（`Downloads`フォルダに移動してから）。

```powershell
cd Downloads
npm create vite@latest ginzake-chigyo-hannyu -- --template react
cd ginzake-chigyo-hannyu\ginzake-chigyo-hannyu
```

> 既存アプリと同じく `ginzake-chigyo-hannyu\ginzake-chigyo-hannyu` の二重構造になるように、
> 内側にもう一度 `npm create vite@latest . -- --template react` を実行するか、
> 一度作ってから手動でフォルダをもう1階層作って中身を移動してください。
> （既存アプリ①と同じ深さに揃えるための手順です。どちらでも動作は変わりません）

## 2. 今回渡したファイルを上書き・追加する

このzip（またはフォルダ）の中身を、上で作ったプロジェクトの同じ場所にコピー＆上書きしてください。

```
ginzake-chigyo-hannyu/
├─ package.json          ← 上書き
├─ vite.config.js         ← 上書き
├─ index.html             ← 上書き
├─ .env.example           ← これをコピーして「.env」にリネームする
└─ src/
   ├─ index.css           ← 上書き
   ├─ main.jsx            ← 上書き
   ├─ App.jsx              ← 上書き
   ├─ lib/
   │   ├─ api.js
   │   └─ dateUtils.js
   ├─ context/
   │   └─ AuthContext.jsx
   ├─ components/
   │   ├─ BusyButton.jsx
   │   ├─ UI.jsx
   │   └─ PinPad.jsx
   └─ screens/
       └─ LoginScreen.jsx
```

**`.env.example`は必ず`.env`という名前にリネームしてください**（`.env`はGitにコミットしない前提のファイルなので、サンプルとして`.env.example`の名前で渡しています）。中身のGAS WebアプリURLは、すでに動作確認済みのURLを入れてあります。

## 3. パッケージをインストールして起動確認

```powershell
npm install
npm run dev
```

ブラウザで `http://localhost:5173/` を開き、以下が確認できればOKです。

- 9タイル画面が表示される（マスタ_ログイン事業者に登録した分だけタイルが表示され、残りは空枠）
- タイルをタップ→PIN入力画面に切り替わる
- 正しいPINを入れると「ログイン成功：〇〇（役割）」の画面に切り替わる
- 間違ったPINを入れるとエラーメッセージが出る

## 4. 動作確認できたら、GitHubへのpush・公開準備

まだ画面はログイン確認までしかありませんが、土台としてリポジトリを作っておく場合は以下を実行してください。

```powershell
git init
git remote add origin https://github.com/eachk2-art/ginzake-chigyo-hannyu.git
git add .
git commit -m "初期セットアップ：ログイン画面まで実装"
git branch -M main
git push -u origin main
```

（GitHub Pagesへの公開＝`npx vite build` → `npx gh-pages -d dist` は、もう少し画面が増えてから実施しましょう）

## 次のステップ

ログイン〜認証情報の保持ができたので、次は **ホーム画面（SCR-010）とメニュー**、そして **積込予定一覧（SCR-020）** に進みます。
