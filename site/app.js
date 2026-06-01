import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const config = window.GOAL_SUPABASE || {};
const app = document.querySelector("#app");
const hasConfig = config.url && config.key && !config.url.includes("PASTE_") && !config.key.includes("PASTE_");
const supabase = hasConfig ? createClient(config.url, config.key) : null;

const reactions = [
  { type: "thumbs_up", emoji: "👍", label: "いいね" },
  { type: "fire", emoji: "🔥", label: "刺激を受けた" },
  { type: "muscle", emoji: "💪", label: "応援" },
  { type: "eyes", emoji: "👀", label: "見たよ" },
  { type: "raised_hands", emoji: "🙌", label: "わかる / 一緒に頑張ろう" },
  { type: "bulb", emoji: "💡", label: "気づき" }
];

const editorFields = [
  { key: "theme", title: "今月のテーマ", help: "今月意識したいことや、挑戦したいことを一言で", icon: "sprout", max: 50, input: "input" },
  { key: "work_goal", title: "仕事", help: "今月の取り組みや、うまくいきそうなこと", icon: "briefcase", max: 500, input: "textarea" },
  { key: "private_goal", title: "プライベート", help: "プライベートで大切にしたいことや、楽しみなこと", icon: "user", max: 500, input: "textarea" },
  { key: "mindset_goal", title: "マインド", help: "今月、意識したい考え方や、自分へのメッセージ", icon: "heart", max: 500, input: "textarea" },
  { key: "support_request", title: "応援してほしいこと / 相談したいこと", help: "チームにシェアして、応援やアドバイスをもらいましょう", icon: "chat", max: 500, input: "textarea" },
  { key: "reflection", title: "先月の振り返り", help: "うまくいったこと、気づき、来月に活かしたいこと", icon: "refresh", max: 500, input: "textarea", optional: true }
];

const state = {
  authUser: null,
  user: null,
  members: [],
  currentMonth: monthNow(),
  route: "",
  loginMode: "login",
  editorExpected: null,
  editorStatus: "draft",
  editorSaveTimer: null,
  editorDirty: false,
  refreshTimer: null,
  suppressRefreshUntil: 0,
  channel: null
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function failIf(error) {
  if (error) throw new Error(error.message || "処理に失敗しました");
}

function textOrDash(value) {
  const text = String(value ?? "").trim();
  return text ? escapeHtml(text) : '<span class="muted">未入力</span>';
}

function shortText(value, length = 34) {
  const text = String(value ?? "").trim();
  if (!text) return "未入力";
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function monthNow() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit"
  }).format(new Date()).slice(0, 7);
}

function formatMonth(month) {
  const [year, monthText] = String(month).split("-");
  return `${year}年${Number(monthText)}月`;
}

function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function avatarVars(name) {
  const palette = [
    ["#087f68", "#9ed7c7"],
    ["#2b7bba", "#abd1ec"],
    ["#b56f18", "#f1c27a"],
    ["#7f6ab3", "#cdbde9"],
    ["#be6870", "#efb4b4"],
    ["#3e7d59", "#bddcad"]
  ];
  let hash = 0;
  for (const char of String(name)) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const colors = palette[hash % palette.length];
  return `--avatar-a:${colors[0]};--avatar-b:${colors[1]};`;
}

function initials(name) {
  const clean = String(name ?? "?").trim();
  return escapeHtml(clean.slice(0, 2) || "?");
}

function avatar(user, size = "") {
  if (!user) return `<span class="avatar ${size} muted">?</span>`;
  if (user.avatar_url) {
    return `<img class="avatar ${size}" src="${escapeHtml(user.avatar_url)}" alt="${escapeHtml(user.nickname)}" />`;
  }
  return `<span class="avatar ${size}" style="${avatarVars(user.nickname)}">${initials(user.nickname)}</span>`;
}

