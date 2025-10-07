import L from "leaflet";
import polyline from "polyline";
import { ROUTES } from "./routes.js";
import { smartReply } from "./ai.js";

/* App State */
const state = {
  role: null, // "user" | "driver"
  session: null, // user or driver data
  map: null,
  routeLayers: new Map(),
  selectedRouteId: null,
  userMarker: null,
  driverMarker: null,
  operators: {}, // { routeId: [ { id, name, unit, plate, lat, lng } ] }
  requests: {}, // { routeId: number }
  requestLayers: new Map()
};

/* Elements */
const authView = document.getElementById("authView");
const mapView = document.getElementById("mapView");
const asUserBtn = document.getElementById("asUserBtn");
const asDriverBtn = document.getElementById("asDriverBtn");
const userForm = document.getElementById("userForm");
const driverForm = document.getElementById("driverForm");
const userRegView = document.getElementById("userRegView");
const driverRegView = document.getElementById("driverRegView");
const userRouteSel = document.getElementById("userRoute");
const driverRouteSel = document.getElementById("driverRoute");
const routeSelect = document.getElementById("routeSelect");
const originSelect = document.getElementById("originSelect");
const destinationSelect = document.getElementById("destinationSelect");
const requestBtn = document.getElementById("requestBtn");
const etaText = document.getElementById("etaText");
const destInput = document.getElementById("destInput");
const recommendBtn = document.getElementById("recommendBtn");
const statusEl = document.getElementById("status");
const driverPanel = document.getElementById("driverPanel");
const requestCount = document.getElementById("requestCount");
const logoutBtn = document.getElementById("logoutBtn");
const chatNavBtn = document.getElementById("chatNavBtn");
const chatView = document.getElementById("chatView");
const backFromChat = document.getElementById("backFromChat");
const loginView = document.getElementById("loginView");
const loginForm = document.getElementById("loginForm");
const backToChoiceFromLogin = document.getElementById("backToChoiceFromLogin");
const authChoice = document.getElementById("authChoice");
const sttBtn = document.getElementById("sttBtn"); const ttsBtn = document.getElementById("ttsBtn");
const roleChoiceView = document.getElementById("roleChoiceView");
const roleChosen = document.getElementById("roleChosen");
const backToHome = document.getElementById("backToHome");
const loginStatus = document.getElementById("loginStatus");

/* chat elements (moved into chatView) */
const chatMessages = document.getElementById("chatMessages");
const chatInput = document.getElementById("chatInput");
const sendChatBtn = document.getElementById("sendChatBtn");

/* Populate route selects */
function fillRouteSelects() {
  const opts = ROUTES.map(r => `<option value="${r.id}">${r.name}</option>`).join("");
  userRouteSel.innerHTML = opts; driverRouteSel.innerHTML = opts;
  routeSelect.innerHTML = `<option value="">Sin asignar</option>` + opts;
  const origins = [...new Set(ROUTES.map(r=>r.originLabel||r.name.split(" - ")[0]))];
  const dests =   [...new Set(ROUTES.map(r=>r.destinationLabel||r.name.split(" - ").slice(-1)[0]))];
  originSelect.innerHTML = `<option value="">Origen</option>` + origins.map(o=>`<option>${o}</option>`).join("");
  destinationSelect.innerHTML = `<option value="">Destino</option>` + dests.map(d=>`<option>${d}</option>`).join("");
}
fillRouteSelects();

/* Role selection */
asUserBtn.addEventListener("click", () => {
  state.role = "user"; authView.hidden = true; roleChoiceView.hidden = false; roleChosen.textContent = "Usuario";
  roleChoiceView.querySelector("#roleChoiceTitle").innerHTML = `<span class="material-symbols-rounded">how_to_reg</span> Elige una opción - Usuario`;
  roleChoiceView.querySelector("#roleChoiceDesc").textContent = "Elige la opción para registrarte o Ingresar.";
});
asDriverBtn.addEventListener("click", () => {
  state.role = "driver"; authView.hidden = true; roleChoiceView.hidden = false; roleChosen.textContent = "Operador";
  roleChoiceView.querySelector("#roleChoiceTitle").innerHTML = `<span class="material-symbols-rounded">how_to_reg</span> Elige una opción - Operador`;
  roleChoiceView.querySelector("#roleChoiceDesc").textContent = "Elige la opción para registrarte o Ingresar.";
});
backToHome.addEventListener("click", ()=>{ roleChoiceView.hidden=true; authView.hidden=false; });

