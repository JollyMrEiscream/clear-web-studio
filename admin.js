(function () {
  "use strict";

  /*
   * Clear Web Studio Admin Dashboard
   *
   * Data lives in localStorage under CONFIG.storageKey and can sync to a
   * GitHub Contents API JSON file when a personal token is stored locally
   * under CONFIG.githubTokenKey. The token is intentionally never written to
   * the synced JSON payload. Every local save stamps state.updatedAt, persists
   * immediately, and schedules a debounced GitHub PUT.
   *
   * Synced state shape:
   * {
   *   projects: [],
   *   payments: [],
   *   hosting: [],
   *   prospects: [],
   *   settings: { paypalMeUsername: "", googlePlacesApiKey: "" },
   *   updatedAt: null
   * }
   */

  const CONFIG = {
    maintenancePrice: 75,
    depositAmount: 250,
    finalAmount: 250,
    renewalWarnDays: 30,
    storageKey: "cws-admin-data-v3",
    githubTokenKey: "cws-admin-github-token",
    businessName: "Clear Web Studio",
    businessEmail: "levi@srqcoding.club",
    businessPhone: "(941) 278-1096",
    paypalMeUsername: "",
    github: {
      owner: "JollyMrEiscream",
      repo: "clear-web-studio-admin",
      path: "admin-data.json",
      branch: "main",
    },
  };

  const STATUSES = [
    "Lead",
    "Deposit Paid",
    "In Progress",
    "Ready for Review",
    "Launched",
    "On Maintenance",
  ];

  const PROSPECT_STATUSES = [
    "New",
    "Contacted",
    "Interested",
    "Converted",
    "Passed",
  ];

  const OPPORTUNITIES = ["High", "Medium", "Low"];

  const PROSPECT_AREAS = [
    { name: "Sarasota", lat: 27.3364, lng: -82.5307, radius: 12000 },
    { name: "Siesta Key", lat: 27.2676, lng: -82.5453, radius: 8000 },
    { name: "Lakewood Ranch", lat: 27.3864, lng: -82.4143, radius: 9000 },
    { name: "Bradenton", lat: 27.4989, lng: -82.5748, radius: 12000 },
    { name: "Venice", lat: 27.0998, lng: -82.4543, radius: 11000 },
    { name: "Osprey/Nokomis", lat: 27.1764, lng: -82.4754, radius: 9000 },
    { name: "Palmetto", lat: 27.5214, lng: -82.5723, radius: 9000 },
    { name: "Englewood", lat: 26.962, lng: -82.3526, radius: 10000 },
    { name: "Sarasota metro", lat: 27.3364, lng: -82.5307, radius: 30000 },
  ];

  const PROSPECT_CATEGORIES = [
    "Landscaping/lawn care",
    "HVAC/AC repair",
    "Plumbing",
    "Electrician",
    "Roofing",
    "Cleaning",
    "Pressure washing",
    "Pest control",
    "Auto repair",
    "Auto detailing",
    "Pool service",
    "Tree service",
    "Handyman",
    "Painting",
    "Flooring",
    "Home remodeling",
    "Moving company",
    "Junk removal",
    "Fencing",
    "Garage door repair",
    "Irrigation",
    "Window cleaning",
    "Mobile pet grooming",
    "Med spa",
    "Chiropractor",
    "Dentist",
    "Restaurant",
    "Bakery",
    "Fitness studio",
    "Real estate agent",
    "Insurance agency",
    "Bookkeeping",
    "Law office",
    "Photography",
  ];

  const OUTDATED_SITE_PATTERNS = [
    "wixsite.com",
    "wix.com",
    "weebly.com",
    "godaddysites.com",
    "sites.google.com",
    "square.site",
    "squarespace.com",
    "wordpress.com",
    "blogspot.com",
    "webs.com",
    "yolasite.com",
    "jimdosite.com",
    "business.site",
    "facebook.com",
    "linktr.ee",
    "msha.ke",
    "beacons.ai",
  ];

  const stateTemplate = {
    projects: [],
    payments: [],
    hosting: [],
    prospects: [],
    settings: { paypalMeUsername: "", googlePlacesApiKey: "" },
    updatedAt: null,
  };

  let state = loadLocalState();
  let githubSha = null;
  let githubPushTimer = null;
  let lastProspectResults = [];
  let isHydrating = false;

  function $(id) {
    return document.getElementById(id);
  }

  function $all(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setText(id, value) {
    const el = $(id);
    if (el) el.textContent = value == null ? "" : String(value);
  }

  function setValue(id, value) {
    const el = $(id);
    if (el) el.value = value == null ? "" : String(value);
  }

  function getValue(id) {
    const el = $(id);
    return el ? el.value.trim() : "";
  }

  function getChecked(id) {
    const el = $(id);
    return !!(el && el.checked);
  }

  function setChecked(id, value) {
    const el = $(id);
    if (el) el.checked = !!value;
  }

  function uid(prefix) {
    return (
      String(prefix || "id") +
      "-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 9)
    );
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function parseDate(value) {
    if (!value) return null;
    const parts = String(value).slice(0, 10).split("-");
    if (parts.length !== 3) return null;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    const day = Number(parts[2]);
    const date = new Date(year, month, day);
    if (Number.isNaN(date.getTime())) return null;
    return date;
  }

  function formatDate(value) {
    const date = parseDate(value);
    if (!date) return "";
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function isSameMonth(value, compare) {
    const a = parseDate(value);
    const b = compare || new Date();
    if (!a || !b) return false;
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  function daysUntil(value) {
    const date = parseDate(value);
    if (!date) return null;
    const today = parseDate(todayISO());
    if (!today) return null;
    return Math.ceil((date.getTime() - today.getTime()) / 86400000);
  }

  function currency(value) {
    const amount = Number(value || 0);
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: amount % 1 ? 2 : 0,
    });
  }

  function normalizeState(input) {
    const source = input && typeof input === "object" ? input : {};
    return {
      projects: Array.isArray(source.projects) ? source.projects : [],
      payments: Array.isArray(source.payments) ? source.payments : [],
      hosting: Array.isArray(source.hosting) ? source.hosting : [],
      prospects: Array.isArray(source.prospects) ? source.prospects : [],
      settings: Object.assign({}, stateTemplate.settings, source.settings || {}),
      updatedAt: source.updatedAt || null,
    };
  }

  function loadLocalState() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return normalizeState(stateTemplate);
      return normalizeState(JSON.parse(raw));
    } catch (error) {
      console.warn("Unable to load local admin data", error);
      return normalizeState(stateTemplate);
    }
  }

  function persistLocalState() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
  }

  function isEssentiallyEmpty(data) {
    const candidate = normalizeState(data);
    return (
      candidate.projects.length === 0 &&
      candidate.payments.length === 0 &&
      candidate.hosting.length === 0 &&
      candidate.prospects.length === 0
    );
  }

  function getTimestamp(value) {
    if (!value) return 0;
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  }

  function saveState(options) {
    const opts = Object.assign({ sync: true, render: false }, options || {});
    state.updatedAt = new Date().toISOString();
    persistLocalState();
    if (opts.render) refreshAll();
    if (opts.sync && !isHydrating) scheduleGithubPush();
  }

  function storageMessage() {
    return "Data saved locally and synced to GitHub when connected.";
  }

  function getGithubToken() {
    try {
      return localStorage.getItem(CONFIG.githubTokenKey) || "";
    } catch (error) {
      return "";
    }
  }

  function setGithubToken(token) {
    const clean = String(token || "").trim();
    if (clean) {
      localStorage.setItem(CONFIG.githubTokenKey, clean);
    } else {
      localStorage.removeItem(CONFIG.githubTokenKey);
      githubSha = null;
    }
    renderSyncSettings();
  }

  function githubUrl() {
    const gh = CONFIG.github;
    return (
      "https://api.github.com/repos/" +
      encodeURIComponent(gh.owner) +
      "/" +
      encodeURIComponent(gh.repo) +
      "/contents/" +
      gh.path.split("/").map(encodeURIComponent).join("/")
    );
  }

  function githubHeaders(token) {
    return {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  function decodeBase64Utf8(base64) {
    const clean = String(base64 || "").replace(/\s/g, "");
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder("utf-8").decode(bytes);
  }

  function encodeBase64Utf8(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.prototype.slice.call(chunk));
    }
    return btoa(binary);
  }

  function remoteSafeState() {
    return normalizeState({
      projects: state.projects,
      payments: state.payments,
      hosting: state.hosting,
      prospects: state.prospects,
      settings: {
        paypalMeUsername: state.settings.paypalMeUsername || "",
        googlePlacesApiKey: state.settings.googlePlacesApiKey || "",
      },
      updatedAt: state.updatedAt,
    });
  }

  function setSyncStatus(text, className) {
    const el = $("sync-status");
    if (!el) return;
    el.textContent = text;
    el.className = className ? String(className) : "";
  }

  function syncStatusConnected() {
    setSyncStatus("Synced (" + new Date().toLocaleTimeString() + ")", "badge-ok");
  }

  function getErrorMessage(error) {
    if (!error) return "Unknown error";
    return error.message || String(error);
  }

  async function pullFromGitHub() {
    const token = getGithubToken();
    if (!token) {
      setSyncStatus("Not connected", "");
      return null;
    }
    setSyncStatus("Syncing…", "badge-warn");
    const response = await fetch(githubUrl() + "?ref=" + encodeURIComponent(CONFIG.github.branch), {
      method: "GET",
      headers: githubHeaders(token),
    });
    if (response.status === 404) {
      githubSha = null;
      return null;
    }
    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = await response.json();
        detail = body.message || detail;
      } catch (error) {
        /* ignored */
      }
      throw new Error(detail || "Unable to pull GitHub data");
    }
    const payload = await response.json();
    githubSha = payload.sha || null;
    const json = decodeBase64Utf8(payload.content || "");
    return normalizeState(JSON.parse(json));
  }

  async function pushToGitHub(retryConflict) {
    const token = getGithubToken();
    if (!token) {
      setSyncStatus("Not connected", "");
      return false;
    }
    setSyncStatus("Syncing…", "badge-warn");
    const body = {
      message: "Update admin dashboard data",
      content: encodeBase64Utf8(JSON.stringify(remoteSafeState(), null, 2) + "\n"),
      branch: CONFIG.github.branch,
    };
    if (githubSha) body.sha = githubSha;
    const response = await fetch(githubUrl(), {
      method: "PUT",
      headers: Object.assign({ "Content-Type": "application/json" }, githubHeaders(token)),
      body: JSON.stringify(body),
    });
    if (response.ok) {
      const payload = await response.json();
      githubSha = payload.content && payload.content.sha ? payload.content.sha : githubSha;
      syncStatusConnected();
      return true;
    }
    if (response.status === 409 && retryConflict !== false) {
      await pullFromGitHub();
      return pushToGitHub(false);
    }
    if (response.status === 404 && body.sha) {
      githubSha = null;
      return pushToGitHub(false);
    }
    let detail = response.statusText;
    try {
      const errorBody = await response.json();
      detail = errorBody.message || detail;
    } catch (error) {
      /* ignored */
    }
    throw new Error(detail || "Unable to push GitHub data");
  }

  function scheduleGithubPush() {
    if (!getGithubToken()) {
      setSyncStatus("Not connected", "");
      return;
    }
    window.clearTimeout(githubPushTimer);
    setSyncStatus("Syncing…", "badge-warn");
    githubPushTimer = window.setTimeout(function () {
      pushToGitHub().catch(function (error) {
        setSyncStatus("Error: " + getErrorMessage(error), "badge-danger");
        console.error("GitHub sync failed", error);
      });
    }, 1500);
  }

  async function hydrateFromGitHub() {
    if (!getGithubToken()) {
      renderSyncSettings();
      setSyncStatus("Not connected", "");
      return;
    }
    isHydrating = true;
    try {
      const localBefore = normalizeState(state);
      const remote = await pullFromGitHub();
      const localEmpty = isEssentiallyEmpty(localBefore);
      if (remote && (getTimestamp(remote.updatedAt) > getTimestamp(localBefore.updatedAt) || localEmpty)) {
        state = normalizeState(remote);
        persistLocalState();
      } else if (!remote || getTimestamp(localBefore.updatedAt) >= getTimestamp(remote.updatedAt)) {
        state = localBefore;
        persistLocalState();
        await pushToGitHub();
      }
      syncStatusConnected();
    } catch (error) {
      setSyncStatus("Error: " + getErrorMessage(error), "badge-danger");
      console.error("Unable to hydrate GitHub data", error);
    } finally {
      isHydrating = false;
      renderSyncSettings();
    }
  }

  function renderSyncSettings() {
    const tokenInput = $("settings-github-token");
    if (tokenInput) tokenInput.value = getGithubToken();
    if (!getGithubToken()) setSyncStatus("Not connected", "");
  }

  function saveSyncSettings(event) {
    if (event) event.preventDefault();
    setGithubToken(getValue("settings-github-token"));
    if (getGithubToken()) {
      hydrateFromGitHub().then(refreshAll);
    } else {
      setSyncStatus("Not connected", "");
    }
  }

  function syncNow() {
    window.clearTimeout(githubPushTimer);
    saveState({ sync: false });
    pushToGitHub()
      .then(function () {
        alert(storageMessage());
      })
      .catch(function (error) {
        setSyncStatus("Error: " + getErrorMessage(error), "badge-danger");
        alert("GitHub sync failed: " + getErrorMessage(error));
      });
  }

  function statusBadge(status) {
    const value = status || "Lead";
    const key = value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const map = {
      lead: "badge-lead",
      "deposit-paid": "badge-deposit",
      "in-progress": "badge-progress",
      "ready-for-review": "badge-review",
      launched: "badge-launched",
      "on-maintenance": "badge-maintenance",
      contacted: "badge-contacted",
      interested: "badge-interested",
      converted: "badge-converted",
      passed: "badge-passed",
      new: "badge-lead",
    };
    return '<span class="' + (map[key] || "badge-lead") + '">' + escapeHtml(value) + "</span>";
  }

  function dueBadge(dateValue) {
    const days = daysUntil(dateValue);
    if (days == null) return "";
    if (days < 0) return '<span class="badge-danger">Overdue</span>';
    if (days <= CONFIG.renewalWarnDays) return '<span class="badge-warn">' + days + " days</span>";
    return '<span class="badge-ok">' + days + " days</span>";
  }

  function fillSelect(id, values, options) {
    const el = $(id);
    if (!el) return;
    const opts = Object.assign({ blank: false, valueKey: null, labelKey: null }, options || {});
    const current = el.value;
    let html = opts.blank ? '<option value="">All</option>' : "";
    values.forEach(function (item) {
      const value = opts.valueKey ? item[opts.valueKey] : item;
      const label = opts.labelKey ? item[opts.labelKey] : item;
      html += '<option value="' + escapeHtml(value) + '">' + escapeHtml(label) + "</option>";
    });
    el.innerHTML = html;
    if (current) el.value = current;
  }

  function fillStatusSelects() {
    [
      "project-status",
      "project-status-filter",
    ].forEach(function (id) {
      fillSelect(id, STATUSES, { blank: id.indexOf("filter") !== -1 });
    });
    [
      "prospect-status-filter",
      "prospect-status-input",
    ].forEach(function (id) {
      fillSelect(id, PROSPECT_STATUSES, { blank: id.indexOf("filter") !== -1 });
    });
    fillSelect("prospect-opportunity-filter", OPPORTUNITIES, { blank: true });
    fillSelect("prospect-opportunity-input", OPPORTUNITIES);
  }

  function fillProspectSelects() {
    fillSelect("prospect-category", PROSPECT_CATEGORIES, { blank: false });
    fillSelect("prospect-area", PROSPECT_AREAS, {
      blank: false,
      valueKey: "name",
      labelKey: "name",
    });
    const websiteFilter = $("prospect-website-filter");
    if (websiteFilter && websiteFilter.options.length === 0) {
      websiteFilter.innerHTML =
        '<option value="">All websites</option>' +
        '<option value="no-website">No website</option>' +
        '<option value="outdated">No website or outdated</option>';
    }
  }

  function projectLabel(project) {
    if (!project) return "Unknown client";
    return project.clientName || project.businessName || project.domain || "Untitled project";
  }

  function findProject(id) {
    return state.projects.find(function (project) {
      return project.id === id;
    });
  }

  function findPayment(id) {
    return state.payments.find(function (payment) {
      return payment.id === id;
    });
  }

  function findHosting(id) {
    return state.hosting.find(function (hosting) {
      return hosting.id === id;
    });
  }

  function findProspect(id) {
    return state.prospects.find(function (prospect) {
      return prospect.id === id;
    });
  }

  function projectOptions(selectedId) {
    let html = '<option value="">Select client</option>';
    state.projects
      .slice()
      .sort(function (a, b) {
        return projectLabel(a).localeCompare(projectLabel(b));
      })
      .forEach(function (project) {
        html +=
          '<option value="' +
          escapeHtml(project.id) +
          '"' +
          (project.id === selectedId ? " selected" : "") +
          ">" +
          escapeHtml(projectLabel(project)) +
          "</option>";
      });
    return html;
  }

  function openModal(id) {
    const modal = $(id);
    if (!modal) return;
    modal.removeAttribute("hidden");
    modal.classList.add("is-open");
    const focusable = modal.querySelector("input, select, textarea, button");
    if (focusable) focusable.focus();
  }

  function closeModal(target) {
    const modal =
      typeof target === "string"
        ? $(target)
        : target && target.closest
          ? target.closest("[id$='-modal'], .modal")
          : null;
    if (!modal) return;
    modal.setAttribute("hidden", "hidden");
    modal.classList.remove("is-open");
  }

  function closeAllModals() {
    $all("[id$='-modal'], .modal").forEach(function (modal) {
      modal.setAttribute("hidden", "hidden");
      modal.classList.remove("is-open");
    });
  }

  function formToProject() {
    return {
      id: getValue("project-id") || uid("project"),
      clientName: getValue("project-clientName"),
      businessName: getValue("project-businessName"),
      clientEmail: getValue("project-clientEmail"),
      status: getValue("project-status") || "Lead",
      domain: getValue("project-domain"),
      siteGround: getValue("project-siteGround"),
      depositPaid: getChecked("project-depositPaid"),
      depositDate: getValue("project-depositDate"),
      finalDue: getValue("project-finalDue"),
      finalPaid: getChecked("project-finalPaid"),
      finalPaidDate: getValue("project-finalPaidDate"),
      maintenance: getChecked("project-maintenance"),
      maintenanceStart: getValue("project-maintenanceStart"),
      nextMaintenance: getValue("project-nextMaintenance"),
      notes: getValue("project-notes"),
    };
  }

  function openProjectModal(project) {
    const item = project || {};
    setText("project-modal-title", project ? "Edit Project" : "Add Project");
    setValue("project-id", item.id || "");
    setValue("project-clientName", item.clientName || "");
    setValue("project-businessName", item.businessName || "");
    setValue("project-clientEmail", item.clientEmail || "");
    setValue("project-status", item.status || "Lead");
    setValue("project-domain", item.domain || "");
    setValue("project-siteGround", item.siteGround || "");
    setChecked("project-depositPaid", item.depositPaid);
    setValue("project-depositDate", item.depositDate || "");
    setValue("project-finalDue", item.finalDue || "");
    setChecked("project-finalPaid", item.finalPaid);
    setValue("project-finalPaidDate", item.finalPaidDate || "");
    setChecked("project-maintenance", item.maintenance);
    setValue("project-maintenanceStart", item.maintenanceStart || "");
    setValue("project-nextMaintenance", item.nextMaintenance || "");
    setValue("project-notes", item.notes || "");
    openModal("project-modal");
  }

  function saveProject(event) {
    if (event) event.preventDefault();
    const project = formToProject();
    if (!project.clientName && !project.businessName) {
      alert("Please enter a client or business name.");
      return;
    }
    const index = state.projects.findIndex(function (item) {
      return item.id === project.id;
    });
    if (index >= 0) state.projects[index] = project;
    else state.projects.push(project);
    saveState({ render: true });
    closeModal("project-modal");
    alert(storageMessage());
  }

  function deleteProject(id) {
    const project = findProject(id);
    if (!project || !confirm("Delete " + projectLabel(project) + "?")) return;
    state.projects = state.projects.filter(function (item) {
      return item.id !== id;
    });
    state.payments = state.payments.filter(function (item) {
      return item.clientId !== id;
    });
    state.hosting = state.hosting.filter(function (item) {
      return item.clientId !== id;
    });
    saveState({ render: true });
  }

  function toggleProjectPayment(id, field) {
    const project = findProject(id);
    if (!project) return;
    if (field === "deposit") {
      project.depositPaid = !project.depositPaid;
      project.depositDate = project.depositPaid ? project.depositDate || todayISO() : "";
      if (project.depositPaid && project.status === "Lead") project.status = "Deposit Paid";
    }
    if (field === "final") {
      project.finalPaid = !project.finalPaid;
      project.finalPaidDate = project.finalPaid ? project.finalPaidDate || todayISO() : "";
      if (project.finalPaid && project.status !== "On Maintenance") project.status = "Launched";
    }
    saveState({ render: true });
  }

  function renderOverviewStats() {
    const activeClients = state.projects.filter(function (project) {
      return project.status !== "Lead";
    }).length;
    const inProgress = state.projects.filter(function (project) {
      return ["Deposit Paid", "In Progress", "Ready for Review"].indexOf(project.status) !== -1;
    }).length;
    const launched = state.projects.filter(function (project) {
      return project.status === "Launched" || project.status === "On Maintenance";
    }).length;
    const openProspects = state.prospects.filter(function (prospect) {
      return ["Converted", "Passed"].indexOf(prospect.status) === -1;
    }).length;
    const revenueThisMonth = state.payments.reduce(function (sum, payment) {
      return payment.paid && isSameMonth(payment.datePaid) ? sum + Number(payment.amount || 0) : sum;
    }, 0);
    const expectedThisMonth = state.payments.reduce(function (sum, payment) {
      return !payment.paid && isSameMonth(payment.dueDate) ? sum + Number(payment.amount || 0) : sum;
    }, 0);
    const monthlyRecurring =
      state.projects.filter(function (project) {
        return project.maintenance;
      }).length * CONFIG.maintenancePrice;
    const renewals = state.hosting.filter(function (item) {
      const hostingRenewal = daysUntil(item.renewal);
      const domainRenewal = daysUntil(item.domainRenewal);
      return (
        (hostingRenewal != null && hostingRenewal >= 0 && hostingRenewal <= CONFIG.renewalWarnDays) ||
        (domainRenewal != null && domainRenewal >= 0 && domainRenewal <= CONFIG.renewalWarnDays)
      );
    }).length;
    const stats = [
      ["Active clients", activeClients],
      ["In progress", inProgress],
      ["Launched", launched],
      ["Open prospects", openProspects],
      ["Revenue this month", currency(revenueThisMonth)],
      ["Expected this month", currency(expectedThisMonth)],
      ["Monthly recurring", currency(monthlyRecurring)],
      ["Renewals in 30 days", renewals],
    ];
    renderStats("overview-stats", stats);
  }

  function renderStats(id, stats) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = stats
      .map(function (item) {
        return (
          '<div class="stat-card"><strong>' +
          escapeHtml(item[1]) +
          '</strong><span>' +
          escapeHtml(item[0]) +
          "</span></div>"
        );
      })
      .join("");
  }

  function filteredProjects() {
    const query = getValue("project-search").toLowerCase();
    const status = getValue("project-status-filter");
    return state.projects.filter(function (project) {
      const text = [
        project.clientName,
        project.businessName,
        project.clientEmail,
        project.domain,
        project.notes,
      ]
        .join(" ")
        .toLowerCase();
      return (!query || text.indexOf(query) !== -1) && (!status || project.status === status);
    });
  }

  function renderProjects() {
    const tbody = $("projects-tbody");
    if (!tbody) return;
    const rows = filteredProjects();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="9">No projects yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (project) {
        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(projectLabel(project)) +
          "</strong><br><small>" +
          escapeHtml(project.clientEmail || "") +
          "</small></td>" +
          "<td>" +
          statusBadge(project.status) +
          "</td>" +
          "<td>" +
          escapeHtml(project.domain || "") +
          "</td>" +
          "<td>" +
          (project.depositPaid ? statusBadge("Deposit Paid") : '<span class="badge-warn">Due</span>') +
          "<br><small>" +
          escapeHtml(formatDate(project.depositDate)) +
          "</small></td>" +
          "<td>" +
          (project.finalPaid ? '<span class="badge-ok">Paid</span>' : '<span class="badge-warn">Due</span>') +
          "<br><small>" +
          escapeHtml(formatDate(project.finalPaidDate || project.finalDue)) +
          "</small></td>" +
          "<td>" +
          (project.maintenance ? '<span class="badge-maintenance">Yes</span>' : "No") +
          "</td>" +
          "<td>" +
          escapeHtml(formatDate(project.nextMaintenance)) +
          "</td>" +
          '<td class="actions">' +
          '<button type="button" data-action="edit-project" data-id="' +
          escapeHtml(project.id) +
          '">Edit</button> ' +
          '<button type="button" data-action="toggle-deposit" data-id="' +
          escapeHtml(project.id) +
          '">' +
          (project.depositPaid ? "Undo deposit" : "Deposit paid") +
          "</button> " +
          '<button type="button" data-action="toggle-final" data-id="' +
          escapeHtml(project.id) +
          '">' +
          (project.finalPaid ? "Undo final" : "Final paid") +
          "</button> " +
          '<button type="button" data-action="delete-project" data-id="' +
          escapeHtml(project.id) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function formToPayment() {
    return {
      id: getValue("payment-id") || uid("payment"),
      clientId: getValue("payment-clientId"),
      type: getValue("payment-type") || "Project",
      amount: Number(getValue("payment-amount") || 0),
      dueDate: getValue("payment-dueDate"),
      paid: getChecked("payment-paid"),
      datePaid: getValue("payment-datePaid"),
      notes: getValue("payment-notes"),
    };
  }

  function openPaymentModal(payment) {
    const item = payment || {};
    setText("payment-modal-title", payment ? "Edit Payment" : "Add Payment");
    setValue("payment-id", item.id || "");
    const clientSelect = $("payment-clientId");
    if (clientSelect) clientSelect.innerHTML = projectOptions(item.clientId || "");
    setValue("payment-type", item.type || "Project");
    setValue("payment-amount", item.amount || "");
    setValue("payment-dueDate", item.dueDate || todayISO());
    setChecked("payment-paid", item.paid);
    setValue("payment-datePaid", item.datePaid || "");
    setValue("payment-notes", item.notes || "");
    openModal("payment-modal");
  }

  function savePayment(event) {
    if (event) event.preventDefault();
    const payment = formToPayment();
    if (!payment.clientId) {
      alert("Please choose a client.");
      return;
    }
    if (!payment.amount) {
      alert("Please enter an amount.");
      return;
    }
    if (payment.paid && !payment.datePaid) payment.datePaid = todayISO();
    const index = state.payments.findIndex(function (item) {
      return item.id === payment.id;
    });
    if (index >= 0) state.payments[index] = payment;
    else state.payments.push(payment);
    saveState({ render: true });
    closeModal("payment-modal");
    alert(storageMessage());
  }

  function togglePayment(id) {
    const payment = findPayment(id);
    if (!payment) return;
    payment.paid = !payment.paid;
    payment.datePaid = payment.paid ? payment.datePaid || todayISO() : "";
    saveState({ render: true });
  }

  function deletePayment(id) {
    const payment = findPayment(id);
    if (!payment || !confirm("Delete this payment?")) return;
    state.payments = state.payments.filter(function (item) {
      return item.id !== id;
    });
    saveState({ render: true });
  }

  function renderPaymentStats() {
    const outstanding = state.payments.reduce(function (sum, payment) {
      return payment.paid ? sum : sum + Number(payment.amount || 0);
    }, 0);
    const paidThisMonth = state.payments.reduce(function (sum, payment) {
      return payment.paid && isSameMonth(payment.datePaid) ? sum + Number(payment.amount || 0) : sum;
    }, 0);
    const overdue = state.payments.filter(function (payment) {
      return !payment.paid && daysUntil(payment.dueDate) != null && daysUntil(payment.dueDate) < 0;
    }).length;
    renderStats("payment-stats", [
      ["Outstanding", currency(outstanding)],
      ["Paid this month", currency(paidThisMonth)],
      ["Overdue invoices", overdue],
      ["Total payments", state.payments.length],
    ]);
  }

  function renderPayments() {
    const tbody = $("payments-tbody");
    if (!tbody) return;
    if (!state.payments.length) {
      tbody.innerHTML = '<tr><td colspan="7">No payments yet.</td></tr>';
      return;
    }
    const rows = state.payments.slice().sort(function (a, b) {
      return String(a.dueDate || "").localeCompare(String(b.dueDate || ""));
    });
    tbody.innerHTML = rows
      .map(function (payment) {
        const project = findProject(payment.clientId);
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(projectLabel(project)) +
          "</td>" +
          "<td>" +
          escapeHtml(payment.type || "") +
          "</td>" +
          "<td>" +
          escapeHtml(currency(payment.amount)) +
          "</td>" +
          "<td>" +
          escapeHtml(formatDate(payment.dueDate)) +
          " " +
          (!payment.paid ? dueBadge(payment.dueDate) : "") +
          "</td>" +
          "<td>" +
          (payment.paid ? '<span class="badge-ok">Paid</span>' : '<span class="badge-warn">Open</span>') +
          "<br><small>" +
          escapeHtml(formatDate(payment.datePaid)) +
          "</small></td>" +
          "<td>" +
          escapeHtml(payment.notes || "") +
          "</td>" +
          '<td class="actions">' +
          '<button type="button" data-action="toggle-payment" data-id="' +
          escapeHtml(payment.id) +
          '">' +
          (payment.paid ? "Mark open" : "Mark paid") +
          "</button> " +
          '<button type="button" data-action="invoice-payment" data-id="' +
          escapeHtml(payment.id) +
          '">Email invoice</button> ' +
          '<button type="button" data-action="edit-payment" data-id="' +
          escapeHtml(payment.id) +
          '">Edit</button> ' +
          '<button type="button" data-action="delete-payment" data-id="' +
          escapeHtml(payment.id) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function formToHosting() {
    return {
      id: getValue("hosting-id") || uid("hosting"),
      clientId: getValue("hosting-clientId"),
      domain: getValue("hosting-domain"),
      provider: getValue("hosting-provider"),
      plan: getValue("hosting-plan"),
      renewal: getValue("hosting-renewal"),
      registrar: getValue("hosting-registrar"),
      domainRenewal: getValue("hosting-domainRenewal"),
      autoRenew: getChecked("hosting-autoRenew"),
      notes: getValue("hosting-notes"),
    };
  }

  function openHostingModal(hosting) {
    const item = hosting || {};
    setText("hosting-modal-title", hosting ? "Edit Hosting" : "Add Hosting");
    setValue("hosting-id", item.id || "");
    const clientSelect = $("hosting-clientId");
    if (clientSelect) clientSelect.innerHTML = projectOptions(item.clientId || "");
    setValue("hosting-domain", item.domain || "");
    setValue("hosting-provider", item.provider || "SiteGround");
    setValue("hosting-plan", item.plan || "");
    setValue("hosting-renewal", item.renewal || "");
    setValue("hosting-registrar", item.registrar || "");
    setValue("hosting-domainRenewal", item.domainRenewal || "");
    setChecked("hosting-autoRenew", item.autoRenew);
    setValue("hosting-notes", item.notes || "");
    openModal("hosting-modal");
  }

  function saveHosting(event) {
    if (event) event.preventDefault();
    const hosting = formToHosting();
    if (!hosting.clientId && !hosting.domain) {
      alert("Please enter a client or domain.");
      return;
    }
    const index = state.hosting.findIndex(function (item) {
      return item.id === hosting.id;
    });
    if (index >= 0) state.hosting[index] = hosting;
    else state.hosting.push(hosting);
    saveState({ render: true });
    closeModal("hosting-modal");
    alert(storageMessage());
  }

  function deleteHosting(id) {
    const hosting = findHosting(id);
    if (!hosting || !confirm("Delete this hosting record?")) return;
    state.hosting = state.hosting.filter(function (item) {
      return item.id !== id;
    });
    saveState({ render: true });
  }

  function renderHostingStats() {
    const renewals = state.hosting.filter(function (item) {
      const h = daysUntil(item.renewal);
      const d = daysUntil(item.domainRenewal);
      return (
        (h != null && h >= 0 && h <= CONFIG.renewalWarnDays) ||
        (d != null && d >= 0 && d <= CONFIG.renewalWarnDays)
      );
    }).length;
    const overdue = state.hosting.filter(function (item) {
      const h = daysUntil(item.renewal);
      const d = daysUntil(item.domainRenewal);
      return (h != null && h < 0) || (d != null && d < 0);
    }).length;
    const autoRenew = state.hosting.filter(function (item) {
      return item.autoRenew;
    }).length;
    renderStats("hosting-stats", [
      ["Hosting records", state.hosting.length],
      ["Renewals soon", renewals],
      ["Overdue renewals", overdue],
      ["Auto-renew", autoRenew],
    ]);
  }

  function renderHosting() {
    const tbody = $("hosting-tbody");
    if (!tbody) return;
    if (!state.hosting.length) {
      tbody.innerHTML = '<tr><td colspan="8">No hosting records yet.</td></tr>';
      return;
    }
    tbody.innerHTML = state.hosting
      .slice()
      .sort(function (a, b) {
        return String(a.domain || "").localeCompare(String(b.domain || ""));
      })
      .map(function (hosting) {
        const project = findProject(hosting.clientId);
        return (
          "<tr>" +
          "<td>" +
          escapeHtml(projectLabel(project)) +
          "</td>" +
          "<td>" +
          escapeHtml(hosting.domain || "") +
          "</td>" +
          "<td>" +
          escapeHtml(hosting.provider || "") +
          "</td>" +
          "<td>" +
          escapeHtml(hosting.plan || "") +
          "</td>" +
          "<td>" +
          escapeHtml(formatDate(hosting.renewal)) +
          " " +
          dueBadge(hosting.renewal) +
          "</td>" +
          "<td>" +
          escapeHtml(hosting.registrar || "") +
          "<br><small>" +
          escapeHtml(formatDate(hosting.domainRenewal)) +
          " " +
          dueBadge(hosting.domainRenewal) +
          "</small></td>" +
          "<td>" +
          (hosting.autoRenew ? '<span class="badge-ok">Yes</span>' : '<span class="badge-warn">No</span>') +
          "</td>" +
          '<td class="actions">' +
          '<button type="button" data-action="edit-hosting" data-id="' +
          escapeHtml(hosting.id) +
          '">Edit</button> ' +
          '<button type="button" data-action="delete-hosting" data-id="' +
          escapeHtml(hosting.id) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function websiteLooksOutdated(url) {
    if (!url) return false;
    const lower = String(url).toLowerCase();
    return OUTDATED_SITE_PATTERNS.some(function (pattern) {
      return lower.indexOf(pattern) !== -1;
    });
  }

  function normalizeWebsite(url) {
    const value = String(url || "").trim();
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    return "https://" + value;
  }

  function prospectFromPlace(place, category, area) {
    const website = place.websiteUri || "";
    const mapsUrl = place.googleMapsUri || "";
    const phone = place.nationalPhoneNumber || place.internationalPhoneNumber || "";
    return {
      id: uid("prospect"),
      placeId: place.id || place.name || "",
      name: place.displayName && place.displayName.text ? place.displayName.text : place.name || "",
      category: category || "",
      area: area || "",
      phone: phone,
      address: place.formattedAddress || "",
      website: website,
      mapsUrl: mapsUrl,
      status: "New",
      opportunity: !website ? "High" : websiteLooksOutdated(website) ? "Medium" : "Low",
      notes: !website
        ? "No website found from Google Places."
        : websiteLooksOutdated(website)
          ? "Website may be outdated or builder-hosted."
          : "",
      createdAt: new Date().toISOString(),
    };
  }

  function prospectMatchesFilter(prospect, filter) {
    if (filter === "no-website") return !prospect.website;
    if (filter === "outdated") return !prospect.website || websiteLooksOutdated(prospect.website);
    return true;
  }

  function filteredProspects() {
    const query = getValue("prospect-list-search").toLowerCase();
    const status = getValue("prospect-status-filter");
    const opportunity = getValue("prospect-opportunity-filter");
    return state.prospects.filter(function (prospect) {
      const text = [
        prospect.name,
        prospect.category,
        prospect.area,
        prospect.phone,
        prospect.address,
        prospect.website,
        prospect.notes,
      ]
        .join(" ")
        .toLowerCase();
      return (
        (!query || text.indexOf(query) !== -1) &&
        (!status || prospect.status === status) &&
        (!opportunity || prospect.opportunity === opportunity)
      );
    });
  }

  function renderProspectStats() {
    const open = state.prospects.filter(function (prospect) {
      return ["Converted", "Passed"].indexOf(prospect.status) === -1;
    }).length;
    const high = state.prospects.filter(function (prospect) {
      return prospect.opportunity === "High";
    }).length;
    const converted = state.prospects.filter(function (prospect) {
      return prospect.status === "Converted";
    }).length;
    renderStats("prospect-stats", [
      ["Open prospects", open],
      ["High opportunity", high],
      ["Converted", converted],
      ["Saved prospects", state.prospects.length],
    ]);
  }

  function renderProspects() {
    const tbody = $("prospects-tbody");
    if (!tbody) return;
    const rows = filteredProspects();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8">No saved prospects yet.</td></tr>';
      return;
    }
    tbody.innerHTML = rows
      .map(function (prospect) {
        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(prospect.name || "") +
          "</strong><br><small>" +
          escapeHtml(prospect.category || "") +
          "</small></td>" +
          "<td>" +
          escapeHtml(prospect.area || "") +
          "</td>" +
          "<td>" +
          escapeHtml(prospect.phone || "") +
          "</td>" +
          "<td>" +
          escapeHtml(prospect.address || "") +
          "</td>" +
          "<td>" +
          websiteLink(prospect.website) +
          "</td>" +
          "<td>" +
          statusBadge(prospect.status) +
          "</td>" +
          "<td>" +
          escapeHtml(prospect.opportunity || "") +
          "</td>" +
          '<td class="actions">' +
          '<button type="button" data-action="edit-prospect" data-id="' +
          escapeHtml(prospect.id) +
          '">Edit</button> ' +
          '<button type="button" data-action="convert-prospect" data-id="' +
          escapeHtml(prospect.id) +
          '">Convert</button> ' +
          '<button type="button" data-action="delete-prospect" data-id="' +
          escapeHtml(prospect.id) +
          '">Delete</button>' +
          "</td>" +
          "</tr>"
        );
      })
      .join("");
  }

  function websiteLink(url) {
    const href = normalizeWebsite(url);
    if (!href) return '<span class="badge-warn">No website</span>';
    return (
      '<a href="' +
      escapeHtml(href) +
      '" target="_blank" rel="noopener noreferrer">' +
      escapeHtml(url) +
      "</a>" +
      (websiteLooksOutdated(url) ? ' <span class="badge-warn">Outdated?</span>' : "")
    );
  }

  function renderProspectResults() {
    const tbody = $("prospect-results-tbody");
    if (!tbody) return;
    if (!lastProspectResults.length) {
      tbody.innerHTML = '<tr><td colspan="7">Run a search to find prospects. Results sync via GitHub when connected after saving.</td></tr>';
      return;
    }
    tbody.innerHTML = lastProspectResults
      .map(function (prospect) {
        return (
          "<tr>" +
          "<td><strong>" +
          escapeHtml(prospect.name || "") +
          "</strong></td>" +
          "<td>" +
          escapeHtml(prospect.phone || "") +
          "</td>" +
          "<td>" +
          escapeHtml(prospect.address || "") +
          "</td>" +
          "<td>" +
          websiteLink(prospect.website) +
          "</td>" +
          "<td>" +
          escapeHtml(prospect.opportunity || "") +
          "</td>" +
          "<td>" +
          (prospect.mapsUrl
            ? '<a href="' + escapeHtml(prospect.mapsUrl) + '" target="_blank" rel="noopener noreferrer">Maps</a>'
            : "") +
          "</td>" +
          '<td><label><input type="checkbox" data-result-id="' +
          escapeHtml(prospect.id) +
          '" checked> Save</label></td>' +
          "</tr>"
        );
      })
      .join("");
  }

  async function searchProspects(event) {
    if (event) event.preventDefault();
    const apiKey = state.settings.googlePlacesApiKey || "";
    if (!apiKey) {
      alert("Add a Google Places API key in prospect settings first.");
      openModal("prospect-settings-modal");
      return;
    }
    const category = getValue("prospect-category");
    const areaName = getValue("prospect-area");
    const area = PROSPECT_AREAS.find(function (item) {
      return item.name === areaName;
    }) || PROSPECT_AREAS[0];
    const customQuery = getValue("prospect-custom-query");
    const query = customQuery || category + " in " + area.name + " Florida";
    const websiteFilter = getValue("prospect-website-filter");
    setText("prospect-search-status", "Searching Google Places...");
    try {
      const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask":
            "places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.googleMapsUri",
        },
        body: JSON.stringify({
          textQuery: query,
          locationBias: {
            circle: {
              center: { latitude: area.lat, longitude: area.lng },
              radius: area.radius,
            },
          },
        }),
      });
      if (!response.ok) {
        let detail = response.statusText;
        try {
          const errorBody = await response.json();
          detail = errorBody.error && errorBody.error.message ? errorBody.error.message : detail;
        } catch (error) {
          /* ignored */
        }
        throw new Error(detail || "Google Places search failed");
      }
      const payload = await response.json();
      const existingKeys = {};
      state.prospects.forEach(function (prospect) {
        existingKeys[(prospect.placeId || "") + "|" + (prospect.name || "").toLowerCase()] = true;
      });
      lastProspectResults = (payload.places || [])
        .map(function (place) {
          return prospectFromPlace(place, category, area.name);
        })
        .filter(function (prospect) {
          const key = (prospect.placeId || "") + "|" + (prospect.name || "").toLowerCase();
          return !existingKeys[key] && prospectMatchesFilter(prospect, websiteFilter);
        });
      renderProspectResults();
      setText("prospect-search-status", lastProspectResults.length + " matching prospects found.");
    } catch (error) {
      setText("prospect-search-status", "Error: " + getErrorMessage(error));
      console.error("Prospect search failed", error);
    }
  }

  function openProspectMaps() {
    const category = getValue("prospect-category");
    const area = getValue("prospect-area");
    const customQuery = getValue("prospect-custom-query");
    const query = customQuery || category + " in " + area + " Florida";
    const url = "https://www.google.com/maps/search/" + encodeURIComponent(query);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  function saveFilteredProspects() {
    const checked = $all("[data-result-id]:checked").map(function (input) {
      return input.getAttribute("data-result-id");
    });
    const toSave = lastProspectResults.filter(function (prospect) {
      return checked.indexOf(prospect.id) !== -1;
    });
    if (!toSave.length) {
      alert("No prospect results selected.");
      return;
    }
    state.prospects = state.prospects.concat(toSave);
    lastProspectResults = [];
    saveState({ render: true });
    renderProspectResults();
    setText("prospect-search-status", toSave.length + " prospects saved. " + storageMessage());
  }

  function formToProspect() {
    return {
      id: getValue("prospect-id") || uid("prospect"),
      placeId: findProspect(getValue("prospect-id")) ? findProspect(getValue("prospect-id")).placeId || "" : "",
      name: getValue("prospect-name"),
      category: getValue("prospect-category-input"),
      area: getValue("prospect-area-input"),
      phone: getValue("prospect-phone"),
      address: getValue("prospect-address"),
      website: getValue("prospect-website"),
      mapsUrl: getValue("prospect-maps-url"),
      status: getValue("prospect-status-input") || "New",
      opportunity: getValue("prospect-opportunity-input") || "Medium",
      notes: getValue("prospect-notes-input"),
      createdAt: findProspect(getValue("prospect-id")) ? findProspect(getValue("prospect-id")).createdAt : new Date().toISOString(),
    };
  }

  function openProspectModal(prospect) {
    const item = prospect || {};
    setText("prospect-modal-title", prospect ? "Edit Prospect" : "Add Prospect");
    setValue("prospect-id", item.id || "");
    setValue("prospect-name", item.name || "");
    setValue("prospect-category-input", item.category || getValue("prospect-category"));
    setValue("prospect-area-input", item.area || getValue("prospect-area"));
    setValue("prospect-phone", item.phone || "");
    setValue("prospect-address", item.address || "");
    setValue("prospect-website", item.website || "");
    setValue("prospect-maps-url", item.mapsUrl || "");
    setValue("prospect-status-input", item.status || "New");
    setValue("prospect-opportunity-input", item.opportunity || "Medium");
    setValue("prospect-notes-input", item.notes || "");
    openModal("prospect-modal");
  }

  function saveProspect(event) {
    if (event) event.preventDefault();
    const prospect = formToProspect();
    if (!prospect.name) {
      alert("Please enter a prospect name.");
      return;
    }
    const index = state.prospects.findIndex(function (item) {
      return item.id === prospect.id;
    });
    if (index >= 0) state.prospects[index] = prospect;
    else state.prospects.push(prospect);
    saveState({ render: true });
    closeModal("prospect-modal");
    alert(storageMessage());
  }

  function deleteProspect(id) {
    const prospect = findProspect(id);
    if (!prospect || !confirm("Delete " + (prospect.name || "this prospect") + "?")) return;
    state.prospects = state.prospects.filter(function (item) {
      return item.id !== id;
    });
    saveState({ render: true });
  }

  function convertProspect(id) {
    const prospect = findProspect(id);
    if (!prospect) return;
    const project = {
      id: uid("project"),
      clientName: prospect.name || "",
      businessName: prospect.name || "",
      clientEmail: "",
      status: "Lead",
      domain: prospect.website || "",
      siteGround: "",
      depositPaid: false,
      depositDate: "",
      finalDue: "",
      finalPaid: false,
      finalPaidDate: "",
      maintenance: false,
      maintenanceStart: "",
      nextMaintenance: "",
      notes:
        "Converted from prospect.\nPhone: " +
        (prospect.phone || "") +
        "\nAddress: " +
        (prospect.address || "") +
        "\nMaps: " +
        (prospect.mapsUrl || "") +
        (prospect.notes ? "\nNotes: " + prospect.notes : ""),
    };
    state.projects.push(project);
    prospect.status = "Converted";
    saveState({ render: true });
    alert("Prospect converted to a Lead project. " + storageMessage());
  }

  function renderBillingSettings() {
    const username = state.settings.paypalMeUsername || CONFIG.paypalMeUsername || "";
    setValue("settings-paypal-username", username);
    const link = buildPaypalLink(CONFIG.finalAmount);
    const el = $("settings-paypal-link");
    if (el) {
      if (link) {
        el.textContent = link;
        el.setAttribute("href", link);
      } else {
        el.textContent = "Add a PayPal.Me username";
        el.removeAttribute("href");
      }
    }
  }

  function saveBillingSettings(event) {
    if (event) event.preventDefault();
    state.settings.paypalMeUsername = getValue("settings-paypal-username");
    saveState({ render: true });
    alert(storageMessage());
  }

  function buildPaypalLink(amount) {
    const username = (state.settings.paypalMeUsername || CONFIG.paypalMeUsername || "").replace(/^@/, "").trim();
    if (!username) return "";
    const cleanAmount = Number(amount || 0);
    return "https://paypal.me/" + encodeURIComponent(username) + (cleanAmount ? "/" + cleanAmount.toFixed(2) : "");
  }

  function defaultInvoiceSubject(payment) {
    const project = findProject(payment.clientId);
    return CONFIG.businessName + " invoice for " + projectLabel(project);
  }

  function defaultInvoiceBody(payment) {
    const project = findProject(payment.clientId);
    const paypal = buildPaypalLink(payment.amount);
    return [
      "Hi " + (project && project.clientName ? project.clientName : "there") + ",",
      "",
      "Here is your invoice from " + CONFIG.businessName + ".",
      "",
      "Client: " + projectLabel(project),
      "Type: " + (payment.type || "Project"),
      "Amount due: " + currency(payment.amount),
      "Due date: " + (formatDate(payment.dueDate) || payment.dueDate || "Upon receipt"),
      paypal ? "PayPal.Me: " + paypal : "",
      "",
      payment.notes ? "Notes: " + payment.notes : "",
      "",
      "Thank you,",
      CONFIG.businessName,
      CONFIG.businessEmail,
      CONFIG.businessPhone,
    ]
      .filter(function (line, index, lines) {
        return line || lines[index - 1] !== "";
      })
      .join("\n");
  }

  function openInvoiceModal(payment) {
    if (!payment) return;
    const project = findProject(payment.clientId);
    setValue("invoice-payment-id", payment.id);
    setValue("invoice-to", project ? project.clientEmail || "" : "");
    setValue("invoice-subject", defaultInvoiceSubject(payment));
    setValue("invoice-body", defaultInvoiceBody(payment));
    refreshInvoicePreview();
    openModal("invoice-modal");
  }

  function refreshInvoicePreview() {
    const payment = findPayment(getValue("invoice-payment-id"));
    const preview = $("invoice-paypal-preview");
    if (!preview || !payment) return;
    const link = buildPaypalLink(payment.amount);
    if (link) {
      preview.textContent = link;
      preview.setAttribute("href", link);
    } else {
      preview.textContent = "No PayPal.Me username configured.";
      preview.removeAttribute("href");
    }
  }

  function invoiceMailto() {
    const to = getValue("invoice-to");
    const subject = getValue("invoice-subject");
    const body = getValue("invoice-body");
    const url =
      "mailto:" +
      encodeURIComponent(to) +
      "?subject=" +
      encodeURIComponent(subject) +
      "&body=" +
      encodeURIComponent(body);
    window.location.href = url;
  }

  function copyInvoice() {
    const body = getValue("invoice-body");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(body)
        .then(function () {
          alert("Invoice copied.");
        })
        .catch(function () {
          fallbackCopy(body);
        });
    } else {
      fallbackCopy(body);
    }
  }

  function fallbackCopy(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "readonly");
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand("copy");
      alert("Invoice copied.");
    } catch (error) {
      alert("Copy failed. Please copy the invoice text manually.");
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function renderProspectSettings() {
    setValue("settings-places-key", state.settings.googlePlacesApiKey || "");
  }

  function saveProspectSettings(event) {
    if (event) event.preventDefault();
    state.settings.googlePlacesApiKey = getValue("settings-places-key");
    saveState({ render: true });
    closeModal("prospect-settings-modal");
    alert(storageMessage());
  }

  function handleTableClick(event) {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const action = button.getAttribute("data-action");
    const id = button.getAttribute("data-id");
    if (action === "edit-project") openProjectModal(findProject(id));
    if (action === "delete-project") deleteProject(id);
    if (action === "toggle-deposit") toggleProjectPayment(id, "deposit");
    if (action === "toggle-final") toggleProjectPayment(id, "final");
    if (action === "toggle-payment") togglePayment(id);
    if (action === "invoice-payment") openInvoiceModal(findPayment(id));
    if (action === "edit-payment") openPaymentModal(findPayment(id));
    if (action === "delete-payment") deletePayment(id);
    if (action === "edit-hosting") openHostingModal(findHosting(id));
    if (action === "delete-hosting") deleteHosting(id);
    if (action === "edit-prospect") openProspectModal(findProspect(id));
    if (action === "convert-prospect") convertProspect(id);
    if (action === "delete-prospect") deleteProspect(id);
  }

  function on(id, eventName, handler) {
    const el = $(id);
    if (el) el.addEventListener(eventName, handler);
  }

  function initEvents() {
    on("btn-add-project", "click", function () {
      openProjectModal();
    });
    on("project-form", "submit", saveProject);
    on("project-search", "input", renderProjects);
    on("project-status-filter", "change", renderProjects);

    on("btn-add-payment", "click", function () {
      openPaymentModal();
    });
    on("payment-form", "submit", savePayment);

    on("btn-add-hosting", "click", function () {
      openHostingModal();
    });
    on("hosting-form", "submit", saveHosting);

    on("billing-settings-form", "submit", saveBillingSettings);
    on("sync-settings-form", "submit", saveSyncSettings);
    on("btn-sync-now", "click", syncNow);

    on("prospect-search-form", "submit", searchProspects);
    on("btn-prospect-search", "click", searchProspects);
    on("btn-prospect-maps", "click", openProspectMaps);
    on("btn-prospect-save-filtered", "click", saveFilteredProspects);
    on("btn-prospect-settings", "click", function () {
      renderProspectSettings();
      openModal("prospect-settings-modal");
    });
    on("btn-add-prospect-manual", "click", function () {
      openProspectModal();
    });
    on("prospect-settings-form", "submit", saveProspectSettings);
    on("prospect-form", "submit", saveProspect);
    on("prospect-list-search", "input", renderProspects);
    on("prospect-status-filter", "change", renderProspects);
    on("prospect-opportunity-filter", "change", renderProspects);

    on("invoice-form", "submit", function (event) {
      event.preventDefault();
      invoiceMailto();
    });
    on("btn-invoice-mailto", "click", invoiceMailto);
    on("btn-invoice-copy", "click", copyInvoice);
    on("btn-invoice-refresh", "click", function () {
      const payment = findPayment(getValue("invoice-payment-id"));
      if (payment) {
        setValue("invoice-subject", defaultInvoiceSubject(payment));
        setValue("invoice-body", defaultInvoiceBody(payment));
        refreshInvoicePreview();
      }
    });

    ["projects-tbody", "payments-tbody", "hosting-tbody", "prospects-tbody"].forEach(function (id) {
      on(id, "click", handleTableClick);
    });

    $all("[data-close]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeModal(button);
      });
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeAllModals();
    });
  }

  function refreshProjectSelects() {
    const paymentSelect = $("payment-clientId");
    if (paymentSelect) paymentSelect.innerHTML = projectOptions(paymentSelect.value);
    const hostingSelect = $("hosting-clientId");
    if (hostingSelect) hostingSelect.innerHTML = projectOptions(hostingSelect.value);
  }

  function refreshAll() {
    state = normalizeState(state);
    renderOverviewStats();
    renderProjectSelectsSafe();
    renderProjects();
    renderPaymentStats();
    renderPayments();
    renderHostingStats();
    renderHosting();
    renderProspectStats();
    renderProspects();
    renderProspectResults();
    renderBillingSettings();
    renderSyncSettings();
    renderProspectSettings();
  }

  function renderProjectSelectsSafe() {
    try {
      refreshProjectSelects();
    } catch (error) {
      console.warn("Unable to refresh project selects", error);
    }
  }

  window.CWSAdmin = {
    CONFIG: CONFIG,
    getState: function () {
      return normalizeState(state);
    },
    saveState: saveState,
    pullFromGitHub: pullFromGitHub,
    pushToGitHub: pushToGitHub,
    hydrateFromGitHub: hydrateFromGitHub,
    syncNow: syncNow,
    uid: uid,
    todayISO: todayISO,
    formatDate: formatDate,
    parseDate: parseDate,
    isSameMonth: isSameMonth,
    daysUntil: daysUntil,
    refreshAll: refreshAll,
  };

  document.addEventListener("DOMContentLoaded", function () {
    fillStatusSelects();
    fillProspectSelects();
    initEvents();
    refreshAll();
    hydrateFromGitHub().then(refreshAll);
  });
})();
