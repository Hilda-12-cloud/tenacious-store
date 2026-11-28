(function () {
  "use strict";

  const API = "https://tenacious-payments.hildaocran3.workers.dev";
  const PAGE_SIZE = 10;
  let adminToken = "";
  let currentPage = 1;
  let totalPages = 1;
  let debounceTimer = null;
  let currentCustomers = [];

  const overlay = document.getElementById("signin-overlay");
  const signinForm = document.getElementById("signin-form");
  const signinInput = document.getElementById("admin-token");
  const signinButton = document.getElementById("signin-button");
  const signinStatus = document.getElementById("signin-status");
  const listStatus = document.getElementById("list-status");
  const pageStatus = document.getElementById("page-status");
  const detailStatus = document.getElementById("detail-status");
  const rows = document.getElementById("customer-rows");
  const search = document.getElementById("search");
  const detailSection = document.getElementById("customer-detail");

  function setStatus(element, message, error) {
    element.textContent = message || "";
    element.className = "status" + (error ? " error" : "");
  }

  async function readResponse(response) {
    let body;
    try {
      body = await response.json();
    } catch {
      body = {};
    }
    if (!response.ok) {
      const error = new Error(body.error || body.message || "The request could not be completed.");
      error.status = response.status;
      throw error;
    }
    return body;
  }

  async function api(path) {
    const response = await fetch(API + path, {
      headers: { Authorization: "Bearer " + adminToken }
    });
    return readResponse(response);
  }

  function payloadData(body) {
    return body && body.data && typeof body.data === "object" ? body.data : body;
  }

  function field(object, keys) {
    for (const key of keys) {
      if (object && object[key] !== undefined && object[key] !== null && object[key] !== "") return object[key];
    }
    return null;
  }

  function dateValue(value) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
  }

  function displayValue(value) {
    if (value === null || value === undefined || value === "") return "—";
    if (typeof value === "boolean") return value ? "Yes" : "No";
    return String(value);
  }

  function customerName(customer) {
    return field(customer, ["name", "full_name", "fullName"]) ||
      [customer && customer.first_name, customer && customer.last_name].filter(Boolean).join(" ") ||
      "Customer";
  }

  function getCustomerId(customer) {
    return field(customer, ["id", "customer_id", "customerId"]);
  }

  function listData(body) {
    const data = payloadData(body);
    const customers = Array.isArray(data) ? data :
      (data && Array.isArray(data.customers) ? data.customers :
        (data && data.result && Array.isArray(data.result.customers) ? data.result.customers : null));
    if (!customers) throw new Error("The customer list response was invalid.");
    const meta = Array.isArray(data) ? {} : (data.pagination || data.meta || data);
    const total = field(meta, ["total", "total_customers", "totalCustomers", "count"]);
    const pages = field(meta, ["total_pages", "totalPages", "pages"]);
    const page = field(meta, ["page", "current_page", "currentPage"]);
    const limit = field(meta, ["limit", "page_size", "pageSize"]);
    const totalValue = Number.isFinite(Number(total)) && total !== null ? Number(total) : null;
    return {
      customers,
      total: totalValue,
      pages: Number.isFinite(Number(pages)) && Number(pages) > 0
        ? Number(pages)
        : totalValue !== null
          ? Math.max(1, Math.ceil(totalValue / (Number(limit) || PAGE_SIZE)))
          : (customers.length >= PAGE_SIZE ? currentPage + 1 : currentPage),
      page: Number.isFinite(Number(page)) && Number(page) > 0 ? Number(page) : currentPage
    };
  }

  function orderCount(customer) {
    const value = Number(field(customer, ["total_orders", "order_count", "orders_count"]));
    return Number.isFinite(value) && value >= 0 ? value : null;
  }

  function hasNoCompletedOrders(customer) {
    const completed = field(customer, ["completed_orders", "completed_order_count", "orders_completed"]);
    if (completed !== null) {
      const count = Number(completed);
      return Number.isFinite(count) ? count === 0 : null;
    }
    return orderCount(customer) === 0 ? true : null;
  }

  function amountFor(customer, keys) {
    for (const key of keys) {
      if (!customer || customer[key] === undefined || customer[key] === null || customer[key] === "") continue;
      const value = Number(customer[key]);
      if (!Number.isFinite(value)) return null;
      return key.endsWith("_minor") || key.endsWith("_cents") ? value / 100 : value;
    }
    return null;
  }

  function formatMoney(value, currency) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    const code = currency && String(currency).toUpperCase();
    if (code && /^[A-Z]{3}$/.test(code)) {
      try {
        return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(Number(value));
      } catch {
        return Number(value).toFixed(2) + " " + code;
      }
    }
    return Number(value).toFixed(2) + (currency ? " " + currency : "");
  }

  function make(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function updateInsights(list, total) {
    document.getElementById("registered-total").textContent = total === null ? "—" : total.toLocaleString();
    const returning = list.filter(customer => (orderCount(customer) || 0) > 1).length;
    const noOrders = list.filter(customer => hasNoCompletedOrders(customer) === true).length;
    document.getElementById("returning-total").textContent = String(returning);
    document.getElementById("no-orders-total").textContent = String(noOrders);

    const spendingByCurrency = new Map();
    const tiers = new Map();
    list.forEach(customer => {
      const spend = amountFor(customer, ["total_spent", "total_spending", "total_spent_minor", "total_spending_minor"]);
      if (spend !== null) {
        const currency = field(customer, ["currency", "currency_code"]);
        const key = currency ? String(currency).toUpperCase() : "";
        spendingByCurrency.set(key, (spendingByCurrency.get(key) || 0) + spend);
      }
      const tier = field(customer, ["loyalty_tier", "tier"]);
      if (tier !== null) tiers.set(String(tier), (tiers.get(String(tier)) || 0) + 1);
    });
    const spendSummary = Array.from(spendingByCurrency, ([currency, value]) => formatMoney(value, currency || null));
    document.getElementById("page-spend").textContent = spendSummary.length
      ? spendSummary.slice(0, 2).join(" · ") + (spendSummary.length > 2 ? " · …" : "")
      : "—";

    const host = document.getElementById("insights-grid");
    host.replaceChildren();
    const addInsight = (value, label) => {
      const card = make("div", "insight-card");
      card.append(make("strong", "", value), make("span", "", label));
      host.appendChild(card);
    };
    addInsight(String(returning), "Returning customers on this page (>1 order)");
    addInsight(String(noOrders), "Customers with no completed orders on this page");
    if (!tiers.size) addInsight("—", "Loyalty tier distribution unavailable");
    tiers.forEach((count, tier) => addInsight(String(count), tier + " tier on this page"));
  }

  function renderRows(list) {
    rows.replaceChildren();
    if (!list.length) {
      const tr = make("tr");
      const td = make("td", "muted", search.value.trim() ? "No customers match your search." : "No customer records were returned.");
      td.colSpan = 7;
      td.style.textAlign = "center";
      td.style.padding = "32px";
      tr.appendChild(td);
      rows.appendChild(tr);
      return;
    }
    list.forEach(customer => {
      const tr = document.createElement("tr");
      const nameCell = document.createElement("td");
      const id = getCustomerId(customer);
      const name = make("button", "customer-select", customerName(customer));
      name.type = "button";
      name.disabled = id === null;
      name.addEventListener("click", () => id !== null && loadCustomer(id));
      nameCell.appendChild(name);
      tr.append(
        nameCell,
        make("td", "", field(customer, ["email", "email_address"])),
        make("td", "", field(customer, ["phone", "phone_number", "telephone"])),
        make("td", "", dateValue(field(customer, ["created_at", "registered_at", "registration_date"]))),
        make("td", "", orderCount(customer) === null ? "—" : orderCount(customer)),
        make("td", "", formatMoney(
          amountFor(customer, ["total_spent", "total_spending", "total_spent_minor", "total_spending_minor"]),
          field(customer, ["currency", "currency_code"])
        )),
        make("td", "tier", field(customer, ["loyalty_tier", "tier"]))
      );
      rows.appendChild(tr);
    });
  }

  async function loadCustomers() {
    if (!adminToken) return;
    setStatus(listStatus, "Loading customers…");
    document.getElementById("previous-page").disabled = true;
    document.getElementById("next-page").disabled = true;
    try {
      const params = new URLSearchParams({ page: String(currentPage), limit: String(PAGE_SIZE) });
      if (search.value.trim()) params.set("q", search.value.trim());
      const responseBody = await api("/admin/customers?" + params.toString());
      const result = listData(responseBody);
      currentCustomers = result.customers;
      currentPage = result.page;
      totalPages = result.pages;
      renderRows(currentCustomers);
      updateInsights(currentCustomers, result.total);
      document.getElementById("result-count").textContent = result.total === null
        ? currentCustomers.length + " returned"
        : result.total.toLocaleString() + " registered";
      document.getElementById("page-count").textContent = currentCustomers.length + " shown";
      document.getElementById("pagination-label").textContent = "Page " + currentPage + " of " + totalPages;
      document.getElementById("previous-page").disabled = currentPage <= 1;
      document.getElementById("next-page").disabled = currentPage >= totalPages;
      setStatus(listStatus, currentCustomers.length ? "" : (search.value.trim() ? "No matching customers found." : "No customers are available."));
      setStatus(pageStatus, "");
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        denyAccess();
        return;
      }
      setStatus(listStatus, error.message || "Customer records could not be loaded.", true);
      setStatus(pageStatus, "Unable to load customers.", true);
      renderRows([]);
    }
  }

  function detailField(host, label, value) {
    const item = make("div", "detail-item");
    item.append(make("span", "", label), make("strong", "", displayValue(value)));
    host.appendChild(item);
  }

  function orderList(body, profile) {
    const data = payloadData(body);
    if (data && Array.isArray(data.orders)) return data.orders;
    if (profile && Array.isArray(profile.orders)) return profile.orders;
    if (data && data.customer && Array.isArray(data.customer.orders)) return data.customer.orders;
    return [];
  }

  function renderDetailOrder(order) {
    const tr = document.createElement("tr");
    tr.append(
      make("td", "", field(order, ["order_reference", "reference", "order_ref", "order_number", "id"])),
      make("td", "", dateValue(field(order, ["order_date", "created_at", "date"]))),
      make("td", "", field(order, ["status", "payment_status", "order_status"])),
      make("td", "", field(order, ["currency", "currency_code"])),
      make("td", "", formatMoney(amountFor(order, ["subtotal", "subtotal_amount", "subtotal_minor", "subtotal_amount_minor"]), field(order, ["currency", "currency_code"]))),
      make("td", "", formatMoney(amountFor(order, ["discount", "discount_amount", "discount_minor", "discount_amount_minor"]), field(order, ["currency", "currency_code"]))),
      make("td", "", formatMoney(amountFor(order, ["shipping", "shipping_amount", "shipping_minor", "shipping_amount_minor"]), field(order, ["currency", "currency_code"]))),
      make("td", "", formatMoney(amountFor(order, ["total", "total_amount", "total_minor", "total_amount_minor", "amount"]), field(order, ["currency", "currency_code"])))
    );
    return tr;
  }

  async function loadCustomer(id) {
    detailSection.hidden = false;
    detailSection.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("detail-name").textContent = "Loading customer…";
    document.getElementById("detail-email").textContent = "";
    document.getElementById("detail-id").textContent = "";
    document.getElementById("detail-fields").replaceChildren();
    document.getElementById("detail-orders").replaceChildren();
    setStatus(detailStatus, "Loading customer details…");
    try {
      const body = await api("/admin/customers/" + encodeURIComponent(String(id)));
      const data = payloadData(body);
      const profile = data && data.customer && typeof data.customer === "object" ? data.customer : data;
      if (!profile || typeof profile !== "object") throw new Error("The customer detail response was invalid.");
      document.getElementById("detail-name").textContent = customerName(profile);
      document.getElementById("detail-email").textContent = displayValue(field(profile, ["email", "email_address"]));
      document.getElementById("detail-id").textContent = "ID " + displayValue(field(profile, ["id", "customer_id", "customerId"]));
      const fields = document.getElementById("detail-fields");
      fields.replaceChildren();
      detailField(fields, "Full name", customerName(profile));
      detailField(fields, "Email address", field(profile, ["email", "email_address"]));
      detailField(fields, "Phone number", field(profile, ["phone", "phone_number", "telephone"]));
      detailField(fields, "Registration date", dateValue(field(profile, ["created_at", "registered_at", "registration_date"])));
      detailField(fields, "Last updated", dateValue(field(profile, ["updated_at", "last_updated", "modified_at"])));
      detailField(fields, "Total orders", field(profile, ["total_orders", "order_count", "orders_count"]));
      detailField(fields, "Total spending", formatMoney(
        amountFor(profile, ["total_spent", "total_spending", "total_spent_minor", "total_spending_minor"]),
        field(profile, ["currency", "currency_code"])
      ));
      detailField(fields, "Loyalty tier", field(profile, ["loyalty_tier", "tier"]));
      detailField(fields, "Birthday", field(profile, ["birthday", "date_of_birth"]));
      detailField(fields, "Marketing updates", field(profile, ["marketing_subscribed", "marketing_subscription", "marketing_opt_in", "subscribed_to_updates"]));

      const host = document.getElementById("detail-orders");
      host.replaceChildren();
      const customerOrders = orderList(body, profile);
      if (!customerOrders.length) {
        host.appendChild(make("div", "empty", "No order history was returned for this customer."));
      } else {
        const tableWrap = make("div", "table-wrap");
        const table = document.createElement("table");
        table.style.minWidth = "850px";
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Reference", "Order date", "Status", "Currency", "Subtotal", "Discount", "Shipping", "Total"].forEach(label => headerRow.appendChild(make("th", "", label)));
        thead.appendChild(headerRow);
        const tbody = document.createElement("tbody");
        customerOrders.forEach(order => tbody.appendChild(renderDetailOrder(order)));
        table.append(thead, tbody);
        tableWrap.appendChild(table);
        host.appendChild(tableWrap);
      }
      setStatus(detailStatus, "");
    } catch (error) {
      if (error.status === 401 || error.status === 403) {
        denyAccess();
        return;
      }
      setStatus(detailStatus, error.message || "Customer details could not be loaded.", true);
    }
  }

  function denyAccess() {
    adminToken = "";
    signinInput.value = "";
    overlay.hidden = false;
    setStatus(signinStatus, "Access denied. The token is invalid or no longer authorized.", true);
    setStatus(listStatus, "");
    document.getElementById("signout").hidden = true;
    rows.replaceChildren();
    currentCustomers = [];
    document.getElementById("registered-total").textContent = "—";
    document.getElementById("returning-total").textContent = "—";
    document.getElementById("no-orders-total").textContent = "—";
    document.getElementById("page-spend").textContent = "—";
    document.getElementById("result-count").textContent = "";
    document.getElementById("page-count").textContent = "";
    document.getElementById("insights-grid").replaceChildren();
    detailSection.hidden = true;
    document.getElementById("detail-name").textContent = "";
    document.getElementById("detail-email").textContent = "";
    document.getElementById("detail-id").textContent = "";
    document.getElementById("detail-fields").replaceChildren();
    document.getElementById("detail-orders").replaceChildren();
  }

  signinForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!signinForm.reportValidity()) return;
    adminToken = signinInput.value.trim();
    signinButton.disabled = true;
    signinInput.disabled = true;
    setStatus(signinStatus, "Checking access…");
    try {
      const params = new URLSearchParams({ page: "1", limit: String(PAGE_SIZE) });
      const body = await api("/admin/customers?" + params.toString());
      listData(body);
      currentPage = 1;
      overlay.hidden = true;
      signinInput.value = "";
      document.getElementById("signout").hidden = false;
      await loadCustomers();
    } catch (error) {
      adminToken = "";
      signinInput.value = "";
      setStatus(signinStatus, error.status === 401 || error.status === 403
        ? "Access denied. Check the administrator token."
        : error.message || "Could not connect to the customer service.", true);
    } finally {
      signinButton.disabled = false;
      signinInput.disabled = false;
    }
  });

  search.addEventListener("input", function () {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(function () {
      currentPage = 1;
      loadCustomers();
    }, 300);
  });

  document.getElementById("previous-page").addEventListener("click", function () {
    if (currentPage > 1) {
      currentPage -= 1;
      loadCustomers();
    }
  });
  document.getElementById("next-page").addEventListener("click", function () {
    if (currentPage < totalPages) {
      currentPage += 1;
      loadCustomers();
    }
  });
  document.getElementById("close-detail").addEventListener("click", function () {
    detailSection.hidden = true;
  });
  document.getElementById("signout").addEventListener("click", function () {
    adminToken = "";
    overlay.hidden = false;
    signinInput.value = "";
    setStatus(signinStatus, "You have signed out.");
    this.hidden = true;
    rows.replaceChildren();
    currentCustomers = [];
    detailSection.hidden = true;
    document.getElementById("registered-total").textContent = "—";
    document.getElementById("returning-total").textContent = "—";
    document.getElementById("no-orders-total").textContent = "—";
    document.getElementById("page-spend").textContent = "—";
    document.getElementById("result-count").textContent = "";
    document.getElementById("page-count").textContent = "";
    document.getElementById("detail-name").textContent = "";
    document.getElementById("detail-email").textContent = "";
    document.getElementById("detail-id").textContent = "";
    document.getElementById("insights-grid").replaceChildren();
    document.getElementById("detail-fields").replaceChildren();
    document.getElementById("detail-orders").replaceChildren();
  });

  const sidebar = document.getElementById("sidebar");
  const menuButton = document.getElementById("menu-button");
  menuButton.addEventListener("click", function () {
    const open = sidebar.classList.toggle("open");
    menuButton.setAttribute("aria-expanded", String(open));
  });
  sidebar.querySelectorAll(".side-link").forEach(link => {
    link.addEventListener("click", function () {
      sidebar.classList.remove("open");
      menuButton.setAttribute("aria-expanded", "false");
      sidebar.querySelectorAll(".side-link").forEach(item => item.classList.toggle("active", item === link));
    });
  });
})();