document.querySelector("#roleChoiceView #goRegister").addEventListener("click",()=>{
  roleChoiceView.hidden=true; (state.role==="user"?userRegView:driverRegView).hidden=false;
});
document.querySelector("#roleChoiceView #goLogin").addEventListener("click",()=>{
  roleChoiceView.hidden=true; loginView.hidden=false;
});

document.getElementById("backToRoleFromUser").addEventListener("click", ()=>{
  userRegView.hidden = true; roleChoiceView.hidden = false;
});
document.getElementById("backToRoleFromDriver").addEventListener("click", ()=>{
  driverRegView.hidden = true; roleChoiceView.hidden = false;
});

/* Registration handlers */
userForm.addEventListener("submit", e => {
  e.preventDefault();
  const data = {
    role: "user",
    name: document.getElementById("userName").value.trim(),
    email: document.getElementById("userEmail").value.trim(),
    city: document.getElementById("userCity").value.trim(),
    count: Number(document.getElementById("userCount").value),
    preferredRouteId: userRouteSel.value,
    pass: document.getElementById("userPass").value
  };
  const users = db.read(DB_KEYS.users);
  if (users.some(u=>u.email===data.email)) { alert("Ese correo ya está registrado."); return; }
  users.push({ ...data }); db.write(DB_KEYS.users, users);
  state.session = { ...data }; localStorage.setItem("session", JSON.stringify(state.session));
  userRegView.hidden = true; enterMapView();
});

driverForm.addEventListener("submit", e => {
  e.preventDefault();
  const data = {
    role: "driver",
    name: document.getElementById("driverName").value.trim(),
    unit: document.getElementById("driverUnit").value.trim(),
    plate: document.getElementById("driverPlate").value.trim(),
    routeId: driverRouteSel.value,
    email: document.getElementById("driverEmail").value.trim(),
    pass: document.getElementById("driverPass").value,
    id: crypto.randomUUID()
  };
  const drivers = db.read(DB_KEYS.drivers);
  if (drivers.some(d=>d.email===data.email)) { alert("Ese correo ya está en uso."); return; }
  if (drivers.some(d=>d.unit===data.unit)) { alert("Ese número de unidad ya está registrado."); return; }
  drivers.push({ ...data }); db.write(DB_KEYS.drivers, drivers);
  state.session = data; localStorage.setItem("session", JSON.stringify(data));
  driverRegView.hidden = true;
  const ops = JSON.parse(localStorage.getItem("operators") || "{}");
  ops[data.routeId] = ops[data.routeId] || [];
  if (!ops[data.routeId].some(o => o.id === data.id)) {
    ops[data.routeId].push({ id: data.id, name: data.name, unit: data.unit, plate: data.plate, lat: null, lng: null });
  }
  localStorage.setItem("operators", JSON.stringify(ops));
  enterMapView();
});

/* Login handler */
loginForm.addEventListener("submit", e=>{
  e.preventDefault();
  const email = document.getElementById("loginEmail").value.trim();
  const pass = document.getElementById("loginPass").value;
  const users = db.read(DB_KEYS.users);
  const drivers = db.read(DB_KEYS.drivers);
  let sess = users.find(u=>u.email===email && u.pass===pass) || drivers.find(d=>d.email===email && d.pass===pass);
  if (!sess) { loginStatus.textContent = "La contraseña o correo son incorrectos."; return; }
  loginStatus.textContent = "";
  state.session = sess; state.role = sess.role; localStorage.setItem("session", JSON.stringify(sess));
  loginView.hidden = true; enterMapView();
});
backToChoiceFromLogin.addEventListener("click", ()=>{ loginView.hidden=true; roleChoiceView.hidden=false; });