function icon(name) {
  const common = `width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"`;
  const paths = {
    sprout: `<path d="M12 21V12"/><path d="M12 12C7.5 12 4.5 9.5 4 5c4.5.1 7.4 2.5 8 7Z"/><path d="M12 12c4.5 0 7.5-2.5 8-7-4.5.1-7.4 2.5-8 7Z"/>`,
    home: `<path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10.5V20h13v-9.5"/><path d="M9.5 20v-6h5v6"/>`,
    cloud: `<path d="M7.5 17.5a4.5 4.5 0 0 1-.2-9A6 6 0 0 1 18.7 10 3.8 3.8 0 0 1 18 17.5"/><path d="M8 15c1.4-1.3 3-1.3 4.4 0 1.2 1 2.5 1 3.6 0"/>`,
    clock: `<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>`,
    pen: `<path d="m4 20 4.5-1 10-10a2.4 2.4 0 0 0-3.4-3.4l-10 10L4 20Z"/><path d="m14 7 3 3"/>`,
    back: `<path d="m15 18-6-6 6-6"/>`,
    save: `<path d="M6 4h10l2 2v14H6z"/><path d="M8 4v6h8"/><path d="M9 20v-6h6v6"/>`,
    send: `<path d="m21 3-8.5 18-2-7.5L3 11 21 3Z"/><path d="m10.5 13.5 5-5"/>`,
    briefcase: `<path d="M9 7V5h6v2"/><rect x="4" y="7" width="16" height="12" rx="2"/><path d="M4 12h16"/><path d="M10 12v2h4v-2"/>`,
    user: `<circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/>`,
    heart: `<path d="M20.5 8.5c0 5.5-8.5 10.5-8.5 10.5S3.5 14 3.5 8.5a4.5 4.5 0 0 1 8-2.8 4.5 4.5 0 0 1 9 2.8Z"/>`,
    chat: `<path d="M5 18.5 3.5 21V6a3 3 0 0 1 3-3h11a3 3 0 0 1 3 3v9.5a3 3 0 0 1-3 3Z"/>`,
    refresh: `<path d="M20 12a8 8 0 0 1-14.7 4.4"/><path d="M4 12A8 8 0 0 1 18.7 7.6"/><path d="M3 17h4v-4"/><path d="M21 7h-4v4"/>`,
    bookmark: `<path d="M7 4h10v16l-5-3-5 3Z"/>`,
    logout: `<path d="M10 5H6v14h4"/><path d="M14 8l4 4-4 4"/><path d="M18 12H9"/>`,
    dots: `<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>`,
    bell: `<path d="M18 8a6 6 0 0 0-12 0c0 7-2.5 7-2.5 7h17S18 15 18 8Z"/><path d="M10 19a2 2 0 0 0 4 0"/>`,
    help: `<circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 4 1.8c-.9.7-1.8 1.2-1.8 2.7"/><path d="M12 17h.01"/>`
  };
  return `<svg ${common}>${paths[name] ?? paths.sprout}</svg>`;
}

async function nicknameEmail(nickname) {
  const normalized = String(nickname || "").normalize("NFKC").trim().replace(/\s+/g, " ");
  const bytes = new TextEncoder().encode(normalized.toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `u-${hex.slice(0, 40)}@goal.local`;
}

function authPassword(pin) {
  return `goal-share-v1:${pin}`;
}

async function loadProfile() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  failIf(sessionError);
  state.authUser = sessionData.session?.user || null;
  if (!state.authUser) {
    state.user = null;
    state.members = [];
    return null;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nickname,avatar_url,created_at,updated_at")
    .eq("id", state.authUser.id)
    .maybeSingle();
  failIf(error);
  state.user = data;
  return data;
}

async function ensureProfile(nickname) {
  const profile = {
    id: state.authUser.id,
    nickname: String(nickname || "").normalize("NFKC").trim().replace(/\s+/g, " ")
  };
  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select("id,nickname,avatar_url,created_at,updated_at")
    .single();
  failIf(error);
  state.user = data;
  return data;
}

async function loadMembers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,nickname,avatar_url,created_at")
    .order("created_at", { ascending: true });
  failIf(error);
  state.members = data || [];
  return state.members;
}

function navigate(path) {
  history.pushState(null, "", path);
  route();
}

function currentMonthFromUrl() {
  const url = new URL(location.href);
  const match = location.pathname.match(/^\/month\/(\d{4}-\d{2})$/);
  return match ? match[1] : url.searchParams.get("month") || state.currentMonth;
}

function brandMarkup() {
  return `<div class="brand"><span class="brand-icon">${icon("sprout")}</span><span>目標達成会議</span></div>`;
}

function navLink(href, active, iconName, label) {
  return `<a class="nav-link ${active ? "is-active" : ""}" href="${href}" data-link>
    <span class="nav-icon">${icon(iconName)}</span><span>${label}</span>
  </a>`;
}

function shell(content, options = {}) {
  const active = options.active || "home";
  const wide = options.wide ? "page-wide" : "";
  app.className = "";
  app.innerHTML = `
    <div class="app-layout">
      <aside class="sidebar">
        <div class="sidebar-inner">
          ${brandMarkup()}
          <nav class="nav">
            ${navLink("/", active === "home", "home", "ホーム")}
            ${navLink(`/edit?month=${encodeURIComponent(state.currentMonth)}`, active === "edit", "cloud", "今月の投稿")}
            ${navLink("/logs", active === "logs", "clock", "過去ログ")}
          </nav>
        </div>
        <div class="sidebar-footer">
          <div class="profile">
            ${avatar(state.user)}
            <div>
              <div class="profile-name">${escapeHtml(state.user?.nickname || "")}</div>
              <div class="profile-sub">固定メンバー</div>
            </div>
            <button class="icon-button" type="button" data-logout title="ログアウト">${icon("logout")}</button>
          </div>
        </div>
      </aside>
      <main class="main">
        <div class="page ${wide}">
          ${content}
        </div>
      </main>
    </div>
  `;
}

function renderConfigMissing() {
  app.className = "";
  app.innerHTML = `
    <main class="login-page">
      <section class="login-card">
        ${brandMarkup()}
        <p class="login-lead">SupabaseのURLとキーを設定してください。</p>
        <div class="form-error is-visible">
          config.js の url と key がまだプレースホルダーです。Project Settings → API Keys の Project URL と Publishable key / anon key を入れてください。
        </div>
      </section>
    </main>
  `;
}

