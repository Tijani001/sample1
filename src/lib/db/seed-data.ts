/**
 * Demonstration data for development. Every operator here is FICTIONAL and flagged `is_demo`; schedules,
 * fares, reviews and availability are illustrative only and are labelled as such in the interface.
 * Replace by onboarding real operators through the operator portal or an integration adapter.
 */

export const REGIONS: [id: string, name: string][] = [
  ["ng-la", "Lagos"], ["ng-fc", "Federal Capital Territory"], ["ng-kn", "Kano"], ["ng-oy", "Oyo"], ["ng-ri", "Rivers"],
  ["ng-en", "Enugu"], ["ng-kd", "Kaduna"], ["ng-pl", "Plateau"], ["ng-cr", "Cross River"], ["ng-ed", "Edo"],
  ["ng-ak", "Akwa Ibom"], ["ng-so", "Sokoto"], ["ng-im", "Imo"], ["ng-on", "Ondo"], ["ng-kw", "Kwara"], ["ng-og", "Ogun"],
  ["ng-an", "Anambra"], ["ng-de", "Delta"], ["ng-bo", "Borno"], ["ng-be", "Benue"], ["ng-ko", "Kogi"], ["ng-os", "Osun"],
  ["ng-ni", "Niger"], ["ng-ba", "Bauchi"],
];

export type SeedCity = { id: string; name: string; region: string; lat: number; lng: number; popularity: number; blurb: string };

export const CITIES: SeedCity[] = [
  { id: "lagos", name: "Lagos", region: "ng-la", lat: 6.5244, lng: 3.3792, popularity: 100, blurb: "Lagoons, beaches and the country's busiest creative scene." },
  { id: "abuja", name: "Abuja", region: "ng-fc", lat: 9.0765, lng: 7.3986, popularity: 95, blurb: "The planned capital beneath Aso Rock and Zuma Rock." },
  { id: "kano", name: "Kano", region: "ng-kn", lat: 12.0022, lng: 8.592, popularity: 80, blurb: "Ancient walls, dye pits and the great Kurmi market." },
  { id: "ibadan", name: "Ibadan", region: "ng-oy", lat: 7.3775, lng: 3.947, popularity: 85, blurb: "Brown rooftops, Cocoa House and Bower's Tower views." },
  { id: "port-harcourt", name: "Port Harcourt", region: "ng-ri", lat: 4.8156, lng: 7.0498, popularity: 82, blurb: "The Garden City on the Bonny River." },
  { id: "enugu", name: "Enugu", region: "ng-en", lat: 6.4584, lng: 7.5464, popularity: 78, blurb: "The Coal City, framed by the Udi hills." },
  { id: "kaduna", name: "Kaduna", region: "ng-kd", lat: 10.5105, lng: 7.4165, popularity: 70, blurb: "Riverside city on the Kaduna River." },
  { id: "jos", name: "Jos", region: "ng-pl", lat: 9.8965, lng: 8.8583, popularity: 68, blurb: "Cool plateau air, rock formations and the wildlife park." },
  { id: "calabar", name: "Calabar", region: "ng-cr", lat: 4.9757, lng: 8.3417, popularity: 72, blurb: "Tidy streets, Marina Resort and December carnival." },
  { id: "benin-city", name: "Benin City", region: "ng-ed", lat: 6.335, lng: 5.6037, popularity: 74, blurb: "Royal heritage, bronze casters and the Oba's palace." },
  { id: "uyo", name: "Uyo", region: "ng-ak", lat: 5.0377, lng: 7.9128, popularity: 60, blurb: "Calm, green and close to the Ibeno coast." },
  { id: "sokoto", name: "Sokoto", region: "ng-so", lat: 13.0059, lng: 5.2476, popularity: 50, blurb: "Seat of the Caliphate in the far north-west." },
  { id: "owerri", name: "Owerri", region: "ng-im", lat: 5.4836, lng: 7.0333, popularity: 62, blurb: "Lively Imo capital known for its hospitality." },
  { id: "akure", name: "Akure", region: "ng-on", lat: 7.2571, lng: 5.2058, popularity: 55, blurb: "Gateway to Idanre Hills and Ondo's forests." },
  { id: "ilorin", name: "Ilorin", region: "ng-kw", lat: 8.4966, lng: 4.5421, popularity: 56, blurb: "Where the South-West meets the North-Central." },
  { id: "abeokuta", name: "Abeokuta", region: "ng-og", lat: 7.1475, lng: 3.3619, popularity: 58, blurb: "Olumo Rock and adire textiles." },
  { id: "onitsha", name: "Onitsha", region: "ng-an", lat: 6.1413, lng: 6.8029, popularity: 60, blurb: "Commerce on the banks of the River Niger." },
  { id: "warri", name: "Warri", region: "ng-de", lat: 5.5544, lng: 5.7932, popularity: 57, blurb: "Oil city with an unmistakable sense of humour." },
  { id: "asaba", name: "Asaba", region: "ng-de", lat: 6.198, lng: 6.7319, popularity: 52, blurb: "Delta's capital, across the Niger Bridge from Onitsha." },
  { id: "maiduguri", name: "Maiduguri", region: "ng-bo", lat: 11.8311, lng: 13.151, popularity: 40, blurb: "The Home of Peace in the north-east." },
  { id: "makurdi", name: "Makurdi", region: "ng-be", lat: 7.7337, lng: 8.5214, popularity: 45, blurb: "Food Basket of the Nation on the Benue River." },
  { id: "lokoja", name: "Lokoja", region: "ng-ko", lat: 7.8023, lng: 6.7333, popularity: 44, blurb: "Confluence of the Niger and Benue rivers." },
  { id: "osogbo", name: "Osogbo", region: "ng-os", lat: 7.7827, lng: 4.5418, popularity: 46, blurb: "Osun Sacred Grove, a UNESCO World Heritage Site." },
  { id: "minna", name: "Minna", region: "ng-ni", lat: 9.6139, lng: 6.5569, popularity: 42, blurb: "Hilly Niger State capital near Gurara Falls." },
  { id: "bauchi", name: "Bauchi", region: "ng-ba", lat: 10.3158, lng: 9.8442, popularity: 41, blurb: "Gateway to Yankari Game Reserve and Wikki Warm Springs." },
];

