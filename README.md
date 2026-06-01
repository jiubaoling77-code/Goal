# 目標達成会議 Supabase版

Cloudflare Pages / Workers に置ける静的フロントエンドと、Supabase用SQLです。

## 1. Supabaseでメール確認をOFFにする

このアプリは「ニックネーム + PIN」でログインします。内部ではSupabase Authのメール/パスワードを使いますが、ユーザーにメールアドレスは見せません。

Supabaseで以下を設定してください。

1. 左メニューの **Authentication**
2. **Providers**
3. **Email**
4. **Confirm email** をOFF
5. 保存

これをOFFにしないと、初回登録後にログイン状態にならず、アプリが使えません。

## 2. SQL EditorでDBを作る

Supabaseの **SQL Editor** を開きます。

1. **New query**
2. `supabase/schema.sql` の中身を全部貼る
3. **Run**

これで以下が作られます。

- `profiles`
- `monthly_posts`
- `comments`
- `reactions`
- `post_versions`
- RLSポリシー
- Realtime設定
- バックアップ用RPC `export_backup`

## 3. config.js にURLとキーを入れる

Supabaseの **Project Settings → API Keys** を開きます。

`site/config.js` を編集します。

```js
window.GOAL_SUPABASE = {
  url: "https://xxxxx.supabase.co",
  key: "publishable-or-anon-key"
};
```

使うキーは **Publishable key** または **anon public key** です。

絶対に使わないキー:

- `service_role`
- `secret`

公開フロントエンドに入れてよいのは、RLS前提の公開用キーだけです。

## 4. GitHubにアップロードする

GitHubには、この `supabase-upload` フォルダの中身をアップロードしてください。

```text
README.md
wrangler.jsonc
site/
supabase/
```

## 5. Cloudflareでデプロイする

前回と同じように deploy command が以下なら、そのまま動くようにしてあります。

```text
npx wrangler deploy
```

`wrangler.jsonc` が `site/` を静的ファイルとして公開します。

Cloudflare Pagesとして設定する場合は、以下でも大丈夫です。

```text
Framework preset: None
Build command: 空欄
Build output directory: site
```

## 6. 使い方

初回は、メンバーそれぞれがアプリ画面で **初回登録** します。

- ニックネームは一意
- PIN / パスワードは4文字以上
- 1人1ヶ月1投稿
- 下書きは本人だけ表示
- 公開済み投稿はログインメンバー全員に表示

## 7. データ保護

- 投稿保存ごとに `post_versions` へ履歴を保存
- 投稿、コメント、返信、リアクションは `deleted_at` による論理削除
- RLSで未ログイン閲覧を禁止
- 自分の投稿だけ編集可能
- コメント削除は本人のみ
- リアクションはログインユーザー単位
- Realtimeで投稿、コメント、返信、リアクションが反映

## 8. バックアップ

ログイン後、画面右上の **バックアップJSON** を押すと、Supabase内の主要データをJSONで保存できます。

Supabaseの管理画面側でも、必要に応じてテーブルのExportやバックアップを利用してください。