function renderLogin() {
  app.className = "";
  app.innerHTML = `
    <main class="login-page">
      <span class="leaf one"></span>
      <span class="leaf two"></span>
      <span class="leaf three"></span>
      <section class="login-card">
        ${brandMarkup()}
        <p class="login-lead">今月の自分を、シェアしよう。</p>
        <div class="login-tabs" role="tablist">
          <button class="tab-button ${state.loginMode === "login" ? "is-active" : ""}" type="button" data-login-mode="login">ログイン</button>
          <button class="tab-button ${state.loginMode === "register" ? "is-active" : ""}" type="button" data-login-mode="register">初回登録</button>
        </div>
        <form class="form-grid" id="login-form">
          <label class="field">
            <span class="field-label">ニックネーム</span>
            <input class="input" name="nickname" autocomplete="username" placeholder="田中 あかり" required minlength="2" maxlength="24" />
          </label>
          <label class="field">
            <span class="field-label">PIN / パスワード <span class="field-help">4文字以上</span></span>
            <input class="input" name="password" type="password" autocomplete="${state.loginMode === "login" ? "current-password" : "new-password"}" placeholder="4文字以上" required minlength="4" maxlength="64" />
          </label>
          <div class="form-error" id="login-error"></div>
          <button class="primary-button" type="submit">${state.loginMode === "login" ? "ログイン" : "登録してはじめる"}</button>
        </form>
      </section>
    </main>
  `;

  document.querySelectorAll("[data-login-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.loginMode = button.dataset.loginMode;
      renderLogin();
    });
  });

  document.querySelector("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type='submit']");
    const errorBox = document.querySelector("#login-error");
    errorBox.classList.remove("is-visible");
    submit.disabled = true;
    try {
      const formData = Object.fromEntries(new FormData(form).entries());
      const nickname = String(formData.nickname || "").normalize("NFKC").trim().replace(/\s+/g, " ");
      const password = String(formData.password || "");
      const email = await nicknameEmail(nickname);

      if (nickname.length < 2) throw new Error("ニックネームは2文字以上で入力してください");
      if (password.length < 4) throw new Error("PIN / パスワードは4文字以上で入力してください");

      if (state.loginMode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password: authPassword(password) });
        failIf(error);
        state.authUser = data.user;
        await loadProfile();
        if (!state.user) await ensureProfile(nickname);
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: authPassword(password),
          options: { data: { nickname } }
        });
        failIf(error);
        if (!data.session) {
          throw new Error("Supabase Auth のメール確認が有効です。Authentication → Providers → Email で Confirm email をOFFにしてください。");
        }
        state.authUser = data.user;
        await ensureProfile(nickname);
      }

      await loadMembers();
      connectRealtime();
      navigate("/");
    } catch (error) {
      errorBox.textContent = error.message;
      errorBox.classList.add("is-visible");
    } finally {
      submit.disabled = false;
    }
  });
}

function topbar() {
  return `<div class="topbar">
    <button class="icon-button" type="button" title="通知">${icon("bell")}</button>
    <button class="icon-button" type="button" title="ヘルプ">${icon("help")}</button>
    <button class="ghost-button" type="button" data-backup>バックアップJSON</button>
  </div>`;
}

function statusLabel(post) {
  if (!post) return "";
  if (post.status === "draft") return `<span class="pill amber">下書き</span>`;
  const theme = String(post.theme || "").trim();
  if (theme.length > 0) return `<span class="pill">${escapeHtml(shortText(theme, 12))}</span>`;
  return `<span class="pill">投稿済み</span>`;
}

function reactionTotal(reactionMap) {
  return Object.values(reactionMap || {}).reduce((sum, item) => sum + Number(item.count || 0), 0);
}

function summarizeReactions(rows, currentUserId) {
  const summary = {};
  for (const row of rows || []) {
    const targetId = row.target_id;
    const type = row.reaction_type;
    summary[targetId] ??= {};
    summary[targetId][type] ??= { count: 0, users: [], reacted: false };
    summary[targetId][type].count += 1;
    summary[targetId][type].users.push(row.profiles?.nickname || "メンバー");
    if (row.user_id === currentUserId) summary[targetId][type].reacted = true;
  }
  return summary;
}

async function loadPostReactions(postIds) {
  if (!postIds.length) return {};
  const { data, error } = await supabase
    .from("reactions")
    .select("target_id,reaction_type,user_id,profiles:user_id(nickname)")
    .eq("target_type", "post")
    .is("deleted_at", null)
    .in("target_id", postIds);
  failIf(error);
  return summarizeReactions(data, state.user.id);
}

async function loadCommentReactions(commentIds) {
  if (!commentIds.length) return {};
  const { data, error } = await supabase
    .from("reactions")
    .select("target_id,reaction_type,user_id,profiles:user_id(nickname)")
    .eq("target_type", "comment")
    .is("deleted_at", null)
    .in("target_id", commentIds);
  failIf(error);
  return summarizeReactions(data, state.user.id);
}

async function loadCommentCounts(postIds) {
  const counts = new Map();
  if (!postIds.length) return counts;
  const { data, error } = await supabase
    .from("comments")
    .select("post_id")
    .is("deleted_at", null)
    .in("post_id", postIds);
  failIf(error);
  for (const row of data || []) counts.set(row.post_id, (counts.get(row.post_id) || 0) + 1);
  return counts;
}