/** Terminal locations per city: [suffix, name, address]. */
export const TERMINALS: Record<string, [string, string, string][]> = {
  lagos: [["jibowu", "Jibowu Terminal", "Ikorodu Road, Jibowu, Yaba, Lagos"], ["ojota", "Ojota Terminal", "Ojota Interchange, Ikorodu Road, Lagos"], ["ajah", "Ajah Terminal", "Lekki–Epe Expressway, Ajah, Lagos"]],
  abuja: [["utako", "Utako Terminal", "Obafemi Awolowo Way, Utako, Abuja"], ["jabi", "Jabi Terminal", "Jabi Motor Park, Jabi, Abuja"]],
  kano: [["naibawa", "Naibawa Terminal", "Zaria Road, Naibawa, Kano"], ["sabon-gari", "Sabon Gari Terminal", "Airport Road, Sabon Gari, Kano"]],
  ibadan: [["iwo-road", "Iwo Road Terminal", "Iwo Road Interchange, Ibadan"], ["challenge", "Challenge Terminal", "Ring Road, Challenge, Ibadan"]],
  "port-harcourt": [["waterlines", "Waterlines Terminal", "Aba Road, Waterlines, Port Harcourt"], ["mile-1", "Mile 1 Terminal", "Ikwerre Road, Mile 1, Port Harcourt"]],
  enugu: [["holy-ghost", "Holy Ghost Terminal", "Ogui Road, Holy Ghost, Enugu"], ["abakpa", "Abakpa Terminal", "Abakaliki Road, Abakpa Nike, Enugu"]],
  kaduna: [["kawo", "Kawo Terminal", "Ali Akilu Road, Kawo, Kaduna"], ["mando", "Mando Terminal", "Kaduna–Zaria Road, Mando, Kaduna"]],
  jos: [["bauchi-road", "Bauchi Road Terminal", "Bauchi Road, Jos"], ["terminus", "Terminus Terminal", "Ahmadu Bello Way, Terminus, Jos"]],
  calabar: [["marian", "Marian Road Terminal", "Marian Road, Calabar"]],
  "benin-city": [["ramat", "Ramat Park Terminal", "Benin–Agbor Road, Ramat Park, Benin City"], ["uselu", "Uselu Terminal", "Uselu–Lagos Road, Uselu, Benin City"]],
  uyo: [["itam", "Itam Terminal", "Itam Junction, Calabar–Itu Road, Uyo"]],
  sokoto: [["kara", "Kara Terminal", "Kano Road, Kara, Sokoto"]],
  owerri: [["wetheral", "Wetheral Road Terminal", "Wetheral Road, Owerri"]],
  akure: [["alagbaka", "Alagbaka Terminal", "Oba Adesida Road, Alagbaka, Akure"]],
  ilorin: [["post-office", "Post Office Terminal", "Ibrahim Taiwo Road, Ilorin"]],
  abeokuta: [["kuto", "Kuto Terminal", "Kuto Roundabout, Abeokuta"]],
  onitsha: [["upper-iweka", "Upper Iweka Terminal", "Upper Iweka Road, Onitsha"]],
  warri: [["effurun", "Effurun Terminal", "Effurun Roundabout, Warri"]],
  asaba: [["nnebisi", "Nnebisi Road Terminal", "Nnebisi Road, Asaba"]],
  maiduguri: [["muna", "Muna Terminal", "Muna Garage, Maiduguri"]],
  makurdi: [["wurukum", "Wurukum Terminal", "Wurukum Roundabout, Makurdi"]],
  lokoja: [["ganaja", "Ganaja Terminal", "Ganaja Junction, Lokoja"]],
  osogbo: [["old-garage", "Old Garage Terminal", "Old Garage, Gbongan Road, Osogbo"]],
  minna: [["kpakungu", "Kpakungu Terminal", "Kpakungu Roundabout, Minna"]],
  bauchi: [["wunti", "Wunti Terminal", "Wunti Market Road, Bauchi"]],
};

