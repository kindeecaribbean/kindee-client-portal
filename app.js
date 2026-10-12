import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/+esm";

const SUPABASE_URL = "https://hkrjzidloauepwcbsqxp.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ZIhphiaqO927Kr4at7OJLA_3orb7S9W";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});
const queryParams = new URLSearchParams(window.location.search);
const DEMO_MODE = queryParams.get("demo") === "portal";

const $ = (id) => document.getElementById(id);
const views = { loading: $("loading"), auth: $("auth-view"), portal: $("portal-view") };
let currentUser = null;
let availableMemberships = [];

function showView(name) {
  Object.entries(views).forEach(([key, element]) => element.classList.toggle("hidden", key !== name));
}

function setMessage(message = "", success = false) {
  const root = $("auth-message");
  root.textContent = message;
  root.classList.toggle("success", success);
}

function setAuthMode(mode) {
  const login = mode === "login";
  const activate = mode === "activate";
  const reset = mode === "reset";
  $("login-form").classList.toggle("hidden", !login);
  $("activate-form").classList.toggle("hidden", !activate);
  $("reset-form").classList.toggle("hidden", !reset);
  $("auth-links").classList.toggle("hidden", !login);
  $("back-button").classList.toggle("hidden", login || reset);
  $("auth-title").textContent = login ? "Welcome back" : activate ? "Activeer jouw account" : "Kies een nieuw wachtwoord";
  $("auth-intro").textContent = login
    ? "Access every detail of your project."
    : activate
      ? "Gebruik het e-mailadres waarop je door ons bent uitgenodigd."
      : "Maak een nieuw persoonlijk wachtwoord voor jouw projectomgeving.";
  setMessage();
}

function errorText(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return "Het e-mailadres of wachtwoord klopt niet.";
  if (message.includes("email not confirmed")) return "Bevestig eerst jouw e-mailadres via de e-mail die je hebt ontvangen.";
  if (message.includes("already registered")) return "Dit account bestaat al. Log in of kies ‘Wachtwoord vergeten’.";
  if (message.includes("password")) return "Gebruik een sterker wachtwoord van minimaal 8 tekens.";
  return "Dat lukte niet. Probeer het nog een keer of neem contact op met ons team.";
}

async function handleLogin(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const email = $("login-email").value.trim();
  const password = $("login-password").value;
  button.disabled = true;
  setMessage();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) setMessage(errorText(error));
  button.disabled = false;
}

async function handleActivate(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const email = $("activate-email").value.trim().toLowerCase();
  const password = $("activate-password").value;
  if (password.length < 8) return setMessage("Gebruik minimaal 8 tekens voor jouw wachtwoord.");
  button.disabled = true;
  setMessage();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}` },
  });
  if (error) setMessage(errorText(error));
  else setMessage("Gelukt. Open de bevestigingsmail om jouw account te activeren.", true);
  button.disabled = false;
}

async function handleForgot() {
  const email = $("login-email").value.trim().toLowerCase();
  if (!email) return setMessage("Vul eerst jouw e-mailadres in.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}${window.location.pathname}?reset=1`,
  });
  if (error) setMessage(errorText(error));
  else setMessage("Je ontvangt zo een e-mail waarmee je een nieuw wachtwoord kunt kiezen.", true);
}

async function handleReset(event) {
  event.preventDefault();
  const password = $("reset-password").value;
  if (password.length < 8) return setMessage("Gebruik minimaal 8 tekens voor jouw wachtwoord.");
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) setMessage(errorText(error));
  else {
    setMessage("Jouw wachtwoord is bijgewerkt.", true);
    window.history.replaceState({}, "", window.location.pathname);
    await openPortal();
  }
  button.disabled = false;
}