function renderPostCard(card) {
  const member = card.member;
  const post = card.post;
  if (!post) {
    const isSelf = member.id === state.user.id;
    return `
      <article class="card post-card empty-card">
        <div>
          ${avatar(member, "large muted")}
          <h3>${escapeHtml(member.nickname)}</h3>
          <span class="pill gray">まだ投稿していません</span>
          <p>${isSelf ? "どんな1ヶ月にしたいか、考えてみましょう。" : "このメンバーの投稿を待っています。"}</p>
          ${isSelf ? `<a class="secondary-button" href="/edit?month=${encodeURIComponent(state.currentMonth)}" data-link>${icon("pen")}投稿を書く</a>` : ""}
        </div>
      </article>
    `;
  }

  const href = `/posts/${encodeURIComponent(post.id)}`;
  return `
    <article class="card post-card" data-clickable="true" data-card-link="${href}">
      <header class="card-header">
        ${avatar(member)}
        <div class="card-name">${escapeHtml(member.nickname)}</div>
        ${statusLabel(post)}
      </header>
      <dl class="summary-list">
        <div class="summary-row"><dt class="summary-label">仕事</dt><dd class="summary-text">${escapeHtml(shortText(post.work_goal))}</dd></div>
        <div class="summary-row"><dt class="summary-label">プライベート</dt><dd class="summary-text">${escapeHtml(shortText(post.private_goal))}</dd></div>
        <div class="summary-row"><dt class="summary-label">マインド</dt><dd class="summary-text">${escapeHtml(shortText(post.mindset_goal))}</dd></div>
        <div class="summary-row"><dt class="summary-label">相談</dt><dd class="summary-text">${escapeHtml(shortText(post.support_request))}</dd></div>
      </dl>
      <footer class="card-footer">
        <div class="metric-group">
          <span>♡ ${reactionTotal(post.reactions)}</span>
          <span>💬 ${Number(post.comment_count || 0)}</span>
        </div>
        <span>${formatDateTime(post.updated_at)}</span>
      </footer>
    </article>
  `;
}

async function renderHome(month = state.currentMonth) {
  state.route = "home";
  state.currentMonth = month;
  await loadMembers();
  const { data: posts, error } = await supabase
    .from("monthly_posts")
    .select("*, profiles:user_id(id,nickname,avatar_url,created_at)")
    .eq("target_month", month)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  failIf(error);

  const postIds = (posts || []).map((post) => post.id);
  const reactionSummary = await loadPostReactions(postIds);
  const commentCounts = await loadCommentCounts(postIds);
  const postByUser = new Map();
  for (const post of posts || []) {
    postByUser.set(post.user_id, {
      ...post,
      reactions: reactionSummary[post.id] || {},
      comment_count: commentCounts.get(post.id) || 0
    });
  }
  const cards = state.members.map((member) => ({ member, post: postByUser.get(member.id) || null }))
    .sort((left, right) => {
      if (left.post && right.post) return String(right.post.updated_at).localeCompare(String(left.post.updated_at));
      if (left.post) return -1;
      if (right.post) return 1;
      return 0;
    });
  const postedCount = cards.filter((card) => card.post && card.post.status === "published").length;
  const published = cards.filter((card) => card.post && card.post.status === "published");
  const missingCount = Math.max(0, state.members.length - postedCount);
  const myCard = cards.find((card) => card.member.id === state.user.id);
  const heroButtonLabel = myCard?.post ? "自分の投稿を編集" : "自分の投稿を書く";

  shell(`
    ${topbar()}
    <section class="hero">
      <div>
        <div class="hero-plant"></div>
        <h1>${formatMonth(month)}</h1>
        <p>今月も、あなたらしい一歩を。<br>お互いの目標を応援し合い、成長につなげていきましょう。</p>
      </div>
      <a class="primary-button" href="/edit?month=${encodeURIComponent(month)}" data-link>${icon("pen")}${heroButtonLabel}</a>
    </section>

    <section class="status-card">
      <div class="status-title">今月の投稿状況</div>
      <div class="status-count">${postedCount}人が投稿済み</div>
      <div class="avatar-stack">
        ${published.map((card) => avatar(card.member, "small")).join("")}
        ${Array.from({ length: Math.min(missingCount, 3) }).map(() => `<span class="avatar small muted">?</span>`).join("")}
      </div>
    </section>

    <div class="section-heading">
      <h2><span class="inline-icon">${icon("sprout")}</span>メンバーの今月の投稿</h2>
      <span class="pill gray">新しい順</span>
    </div>
    <section class="cards-grid">
      ${cards.map(renderPostCard).join("")}
    </section>

    <div class="notice-band">
      <span>${icon("sprout")} みんなの一歩が、チームの大きな前進に。</span>
      <span>いいねやコメントで、お互いを応援し合いましょう！ ♡</span>
    </div>
  `, { active: "home" });
}

function collectEditorValues() {
  const values = {};
  for (const field of editorFields) {
    const element = document.querySelector(`[name="${field.key}"]`);
    values[field.key] = element ? element.value : "";
  }
  return values;
}