export type SeedOperator = {
  id: string; name: string; legal: string; color: string; initials: string; hq: string; description: string;
  seating: "assigned" | "open"; integration: "native" | "api" | "manual" | "import"; rating: number; ratingCount: number;
  founded: number; vehicles: { layout: string; type: string; model: string; amenities: string[]; count: number }[];
  policy: string;
};

export const OPERATORS: SeedOperator[] = [
  {
    id: "savannah-line", name: "Savannah Line", legal: "Savannah Line Transport Ltd (demo)", color: "#0F5C4D", initials: "SL", hq: "abuja",
    description: "Comfortable 18-seater buses and executive coaches connecting Abuja with the North and South-West.",
    seating: "assigned", integration: "native", rating: 4.6, ratingCount: 1284, founded: 2009, policy: "standard",
    vehicles: [
      { layout: "bus-18", type: "bus-18", model: "Toyota HiAce (18 seats)", amenities: ["ac", "charging", "reclining"], count: 3 },
      { layout: "coach-exec-36", type: "coach-exec", model: "Yutong ZK6122 Executive", amenities: ["ac", "wifi", "charging", "reclining", "legroom", "entertainment", "refreshments"], count: 2 },
    ],
  },
  {
    id: "atlantic-coaches", name: "Atlantic Coaches", legal: "Atlantic Coaches Nigeria Ltd (demo)", color: "#1E3A8A", initials: "AC", hq: "lagos",
    description: "Long-distance executive coaches with 2+1 seating, Wi-Fi and on-board refreshments.",
    seating: "assigned", integration: "api", rating: 4.7, ratingCount: 2210, founded: 2004, policy: "flexible",
    vehicles: [
      { layout: "coach-exec-36", type: "coach-exec", model: "Marcopolo Paradiso Executive", amenities: ["ac", "wifi", "charging", "reclining", "legroom", "entertainment", "refreshments"], count: 3 },
      { layout: "coach-std-44", type: "coach-std", model: "Higer KLQ6129 Standard", amenities: ["ac", "charging", "reclining"], count: 2 },
    ],
  },
  {
    id: "greenway-motors", name: "Greenway Motors", legal: "Greenway Motors Ltd (demo)", color: "#15803D", initials: "GM", hq: "ibadan",
    description: "Frequent 14-seater departures across the South-West.",
    seating: "assigned", integration: "native", rating: 4.3, ratingCount: 864, founded: 2014, policy: "standard",
    vehicles: [
      { layout: "bus-14", type: "bus-14", model: "Toyota HiAce (14 seats)", amenities: ["ac"], count: 4 },
      { layout: "bus-14", type: "bus-14", model: "Toyota HiAce (14 seats, non-AC)", amenities: [], count: 1 },
    ],
  },
  {
    id: "delta-star", name: "Delta Star Express", legal: "Delta Star Express Ltd (demo)", color: "#9A3412", initials: "DS", hq: "benin-city",
    description: "South-South specialists with comfortable 18-seater buses.",
    seating: "assigned", integration: "native", rating: 4.4, ratingCount: 1032, founded: 2011, policy: "standard",
    vehicles: [{ layout: "bus-18", type: "bus-18", model: "Toyota HiAce (18 seats)", amenities: ["ac", "charging"], count: 3 }],
  },
  {
    id: "harmattan-transit", name: "Harmattan Transit", legal: "Harmattan Transit Co. (demo)", color: "#B45309", initials: "HT", hq: "kano",
    description: "Affordable 30-seater buses linking Kano, Kaduna, Sokoto and the North-East.",
    seating: "assigned", integration: "manual", rating: 4.2, ratingCount: 642, founded: 2012, policy: "strict",
    vehicles: [{ layout: "bus-30", type: "bus-30", model: "Toyota Coaster (30 seats)", amenities: ["ac", "reclining"], count: 3 }],
  },
  {
    id: "lagoon-shuttle", name: "Lagoon Shuttle", legal: "Lagoon Shuttle Services (demo)", color: "#0E7490", initials: "LS", hq: "lagos",
    description: "Private-car and minivan rides for short intercity trips around Lagos.",
    seating: "assigned", integration: "native", rating: 4.5, ratingCount: 388, founded: 2019, policy: "flexible",
    vehicles: [
      { layout: "minivan-7", type: "minivan-7", model: "Toyota Sienna (7 seats)", amenities: ["ac", "charging"], count: 2 },
      { layout: "car-4", type: "car-4", model: "Toyota Corolla (4 seats)", amenities: ["ac", "charging"], count: 2 },
    ],
  },
  {
    id: "eastlink-comfort", name: "Eastlink Comfort", legal: "Eastlink Comfort Travels Ltd (demo)", color: "#6D28D9", initials: "EC", hq: "enugu",
    description: "South-East routes with 14-seater buses and Lagos-bound coaches.",
    seating: "assigned", integration: "api", rating: 4.5, ratingCount: 1157, founded: 2008, policy: "standard",
    vehicles: [
      { layout: "bus-14", type: "bus-14", model: "Toyota HiAce (14 seats)", amenities: ["ac", "charging"], count: 3 },
      { layout: "coach-std-44", type: "coach-std", model: "Yutong ZK6107 Standard", amenities: ["ac", "charging", "reclining", "refreshments"], count: 2 },
    ],
  },
  {
    id: "plateau-riders", name: "Plateau Riders", legal: "Plateau Riders Cooperative (demo)", color: "#B91C1C", initials: "PR", hq: "jos",
    description: "Cooperative buses across the Middle Belt. Seats are allocated at boarding.",
    seating: "open", integration: "manual", rating: 4.1, ratingCount: 296, founded: 2016, policy: "strict",
    vehicles: [{ layout: "bus-18", type: "bus-18", model: "Toyota HiAce (18 seats)", amenities: [], count: 3 }],
  },
  {
    id: "crossriver-express", name: "Crossriver Express", legal: "Crossriver Express Ltd (demo)", color: "#0369A1", initials: "CE", hq: "calabar",
    description: "Six-seater SUVs between Calabar, Uyo and Port Harcourt.",
    seating: "assigned", integration: "native", rating: 4.4, ratingCount: 241, founded: 2018, policy: "flexible",
    vehicles: [{ layout: "suv-6", type: "suv-6", model: "Toyota Highlander (6 seats)", amenities: ["ac", "charging", "legroom"], count: 2 }],
  },
];

