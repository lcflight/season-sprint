<script>
export default { name: "PrivacyView" };
</script>

<template>
  <div class="privacy-page">
    <header class="privacy-page-head">
      <h1>Privacy Policy</h1>
      <router-link class="btn-ghost back-link" to="/">Back</router-link>
    </header>

    <p class="updated">Last updated: July 9, 2026</p>

    <section class="privacy-card">
      <p>
        Season Sprint ("the app") is an independent, fan-made tracker for THE
        FINALS season leaderboard progress. It is not affiliated with or
        endorsed by Embark Studios. This page explains what data the app
        collects and how it's used, across the Android, iOS, and web clients.
      </p>

      <h2 class="card-title">Information we collect</h2>
      <ul>
        <li>
          <strong>Account information.</strong> When you sign in, our
          authentication provider, Clerk, collects your email address to send
          a one-time sign-in code and to maintain your session. We store your
          email and, optionally, a display name against your account.
        </li>
        <li>
          <strong>Season records you enter.</strong> The dates and point
          totals you log to track your season progress, plus which mode
          (World Tour / Ranked) they belong to.
        </li>
        <li>
          <strong>API keys.</strong> If you generate an API key for
          programmatic access, we store a hashed version of it — never the
          key itself in plain text.
        </li>
      </ul>
      <p>
        We do not use analytics, advertising, or crash-reporting SDKs of any
        kind, and we do not collect device identifiers, location data, or
        contacts.
      </p>

      <h2 class="card-title">How your data is used</h2>
      <p>
        Your email identifies your account and lets you sign back in. Your
        season records are used solely to show you your own points graph and
        pace projections — they're not shared with other users or used for
        any purpose beyond displaying your own data back to you.
      </p>

      <h2 class="card-title">Where your data is stored</h2>
      <p>
        The app runs on Cloudflare Workers, with account and season-record
        data stored in a Cloudflare D1 database. Cloudflare, as our hosting
        provider, retains standard infrastructure request logs (e.g. IP
        address and timestamp of requests) independent of anything the app
        itself stores. Live sync between your devices uses a WebSocket
        connection that relays updates in real time and does not log message
        contents.
      </p>

      <h2 class="card-title">Third parties</h2>
      <p>
        We use <strong>Clerk</strong> for authentication. Clerk processes
        your email address on our behalf under its own privacy policy,
        available at
        <a href="https://clerk.com/privacy" target="_blank" rel="noopener noreferrer">clerk.com/privacy</a>.
        We do not sell or share your data with any other third party.
      </p>

      <h2 id="data-deletion" class="card-title">Data deletion</h2>
      <p>
        You can delete individual season records at any time from within the
        Season Sprint app (Android, iOS, or web) — open a record and choose
        delete.
      </p>
      <p>
        To delete your Season Sprint account and all associated data
        entirely:
      </p>
      <ol>
        <li>
          Submit the <router-link to="/delete-account">account deletion form</router-link>
          with the email your account uses (or email
          <a href="mailto:larthur.creations@gmail.com">larthur.creations@gmail.com</a>
          directly).
        </li>
        <li>
          We'll confirm the request and permanently delete your account,
          email, season records, and API keys within 30 days.
        </li>
      </ol>
      <p>
        Standard infrastructure request logs kept by our hosting provider,
        Cloudflare (e.g. IP address and timestamp of requests — see "Where
        your data is stored" above), are not covered by this process and age
        out per Cloudflare's own retention policy, independent of your
        account.
      </p>

      <h2 class="card-title">Children's privacy</h2>
      <p>
        Season Sprint is not directed at children under 13, and we do not
        knowingly collect data from them.
      </p>

      <h2 class="card-title">Contact</h2>
      <p>
        Questions about this policy or your data? Reach out at
        <a href="mailto:larthur.creations@gmail.com">larthur.creations@gmail.com</a>.
      </p>
    </section>
  </div>
</template>

<style scoped>
.privacy-page {
  width: min(720px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 20px;
  text-align: left;
}

.privacy-page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.privacy-page-head h1 {
  margin: 0;
  font-size: clamp(20px, 5vw, 28px);
  font-weight: 900;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-strong);
}

.back-link {
  text-decoration: none;
}

.updated {
  margin: -8px 0 0;
  font-size: 12px;
  color: var(--muted);
}

.privacy-card {
  background: var(--surface);
  border: 1px solid color-mix(in oklab, var(--primary) 20%, var(--surface));
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  padding: 20px 24px;
}

.privacy-card .card-title {
  margin: 24px 0 8px;
  font-size: 14px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-strong);
  /* So a direct link to #data-deletion doesn't land the heading underneath
     the sticky header bar. */
  scroll-margin-top: 80px;
}
.privacy-card .card-title:first-child {
  margin-top: 0;
}

.privacy-card p {
  margin: 0 0 8px;
  color: var(--text);
  line-height: 1.5;
}
.privacy-card p:last-child {
  margin-bottom: 0;
}

.privacy-card ul,
.privacy-card ol {
  margin: 0 0 8px;
  padding-left: 20px;
  color: var(--text);
  line-height: 1.5;
}

.privacy-card a {
  color: var(--primary);
}
</style>