function updateEditorProgress() {
  const values = collectEditorValues();
  let done = 0;
  const required = editorFields.filter((field) => !field.optional);
  for (const field of required) {
    if (String(values[field.key] || "").trim()) done += 1;
  }
  const progress = Math.round((done / required.length) * 100);
  const ring = document.querySelector(".progress-ring");
  if (ring) ring.style.setProperty("--progress", progress);
  const number = document.querySelector(".progress-number");
  if (number) number.textContent = `${progress}%`;
  document.querySelectorAll("[data-progress-field]").forEach((item) => {
    const key = item.dataset.progressField;
    item.classList.toggle("is-done", Boolean(String(values[key] || "").trim()));
  });
  document.querySelectorAll("[data-counter]").forEach((counter) => {
    const key = counter.dataset.counter;
    const max = Number(counter.dataset.max);
    counter.textContent = `${String(values[key] || "").length} / ${max}`;
  });
  const publish = document.querySelector("[data-publish]");
  if (publish) publish.disabled = progress < 40;
}

function setSaveState(message, tone = "") {
  const element = document.querySelector("#save-state");
  if (!element) return;
  element.textContent = message;
  element.dataset.tone = tone;
}

async function loadMinePost(month) {
  const { data, error } = await supabase
    .from("monthly_posts")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("target_month", month)
    .is("deleted_at", null)
    .maybeSingle();
  failIf(error);
  return data;
}

async function saveEditor(status = state.editorStatus, manual = false) {
  const values = collectEditorValues();
  const hasAnyText = Object.values(values).some((value) => String(value).trim());
  if (!hasAnyText && !manual) {
    setSaveState("入力待ち");
    return null;
  }
  setSaveState("保存中...");
  try {
    const existing = await loadMinePost(state.currentMonth);
    const existingHasContent = existing && editorFields.some((field) => String(existing[field.key] || "").trim());
    const incomingIsEmpty = editorFields.every((field) => String(values[field.key] || "").trim() === "");
    if (existing && existingHasContent && incomingIsEmpty) {
      throw new Error("空欄の内容では既存投稿を上書きできません");
    }
    let saved;
    if (existing) {
      if (state.editorExpected && existing.updated_at !== state.editorExpected) {
        throw new Error("別の画面で更新されています。再読み込みしてからもう一度保存してください");
      }
      const { data, error } = await supabase
        .from("monthly_posts")
        .update({ ...values, status })
        .eq("id", existing.id)
        .eq("updated_at", existing.updated_at)
        .select("*")
        .single();
      failIf(error);
      saved = data;
    } else {
      const { data, error } = await supabase
        .from("monthly_posts")
        .insert({ user_id: state.user.id, target_month: state.currentMonth, ...values, status })
        .select("*")
        .single();
      failIf(error);
      saved = data;
    }
    state.editorExpected = saved.updated_at;
    state.editorStatus = saved.status;
    state.editorDirty = false;
    state.suppressRefreshUntil = Date.now() + 1400;
    setSaveState(`保存済み ${formatDateTime(saved.updated_at)}`);
    return saved;
  } catch (error) {
    setSaveState(error.message, "error");
    throw error;
  }
}

async function renderEditor(month = state.currentMonth) {
  state.route = "edit";
  state.currentMonth = month;
  const post = await loadMinePost(month) || {};
  state.editorExpected = post.updated_at || null;
  state.editorStatus = post.status || "draft";
  state.editorDirty = false;

  shell(`
    <a class="back-link" href="/month/${encodeURIComponent(month)}" data-link>${icon("back")}戻る</a>
    <section class="page-title">
      <h1>${formatMonth(month)}の投稿</h1>
      <p>あなたらしい一歩を、チームで応援し合いましょう。</p>
    </section>
    <div class="editor-layout">
      <form class="panel editor-form" id="editor-form">
        ${editorFields.map((field) => `
          <section class="editor-section">
            <div class="editor-section-title">
              <span class="inline-icon">${icon(field.icon)}</span>
              <label>
                <strong>${escapeHtml(field.title)}${field.optional ? "（任意）" : ""}</strong>
                <span>${escapeHtml(field.help)}</span>
              </label>
            </div>
            ${field.input === "input"
              ? `<input class="input" name="${field.key}" maxlength="${field.max}" placeholder="例：信頼を築く、継続を楽しむ、自分の可能性を広げる など" value="${escapeHtml(post[field.key] || "")}" />`
              : `<textarea class="textarea" name="${field.key}" maxlength="${field.max}" placeholder="自由に入力してください${field.optional ? "（任意）" : ""}">${escapeHtml(post[field.key] || "")}</textarea>`}
            <div class="counter" data-counter="${field.key}" data-max="${field.max}">0 / ${field.max}</div>
          </section>
        `).join("")}
      </form>

      <aside class="sticky-side">
        <section class="panel">
          <h3>投稿の進捗</h3>
          <div class="progress-ring"><div><span class="progress-number">0%</span></div></div>
          <ul class="check-list">
            ${editorFields.filter((field) => !field.optional).map((field) => `
              <li data-progress-field="${field.key}"><span class="check-dot"></span>${escapeHtml(field.title)}を入力する</li>
            `).join("")}
          </ul>
          <div class="save-state" id="save-state">${post.updated_at ? `保存済み ${formatDateTime(post.updated_at)}` : "まだ保存されていません"}</div>
        </section>
        <section class="panel safe-panel">
          <h3>${icon("sprout")} 安心してシェアしよう</h3>
          <p class="muted">投稿は固定メンバーだけが閲覧できます。</p>
          <p class="muted">保存ごとに履歴を残し、古い画面からの上書きも検知します。</p>
        </section>
      </aside>
    </div>
    <div class="editor-actions">
      <button class="secondary-button" type="button" data-save-draft>${icon("bookmark")}下書き保存</button>
      <button class="primary-button" type="button" data-publish>${icon("send")}投稿する</button>
    </div>
  `, { active: "edit", wide: true });

  updateEditorProgress();
  document.querySelectorAll("#editor-form input, #editor-form textarea").forEach((element) => {
    element.addEventListener("input", () => {
      state.editorDirty = true;
      updateEditorProgress();
      setSaveState("保存待ち");
      clearTimeout(state.editorSaveTimer);
      state.editorSaveTimer = setTimeout(() => {
        saveEditor(state.editorStatus).catch(() => {});
      }, 900);
    });
  });
  document.querySelector("[data-save-draft]").addEventListener("click", async () => {
    await saveEditor("draft", true).catch((error) => alert(error.message));
  });
  document.querySelector("[data-publish]").addEventListener("click", async () => {
    const post = await saveEditor("published", true).catch((error) => {
      alert(error.message);
      return null;
    });
    if (post) navigate(`/posts/${encodeURIComponent(post.id)}`);
  });
}

