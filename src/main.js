import legacyHtml from "../the-spot-mvp.html?raw";
import { createClient } from "@supabase/supabase-js";

const app = document.querySelector("#app");
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabasePublishableKey
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

const dom = new DOMParser().parseFromString(legacyHtml, "text/html");
document.head.insertAdjacentHTML("beforeend", dom.head.querySelector("style")?.outerHTML || "");
app.innerHTML = dom.body.innerHTML.replace(/<script[\s\S]*?<\/script>/gi, "");

const $ = (id) => document.getElementById(id);
let currentHolder = null;
let currentPrice = 0;
let reignStartTimestamp = Date.now();
let holderHistory = [];
let reclaimState = null;
let simulatedVisitors = 1284;
let selectedLogoDataUrl = null;

function money(value) { return "$" + Number(value || 0).toLocaleString("en-US"); }
function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function secondsValue(value) {
  if (typeof value === "string" && value.includes(":")) {
    const parts = value.split(":").map(Number);
    if (parts.every(Number.isFinite)) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return Number(value) || 0;
}
function pick(row, keys, fallback = "") {
  for (const key of keys) if (row?.[key] !== undefined && row[key] !== null) return row[key];
  return fallback;
}
function normalizeHolder(row) {
  const displayName = pick(row, ["display_name", "displayName", "holder_name"], "Unknown");
  return {
    displayName,
    username: String(pick(row, ["username", "x_username", "holder_username"], displayName)).replace(/^@/, ""),
    website: pick(row, ["website", "website_url"], "https://example.com"),
    description: String(pick(row, ["description", "promotional_description"], "")).slice(0, 120),
    logoDataUrl: pick(row, ["logo_url", "logo_data_url", "logo"], null),
  };
}
function normalizeHistory(rows) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    name: String(
  pick(row, ["holder_x_username", "holder_name", "username", "x_username", "holder_username"], "Unknown")
).replace(/^@/, ""),
    price: Number(pick(row, ["price_paid", "price", "amount"], 0)),
    duration: secondsValue(pick(row, ["reign_duration_seconds", "duration_seconds", "duration"], 0)) ||
      Math.max(0, (new Date(pick(row, ["reign_ended_at", "ended_at"], 0)).getTime() - new Date(pick(row, ["reign_started_at", "started_at"], 0)).getTime()) / 1000),
  }));
}
function showError(message) {
  const error = $("offerError");
  if (error) error.textContent = message;
  const reclaimError = $("reclaimError");
  if (reclaimError && !$("reclaimPanel")?.classList.contains("visible")) reclaimError.textContent = message;
}
function setLoadingState() {
  $("holder").textContent = "Loading";
  $("description").textContent = "Reading the current Spot.";
  $("price").textContent = "—";
  $("currentPrice").textContent = "—";
  $("minimumOffer").textContent = "—";
  $("socialLink").textContent = "";
  $("websiteLink").textContent = "";
  $("longest").innerHTML = "";
  $("highest").innerHTML = "";
}
function setUnavailableState(message) {
  currentHolder = null;
  currentPrice = 0;
  holderHistory = [];
  $("holder").textContent = "Unavailable";
  $("description").textContent = "The current Spot could not be loaded.";
  $("price").textContent = "—";
  $("currentPrice").textContent = "—";
  $("minimumOffer").textContent = "—";
  $("socialLink").textContent = "";
  $("websiteLink").textContent = "";
  $("longest").innerHTML = "";
  $("highest").innerHTML = "";
  $("takeBtn").disabled = true;
  $("reclaimPanel").classList.remove("visible");
  showError(message);
}
function renderLogo() {
  $("logoFrame").innerHTML = currentHolder?.logoDataUrl
    ? `<img src="${currentHolder.logoDataUrl}" alt="Current holder logo">`
    : '<span class="logo-placeholder">✦</span>';
}
function renderHistory() {
  const rows = (list) => list.map((item) =>
    `<div class="row"><span>@${item.name}</span><span>${money(item.price)}</span><span>${duration(item.duration)}</span></div>`
  ).join("");
  $("longest").innerHTML = rows([...holderHistory].sort((a, b) => b.duration - a.duration).slice(0, 5));
  $("highest").innerHTML = rows([...holderHistory].sort((a, b) => b.price - a.price).slice(0, 5));
}
function renderReclaim() {
  if (!reclaimState) { $("reclaimPanel").classList.remove("visible"); return; }
  const remaining = Math.max(0, reclaimState.expiresAt - Date.now());
  const minimum = Math.max(1, currentPrice - reclaimState.previousContribution + 1);
  $("reclaimPanel").classList.add("visible");
  $("reclaimMessage").textContent = `@${currentHolder.username} just took THE SPOT for ${money(currentPrice)}.`;
  $("reclaimContribution").textContent = money(reclaimState.previousContribution);
  $("reclaimPrice").textContent = money(currentPrice);
  $("reclaimTimer").textContent = duration(Math.floor(remaining / 1000));
  $("reclaimMinimum").textContent = money(minimum);
  $("reclaimOffer").min = minimum;
  $("reclaimOffer").placeholder = money(minimum);
  if (remaining <= 0) {
    $("reclaimPanel").innerHTML = "<h4>Reclaim window expired</h4><div class=\"reclaim-title\">Reclaim window expired.</div><p>Your previous contribution can no longer be used to reclaim THE SPOT.</p><p class=\"reclaim-note\">If you want to take THE SPOT again, make a completely new offer based on the current price.</p>";
  }
}
function render() {
  if (!currentHolder) return;
  $("holder").textContent = "@" + currentHolder.username;
  $("description").textContent = currentHolder.description;
  $("price").textContent = Number(currentPrice).toLocaleString("en-US");
  $("currentPrice").textContent = money(currentPrice);
  $("minimumOffer").textContent = money(currentPrice + 1);
  $("socialLink").textContent = "@" + currentHolder.username;
  $("socialLink").href = `https://x.com/${currentHolder.username}`;
  try { $("websiteLink").textContent = new URL(currentHolder.website).hostname.replace(/^www\./, ""); } catch { $("websiteLink").textContent = currentHolder.website; }
  $("websiteLink").href = currentHolder.website;
  renderLogo();
  renderHistory();
  renderReclaim();
}
function updateOfferLabels() {
  $("modalCurrent").textContent = money(currentPrice);
  $("modalMinimum").textContent = money(currentPrice + 1);
  $("offer").min = currentPrice + 1;
  $("offer").placeholder = money(currentPrice + 1);
  $("offerError").textContent = "";
}
async function loadRemoteState() {
    
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  console.info("[The Spot] Supabase configuration", {
    urlPresent: Boolean(supabaseUrl),
    publishableKeyPresent: Boolean(supabasePublishableKey),
    urlOrigin: supabaseUrl ? new URL(supabaseUrl).origin : null,
  });

  console.info("[The Spot] Executing public.spot query");

  const { data: spot, error: spotError } = await supabase
  .from("spot")
  .select("*")
  .limit(1)
  .maybeSingle();



  if (spotError) throw spotError;

  if (!spot) {
    throw new Error("The public.spot query returned no rows.");
  }

  const { data: history, error: historyError } = await supabase
    .from("spot_history")
    .select("*");

  if (historyError) {
    console.error(
      "[The Spot] public.spot_history query failed",
      historyError
    );
    throw historyError;
  }

  /*
   * RECLAIM
   * Only look for the reclaim window whose token
   * exists in THIS browser.
   */

  let reclaim = null;

  const reclaimTokenFromUrl = new URLSearchParams(
  window.location.search
).get("reclaim");

if (reclaimTokenFromUrl) {
  localStorage.setItem(
    "theSpotReclaimToken",
    reclaimTokenFromUrl
  );

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );
}
  const localReclaimToken = localStorage.getItem(
    "theSpotReclaimToken"
  );

  console.info(
    "[The Spot] Local reclaim token exists:",
    Boolean(localReclaimToken)
  );

  if (localReclaimToken) {
  const {
    data: reclaimData,
    error: reclaimError,
  } = await supabase.rpc(
    "get_my_reclaim_window",
    {
      p_reclaim_token: localReclaimToken,
    }
  );

  if (reclaimError) {
  console.error(
    "[The Spot] Matching reclaim window query failed",
    reclaimError
  );
} else {
  reclaim = Array.isArray(reclaimData)
    ? reclaimData[0] || null
    : reclaimData || null;

  if (!reclaim) {
    localStorage.removeItem("theSpotReclaimToken");
  }
}
}


  console.info("[The Spot] Matching reclaim window:", {
    found: Boolean(reclaim),
    tokenExists: Boolean(localReclaimToken),
    expiresAt: reclaim?.expires_at || null,
  });

  console.info("[The Spot] public.spot row received", {
    holderName: pick(
      spot,
      ["holder_name", "display_name", "username"],
      null
    ),
    currentPrice: pick(
      spot,
      ["current_price", "price", "amount"],
      null
    ),
  });

  currentHolder = normalizeHolder(spot);

  currentPrice = Number(
    pick(spot, ["current_price", "price", "amount"], 0)
  );

  reignStartTimestamp = new Date(
    pick(
      spot,
      ["reign_started_at"],
      new Date().toISOString()
    )
  ).getTime();

  holderHistory = normalizeHistory(history);

  console.log("[The Spot] RECLAIM BEFORE STATE:", reclaim);
  reclaimState =
  reclaim &&
  new Date(
    pick(reclaim, ["expires_at"], 0)
  ).getTime() > Date.now()
      ? {
          previousContribution: Number(
            pick(
              reclaim,
              ["previous_contribution", "contribution"],
              0
            )
          ),
          expiresAt: new Date(
            pick(reclaim, ["expires_at"], 0)
          ).getTime(),
          previousHolder: normalizeHolder(reclaim),
        }
      : null;

  console.log(
    "[The Spot] Final reclaim state:",
    reclaimState
  );

  render();
}
function openTakeover() {
  updateOfferLabels();
  $("modal").classList.add("open");
  $("formView").classList.remove("hidden");
  $("confirmView").classList.remove("visible");
  $("successView").classList.remove("visible");
  $("infoView").classList.remove("visible");
}
function reviewTakeover() {
  const offer = Number($("offer").value);
  if (!$("name").value.trim() || !$("username").value.trim()) return showError("Add a display name and username to continue.");
  if (!Number.isInteger(offer) || offer <= currentPrice) return showError(`Your offer must be at least ${money(currentPrice + 1)}.`);
  $("confirmCurrent").textContent = money(currentPrice);
  $("confirmNext").textContent = money(offer);
  $("formView").classList.add("hidden");
  $("confirmView").classList.add("visible");
}
async function submitTakeover() {
  const offer = Number($("offer").value);

  if (
    !$("name").value.trim() ||
    !$("username").value.trim()
  ) {
    return showError(
      "Add a display name and username to continue."
    );
  }

  if (
    !Number.isInteger(offer) ||
    offer <= currentPrice
  ) {
    return showError(
      `Your offer must be at least ${money(currentPrice + 1)}.`
    );
  }

  if (!supabase) {
    return showError(
      "Supabase is not configured. The demo cannot complete a takeover until the Vercel variables are added."
    );
  }

  $("review").disabled = true;

  const previousUsername = currentHolder.username;
  const previousPrice = currentPrice;
  const previousReclaimToken = localStorage.getItem(
  "theSpotReclaimToken"
);

  const response = await fetch(
    `${supabaseUrl}/functions/v1/super-function`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabasePublishableKey}`,
        "apikey": supabasePublishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "takeover",
        amount: offer,
        holderName: $("name").value.trim(),
        username: $("username").value
          .trim()
          .replace(/^@/, ""),
        website:
          $("website").value.trim() ||
          "https://example.com",
        description:
          $("message").value
            .trim()
            .slice(0, 120),
        logoUrl:
          selectedLogoDataUrl || ""
      })
    }
  );

  const result = await response.json();
  console.log("[The Spot] Stripe checkout result:", result);

  $("review").disabled = false;

  if (!response.ok || !result.url) {
    return showError(
      `Payment error: ${
        result.error ||
        "Could not create Stripe Checkout."
      }`
    );
  }

  // Save the private reclaim token before going to Stripe.
console.log(
  "[The Spot] Checkout result:",
  result
);

if (result.reclaimToken) {
  console.log(
    "[The Spot] Saving reclaim token:",
    result.reclaimToken
  );

  localStorage.setItem(
    "theSpotReclaimToken",
    result.reclaimToken
  );

  console.log(
    "[The Spot] Token saved:",
    localStorage.getItem("theSpotReclaimToken")
  );
} else {
  console.error(
    "[The Spot] NO reclaim token received from super-function"
  );
}

if (previousReclaimToken) {
  console.log(
    "[The Spot] Previous holder reclaim token preserved:",
    previousReclaimToken
  );
}

window.location.href = result.url;
  
async function submitReclaim() {
  if (!reclaimState) return;

  const additional = Number($("reclaimOffer").value);

  const minimum = Math.max(
    1,
    currentPrice -
      reclaimState.previousContribution +
      1
  );

  if (
    !Number.isInteger(additional) ||
    additional < minimum
  ) {
    return $("reclaimError").textContent =
      `Your additional offer must be at least ${money(minimum)}.`;
  }

  if (!supabase) {
    return $("reclaimError").textContent =
      "Supabase is not configured. Reclaim is unavailable until the Vercel variables are added.";
  }

  const reclaimToken = localStorage.getItem(
  "theSpotReclaimToken"
);

console.log("[The Spot] RECLAIM TOKEN USED:", reclaimToken);
console.log("[The Spot] RECLAIM STATE:", reclaimState);

  if (!reclaimToken) {
    return $("reclaimError").textContent =
      "Your reclaim token could not be found on this device.";
  }

  const response = await fetch(
    `${supabaseUrl}/functions/v1/super-function`,
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabasePublishableKey}`,
        "apikey": supabasePublishableKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        type: "reclaim",
        amount: additional,
        reclaimToken: reclaimToken
      })
    }
  );

  const result = await response.json();

  if (!response.ok || !result.url) {
    return $("reclaimError").textContent =
      `Payment error: ${
        result.error ||
        "Could not create Stripe Checkout."
      }`;
  }

  window.location.href = result.url;
}
async function finishRemoteAction(fallbackMessage, successMessage = null) {
  try {
    reclaimState = null;
    await loadRemoteState();
    if (successMessage) {
      $("successText").innerHTML = successMessage;
      $("formView").classList.add("hidden");
      $("confirmView").classList.remove("visible");
      $("infoView").classList.remove("visible");
      $("successView").classList.add("visible");
      $("modal").classList.add("open");
    } else {
      $("modal").classList.remove("open");
    }
  } catch (error) {
    showError(`${fallbackMessage} ${error.message || ""}`);
  }
}