export const POLICIES = [
  { id: "flexible", name: "Flexible", summary: "Free cancellation up to 24 hours before departure.", rules: [{ hours_before: 24, refund_pct: 100 }, { hours_before: 6, refund_pct: 50 }], allows_reschedule: true, reschedule_fee: 0, refundable: true },
  { id: "standard", name: "Standard", summary: "90% refund up to 24 hours before departure, 50% up to 6 hours.", rules: [{ hours_before: 24, refund_pct: 90 }, { hours_before: 6, refund_pct: 50 }], allows_reschedule: true, reschedule_fee: 100000, refundable: true },
  { id: "strict", name: "Non-refundable", summary: "Non-refundable. Rescheduling allowed up to 24 hours before departure for a fee.", rules: [], allows_reschedule: true, reschedule_fee: 150000, refundable: false },
];

/**
 * City pairs. Each pair is seeded in both directions. [origin, destination, km, minutes, operators, via]
 * via: intermediate stops as [name, cityId|null, fraction of journey, kind]
 */
export type Pair = {
  a: string; b: string; km: number; min: number; ops: string[];
  via?: [string, string | null, number, "rest" | "pickup"][];
};

export const PAIRS: Pair[] = [
  { a: "abuja", b: "lagos", km: 760, min: 630, ops: ["savannah-line", "atlantic-coaches", "eastlink-comfort"], via: [["Lokoja rest stop", "lokoja", 0.22, "rest"], ["Benin City", "benin-city", 0.55, "pickup"], ["Ore service area", null, 0.75, "rest"]] },
  { a: "lagos", b: "ibadan", km: 130, min: 135, ops: ["greenway-motors", "lagoon-shuttle", "atlantic-coaches"] },
  { a: "abuja", b: "kano", km: 430, min: 330, ops: ["savannah-line", "harmattan-transit"], via: [["Kaduna", "kaduna", 0.45, "pickup"]] },
  { a: "lagos", b: "benin-city", km: 320, min: 300, ops: ["delta-star", "atlantic-coaches", "greenway-motors"], via: [["Ore service area", null, 0.55, "rest"]] },
  { a: "abuja", b: "kaduna", km: 190, min: 165, ops: ["savannah-line", "harmattan-transit", "plateau-riders"] },
  { a: "port-harcourt", b: "enugu", km: 270, min: 255, ops: ["eastlink-comfort", "delta-star"] },
  { a: "lagos", b: "akure", km: 310, min: 300, ops: ["greenway-motors", "atlantic-coaches"] },
  { a: "abuja", b: "jos", km: 300, min: 270, ops: ["plateau-riders", "savannah-line"] },
  { a: "kano", b: "kaduna", km: 240, min: 195, ops: ["harmattan-transit", "savannah-line"] },
  { a: "enugu", b: "owerri", km: 150, min: 150, ops: ["eastlink-comfort"] },
  { a: "lagos", b: "abeokuta", km: 80, min: 105, ops: ["greenway-motors", "lagoon-shuttle"] },
  { a: "lagos", b: "ilorin", km: 300, min: 285, ops: ["greenway-motors", "savannah-line"], via: [["Ogbomoso rest stop", null, 0.7, "rest"]] },
  { a: "lagos", b: "port-harcourt", km: 620, min: 600, ops: ["atlantic-coaches", "delta-star", "eastlink-comfort"], via: [["Benin City", "benin-city", 0.48, "pickup"], ["Asaba", "asaba", 0.66, "rest"]] },
  { a: "lagos", b: "enugu", km: 560, min: 540, ops: ["eastlink-comfort", "atlantic-coaches"], via: [["Benin City", "benin-city", 0.52, "rest"], ["Onitsha", "onitsha", 0.82, "pickup"]] },
  { a: "lagos", b: "owerri", km: 520, min: 525, ops: ["eastlink-comfort", "delta-star"], via: [["Benin City", "benin-city", 0.55, "rest"]] },
  { a: "lagos", b: "onitsha", km: 460, min: 450, ops: ["eastlink-comfort", "delta-star"], via: [["Benin City", "benin-city", 0.62, "rest"]] },
  { a: "lagos", b: "warri", km: 430, min: 420, ops: ["delta-star", "atlantic-coaches"], via: [["Ore service area", null, 0.45, "rest"]] },
  { a: "abuja", b: "enugu", km: 480, min: 420, ops: ["eastlink-comfort", "savannah-line"], via: [["Lokoja rest stop", "lokoja", 0.35, "rest"]] },
  { a: "abuja", b: "port-harcourt", km: 680, min: 600, ops: ["eastlink-comfort", "atlantic-coaches"], via: [["Lokoja rest stop", "lokoja", 0.25, "rest"], ["Enugu", "enugu", 0.6, "pickup"]] },
  { a: "abuja", b: "benin-city", km: 480, min: 435, ops: ["delta-star", "savannah-line"], via: [["Lokoja rest stop", "lokoja", 0.38, "rest"]] },
  { a: "abuja", b: "makurdi", km: 290, min: 270, ops: ["plateau-riders"] },
  { a: "abuja", b: "lokoja", km: 200, min: 180, ops: ["savannah-line", "plateau-riders"] },
  { a: "abuja", b: "minna", km: 150, min: 150, ops: ["plateau-riders", "savannah-line"] },
  { a: "abuja", b: "ilorin", km: 500, min: 465, ops: ["savannah-line"] },
  { a: "port-harcourt", b: "uyo", km: 140, min: 165, ops: ["crossriver-express", "eastlink-comfort"] },
  { a: "port-harcourt", b: "calabar", km: 230, min: 225, ops: ["crossriver-express", "eastlink-comfort"], via: [["Uyo", "uyo", 0.55, "pickup"]] },
  { a: "uyo", b: "calabar", km: 120, min: 120, ops: ["crossriver-express"] },
  { a: "benin-city", b: "asaba", km: 140, min: 135, ops: ["delta-star"] },
  { a: "benin-city", b: "warri", km: 105, min: 110, ops: ["delta-star"] },
  { a: "kano", b: "sokoto", km: 450, min: 390, ops: ["harmattan-transit"] },
  { a: "kaduna", b: "jos", km: 270, min: 255, ops: ["plateau-riders", "harmattan-transit"] },
  { a: "ibadan", b: "osogbo", km: 90, min: 105, ops: ["greenway-motors"] },
  { a: "ibadan", b: "ilorin", km: 160, min: 165, ops: ["greenway-motors", "savannah-line"] },
  { a: "enugu", b: "onitsha", km: 100, min: 110, ops: ["eastlink-comfort"] },
  { a: "kano", b: "maiduguri", km: 600, min: 510, ops: ["harmattan-transit"], via: [["Potiskum rest stop", null, 0.55, "rest"]] },
  { a: "jos", b: "bauchi", km: 120, min: 135, ops: ["plateau-riders"] },
];