function renderDashboard(membership, dashboard, proposals, responses) {
  const project = membership.projects;
  const data = dashboard.content || {};
  $("header-user").textContent = currentUser.email;
  $("client-name").textContent = membership.client_display_name;
  $("project-name").textContent = project.display_name;
  $("hero-project").textContent = project.display_name;
  $("project-update").textContent = data.projectUpdate || "Een nieuwe projectupdate volgt.";
  $("last-sync").textContent = data.lastSync ? `Bijgewerkt ${data.lastSync}` : "";

  const planning = Array.isArray(data.planning) ? data.planning : [];
  const next = planning.find((item) => item.status !== "Gereed") || planning[0] || {};
  $("next-milestone").textContent = next.title || "Nieuwe planning volgt";
  $("next-note").textContent = next.note || next.period || "";

  $("summary-grid").innerHTML = (data.summary || []).map((item) => `
    <article class="summary-card"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.note)}</small></article>
  `).join("");

  $("planning-list").innerHTML = planning.length ? planning.slice(0, 4).map((item) => `
    <div class="planning-item"><div class="planning-date">${escapeHtml(item.shortDate || "UPDATE")}</div><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.note || item.period || "")}</p></div></div>
  `).join("") : '<div class="empty-state">Een nieuwe planning volgt.</div>';

  $("folder-grid").innerHTML = (data.folders || []).map((folder) => `
    <a class="folder-card" href="${safeUrl(folder.url)}" target="_blank" rel="noopener"><span>${escapeHtml(folder.number)}</span><strong>${escapeHtml(folder.title)}</strong><small>Map openen ↗</small></a>
  `).join("");
  $("root-folder").href = safeUrl(data.rootFolderUrl);

  $("contacts-grid").innerHTML = (data.contacts || []).map((contact) => `
    <article class="contact-card"><span>${escapeHtml(contact.role)}</span><strong>${escapeHtml(contact.name)}</strong><p>${escapeHtml(contact.note)}</p>${contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}">${escapeHtml(contact.phone)}</a>` : ""}${contact.email ? `<a href="mailto:${escapeHtml(contact.email)}">${escapeHtml(contact.email)}</a>` : ""}</article>
  `).join("");

  renderApprovals(proposals, responses);
}

function renderApprovals(proposals, responses) {
  const pending = proposals.filter((item) => item.status === "pending");
  if (!pending.length) {
    $("approvals-list").className = "empty-state";
    $("approvals-list").textContent = "Er staan momenteel geen voorstellen ter beoordeling.";
    return;
  }
  $("approvals-list").className = "";
  $("approvals-list").innerHTML = pending.map((proposal) => {
    const response = responses.find((item) => item.proposal_id === proposal.id && item.user_id === currentUser.id);
    return `<div class="planning-item"><div class="planning-date">${escapeHtml(proposal.code)}</div><div><strong>${escapeHtml(proposal.title)}</strong><p>${escapeHtml(response ? "Jouw reactie is vastgelegd." : proposal.note || proposal.amount)}</p></div></div>`;
  }).join("");
}

function openPortalDemo() {
  currentUser = { id: "demo", email: "Voorbeeldweergave · geen privébestanden" };
  const membership = {
    client_display_name: "Familie Example",
    projects: { display_name: "Villa Example" },
  };
  const folderTitles = [
    "Contract & begroting", "Betaalstaten", "Facturen", "Betalingsbewijzen",
    "Meer- en minderwerk", "Planning", "Tekeningen", "Vergunningen & machtigingen",
    "Nutsvoorzieningen", "Inkoop & import", "Voortgangsfoto’s", "Correspondentie",
    "Oplevering & garantie",
  ];
  const dashboard = { content: {
    projectUpdate: "De eerste projectupdate volgt.",
    lastSync: "11 oktober 2026",
    planning: [],
    summary: [],
    rootFolderUrl: "#",
    folders: folderTitles.map((title, index) => ({
      number: String(index + 1).padStart(2, "0"), title, url: "#",
    })),
    contacts: [
      { name: "Jouw vaste contactpersoon", role: "Uitvoerder", note: "Dagelijkse coördinatie op de bouw" },
      { name: "Ons uitvoeringsteam", role: "Hoofduitvoerder", note: "Uitvoering en algemeen toezicht" },
      { name: "Onze financiële administratie", role: "Financiële administratie", note: "Facturen, betalingen en financiële vragen" },
      { name: "Ons ondersteuningsteam", role: "Algemene vragen", note: "Vergunningen, nutsvoorzieningen, transport en ondersteuning" },
    ],
  }};
  renderDashboard(membership, dashboard, [], []);
  $("signout-button").textContent = "Voorbeeld sluiten";
  $("root-folder").removeAttribute("href");
  document.querySelectorAll("#folder-grid a").forEach((link) => {
    link.removeAttribute("href");
    link.removeAttribute("target");
    link.querySelector("small").textContent = "Beschikbaar na inloggen";
  });
  showView("portal");
}

function showProjectPicker(memberships) {
  showView("portal");
  $("header-user").textContent = currentUser.email;

  const portalMain = document.querySelector(".portal-main");
  portalMain.classList.add("hidden");

  const picker = document.createElement("section");
  picker.id = "project-picker";
  picker.style.cssText =
    "max-width:1180px;margin:0 auto;padding:clamp(70px,10vw,130px) 24px;";

  picker.innerHTML = `
    <div style="max-width:660px;margin-bottom:46px">
      <p class="eyebrow">Client Portal</p>
      <h1 style="font-size:clamp(36px,6vw,70px);font-weight:400;line-height:1.05;margin:12px 0 20px">
        Selecteer uw project
      </h1>
      <p style="color:#68737b;font-size:17px;line-height:1.7;margin:0">
        Kies de projectomgeving die u wilt openen.
      </p>
    </div>
    <div id="project-picker-grid"
         style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px">
    </div>`;

  const grid = picker.querySelector("#project-picker-grid");

  memberships.forEach((membership) => {
    const button = document.createElement("button");
    button.type = "button";
    button.style.cssText =
      "min-height:190px;padding:30px;text-align:left;border:1px solid #d8d5ce;background:#fff;color:#0d1921;cursor:pointer;display:flex;flex-direction:column;justify-content:space-between;transition:transform .2s ease,border-color .2s ease;";

    button.innerHTML = `
      <span style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#9a874e">Project</span>
      <strong style="font-size:25px;font-weight:400;line-height:1.25">
        ${escapeHtml(membership.projects.display_name)}
      </strong>
      <span style="font-size:14px">Project openen&nbsp; →</span>`;

    button.addEventListener("click", () => {
      const url = new URL(window.location.href);
      url.searchParams.set("project", membership.project_id);
      window.location.href = url.toString();
    });

    grid.appendChild(button);
  });

  document.querySelector("#portal-view .portal-header").after(picker);
}
async function openPortal() {
  showView("loading");
  const { data: userResult } = await supabase.auth.getUser();
  currentUser = userResult.user;
  if (!currentUser) return showView("auth");

  const { data: memberships, error: membershipError } = await supabase
    .from("project_memberships")
    .select("project_id, client_display_name, role, projects(id, display_name, is_active)")
    .eq("user_id", currentUser.id)
    .eq("projects.is_active", true)
    .order("created_at", { ascending: true });

  if (membershipError || !memberships?.length) {
    await supabase.auth.signOut();
    setAuthMode("login");
    showView("auth");
    return setMessage("Voor dit e-mailadres staat nog geen actieve projectomgeving klaar. Neem contact op met ons team.");
  }

  availableMemberships = memberships;
const selectedProjectId = queryParams.get("project");

if (memberships.length > 1 && !selectedProjectId) {
  showProjectPicker(memberships);
  return;
}

const membership =
  memberships.find((item) => item.project_id === selectedProjectId) ||
  memberships[0];
  const [dashboardResult, proposalsResult] = await Promise.all([
    supabase.from("project_dashboards").select("content, updated_at").eq("project_id", membership.project_id).single(),
    supabase.from("more_work_proposals").select("id, code, title, amount, proposal_date, document_url, note, status, revision").eq("project_id", membership.project_id).order("created_at", { ascending: false }),
  ]);

  if (dashboardResult.error) {
    setAuthMode("login");
    showView("auth");
    return setMessage("De projectomgeving kon niet worden geladen. Probeer het later opnieuw.");
  }

  const proposals = proposalsResult.data || [];
  let responses = [];
  if (proposals.length) {
    const ids = proposals.map((item) => item.id);
    const result = await supabase.from("approval_responses").select("proposal_id, user_id, decision, comment, created_at").in("proposal_id", ids);
    responses = result.data || [];
  }

  renderDashboard(membership, dashboardResult.data, proposals, responses);
  showView("portal");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function safeUrl(value) {
  try {
    const url = new URL(String(value));
    return ["https:", "mailto:", "tel:"].includes(url.protocol) ? escapeHtml(url.href) : "#";
  } catch { return "#"; }
}

$("login-form").addEventListener("submit", handleLogin);
$("activate-form").addEventListener("submit", handleActivate);
$("reset-form").addEventListener("submit", handleReset);
$("forgot-button").addEventListener("click", handleForgot);
$("activate-button").addEventListener("click", () => setAuthMode("activate"));
$("back-button").addEventListener("click", () => setAuthMode("login"));
$("signout-button").addEventListener("click", async () => {
  if (DEMO_MODE) {
    window.location.href = window.location.pathname;
    return;
  }
  await supabase.auth.signOut();
  setAuthMode("login");
  showView("auth");
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    setAuthMode("reset");
    showView("auth");
  } else if (event === "SIGNED_IN" && session?.user) {
    setTimeout(() => { void openPortal(); }, 0);
  }
});

const { data: sessionResult } = DEMO_MODE ? { data: { session: null } } : await supabase.auth.getSession();
if (DEMO_MODE) {
  openPortalDemo();
} else if (queryParams.has("reset")) {
  setAuthMode("reset");
  showView("auth");
} else if (sessionResult.session) {
  await openPortal();
} else {
  setAuthMode("login");
  showView("auth");
}