// Bind the existing UI after importing its untouched markup and styles.
$("takeBtn").onclick = openTakeover;
$("cancel").onclick = () => $("modal").classList.remove("open");
$("review").onclick = reviewTakeover;
$("confirm").onclick = submitTakeover;
$("back").onclick = () => { $("confirmView").classList.remove("visible"); $("formView").classList.remove("hidden"); };
$("reclaimBtn").onclick = submitReclaim;
$("learnLink").onclick = (event) => { event.preventDefault(); $("modal").classList.add("open"); $("formView").classList.add("hidden"); $("infoView").classList.add("visible"); };
$("closeInfo").onclick = () => $("modal").classList.remove("open");
$("closeSuccess").onclick = () => $("modal").classList.remove("open");
$("logoInput").onchange = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return showError("Please choose a PNG, JPG, JPEG, or WebP image.");
  if (file.size > 5 * 1024 * 1024) return showError("That image is larger than the 5 MB demo limit.");
  const reader = new FileReader();
  reader.onload = () => { selectedLogoDataUrl = reader.result; $("previewImage").src = reader.result; $("imagePreview").classList.add("visible"); };
  reader.readAsDataURL(file);
};
setInterval(() => { $("timer").textContent = duration(Math.floor((Date.now() - reignStartTimestamp) / 1000)); renderReclaim(); }, 1000);
setInterval(() => { simulatedVisitors = Math.max(200, Math.min(2000, simulatedVisitors + Math.floor(Math.random() * 41) - 20)); $("visitors").textContent = simulatedVisitors.toLocaleString("en-US"); }, 7000);

const paymentStatus = new URLSearchParams(window.location.search).get("payment");

if (paymentStatus === "success") {
  window.history.replaceState({}, document.title, window.location.pathname);
  setTimeout(() => {
    loadRemoteState().catch((error) => {
      console.error("[The Spot] Reload after payment failed", error);
    });
  }, 500);
}
setLoadingState();
loadRemoteState().catch((error) => {
  console.error("[The Spot] Supabase load failed", error);
  if (supabase) {
    setUnavailableState(`Live Spot data unavailable: ${error.message || "unknown Supabase error"}`);
  } else {
    setUnavailableState("Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.");
  }
});