function renderReactions(targetType, targetId, reactionMap = {}, compact = false) {
  return `<div class="reactions">
    ${reactions.map((reaction) => {
      const summary = reactionMap[reaction.type] || { count: 0, users: [], reacted: false };
      const title = summary.users.length ? `${reaction.label}: ${summary.users.join("、")}` : reaction.label;
      return `<button class="reaction-button ${summary.reacted ? "is-active" : ""}" type="button"
        data-reaction data-target-type="${targetType}" data-target-id="${escapeHtml(targetId)}"
        data-reaction-type="${reaction.type}" title="${escapeHtml(title)}">
        <span>${reaction.emoji}</span>${compact && summary.count === 0 ? "" : `<span>${summary.count || ""}</span>`}
      </button>`;
    }).join("")}
  </div>`;
}

function detailField(iconName, label, value) {
  return `<div class="detail-row">
    <div class="detail-label"><span class="inline-icon">${icon(iconName)}</span>${escapeHtml(label)}</div>
    <div class="detail-text">${textOrDash(value)}</div>
  </div>`;
}

function renderComment(comment, postAuthorId) {
  const isOwn = comment.user_id === state.user.id;
  const authorBadge = comment.user_id === postAuthorId ? `<span class="pill">投稿者</span>` : "";
  const replies = comment.replies || [];
  return `
    <article class="comment" id="comment-${escapeHtml(comment.id)}">
      ${avatar(comment.profiles || comment, "small")}
      <div class="comment-main">
        <div class="comment-head">
          <span class="comment-name">${escapeHtml(comment.profiles?.nickname || comment.nickname)}</span>
          ${authorBadge}
          <span class="comment-time">${formatDateTime(comment.created_at)}</span>
        </div>
        <div class="comment-body">${escapeHtml(comment.body)}</div>
        <div class="comment-tools">
          ${renderReactions("comment", comment.id, comment.reactions, true)}
          <button class="tiny-button" type="button" data-reply-toggle="${escapeHtml(comment.id)}">返信</button>
          ${isOwn ? `<button class="tiny-button" type="button" data-comment-delete="${escapeHtml(comment.id)}">削除</button>` : ""}
        </div>
        <form class="reply-box comment-box" data-reply-form="${escapeHtml(comment.id)}">
          ${avatar(state.user, "small")}
          <textarea class="comment-input" name="body" rows="1" placeholder="返信を書く..."></textarea>
          <button class="tiny-button" type="submit">送信</button>
        </form>
        ${replies.map((reply) => `
          <article class="comment reply" id="comment-${escapeHtml(reply.id)}">
            ${avatar(reply.profiles || reply, "small")}
            <div class="comment-main">
              <div class="comment-head">
                <span class="comment-name">${escapeHtml(reply.profiles?.nickname || reply.nickname)}</span>
                ${reply.user_id === postAuthorId ? `<span class="pill">投稿者</span>` : ""}
                <span class="comment-time">${formatDateTime(reply.created_at)}</span>
              </div>
              <div class="comment-body">${escapeHtml(reply.body)}</div>
              <div class="comment-tools">
                ${renderReactions("comment", reply.id, reply.reactions, true)}
                ${reply.user_id === state.user.id ? `<button class="tiny-button" type="button" data-comment-delete="${escapeHtml(reply.id)}">削除</button>` : ""}
              </div>
            </div>
          </article>
        `).join("")}
      </div>
    </article>
  `;
}

function countComments(comments) {
  return comments.reduce((sum, comment) => sum + 1 + (comment.replies ? comment.replies.length : 0), 0);
}