/* Restore session if exists */
const saved = localStorage.getItem("session");
if (saved) {
  state.session = JSON.parse(saved);
  state.role = state.session.role;
  enterMapView(true);
}

/* Map init */
function initMap() {
  if (state.map) return;
  state.map = L.map("map", { zoomControl: true, scrollWheelZoom: true }).setView([19.745, -99.198], 12);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 20, attribution: "© OpenStreetMap" }).addTo(state.map);
}

/* custom icons */
const personIcon = L.divIcon({ className:"", html:'<div style="width:28px;height:28px;border-radius:50%;background:#1976D2;display:grid;place-items:center;color:#fff;font-size:18px;box-shadow:0 4px 10px rgba(0,0,0,.2)">👤</div>', iconSize:[28,28], iconAnchor:[14,28] });
const combiIcon = L.divIcon({ className:"", html:'<div style="width:32px;height:32px;border-radius:8px;background:#43A047;display:grid;place-items:center;color:#fff;font-size:18px;box-shadow:0 4px 10px rgba(0,0,0,.2)">🚌</div>', iconSize:[32,32], iconAnchor:[16,32] });

/* origin/destination markers */
let originMarker = null, destMarker = null, userPathLayer = null;

/* Enter map view */
async function enterMapView(isRestore=false) {
  authView.hidden = true; mapView.hidden = false; chatView.hidden = true;
  logoutBtn.hidden = false; chatNavBtn.hidden = false; initMap();
  requestBtn.style.display = (state.role==="driver") ? "none" : "inline-flex";
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      state.map.setView([latitude, longitude], 14);
      if (state.role === "user" && !state.userMarker) state.userMarker = L.marker([latitude, longitude], { icon: personIcon }).addTo(state.map).bindPopup("Tu ubicación");
      if (state.role === "driver" && !state.driverMarker) state.driverMarker = L.marker([latitude, longitude], { icon: combiIcon }).addTo(state.map).bindPopup("Tu unidad");
    });
  }
  // removed background routes: show only selected route when chosen
  // role-specific UI
  if (state.role === "driver") {
    driverPanel.hidden = false;
    routeSelect.value = ""; state.selectedRouteId = null;
    const rName = ROUTES.find(r=>r.id===state.session.routeId)?.name || "--";
    driverRouteName.textContent = rName;
    renderRequestMarkers(state.session.routeId);
  } else {
    driverPanel.hidden = true;
    routeSelect.value = ""; state.selectedRouteId = null;
  }
  if (state.selectedRouteId) {
    await drawSelectedRoute(state.selectedRouteId, true);
  }
  watchPosition();
}

