const reportsList = document.querySelector("#reports-list");
const reportsStatus = document.querySelector("#reports-status");
const reportsFilter = document.querySelector("#reports-filter");

function formatReason(reason) {
  return reason
    .toLowerCase()
    .split("_")
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function createReportItem(report) {
  const item = document.createElement("article");
  item.className = "report-item";
  item.dataset.reportId = report._id;
  const channel = document.createElement("h3");
  channel.textContent = report.channelId?.name || "Channel unavailable";
  const reporter = document.createElement("p");
  reporter.textContent = `Reported by: ${report.userId?.email || "User unavailable"}`;
  const reason = document.createElement("p");
  reason.textContent = `Reason: ${formatReason(report.reason)}`;
  const description = document.createElement("p");
  description.textContent = report.description;
  const status = document.createElement("p");
  status.className = "report-status";
  status.textContent = report.status;
  const created = document.createElement("p");
  created.className = "report-date";
  created.textContent = new Date(report.createdAt).toLocaleString();
  item.append(channel, reporter, reason, description, status, created);
  if (report.status !== "RESOLVED") {
    const closeButton = document.createElement("button");
    closeButton.type = "button";
    closeButton.textContent = "Close report";
    closeButton.addEventListener("click", () => closeReport(report._id));
    item.append(closeButton);
  }
  return item;
}

function updateReportsCount() {
  const count = reportsList.querySelectorAll(".report-item").length;
  reportsStatus.textContent = `${count} report${count === 1 ? "" : "s"}`;
}

function applyRealtimeReport(report, isNew) {
  const existing = reportsList.querySelector(
    `[data-report-id="${report._id}"]`,
  );
  if (!reportMatchesFilter(report)) {
    existing?.remove();
    updateReportsCount();
    return;
  }
  const item = createReportItem(report);
  if (existing) {
    existing.replaceWith(item);
  } else {
    const emptyState = reportsList.querySelector(".empty-state");
    if (emptyState) emptyState.remove();
    reportsList.prepend(item);
  }
  updateReportsCount();
}

async function loadUser() {
  const response = await fetch("/api/users/me");
  if (!response.ok) {
    location.href = "/login";
    return false;
  }
  const user = await response.json();
  if (user.role !== "ADMIN") {
    location.href = "/";
    return false;
  }
  document.querySelector("#welcome").textContent = `Support: ${user.email}`;
  return true;
}

async function loadReports() {
  const response = await fetch(
    `/api/admin/reports?${new URLSearchParams({ filter: reportsFilter.value })}`,
  );
  if (!response.ok) {
    reportsStatus.textContent = "Could not load reports.";
    return;
  }
  const { reports } = await response.json();
  reportsStatus.textContent = `${reports.length} report${reports.length === 1 ? "" : "s"}`;
  if (reports.length === 0) {
    reportsList.replaceChildren(
      Object.assign(document.createElement("p"), {
        className: "empty-state",
        textContent: "There are no reports yet.",
      }),
    );
    return;
  }
  reportsList.replaceChildren(...reports.map(createReportItem));
}

function reportMatchesFilter(report) {
  if (reportsFilter.value === "all") return true;
  if (reportsFilter.value === "closed") return report.status === "RESOLVED";
  return report.status !== "RESOLVED";
}

async function closeReport(reportId) {
  const response = await fetch(`/api/admin/reports/${reportId}/close`, {
    method: "PATCH",
  });
  if (!response.ok) {
    reportsStatus.textContent = "Could not close report.";
    return;
  }
  const { report } = await response.json();
  applyRealtimeReport(report, false);
}

function connectSupportSocket() {
  const socket = io();
  socket.on("report:created", (report) => {
    console.log("Report created:", report);
    applyRealtimeReport(report, true);
  });
  socket.on("report:updated", (report) => {
    console.log("Report updated:", report);
    applyRealtimeReport(report, false);
  });
}

document.querySelector("#logout").addEventListener("click", async () => {
  await fetch("/api/auth/logout", { method: "POST" });
  location.href = "/login";
});
reportsFilter.addEventListener("change", loadReports);
async function start() {
  if (await loadUser()) {
    await loadReports();
    connectSupportSocket();
  }
}
start();