async function renderDetail(postId) {
  state.route = "detail";
  const { data: post, error } = await supabase
    .from("monthly_posts")
    .select("*, profiles:user_id(id,nickname,avatar_url,created_at)")
    .eq("id", postId)
    .is("deleted_at", null)
    .single();
  failIf(error);
  state.currentMonth = post.target_month || state.currentMonth;

  const { data: commentRows, error: commentsError } = await supabase
    .from("comments")
    .select("*, profiles:user_id(id,nickname,avatar_url,created_at)")
    .eq("post_id", postId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  failIf(commentsError);

  const commentIds = (commentRows || []).map((comment) => comment.id);
  const commentReactions = await loadCommentReactions(commentIds);
  const postReactions = (await loadPostReactions([postId]))[postId] || {};
  const byId = new Map();
  const roots = [];
  for (const comment of commentRows || []) {
    byId.set(comment.id, { ...comment, reactions: commentReactions[comment.id] || {}, replies: [] });
  }
  for (const comment of byId.values()) {
    const parent = comment.parent_comment_id ? byId.get(comment.parent_comment_id) : null;
    if (parent) parent.replies.push(comment);
    else if (!comment.parent_comment_id) roots.push(comment);
  }

  const member = post.profiles;
  const canEdit = post.user_id === state.user.id;
  shell(`
    <a class="back-link" href="/month/${encodeURIComponent(post.target_month)}" data-link>${icon("back")}戻る</a>
    <article class="card detail-card">
      <header class="detail-header">
        ${avatar(member, "large")}
        <div>
          <h1 class="detail-title">${escapeHtml(member.nickname)}</h1>
          <div><strong>${formatMonth(post.target_month)}の投稿</strong></div>
          <div class="detail-meta">投稿日時：${formatDateTime(post.created_at)}　最終更新：${formatDateTime(post.updated_at)}</div>
        </div>
        <div>
          ${canEdit ? `<a class="secondary-button" href="/edit?month=${encodeURIComponent(post.target_month)}" data-link>${icon("pen")}編集</a>` : `<button class="icon-button" type="button">${icon("dots")}</button>`}
        </div>
      </header>
      <div class="detail-body">
        ${detailField("sprout", "今月のテーマ", post.theme)}
        ${detailField("briefcase", "仕事", post.work_goal)}
        ${detailField("user", "プライベート", post.private_goal)}
        ${detailField("heart", "マインド", post.mindset_goal)}
        ${detailField("chat", "応援してほしいこと / 相談したいこと", post.support_request)}
        ${detailField("refresh", "先月の振り返り", post.reflection)}
      </div>
      <div class="reaction-row">
        ${renderReactions("post", post.id, postReactions)}
      </div>
    </article>

    <section class="comments-section">
      <h2 class="comments-title">コメント（${countComments(roots)}）</h2>
      <div class="comment-list">
        ${roots.length ? roots.map((comment) => renderComment(comment, post.user_id)).join("") : `<div class="empty-state card"><h2>まだコメントはありません</h2><p>最初の応援を届けましょう。</p></div>`}
      </div>
      ${post.status === "published" ? `
        <form class="comment-box" data-comment-form="${escapeHtml(post.id)}">
          ${avatar(state.user, "small")}
          <textarea class="comment-input" name="body" rows="1" placeholder="コメントを書く..."></textarea>
          <button class="primary-button" type="submit">送信</button>
        </form>
      ` : ""}
    </section>
  `, { active: "home", wide: true });
}

async function renderLogs() {
  state.route = "logs";
  const { data, error } = await supabase
    .from("monthly_posts")
    .select("target_month,updated_at")
    .eq("status", "published")
    .is("deleted_at", null)
    .order("target_month", { ascending: false });
  failIf(error);
  const months = new Map();
  for (const post of data || []) {
    const current = months.get(post.target_month) || { target_month: post.target_month, post_count: 0, latest_updated_at: post.updated_at };
    current.post_count += 1;
    if (String(post.updated_at) > String(current.latest_updated_at)) current.latest_updated_at = post.updated_at;
    months.set(post.target_month, current);
  }
  const rows = [...months.values()].sort((a, b) => b.target_month.localeCompare(a.target_month));
  shell(`
    <section class="page-title">
      <h1>過去ログ</h1>
      <p>月ごとの投稿を振り返り、チームの歩みを眺められます。</p>
    </section>
    ${rows.length ? `
      <section class="logs-grid">
        ${rows.map((month) => `
          <a class="card month-card" href="/month/${encodeURIComponent(month.target_month)}" data-link>
            <strong>${formatMonth(month.target_month)}</strong>
            <span>${month.post_count}件の投稿</span>
            <span class="muted">最終更新 ${formatDateTime(month.latest_updated_at)}</span>
          </a>
        `).join("")}
      </section>
    ` : `
      <div class="empty-state card">
        <h2>まだ過去ログはありません</h2>
        <p>公開された投稿が残ると、ここから月ごとに振り返れます。</p>
      </div>
    `}
  `, { active: "logs" });
}

function connectRealtime() {
  if (state.channel) supabase.removeChannel(state.channel);
  state.channel = supabase
    .channel("goal-share-realtime")
    .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, refreshFromRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "monthly_posts" }, refreshFromRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "comments" }, refreshFromRealtime)
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, refreshFromRealtime)
    .subscribe();
}

