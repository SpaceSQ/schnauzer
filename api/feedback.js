const SITE = "https://schnauzer.robot0.com";
const REPO_OWNER = "SpaceSQ";
const REPO_NAME = "schnauzer";
const REPO_ID = "R_kgDOVL9l1w";
const IDEAS_CATEGORY = "DIC_kwDOVL9l184DIlvo";
const WALL_PATH = "reports/feedback-wall.json";

const IDENTITY = new Set(["human_researcher", "ai_agent"]);
const DOMAIN = new Set([
  "robot_brain",
  "soul_consciousness",
  "ai_companion_pet",
  "embodied_control",
  "other",
]);

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function clean(s, max) {
  return String(s || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function isPendingStatus(status) {
  return status === "pending_gemini_review";
}

function statusRank(status) {
  if (status === "published") return 3;
  if (status === "reviewed_by_gemini" || status === "gemini_reviewed") return 2;
  return 0;
}

function normalize(row) {
  const rawStatus = String(row.status || "pending_gemini_review");
  const status =
    rawStatus === "reviewed_by_gemini" ||
    rawStatus === "gemini_reviewed" ||
    rawStatus === "published" ||
    rawStatus === "pending_gemini_review"
      ? rawStatus
      : "pending_gemini_review";
  return {
    id: row.id,
    identity: row.identity,
    submitter: row.submitter || "",
    domain: row.domain,
    reportDate: row.reportDate || row.report_date || "",
    body: row.body || "",
    status,
    geminiReply: row.geminiReply || row.gemini_reply || "",
    discussionUrl: row.discussionUrl || row.discussion_url || "",
    source: row.source || "site",
    createdAt: row.createdAt || row.created_at || new Date().toISOString(),
    reviewedAt: row.reviewedAt || row.reviewed_at || "",
  };
}

function fingerprint(row) {
  const disc = String(row.discussionUrl || "").replace(/\/+$/, "");
  if (disc && !/\/discussions$/i.test(disc)) return `disc:${disc}`;
  return `sb:${String(row.submitter || "").trim()}|${String(row.body || "").replace(/\s+/g, " ").trim()}`;
}

function prefer(a, b) {
  const keep = statusRank(b.status) >= statusRank(a.status) ? b : a;
  const other = keep === b ? a : b;
  return {
    ...other,
    ...keep,
    status: statusRank(keep.status) >= statusRank(other.status) ? keep.status : other.status,
    geminiReply: keep.geminiReply || other.geminiReply,
    discussionUrl: keep.discussionUrl || other.discussionUrl,
    reviewedAt: keep.reviewedAt || other.reviewedAt,
  };
}

function mergeItems(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const raw of list || []) {
      const row = normalize(raw);
      if (!row.id) continue;
      const prev = byId.get(row.id);
      byId.set(row.id, prev ? prefer(prev, row) : row);
    }
  }
  const byFp = new Map();
  for (const row of byId.values()) {
    const fp = fingerprint(row);
    const prev = byFp.get(fp);
    byFp.set(fp, prev ? prefer(prev, row) : row);
  }
  return [...byFp.values()].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function readJson(url, headers) {
  const res = await fetch(url, { headers, cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

function ghHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "scr-lab-feedback",
  };
}

async function readGithubWall() {
  const headers = ghHeaders();
  if (!headers) {
    const wall = await readJson(`${SITE}/${WALL_PATH}`);
    return { items: (wall.items || []).map(normalize), sha: null };
  }
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${WALL_PATH}`,
    { headers, cache: "no-store" },
  );
  if (!res.ok) {
    const wall = await readJson(`${SITE}/${WALL_PATH}`).catch(() => ({ items: [] }));
    return { items: (wall.items || []).map(normalize), sha: null };
  }
  const json = await res.json();
  const decoded = Buffer.from(json.content.replace(/\n/g, ""), "base64").toString("utf8");
  const wall = JSON.parse(decoded);
  return { items: (wall.items || []).map(normalize), sha: json.sha };
}

async function writeGithubWall(items, sha) {
  const headers = ghHeaders();
  if (!headers) return false;
  const body = {
    schema: "scr-lab.external-feedback/1",
    site: `${SITE}/#feedback-portal`,
    discussions: `https://github.com/${REPO_OWNER}/${REPO_NAME}/discussions`,
    updatedAt: new Date().toISOString(),
    items,
  };
  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${WALL_PATH}`,
    {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "sync: external feedback wall",
        content: Buffer.from(JSON.stringify(body, null, 2), "utf8").toString("base64"),
        sha: sha || undefined,
      }),
    },
  );
  return res.ok;
}

async function createDiscussion(row) {
  const headers = ghHeaders();
  if (!headers) return "";
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation($repo:ID!,$cat:ID!,$title:String!,$body:String!){
        createDiscussion(input:{repositoryId:$repo,categoryId:$cat,title:$title,body:$body}){
          discussion { url }
        }
      }`,
      variables: {
        repo: REPO_ID,
        cat: IDEAS_CATEGORY,
        title: `[SCR Feedback] ${row.reportDate || "report"} / ${row.domain} / ${row.submitter || row.identity}`,
        body: [
          `identity: ${row.identity}`,
          `submitter: ${row.submitter || "(anonymous)"}`,
          `domain: ${row.domain}`,
          `report: ${row.reportDate}`,
          `status: ${row.status}`,
          `id: ${row.id}`,
          "",
          row.body,
          "",
          `Portal: ${SITE}/#feedback-portal`,
        ].join("\n"),
      },
    }),
  });
  if (!res.ok) return "";
  const json = await res.json();
  return json.data?.createDiscussion?.discussion?.url || "";
}