/* Geolocation */
let watchId = null;
function watchPosition() {
  if (!navigator.geolocation) {
    statusEl.textContent = "Geolocalización no disponible.";
    return;
  }
  if (watchId) navigator.geolocation.clearWatch(watchId);
  watchId = navigator.geolocation.watchPosition(
    pos => {
      const { latitude: lat, longitude: lng } = pos.coords;
      if (state.role === "user") {
        if (!state.userMarker) {
          state.userMarker = L.marker([lat, lng], { icon: personIcon }).addTo(state.map).bindPopup("Tu ubicación");
        } else state.userMarker.setLatLng([lat, lng]);
        updateETAUI();
      } else {
        if (!state.driverMarker) {
          state.driverMarker = L.marker([lat, lng], { icon: combiIcon }).addTo(state.map).bindPopup("Tu unidad");
        } else state.driverMarker.setLatLng([lat, lng]);
        // persist operator location
        const ops = JSON.parse(localStorage.getItem("operators") || "{}");
        const r = state.session.routeId;
        const idx = ops[r]?.findIndex(o => o.id === state.session.id);
        if (idx >= 0) {
          ops[r][idx].lat = lat; ops[r][idx].lng = lng;
          localStorage.setItem("operators", JSON.stringify(ops));
        }
        updateRequestCount();
        // notify users' ETA could change (best-effort)
        updateETAUI();
      }
    },
    err => { statusEl.textContent = "No se pudo obtener ubicación."; console.warn(err); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

/* Routing helpers */
async function geocodePlace(q) {
  const key = "geo:" + q;
  const cached = JSON.parse(localStorage.getItem(key) || "null");
  if (cached) return cached;
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&addressdetails=1`;
  const res = await fetch(url, { headers: { "Accept-Language": "es" } });
  const json = await res.json();
  const hit = json[0];
  if (!hit) throw new Error("No se pudo geocodificar: " + q);
  const coord = { lat: parseFloat(hit.lat), lng: parseFloat(hit.lon) };
  localStorage.setItem(key, JSON.stringify(coord));
  return coord;
}

async function routeLineWithStats(coords) {
  // Prefer OSRM for multi-waypoint driving
  const locs = coords.map(c => `${c.lng},${c.lat}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${locs}?overview=full&geometries=polyline&steps=false&annotations=distance,duration`;
  const res = await fetch(url);
  const data = await res.json();
  const r = data.routes?.[0];
  if (!r) throw new Error("Ruta no disponible.");
  const pts = polyline.decode(r.geometry).map(([lat,lng])=>[lat,lng]);
  return { points: pts, distance: r.distance, duration: r.duration };
}

/* Draw all routes as colored background polylines */
async function drawAllRoutes() {
  state.routeLayers.forEach(l => state.map.removeLayer(l));
  state.routeLayers.clear();
  for (const r of ROUTES) {
    try {
      const coords = r.waypoints.map(w => ({ lat: w.lat, lng: w.lng }));
      let full = [];
      for (let i = 1; i < coords.length; i++) {
        const seg = await routeLineWithStats([coords[i - 1], coords[i]]);
        full = full.concat(seg.points);
      }
      const layer = L.polyline(full, { color: r.color, weight: 4, opacity: 0.6 });
      layer.addTo(state.map);
      state.routeLayers.set(r.id, layer);
    } catch (e) { console.warn("Error dibujando ruta", r.name, e); }
  }
}

/* Draw selected route emphasized */
let selectedLayer = null, routeStatsCache = {};
async function getRouteStats(routeId){
  if (routeStatsCache[routeId]) return routeStatsCache[routeId];
  const r = ROUTES.find(x=>x.id===routeId); const coords = r.waypoints.map(w=>({lat:w.lat,lng:w.lng}));
  const stat = await routeLineWithStats(coords); routeStatsCache[routeId] = stat; return stat;
}
async function drawSelectedRoute(routeId, fit=false) {
  const r = ROUTES.find(x => x.id === routeId); if (!r) return;
  const coords = r.waypoints.map(w=>({lat:w.lat,lng:w.lng}));
  const { points, distance, duration } = await getRouteStats(routeId);
  if (selectedLayer) state.map.removeLayer(selectedLayer);
  selectedLayer = L.polyline(points, { color:"#1976D2", weight:5, opacity:1, dashArray:"2 12", lineCap:"round" }).addTo(state.map);
  // origin/destination markers
  if (originMarker) state.map.removeLayer(originMarker);
  if (destMarker) state.map.removeLayer(destMarker);
  originMarker = L.circleMarker([coords[0].lat, coords[0].lng], { radius:7, color:"#2e7d32", fillColor:"#43A047", fillOpacity:1 }).addTo(state.map).bindPopup("Origen");
  destMarker = L.circleMarker([coords[coords.length-1].lat, coords[coords.length-1].lng], { radius:7, color:"#1565c0", fillColor:"#1976D2", fillOpacity:1 }).addTo(state.map).bindPopup("Destino");
  // stats
  document.getElementById("routeStats").textContent = `Distancia total: ${(distance/1000).toFixed(1)} km | Tiempo total: ~${Math.max(1, Math.round(duration/60))} min`;
  if (fit) state.map.fitBounds(selectedLayer.getBounds(), { padding: [20,20] });
  // remove user-to-destination path drawing
}

/* Route selection change */
routeSelect.addEventListener("change", async e => {
  const rid = e.target.value;
  state.selectedRouteId = rid || null;
  statusEl.textContent = rid ? "Ruta seleccionada: " + ROUTES.find(r=>r.id===rid)?.name : "";
  if (rid) await drawSelectedRoute(rid, true);
  if (rid && state.role === "driver") renderRequestMarkers(rid);
  updateETAUI();
});

/* Requests handling */
function getRequests() {
  state.requests = JSON.parse(localStorage.getItem("requests") || "{}");
  return state.requests;
}
function setRequests(obj) {
  localStorage.setItem("requests", JSON.stringify(obj));
  state.requests = obj;
}

function updateRequestCount() {
  const reqs = getRequests();
  const count = reqs[state.session.routeId] || 0;
  requestCount.textContent = String(count);
}

/* Find nearest operator on route to user */
function findNearestOperator(routeId, userLatLng) {
  const ops = JSON.parse(localStorage.getItem("operators") || "{}")[routeId] || [];
  let best = null, bestD = Infinity;
  for (const o of ops) {
    if (o.lat == null || o.lng == null || o.active === false) continue;
    const d = haversine(userLatLng, { lat:o.lat, lng:o.lng });
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/* Request button */
requestBtn.addEventListener("click", async () => {
  const rid = state.selectedRouteId;
  if (!rid) { statusEl.textContent = "Selecciona una ruta primero."; return; }
  const reqs = getRequests();
  reqs[rid] = (reqs[rid] || 0) + 1;
  setRequests(reqs);
  statusEl.textContent = "Solicitud enviada. Buscando próxima unidad...";
  // show nearest operator marker popup
  let userPos = null;
  if (state.userMarker) {
    const ll = state.userMarker.getLatLng();
    userPos = { lat: ll.lat, lng: ll.lng };
  }
  const op = userPos ? findNearestOperator(rid, userPos) : null;
  if (op) {
    const marker = L.marker([op.lat, op.lng]).addTo(state.map).bindPopup(`Próxima unidad: ${op.unit} (${op.plate})`).openPopup();
    setTimeout(() => state.map.removeLayer(marker), 8000);
    statusEl.textContent = "Unidad localizada.";
    updateETAUI();
  } else {
    statusEl.textContent = "No hay unidades activas en esta ruta ahora.";
  }
  // persist detailed request with user location
  if (state.userMarker) {
    const ll = state.userMarker.getLatLng();
    const rr = getRouteRequests();
    rr[rid] = rr[rid] || [];
    rr[rid].push({ lat: ll.lat, lng: ll.lng, name: state.session?.name || "Usuario" });
    setRouteRequests(rr);
    // if a driver is viewing this route, refresh markers
    if (state.role === "driver" && state.session.routeId === rid) renderRequestMarkers(rid);
  }
});

/* Logout */
logoutBtn.addEventListener("click", () => {
  // clear session and forms
  localStorage.removeItem("session");
  authView.hidden = false;
  mapView.hidden = true;
  logoutBtn.hidden = true;
  driverPanel.hidden = true;
  userForm.reset();
  driverForm.reset();
  statusEl.textContent = "";
  if (watchId) navigator.geolocation.clearWatch(watchId);
  // note: keep operators and requests to simulate ongoing system
  userRegView.hidden = true; driverRegView.hidden = true; authView.hidden = false;
});

/* Accessibility: focus management */
routeSelect.addEventListener("change", () => requestBtn.focus());

/* Navigation to chat view */
chatNavBtn.addEventListener("click", (e) => {
  e.currentTarget.classList.add("pressed"); setTimeout(()=>e.currentTarget.classList.remove("pressed"),90);
  document.querySelector(".topbar").hidden = true;
  mapView.hidden = true; chatView.hidden = false; saveChat(); restoreChat(); setChatIntro();
});
backFromChat.addEventListener("click", (e) => {
  e.currentTarget.classList.add("pressed"); setTimeout(()=>e.currentTarget.classList.remove("pressed"),90);
  document.querySelector(".topbar").hidden = false;
  chatView.hidden = true; mapView.hidden = false; saveChat();
});

function setChatIntro(){
  const greetings = ["¡Buenos días!", "¡Hola!", "¡Qué gusto verte!", "¿A dónde vas hoy?", "Buen viaje", "Listo para salir", "Planifica tu ruta", "Estamos contigo"];
  const g = greetings[Math.floor(Math.random()*greetings.length)];
  const desc = "Asistente IA para rutas, horarios, costos y emergencias. Escribe tu consulta abajo.";
  const intro = document.getElementById("chatIntro");
  if (chatMessages.children.length === 0) { intro.innerHTML = `<div class="greet">${g}</div><div class="desc">${desc}</div>`; intro.style.display = "block"; }
  else { intro.style.display = "none"; }
}

/* store detailed user requests with location */
function getRouteRequests() {
  return JSON.parse(localStorage.getItem("route_requests") || "{}");
}
function setRouteRequests(obj) {
  localStorage.setItem("route_requests", JSON.stringify(obj));
}

/* render request markers for a route (driver view) */
function renderRequestMarkers(routeId) {
  // clear all previous request markers
  state.requestLayers.forEach(arr => arr.forEach(m => state.map.removeLayer(m)));
  state.requestLayers.clear();
  const reqs = getRouteRequests()[routeId] || [];
  const markers = reqs.map(req => L.marker([req.lat, req.lng], { icon: personIcon })
    .addTo(state.map).bindPopup(`Solicitud de ${req.name}`));
  state.requestLayers.set(routeId, markers);
  requestCount.textContent = String(reqs.length || 0);
}

function updateETAUI() {
  if (!state.selectedRouteId || !state.userMarker) { etaText.textContent = "ETA: --"; return; }
  const ll = state.userMarker.getLatLng();
  const eta = predictETA(state.selectedRouteId, { lat: ll.lat, lng: ll.lng });
  if (!eta) { etaText.textContent = "ETA: sin unidades"; return; }
  getRouteStats(state.selectedRouteId).then(stat=>{
    const distKm = (eta.meters/1000).toFixed(2);
    const totalKm = (stat.distance/1000).toFixed(1);
    const totalMin = Math.max(1, Math.round(stat.duration/60));
    etaText.textContent = `Unidad: ~${eta.minutes} min, ${distKm} km | Ruta: ${totalKm} km, ~${totalMin} min`;
  });
  // show operator marker to user with details
  if (eta.op) {
    if (opLiveMarker) state.map.removeLayer(opLiveMarker);
    const rName = ROUTES.find(r=>r.id===state.selectedRouteId)?.name || "--";
    opLiveMarker = L.marker([eta.op.lat, eta.op.lng], { icon: combiIcon })
      .addTo(state.map)
      .bindPopup(`Unidad ${eta.op.unit} • Placa ${eta.op.plate}<br>Ruta: ${rName}<br>Asientos: ${eta.op.seats ?? '--'}`)
      .openPopup();
  }
}

function pointToSegmentDistance(p, a, b) {
  const toXY = (c)=>({ x: c.lng, y: c.lat });
  const P=toXY(p), A=toXY(a), B=toXY(b);
  const ABx=B.x-A.x, ABy=B.y-A.y; const APx=P.x-A.x, APy=P.y-A.y;
  const t = Math.max(0, Math.min(1, (APx*ABx + APy*ABy)/(ABx*ABx + ABy*ABy || 1)));
  const cx=A.x + t*ABx, cy=A.y + t*ABy;
  return Math.hypot(P.x - cx, P.y - cy);
}

function distanceToRoute(routeId, point) {
  const layer = state.routeLayers.get(routeId);
  if (!layer) return Infinity;
  const ll = layer.getLatLngs();
  let best = Infinity;
  for (let i=1;i<ll.length;i++) {
    best = Math.min(best, pointToSegmentDistance(point, ll[i-1], ll[i]));
  }
  return best;
}

function distanceToRouteFromWaypoints(route, point){
  const w = route.waypoints; let best = Infinity;
  for(let i=1;i<w.length;i++){
    best = Math.min(best, pointToSegmentDistance(point, w[i-1], w[i]));
  }
  return best;
}

recommendBtn.addEventListener("click", async () => {
  const destLabel = destinationSelect.value.trim();
  if (!destLabel) { statusEl.textContent = "Selecciona destino."; return; }
  let userPos=null;
  if (state.userMarker) { const ll=state.userMarker.getLatLng(); userPos={lat:ll.lat,lng:ll.lng}; }
  if (!userPos) { statusEl.textContent = "Esperando tu ubicación..."; return; }
  const candidates = ROUTES.filter(r=>r.name.toLowerCase().includes(destLabel.toLowerCase()));
  if (!candidates.length){ statusEl.textContent="No hay rutas hacia ese destino."; return; }
  const ranked = candidates.map(r=>({ r, d: distanceToRouteFromWaypoints(r, userPos) })).sort((a,b)=>a.d-b.d);
  const best = ranked[0].r; routeSelect.value = best.id; state.selectedRouteId = best.id;
  await drawSelectedRoute(best.id, true); statusEl.textContent = `Ruta sugerida: ${best.name}`; updateETAUI();
});

function appendMsg(role, text){
  const el = document.createElement("div");
  el.textContent = text;
  el.className = role==="user" ? "msg user" : "msg bot";
  chatMessages.appendChild(el);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function sendChat(){
  const text = chatInput.value.trim(); if(!text) return;
  document.getElementById("chatIntro").style.display = "none";
  appendMsg("user", text); chatInput.value="";
  const ctx = { state, ROUTES, routeStatsCache };
  const reply = await smartReply(text, ctx);
  appendMsg("bot", reply);
}

function haversine(a, b) {
  const R = 6371e3, toRad = d=>d*Math.PI/180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(h)); // meters
}

function predictETA(routeId, userPos) {
  const op = userPos ? findNearestOperator(routeId, userPos) : null;
  if (!op) return null;
  const meters = haversine(userPos, { lat: op.lat, lng: op.lng });
  const avgSpeedKmh = 28;
  const minutes = Math.max(1, Math.round((meters/1000) / avgSpeedKmh * 60));
  return { minutes, meters, op };
}

function speakText(text){ const u = new SpeechSynthesisUtterance(text); u.lang="es-MX"; window.speechSynthesis.speak(u); }

function handleEmergency(){
  mapView.hidden = true; chatView.hidden = false;
  appendMsg("bot","Emergencia detectada. ¿Deseas compartir tu ubicación o ver números locales?");
  const btn = document.createElement("div");
  btn.className="msg bot";
  btn.innerHTML = "Opciones: <button class='secondary' id='shareLoc'>Compartir ubicación</button> <button class='secondary' id='localNum'>Ver número de emergencia</button>";
  chatMessages.appendChild(btn); chatMessages.scrollTop = chatMessages.scrollHeight;
  document.getElementById("shareLoc").onclick = async ()=>{
    try{ const p = await new Promise((res,rej)=>navigator.geolocation.getCurrentPosition(res,rej));
      const {latitude,longitude}=p.coords; const url=`https://maps.google.com/?q=${latitude},${longitude}`;
      appendMsg("bot",`Ubicación lista para compartir: ${url}`); saveChat();
    }catch{ appendMsg("bot","No se pudo obtener tu ubicación."); }
  };
  document.getElementById("localNum").onclick = ()=> appendMsg("bot","Emergencias: 911 | Protección Civil: 555-555-5555");
}

function saveChat(){ localStorage.setItem("chat_messages", chatMessages.innerHTML); }
function restoreChat(){ const html = localStorage.getItem("chat_messages"); if(html) chatMessages.innerHTML = html; }

sendChatBtn.addEventListener("click", sendChat);
sttBtn.addEventListener("click", startSTT);
ttsBtn.addEventListener("click", ()=> speakText(chatMessages.lastElementChild?.textContent||""));
emergencyBtn.addEventListener("click", handleEmergency);

function startSTT(){
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if(!SR){ appendMsg("bot","Tu navegador no soporta dictado de voz."); return; }
  const r = new SR(); r.lang="es-MX"; r.onresult=e=>{ chatInput.value = e.results[0][0].transcript; sendChat(); };
  r.onerror=()=>appendMsg("bot","Error de reconocimiento de voz."); r.start();
}

/* DB Keys */
const DB_KEYS = { users:"db_users", drivers:"db_drivers" };
const db = {
  read: (k)=> JSON.parse(localStorage.getItem(k)||"[]"),
  write: (k,v)=> localStorage.setItem(k, JSON.stringify(v))
};

/* init carousel */
function initCarousel(){
  const slides = document.querySelector("#heroCarousel .slides");
  const dots = Array.from(document.querySelectorAll("#heroCarousel .dot"));
  let i=0, n=dots.length; const go=(nIdx)=>{ i=nIdx; slides.style.transform=`translateX(-${i*100}%)`; dots.forEach((d,j)=>d.classList.toggle("active", j===i)); };
  dots.forEach(d=>d.addEventListener("click",()=>go(Number(d.dataset.i))));
  setInterval(()=>go((i+1)%n), 4000); go(0);
}
window.addEventListener("DOMContentLoaded", ()=>{
  initCarousel();
  document.getElementById("yearNow").textContent = new Date().getFullYear();
  setTimeout(()=>{ const s=document.getElementById("splash"); if(s) s.style.display="none"; }, 2000);
});

/* Chat suggestions */
document.getElementById("chatSuggestions").addEventListener("click",(e)=>{
  if (!e.target.classList.contains("chip")) return;
  const t = e.target.textContent.toLowerCase();
  if (t.includes("suburbano")) { chatInput.value="Costo y tiempo hacia Suburbano"; sendChat(); return; }
  if (t.includes("ánimas")) { chatInput.value="¿A qué hora pasa por Las Ánimas?"; sendChat(); return; }
  if (t.includes("cuesta")) { chatInput.value="Costo de Dorado a Quebrada"; sendChat(); return; }
});

// Draw user path to destination (disabled per requirements)
async function drawUserPathToDest(){
  return; // la ruta debe ir del punto inicial (verde) al destino (azul) pasando por waypoints
}

const driverRouteName = document.getElementById("driverRouteName");
const seatsAvailable = document.getElementById("seatsAvailable");
const updateSeatsBtn = document.getElementById("updateSeatsBtn");
const driverOnlineStatus = document.getElementById("driverOnlineStatus");
const toggleActiveBtn = document.getElementById("toggleActiveBtn");

function updateOperatorSeatsDisplay(){
  const ops = JSON.parse(localStorage.getItem("operators") || "{}");
  const r = state.session?.routeId; const me = ops[r]?.find(o=>o.id===state.session?.id);
  seatsAvailable.textContent = me?.seats ?? "--";
  updateOperatorStatusDisplay();
}

function updateOperatorStatusDisplay(){
  const ops = JSON.parse(localStorage.getItem("operators") || "{}");
  const r = state.session?.routeId; const me = ops[r]?.find(o=>o.id===state.session?.id);
  driverOnlineStatus.textContent = me?.active ? "Activo" : "Inactivo";
}

if (driverPanel) {
  updateSeatsBtn?.addEventListener("click", ()=>{
    const val = prompt("Ingresa asientos disponibles (número):", seatsAvailable.textContent || "0");
    const num = Math.max(0, Number(val||0));
    const ops = JSON.parse(localStorage.getItem("operators") || "{}");
    const r = state.session.routeId; const idx = ops[r]?.findIndex(o=>o.id===state.session.id);
    if (idx>=0){ ops[r][idx].seats = num; localStorage.setItem("operators", JSON.stringify(ops)); }
    updateOperatorSeatsDisplay(); updateETAUI();
  });
  toggleActiveBtn?.addEventListener("click", ()=>{
    const ops = JSON.parse(localStorage.getItem("operators") || "{}");
    const r = state.session.routeId; const idx = ops[r]?.findIndex(o=>o.id===state.session.id);
    if (idx>=0){ ops[r][idx].active = !(ops[r][idx].active ?? false); localStorage.setItem("operators", JSON.stringify(ops)); }
    updateOperatorStatusDisplay(); updateETAUI();
  });
}

const entities = {
  suburbano: "Suburbano de Cuautitlán",
  jilotepec: "Av. Jilotepec",
  dorado: "El Dorado",
  quebrada: "La Quebrada",
  animas: "Las Ánimas",
  teoloyucan: "Teoloyucan"
};

const opLiveMarker = null;