function refreshFromRealtime() {
  if (Date.now() < state.suppressRefreshUntil) return;
  if (state.route === "edit" && state.editorDirty) return;
  clearTimeout(state.refreshTimer);
  state.refreshTimer = setTimeout(() => route(true), 450);
}

async function toggleReaction(button) {
  const targetType = button.dataset.targetType;
  const targetId = button.dataset.targetId;
  const reactionType = button.dataset.reactionType;
  const { data: active, error: activeError } = await supabase
    .from("reactions")
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .eq("user_id", state.user.id)
    .eq("reaction_type", reactionType)
    .is("deleted_at", null)
    .maybeSingle();
  failIf(activeError);
  if (active) {
    const { error } = await supabase
      .from("reactions")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", active.id);
    failIf(error);
  } else {
    const { error } = await supabase
      .from("reactions")
      .insert({ target_type: targetType, target_id: targetId, user_id: state.user.id, reaction_type: reactionType });
    failIf(error);
  }
}

async function createComment(postId, body, parentCommentId = null) {
  const payload = {
    post_id: postId,
    user_id: state.user.id,
    parent_comment_id: parentCommentId,
    body: body.trim()
  };
  const { error } = await supabase.from("comments").insert(payload);
  failIf(error);
}

async function softDeleteComment(commentId) {
  const { error } = await supabase
    .from("comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", commentId);
  failIf(error);
}

async function downloadBackup() {
  const { data, error } = await supabase.rpc("export_backup");
  failIf(error);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `goal-share-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function route(isRefresh = false) {
  if (!state.user && !isRefresh) {
    renderLogin();
    return;
  }
  try {
    const path = location.pathname;
    if (path === "/logs") {
      await renderLogs();
      return;
    }
    const postMatch = path.match(/^\/posts\/([^/]+)$/);
    if (postMatch) {
      await renderDetail(decodeURIComponent(postMatch[1]));
      return;
    }
    if (path === "/edit") {
      await renderEditor(currentMonthFromUrl());
      return;
    }
    const monthMatch = path.match(/^\/month\/(\d{4}-\d{2})$/);
    if (monthMatch) {
      await renderHome(monthMatch[1]);
      return;
    }
    await renderHome(currentMonthFromUrl());
  } catch (error) {
    shell(`<div class="empty-state card"><h2>読み込みに失敗しました</h2><p>${escapeHtml(error.message)}</p></div>`, { active: state.route || "home" });
  }
}

document.addEventListener("click", async (event) => {
  const card = event.target.closest("[data-card-link]");
  if (card && !event.target.closest("button, a")) {
    navigate(card.dataset.cardLink);
    return;
  }

  const link = event.target.closest("[data-link]");
  if (link) {
    event.preventDefault();
    navigate(link.getAttribute("href"));
    return;
  }

  const backup = event.target.closest("[data-backup]");
  if (backup) {
    backup.disabled = true;
    await downloadBackup().catch((error) => alert(error.message));
    backup.disabled = false;
    return;
  }

  const logout = event.target.closest("[data-logout]");
  if (logout) {
    await supabase.auth.signOut();
    state.user = null;
    state.authUser = null;
    if (state.channel) supabase.removeChannel(state.channel);
    history.replaceState(null, "", "/");
    renderLogin();
    return;
  }

  const reaction = event.target.closest("[data-reaction]");
  if (reaction) {
    reaction.disabled = true;
    await toggleReaction(reaction).catch((error) => alert(error.message));
    await route(true);
    return;
  }

  const replyToggle = event.target.closest("[data-reply-toggle]");
  if (replyToggle) {
    const form = document.querySelector(`[data-reply-form="${CSS.escape(replyToggle.dataset.replyToggle)}"]`);
    if (form) form.classList.toggle("is-open");
    return;
  }

  const deleteButton = event.target.closest("[data-comment-delete]");
  if (deleteButton) {
    if (!confirm("このコメントを削除しますか？")) return;
    await softDeleteComment(deleteButton.dataset.commentDelete).catch((error) => alert(error.message));
    await route(true);
  }
});

document.addEventListener("submit", async (event) => {
  const commentForm = event.target.closest("[data-comment-form]");
  const replyForm = event.target.closest("[data-reply-form]");
  if (!commentForm && !replyForm) return;
  event.preventDefault();
  const form = commentForm || replyForm;
  const textarea = form.querySelector("textarea[name='body']");
  const body = textarea.value.trim();
  if (!body) return;
  const postId = document.querySelector("[data-comment-form]")?.dataset.commentForm || new URL(location.href).pathname.split("/").pop();
  const parentId = replyForm ? replyForm.dataset.replyForm : null;
  await createComment(postId, body, parentId)
    .then(() => { textarea.value = ""; })
    .catch((error) => alert(error.message));
  await route(true);
});

window.addEventListener("popstate", () => route());

async function boot() {
  if (!hasConfig) {
    renderConfigMissing();
    return;
  }
  try {
    await loadProfile();
    if (state.user) {
      await loadMembers();
      connectRealtime();
      await route();
    } else {
      renderLogin();
    }
  } catch (error) {
    app.innerHTML = `<div class="empty-state card"><h2>起動に失敗しました</h2><p>${escapeHtml(error.message)}</p></div>`;
  }
}

boot();