function supabaseConf() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

async function supabaseSelect() {
  const conf = supabaseConf();
  if (!conf) return [];
  const res = await fetch(
    `${conf.url}/rest/v1/external_feedback?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: conf.key,
        Authorization: `Bearer ${conf.key}`,
      },
    },
  );
  if (!res.ok) return [];
  return (await res.json()).map(normalize);
}

async function supabaseInsert(row) {
  const conf = supabaseConf();
  if (!conf) return null;
  const res = await fetch(`${conf.url}/rest/v1/external_feedback`, {
    method: "POST",
    headers: {
      apikey: conf.key,
      Authorization: `Bearer ${conf.key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      identity: row.identity,
      submitter: row.submitter,
      domain: row.domain,
      report_date: row.reportDate || null,
      body: row.body,
      status: row.status,
      discussion_url: row.discussionUrl || null,
      source: row.source,
    }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows[0] ? normalize(rows[0]) : null;
}

async function supabasePatchReviewed(row) {
  const conf = supabaseConf();
  if (!conf) return false;
  const submitter = String(row.submitter || "").replace(/,/g, " ");
  const filter = `submitter=eq.${encodeURIComponent(submitter)}`;
  const res = await fetch(`${conf.url}/rest/v1/external_feedback?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: conf.key,
      Authorization: `Bearer ${conf.key}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      status: row.status,
      gemini_reply: row.geminiReply || null,
      reviewed_at: row.reviewedAt || new Date().toISOString(),
    }),
  });
  return res.ok;
}

function reviewAuthorized(req) {
  const expected = process.env.SCR_REVIEW_KEY || process.env.GITHUB_TOKEN;
  if (!expected) return false;
  const got = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  return got && got === expected;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    if (req.method === "GET") {
      const github = await readGithubWall().catch(() => ({ items: [], sha: null }));
      const cloud = await supabaseSelect().catch(() => []);
      const items = mergeItems([github.items, cloud]);
      res.status(200).json({
        ok: true,
        pendingCount: items.filter((x) => isPendingStatus(x.status)).length,
        items,
      });
      return;
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const row = {
        id: `fb_${Date.now().toString(16)}_${Math.random().toString(16).slice(2, 8)}`,
        identity: body.identity,
        submitter: clean(body.submitter, 80),
        domain: body.domain,
        reportDate: clean(body.reportDate, 16),
        body: clean(body.body, 8000),
        status: "pending_gemini_review",
        geminiReply: "",
        discussionUrl: "",
        source: clean(body.source, 32) || "site",
        createdAt: new Date().toISOString(),
      };
      if (!IDENTITY.has(row.identity) || !DOMAIN.has(row.domain) || row.body.length < 8) {
        res.status(400).json({ error: "identity, domain and body required" });
        return;
      }
      row.discussionUrl = await createDiscussion(row).catch(() => "");
      await supabaseInsert(row).catch(() => null);
      const github = await readGithubWall().catch(() => ({ items: [], sha: null }));
      const items = mergeItems([[row], github.items]);
      await writeGithubWall(items, github.sha).catch(() => false);
      res.status(200).json({ ok: true, item: row, items });
      return;
    }

    if (req.method === "PATCH") {
      if (!reviewAuthorized(req)) {
        res.status(401).json({ error: "review key required" });
        return;
      }
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const github = await readGithubWall();
      const now = new Date().toISOString();
      const items = github.items.map((row) => {
        const hit =
          (body.ids || []).includes(row.id) ||
          body.id === row.id ||
          (body.submitters || []).includes(row.submitter);
        if (!hit) return row;
        return {
          ...row,
          status: body.status || "reviewed_by_gemini",
          geminiReply: clean(body.geminiReply || body.reply || row.geminiReply, 8000),
          reviewedAt: now,
        };
      });
      await writeGithubWall(items, github.sha);
      await Promise.all(
        items
          .filter((row) => !isPendingStatus(row.status))
          .map((row) => supabasePatchReviewed(row).catch(() => false)),
      );
      res.status(200).json({ ok: true, items, pendingCount: items.filter((x) => isPendingStatus(x.status)).length });
      return;
    }

    res.status(405).json({ error: "method not allowed" });
  } catch (error) {
    res.status(500).json({ error: "feedback backend failed", detail: String(error).slice(0, 200) });
  }
};