/** Fare rate per km (kobo) by layout, roughly reflecting 2026 intercity prices. Illustrative only. */
export const RATE_PER_KM: Record<string, number> = {
  "car-4": 9000, "suv-6": 8000, "minivan-7": 7000, "bus-14": 4800, "bus-18": 5000, "bus-30": 4200, "coach-std-44": 5400, "coach-exec-36": 6800,
};
export const SPEED_FACTOR: Record<string, number> = {
  "car-4": 0.86, "suv-6": 0.9, "minivan-7": 0.9, "bus-14": 0.97, "bus-18": 1, "bus-30": 1.06, "coach-std-44": 1.04, "coach-exec-36": 1,
};

export const DEMO_REVIEWS: [rating: number, comment: string, author: string][] = [
  [5, "Left on time and the driver was careful the whole way. Seat number on the ticket made boarding easy.", "Chiamaka O."],
  [4, "Bus was clean and the AC worked. We stopped a little longer than planned at the rest stop.", "Ibrahim S."],
  [5, "Very smooth boarding with the QR code. Arrived about 20 minutes early.", "Tolu A."],
  [3, "Comfortable seats but departure was 40 minutes late. They did send an update though.", "Emeka N."],
  [4, "Good value for the price. Charging port at my seat was handy.", "Halima B."],
  [5, "Staff were polite and helped with my luggage. Would book again.", "Segun F."],
  [4, "Clean vehicle and courteous driver. Wi-Fi was patchy outside the cities.", "Aisha M."],
  [2, "The vehicle was fine but the terminal was crowded and signage was poor.", "David K."],
  [5, "Booked for my mum and could see her ticket and journey status from my phone.", "Ngozi E."],
  [4, "Easy trip. Refreshments were a nice touch.", "Musa Y."],
];

export const DEMO_PROMOTIONS = [
  { code: "FIRSTTRIP", title: "10% off your first trip", description: "New to Goroada? Take 10% off the fare on your first booking.", kind: "percent", value: 10, max_discount: 250000, min_subtotal: 500000, days: [-30, 120], first_booking_only: true, category: "first_booking", per_user_limit: 1, usage_limit: null as number | null, origin: null as string | null, destination: null as string | null, operator: null as string | null },
  { code: "HARMATTAN8", title: "Harmattan holiday saver", description: "8% off fares for festive-season travel booked on Goroada.", kind: "percent", value: 8, max_discount: 400000, min_subtotal: 1500000, days: [-5, 60], first_booking_only: false, category: "seasonal", per_user_limit: 2, usage_limit: 5000, origin: null, destination: null, operator: null },
  { code: "LAGIBA1K", title: "₦1,000 off Lagos → Ibadan", description: "Save ₦1,000 on any Lagos to Ibadan departure.", kind: "fixed", value: 100000, max_discount: null, min_subtotal: 400000, days: [-10, 45], first_booking_only: false, category: "route", per_user_limit: 3, usage_limit: 2000, origin: "lagos", destination: "ibadan", operator: null },
  { code: "SAVANNAH5", title: "5% off Savannah Line", description: "Savannah Line is offering 5% off all of its departures booked on Goroada.", kind: "percent", value: 5, max_discount: 300000, min_subtotal: 0, days: [-3, 30], first_booking_only: false, category: "operator", per_user_limit: 2, usage_limit: null, origin: null, destination: null, operator: "savannah-line" },
  { code: "RAINY2026", title: "Rainy season saver", description: "Expired promotion kept for testing expiry handling.", kind: "percent", value: 12, max_discount: 300000, min_subtotal: 0, days: [-120, -20], first_booking_only: false, category: "seasonal", per_user_limit: 1, usage_limit: null, origin: null, destination: null, operator: null },
] as const;

export const DEMO_PASSWORD = "goroada-demo";
export const DEMO_USERS = [
  { email: "traveller@demo.goroada.app", name: "Adaeze Okafor", phone: "+2348030000001", kind: "traveller" as const },
  { email: "operator@demo.goroada.app", name: "Yusuf Bello", phone: "+2348030000002", kind: "operator" as const, operator: "savannah-line" },
  { email: "admin@demo.goroada.app", name: "Funmi Adeyemi", phone: "+2348030000003", kind: "admin" as const, roles: ["super_admin"] },
  { email: "finance@demo.goroada.app", name: "Kelechi Uba", phone: "+2348030000004", kind: "admin" as const, roles: ["finance_manager"] },
  { email: "support@demo.goroada.app", name: "Zainab Lawal", phone: "+2348030000005", kind: "admin" as const, roles: ["support_agent"] },
];
