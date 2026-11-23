#!/usr/bin/env node
// Power-Up Kit — meta-schema
//
// Reads, checks and writes page titles, meta descriptions, Open Graph / Twitter tags and
// JSON-LD structured data (schema.org).
//
// Usage:
//   node meta-schema.mjs scan <url | file.html | folder>... [--sitemap] [--max 50]
//        [--out report.json] [--draft proposals.json] [--base-url https://site.com/]
//        [--concurrency 3] [--delay 250]
//   node meta-schema.mjs check <proposals.json> [--snippets snippets.html]
//        [--out report.json] [--compare scan-report.json]
//   node meta-schema.mjs width "<text>"... [--font-size 20]
//
// scan   What each page has now: title, meta description, canonical, robots, H1, og:*,
//        twitter:* and every JSON-LD block (parsed and validated). --sitemap treats the first
//        argument as a website and scans the URLs in its sitemap (robots.txt Sitemap: lines,
//        else /sitemap.xml), up to --max pages. Local HTML files and folders work too.
//        --draft writes the current values as a starting proposals.json.
// check  Validates proposed titles, descriptions, social tags and schema, and writes one
//        paste-ready <head> fragment per page. Exit code 1 if any page fails.
// width  Estimated pixel width of text in Arial (Google shows titles at about 20px Arial and
//        descriptions at about 14px). Always an estimate, never a measurement.
//
// Prints a short JSON summary; the full data goes to --out (default under .powerup/reports/).
// Only scan sites you own or have permission to check. Respects robots.txt.

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  USER_AGENT, VERSION, analyzeHtml, fail, fetchWithRedirects, isSameSite, isoDate, loadSitemapUrls,
  mapLimit, normalizeUrl, openingTags, parseArgs, parseRobots, printJson, robotsAllows, siteKey, slugify, toInt,
} from './powerup-lib.mjs';

const TOOL = 'power-up-kit/meta-schema';
const USAGE = `Usage:
  node meta-schema.mjs scan <url | file.html | folder>... [--sitemap] [--max 50] [--out report.json] [--draft proposals.json] [--base-url URL]
  node meta-schema.mjs check <proposals.json> [--snippets snippets.html] [--out report.json] [--compare scan-report.json]
  node meta-schema.mjs width "<text>"... [--font-size 20]`;

// Google shows titles in ~20px Arial and cuts them by width (~600 px); descriptions ~14px Arial.
const LIMITS = {
  title: { min: 30, max: 60, px: 580, font: 20 },
  description: { min: 70, max: 160, px: 920, font: 14 },
  headline: 110,
};
const ORDER = { fail: 0, warn: 1, info: 2, pass: 3 };

// ===========================================================================
// 1. Text width (estimate). Arial advance widths per 1000 em for ASCII 32–126.
// ===========================================================================
const ARIAL_ASCII = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, //  !"#$%&'()*+,-./
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, // 0-9 :;<=>?
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, // @A-O
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, // P-Z [\]^_
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, // `a-o
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, //      p-z {|}~
];
const ARIAL_EXTRA = {
  ' ': 278, '–': 556, '—': 1000, '‘': 222, '’': 222, '‚': 222, '“': 333, '”': 333, '„': 333,
  '…': 1000, '•': 350, '·': 278, '€': 556, '£': 556, '¥': 556, '¢': 556, '©': 737, '®': 737, '™': 1000,
  '«': 556, '»': 556, '‹': 333, '›': 333, '°': 400, '×': 584, '÷': 584, '±': 584, '§': 556, '¶': 537,
  '¡': 333, '¿': 611, 'ß': 611, 'æ': 889, 'Æ': 1000, 'ø': 611, 'Ø': 778, 'œ': 944, 'Œ': 1000,
  'ð': 556, 'Ð': 722, 'þ': 556, 'Þ': 667, 'ł': 222, 'Ł': 556, 'ı': 278, '½': 834, '¼': 834, '¾': 834,
  '†': 556, '‡': 556, '′': 191, '″': 355,
};
const AVERAGE_UNITS = 550; // fallback for characters not in the table
// East Asian wide characters (CJK, kana, Hangul, full-width forms): one full em, count as 2 for length.
const WIDE_RE = /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]|[\u{20000}-\u{3fffd}]/u;
const INDIC_THAI_RE = /[\p{Script=Devanagari}\p{Script=Bengali}\p{Script=Gurmukhi}\p{Script=Gujarati}\p{Script=Tamil}\p{Script=Telugu}\p{Script=Kannada}\p{Script=Malayalam}\p{Script=Thai}]/u;

function charUnits(ch) {
  const code = ch.codePointAt(0);
  if (code >= 32 && code <= 126) return ARIAL_ASCII[code - 32];
  if (code === 9 || code === 10 || code === 13) return 278; // whitespace shows as a space
  if (ARIAL_EXTRA[ch] !== undefined) return ARIAL_EXTRA[ch];
  if (code < 32 || /[\p{M}​-‏⁠﻿]/u.test(ch)) return 0; // marks, zero-width
  const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
  if (base.length === 1 && base !== ch) return charUnits(base); // é → e
  if (WIDE_RE.test(ch)) return 1000;
  if (/\p{Extended_Pictographic}/u.test(ch)) return 1000; // emoji
  if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(ch)) return 500;
  if (INDIC_THAI_RE.test(ch)) return 600;
  if (/\p{Lu}/u.test(ch)) return 680;
  return AVERAGE_UNITS;
}

/** { chars, displayChars (wide characters count 2), px } — px is an estimate. */
function measureText(text, fontPx) {
  let units = 0;
  let chars = 0;
  let displayChars = 0;
  for (const ch of String(text ?? '')) {
    const u = charUnits(ch);
    units += u;
    if (u === 0) continue;
    chars++;
    displayChars += WIDE_RE.test(ch) ? 2 : 1;
  }
  return { chars, displayChars, px: Math.round((units / 1000) * fontPx) };
}

/** Cut text to fit maxPx (estimate) and add an ellipsis, like Google does. */
function fitWidth(text, maxPx, fontPx) {
  const s = String(text ?? '');
  if (measureText(s, fontPx).px <= maxPx) return s;
  const ellipsis = (1278 / 1000) * fontPx; // " …"
  let out = '';
  let units = 0;
  for (const ch of s) {
    const u = charUnits(ch);
    if (((units + u) / 1000) * fontPx + ellipsis > maxPx) break;
    units += u;
    out += ch;
  }
  return `${out.trimEnd()} …`;
}

// ===========================================================================
// 2. Text and URL helpers
// ===========================================================================
const PLACEHOLDERS = [
  [/lorem ipsum|\blorem\b/i, 'lorem ipsum'],
  [/\bTODO\b/, 'TODO'],
  [/\bTBD\b/, 'TBD'],
  [/\{\{/, '{{ … }}'],
  [/\[your\b/i, '[Your …]'],
  [/\[insert\b/i, '[Insert …]'],
  [/\bexample\.(?:com|org|net)\b/i, 'example.com'],
];
function findPlaceholder(s) {
  if (typeof s !== 'string') return null;
  for (const [re, label] of PLACEHOLDERS) if (re.test(s)) return label;
  return null;
}

/** "BEST CAKES IN DUBAI" — at least two long words, and half of them, in capitals. */
function isShouting(text) {
  const words = String(text).match(/\p{L}{4,}/gu) || [];
  const caps = words.filter((w) => w === w.toUpperCase() && w !== w.toLowerCase());
  return caps.length >= 2 && caps.length / words.length >= 0.5;
}

const STOP_WORDS = new Set('the and for with your you our are from that this best near more what how why who all its was has have will can new get one into about only also than then them they their out not but'.split(' '));
/** Words (3+ letters, not stop words) used `min` or more times. */
function repeatedWords(text, min) {
  const counts = new Map();
  for (const w of String(text).toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || []) {
    if (STOP_WORDS.has(w)) continue;
    counts.set(w, (counts.get(w) || 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= min).map(([w, n]) => `"${w}" ×${n}`).sort();
}

function isLocalHost(host) {
  return /^(localhost|127(\.\d+){3}|0\.0\.0\.0|\[::1\])$/i.test(host) || /\.(localhost|test|local)$/i.test(host);
}

/** null when fine; otherwise 'empty' | 'relative' | 'not-web' | 'http'. Local hosts may use http. */
function urlProblem(value) {
  if (typeof value !== 'string' || !value.trim()) return 'empty';
  let u;
  try {
    u = new URL(value.trim());
  } catch {
    return 'relative';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'not-web';
  if (u.protocol === 'http:' && !isLocalHost(u.hostname)) return 'http';
  return null;
}
const URL_PROBLEM_TEXT = {
  relative: 'is not a full URL — it must start with https://',
  'not-web': 'is not a web address (http/https)',
  http: 'uses http:// — use the https:// address',
  empty: 'is empty',
};

const asArray = (v) => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);
const first = (v) => asArray(v)[0];
const norm = (s) => String(s ?? '').toLowerCase().replace(/&amp;|&/g, ' and ').replace(/\s+/g, ' ').trim();
const short = (s, n = 90) => {
  const t = String(s ?? '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};
function hasValue(obj, prop) {
  if (!obj || typeof obj !== 'object') return false;
  const v = obj[prop];
  if (v === undefined || v === null) return false;
  if (typeof v === 'string') return v.trim() !== '';
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

// ===========================================================================
// 3. Structured data rules — ONE table. Checked against Google Search Central
//    structured-data docs on 2026-11-20 (see reference/schema-guide.md).
//    required → fail · oneOf → fail if none · requiredTopLevel → fail unless nested
//    recommended → warn (top-level nodes only, unless recommendNested)
//    source 'schema.org' = Google has no rich result for this type; schema.org good practice.
// ===========================================================================
const GOOGLE_DOCS = 'https://developers.google.com/search/docs/appearance/';
const SCHEMA_RULES = {
  Organization: { source: 'google', doc: 'structured-data/organization', required: [], recommended: ['name', 'url', 'logo'] },
  LocalBusiness: { source: 'google', doc: 'structured-data/local-business', required: ['name', 'address'], recommended: ['telephone', 'url', 'openingHoursSpecification', 'geo', 'priceRange'] },
  WebSite: { source: 'google', doc: 'site-names', required: ['name', 'url'], recommended: [] },
  WebPage: { source: 'schema.org', required: [], recommended: [] },
  ProfilePage: { source: 'google', doc: 'structured-data/profile-page', required: ['mainEntity'], recommended: [] },
  Article: { source: 'google', doc: 'structured-data/article', required: [], recommended: ['headline', 'image', 'datePublished', 'author'] },
  Product: { source: 'google', doc: 'structured-data/product-snippet', required: ['name'], oneOf: [['offers', 'review', 'aggregateRating']], recommended: ['image', 'description'] },
  Offer: { source: 'google', doc: 'structured-data/merchant-listing', required: ['price', 'priceCurrency'], recommended: ['availability'], recommendNested: true, strictParents: ['Product'] },
  AggregateOffer: { source: 'google', doc: 'structured-data/product-snippet', required: ['lowPrice', 'priceCurrency'], recommended: ['highPrice'], recommendNested: true, strictParents: ['Product'] },
  Service: { source: 'schema.org', required: ['name'], recommended: ['description', 'provider', 'areaServed'] },
  FAQPage: { source: 'schema.org', required: ['mainEntity'], recommended: [] }, // Google retired FAQ rich results (May 2026)
  BreadcrumbList: { source: 'google', doc: 'structured-data/breadcrumb', required: ['itemListElement'], recommended: [] },
  Event: { source: 'google', doc: 'structured-data/event', required: ['name', 'startDate', 'location'], recommended: ['description', 'endDate', 'eventStatus', 'image', 'offers', 'organizer'] },
  Person: { source: 'google', doc: 'structured-data/profile-page', required: ['name'], recommended: ['url', 'image', 'sameAs'] },
  Review: { source: 'google', doc: 'structured-data/review-snippet', required: ['author', 'reviewRating'], requiredTopLevel: ['itemReviewed'], recommended: ['datePublished'] },
  AggregateRating: { source: 'google', doc: 'structured-data/review-snippet', required: ['ratingValue'], oneOf: [['ratingCount', 'reviewCount']], requiredTopLevel: ['itemReviewed'], recommended: ['bestRating'] },
  VideoObject: { source: 'google', doc: 'structured-data/video', required: ['name', 'thumbnailUrl', 'uploadDate'], recommended: ['description', 'contentUrl', 'embedUrl', 'duration'] },
  Recipe: { source: 'google', doc: 'structured-data/recipe', required: ['name', 'image'], recommended: ['author', 'datePublished', 'description', 'recipeIngredient', 'recipeInstructions', 'recipeYield', 'totalTime'] },
  JobPosting: { source: 'google', doc: 'structured-data/job-posting', required: ['title', 'description', 'datePosted', 'hiringOrganization', 'jobLocation'], recommended: ['validThrough', 'employmentType', 'baseSalary'] },
};
// Other ways to give a property that count as "present".
const ALTERNATIVES = {
  price: (n) => hasValue(first(n.priceSpecification), 'price'),
  priceCurrency: (n) => hasValue(first(n.priceSpecification), 'priceCurrency'),
  openingHoursSpecification: (n) => hasValue(n, 'openingHours'),
  jobLocation: (n) => /TELECOMMUTE/i.test(String(n.jobLocationType || '')),
};
const FIX_HINTS = {
  address: 'Add a PostalAddress (streetAddress, addressLocality, addressCountry) exactly as the page shows it.',
  offers: 'Add "offers" with the real price and currency shown on the page. Never invent a price — if there is none, use a Service or leave the Product out.',
  price: 'Add the price shown on the page as a number (e.g. "45.00"). Never invent one.',
  priceCurrency: 'Add a 3-letter currency code such as "AED", "USD" or "EUR".',
  location: 'Add a Place with the venue name and its PostalAddress.',
  itemReviewed: 'Say what is being reviewed (itemReviewed with a name), or nest the review inside that item.',
};

const TYPE_ALIASES = {
  BlogPosting: 'Article', NewsArticle: 'Article', AnalysisNewsArticle: 'Article', OpinionNewsArticle: 'Article', ReportageNewsArticle: 'Article', ReviewNewsArticle: 'Article', BackgroundNewsArticle: 'Article', TechArticle: 'Article', ScholarlyArticle: 'Article', Report: 'Article', SocialMediaPosting: 'Article', LiveBlogPosting: 'Article',
  Corporation: 'Organization', NGO: 'Organization', OnlineStore: 'Organization', OnlineBusiness: 'Organization', EducationalOrganization: 'Organization', CollegeOrUniversity: 'Organization', School: 'Organization', Preschool: 'Organization', ElementarySchool: 'Organization', MiddleSchool: 'Organization', HighSchool: 'Organization', MedicalOrganization: 'Organization', NewsMediaOrganization: 'Organization', SportsOrganization: 'Organization', SportsTeam: 'Organization', PerformingGroup: 'Organization', MusicGroup: 'Organization', DanceGroup: 'Organization', TheaterGroup: 'Organization', GovernmentOrganization: 'Organization', Airline: 'Organization', Consortium: 'Organization', Cooperative: 'Organization', FundingScheme: 'Organization', LibrarySystem: 'Organization', PoliticalParty: 'Organization', ResearchOrganization: 'Organization', SearchRescueOrganization: 'Organization', WorkersUnion: 'Organization',
  OfferForPurchase: 'Offer', OfferForLease: 'Offer',
  IndividualProduct: 'Product', ProductModel: 'Product', SomeProducts: 'Product', Vehicle: 'Product', Car: 'Product', Motorcycle: 'Product',
  CollectionPage: 'WebPage', AboutPage: 'WebPage', ContactPage: 'WebPage', ItemPage: 'WebPage', SearchResultsPage: 'WebPage', CheckoutPage: 'WebPage', MedicalWebPage: 'WebPage', RealEstateListing: 'WebPage',
  CriticReview: 'Review', UserReview: 'Review', EmployerReview: 'Review', Recommendation: 'Review', MediaReview: 'Review',
  EmployerAggregateRating: 'AggregateRating',
  MusicVideoObject: 'VideoObject',
  Festival: 'Event', Hackathon: 'Event',
};
// schema.org LocalBusiness subtypes. A type equal to — or ending in — one of these is a LocalBusiness
// (so "VeganBakery" counts). Anything with both an address and a telephone is treated as one too.
const LOCAL_BUSINESS_TYPES = new Set(`AnimalShelter ArchiveOrganization AutomotiveBusiness AutoBodyShop AutoDealer
AutoPartsStore AutoRental AutoRepair AutoWash GasStation MotorcycleDealer MotorcycleRepair ChildCare Dentist
DryCleaningOrLaundry EmergencyService FireStation Hospital PoliceStation EmploymentAgency EntertainmentBusiness
AdultEntertainment AmusementPark ArtGallery Casino ComedyClub MovieTheater NightClub FinancialService
AccountingService AutomatedTeller BankOrCreditUnion InsuranceAgency FoodEstablishment Bakery BarOrPub Brewery
CafeOrCoffeeShop Distillery FastFoodRestaurant IceCreamShop Restaurant Winery GovernmentOffice PostOffice
HealthAndBeautyBusiness BeautySalon DaySpa HairSalon HealthClub NailSalon TattooParlor HomeAndConstructionBusiness
Electrician GeneralContractor HVACBusiness HousePainter Locksmith MovingCompany Plumber RoofingContractor
InternetCafe LegalService Attorney Notary Library LodgingBusiness BedAndBreakfast Campground Hostel Hotel Motel
Resort SkiResort VacationRental MedicalBusiness CommunityHealth Dermatology DietNutrition Geriatric Gynecologic
MedicalClinic Midwifery Nursing Obstetric Oncologic Optician Optometric Otolaryngologic Pediatric Pharmacy Physician
Physiotherapy PlasticSurgery Podiatric PrimaryCare Psychiatric PublicHealth ProfessionalService RadioStation
RealEstateAgent RecyclingCenter SelfStorage ShoppingCenter SportsActivityLocation BowlingAlley ExerciseGym
GolfCourse PublicSwimmingPool SportsClub StadiumOrArena TennisComplex Store BikeStore BookStore ClothingStore
ComputerStore ConvenienceStore DepartmentStore ElectronicsStore Florist FurnitureStore GardenStore GroceryStore
HardwareStore HobbyShop HomeGoodsStore JewelryStore LiquorStore MensClothingStore MobilePhoneStore
MovieRentalStore MusicStore OfficeEquipmentStore OutletStore PawnShop PetStore ShoeStore SportingGoodsStore
TireShop ToyStore WholesaleStore TelevisionStation TouristInformationCenter TravelAgency`.split(/\s+/));
// Known building-block types with no rules of their own (no "unknown type" note for these).
const HELPER_TYPES = new Set(`Answer Question ListItem PostalAddress GeoCoordinates GeoShape OpeningHoursSpecification
ContactPoint ImageObject Rating Brand Thing SearchAction EntryPoint PropertyValueSpecification PropertyValue ItemList
Place VirtualLocation Country City State AdministrativeArea MonetaryAmount QuantitativeValue PriceSpecification
UnitPriceSpecification CompoundPriceSpecification HowToStep HowToSection HowToSupply HowToTool NutritionInformation
InteractionCounter DefinedRegion OfferShippingDetails ShippingDeliveryTime MerchantReturnPolicy MemberProgram
MemberProgramTier Language Audience PeopleAudience ReadAction WatchAction BuyAction OrderAction ReserveAction
Duration Distance Clip SeekToAction BroadcastEvent PublicationEvent OnDemandEvent
EducationalOccupationalCredential OccupationalExperienceRequirements MonetaryAmountDistribution Schedule Menu
MenuSection MenuItem ServiceChannel OfferCatalog Role OrganizationRole EmployeeRole CreativeWork MediaObject
AudioObject Photograph SpeakableSpecification WPHeader WPFooter SiteNavigationElement Map DefinedTerm Comment
SizeSpecification Demand`.split(/\s+/));
const NOT_LOCAL = new Set(['Service', 'OnlineStore', 'OnlineBusiness', 'Organization', 'Product', 'Offer']);
// Rich results Google has retired (Search Central changelog). Valid schema.org, but no special result any more.
const RETIRED = {
  FAQPage: { feature: 'FAQ rich results', since: '7 May 2026' },
  Quiz: { feature: 'practice problem rich results', since: 'January 2026' },
  Course: { feature: 'course info rich results', since: 'September 2025' },
  CourseInstance: { feature: 'course info rich results', since: 'September 2025' },
  Occupation: { feature: 'estimated salary rich results', since: 'September 2025' },
  LearningResource: { feature: 'learning video rich results', since: 'September 2025' },
  SpecialAnnouncement: { feature: 'special announcement rich results', since: 'September 2025' },
  Vehicle: { feature: 'vehicle listing rich results', since: 'September 2025' },
  Car: { feature: 'vehicle listing rich results', since: 'September 2025' },
  Motorcycle: { feature: 'vehicle listing rich results', since: 'September 2025' },
};
const retiredMessage = (t) => (t === 'FAQPage'
  ? 'Google no longer shows FAQ rich results (since 7 May 2026). The markup is harmless and other search and AI tools may still read it. Don\'t add it expecting stars or dropdowns.'
  : `${t}: Google no longer shows ${RETIRED[t].feature} (since ${RETIRED[t].since}). The markup is harmless and other search and AI tools may still read it. Don't add it expecting a special search result.`);

const URL_PROPS = new Set(['url', 'logo', 'image', 'item', 'sameAs', 'thumbnailUrl', 'contentUrl', 'embedUrl', 'mainEntityOfPage', 'hasMap', 'menu', 'downloadUrl', 'installUrl', 'applicationUrl', 'photo']);
const DATE_PROPS = new Set(['datePublished', 'dateModified', 'dateCreated', 'uploadDate', 'startDate', 'endDate', 'datePosted', 'validThrough', 'validFrom', 'priceValidUntil', 'foundingDate', 'birthDate', 'deathDate', 'expires', 'previousStartDate', 'availabilityStarts', 'availabilityEnds', 'dissolutionDate', 'releaseDate']);
const DURATION_PROPS = new Set(['duration', 'prepTime', 'cookTime', 'totalTime', 'timeRequired']);
const CURRENCY_PROPS = new Set(['priceCurrency', 'currency']);
const TIME_PROPS = new Set(['opens', 'closes']);
const NUMBER_PROPS = new Set(['price', 'lowPrice', 'highPrice', 'ratingValue', 'ratingCount', 'reviewCount', 'bestRating', 'worstRating', 'latitude', 'longitude']);
const DAYS = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'publicholidays']);

function isIsoDate(s) {
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate()) return false;
  if (m[4] !== undefined && (Number(m[4]) > 23 || Number(m[5]) > 59 || (m[6] !== undefined && Number(m[6]) > 59))) return false;
  return true;
}
const isIsoDuration = (s) => /^P(?=\d|T\d)(\d+Y)?(\d+M)?(\d+W)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+(\.\d+)?S)?)?$/.test(String(s));
const isNumberLike = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v));
const cleanType = (t) => String(t).replace(/^https?:\/\/schema\.org\//i, '').replace(/^schema:/i, '').trim();

function isSchemaContext(ctx) {
  if (typeof ctx === 'string') return /^https?:\/\/(www\.)?schema\.org\/?$/i.test(ctx.trim());
  if (Array.isArray(ctx)) return ctx.some(isSchemaContext);
  if (ctx && typeof ctx === 'object') return isSchemaContext(ctx['@vocab']);
  return false;
}

function classify(types, node) {
  const classes = new Set();
  const unknown = [];
  for (const t of types) {
    if (SCHEMA_RULES[t]) classes.add(t);
    else if (TYPE_ALIASES[t]) classes.add(TYPE_ALIASES[t]);
    else if (HELPER_TYPES.has(t) || RETIRED[t]) { /* building block, or a retired rich result (noted separately) */ }
    else if (!NOT_LOCAL.has(t) && [...LOCAL_BUSINESS_TYPES].some((lb) => t === lb || t.endsWith(lb))) classes.add('LocalBusiness');
    else if (/Event$/.test(t)) classes.add('Event');
    else unknown.push(t);
  }
  let treatedAsLocal = false;
  const hasNap = hasValue(node, 'address') && hasValue(node, 'telephone');
  if (hasNap && !classes.has('LocalBusiness') && (classes.has('Organization') || (!classes.size && unknown.length))) {
    classes.add('LocalBusiness');
    treatedAsLocal = true;
  }
  if (classes.has('LocalBusiness')) classes.delete('Organization');
  return { classes: [...classes], unknown, treatedAsLocal };
}

/**
 * Validate one JSON-LD block (already parsed). Returns { types (top-level only), issues }.
 * Issue: { id, status, type, path, message, fix? }.
 */
function validateJsonLd(data) {
  const issues = [];
  const types = new Set();
  const seen = new Set();
  const unknownSeen = new Set();
  const add = (status, id, path, message, fix, type) => {
    const key = `${id}|${path}|${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    issues.push({ id, status, ...(type ? { type } : {}), path: path || '(top)', message, ...(fix ? { fix } : {}) });
  };
  const join = (base, key) => (base ? `${base}.${key}` : key);

  function checkValue(key, value, path, label) {
    const list = Array.isArray(value) ? value.map((v, i) => [v, `${path}[${i}]`]) : [[value, path]];
    for (const [v, p] of list) {
      if (NUMBER_PROPS.has(key) && v !== null && typeof v !== 'object' && !isNumberLike(v)) {
        add('fail', 'schema-number', p, `${label}: "${key}" must be a plain number, not "${short(v, 40)}"`, 'Use digits only, e.g. "45.00" — put the currency in priceCurrency.', label);
      }
      if (typeof v !== 'string') continue;
      if (!v.trim()) {
        add('warn', 'schema-empty', p, `${label}: "${key}" is empty`, 'Fill in the real value or remove the property.', label);
        continue;
      }
      const ph = findPlaceholder(v);
      if (ph) add('fail', 'schema-placeholder', p, `${label}: "${key}" contains placeholder text (${ph}): "${short(v, 60)}"`, 'Replace it with the real value from the page.', label);
      if (URL_PROPS.has(key)) {
        const prob = urlProblem(v);
        if (prob === 'relative' || prob === 'not-web') add('fail', 'schema-url', p, `${label}: "${key}" ${URL_PROBLEM_TEXT[prob]} ("${short(v, 60)}")`, 'Use the full address, e.g. https://www.yoursite.com/page.', label);
      }
      if (DATE_PROPS.has(key) && !isIsoDate(v)) add('fail', 'schema-date', p, `${label}: "${key}" is not an ISO 8601 date ("${short(v, 40)}")`, 'Use YYYY-MM-DD, or YYYY-MM-DDTHH:MM+04:00 with a time.', label);
      if (DURATION_PROPS.has(key) && !isIsoDuration(v)) add('fail', 'schema-duration', p, `${label}: "${key}" is not an ISO 8601 duration ("${short(v, 40)}")`, 'Use e.g. "PT45M" (45 minutes) or "PT1H30M".', label);
      if (CURRENCY_PROPS.has(key) && !/^[A-Z]{3}$/.test(v)) add('fail', 'schema-currency', p, `${label}: "${key}" must be a 3-letter currency code, not "${short(v, 30)}"`, 'Use the ISO 4217 code, e.g. "AED", "USD", "EUR", "GBP".', label);
      if (TIME_PROPS.has(key) && !/^\d{2}:\d{2}(:\d{2})?$/.test(v)) add('warn', 'schema-time', p, `${label}: "${key}" should be a time like "08:00" ("${short(v, 30)}")`, 'Use 24-hour hh:mm, e.g. "07:30" or "18:00".', label);
    }
  }

  function selfServing(node, path, label) {
    const props = ['aggregateRating', 'review'].filter((k) => hasValue(node, k));
    if (props.length) {
      add('warn', 'schema-self-serving', path, `${label} carries ${props.join(' and ')} about itself — Google does not show review stars for reviews a business publishes about itself, and ratings must come from real customers`,
        'Remove it, unless this site collects reviews about other businesses. Never add ratings that are not real and visible on the page.', label);
    }
  }

  const CUSTOM = {
    Organization: (node, path, ctx, label) => selfServing(node, path, label),
    LocalBusiness(node, path, ctx, label) {
      selfServing(node, path, label);
      const addr = node.address;
      if (typeof addr === 'string' && addr.trim()) {
        add('warn', 'schema-address', join(path, 'address'), `${label}: address is plain text — Google expects a PostalAddress`, FIX_HINTS.address, label);
      } else if (addr && typeof addr === 'object' && !Array.isArray(addr)) {
        if (!hasValue(addr, 'streetAddress') && !hasValue(addr, 'addressLocality')) {
          add('fail', 'schema-required', join(path, 'address'), `${label}: address has no streetAddress or addressLocality`, FIX_HINTS.address, label);
        }
        if (!hasValue(addr, 'addressCountry')) add('warn', 'schema-recommended', join(path, 'address'), `${label}: address has no addressCountry`, 'Add the 2-letter country code, e.g. "AE" or "GB".', label);
        for (const k of ['addressRegion', 'postalCode']) {
          if (!hasValue(addr, k)) add('info', 'schema-recommended', join(path, 'address'), `${label}: address has no ${k}`, `Add ${k} if the business has one — skip it if it doesn't (e.g. no postcodes in the UAE).`, label);
        }
      }
      asArray(node.openingHoursSpecification).forEach((spec, i) => {
        if (!spec || typeof spec !== 'object') return;
        const p = Array.isArray(node.openingHoursSpecification) ? `${join(path, 'openingHoursSpecification')}[${i}]` : join(path, 'openingHoursSpecification');
        for (const day of asArray(spec.dayOfWeek)) {
          const d = String(day).replace(/^https?:\/\/schema\.org\//i, '').toLowerCase();
          if (!DAYS.has(d)) add('warn', 'schema-hours', `${p}.dayOfWeek`, `${label}: "${short(day, 30)}" is not a day name schema.org knows`, 'Use full English day names, e.g. "Monday".', label);
        }
        if (!hasValue(spec, 'opens') || !hasValue(spec, 'closes')) add('warn', 'schema-hours', p, `${label}: opening hours need both "opens" and "closes"`, 'Add both times as hh:mm, exactly as the page shows.', label);
      });
    },
    Article(node, path, ctx, label) {
      const h = typeof node.headline === 'string' ? node.headline : '';
      if (h.length > LIMITS.headline) add('warn', 'schema-headline', join(path, 'headline'), `${label}: headline is ${h.length} characters — long headlines get cut off (keep it under ~${LIMITS.headline})`, 'Use a shorter headline that matches the page title.', label);
      for (const [a, i] of asArray(node.author).map((x, j) => [x, j])) {
        const p = Array.isArray(node.author) ? `${join(path, 'author')}[${i}]` : join(path, 'author');
        if (typeof a === 'string') add('warn', 'schema-author', p, `${label}: author is plain text — use a Person or Organization with a name`, 'e.g. "author": {"@type": "Person", "name": "Sara Ali", "url": "https://…/team/sara"}', label);
        else if (a && typeof a === 'object' && !a['@id'] && !hasValue(a, 'name')) add('warn', 'schema-author', p, `${label}: author has no name`, 'Add author.name (the real author shown on the page).', label);
      }
    },
    AggregateRating(node, path, ctx, label) {
      const best = isNumberLike(node.bestRating) ? Number(node.bestRating) : 5;
      const worst = isNumberLike(node.worstRating) ? Number(node.worstRating) : 1;
      if (isNumberLike(node.ratingValue) && (Number(node.ratingValue) > best || Number(node.ratingValue) < worst)) {
        add('fail', 'schema-rating', join(path, 'ratingValue'), `${label}: ratingValue ${node.ratingValue} is outside ${worst}–${best}`, 'Set bestRating/worstRating to match the scale the reviews use.', label);
      }
      for (const k of ['ratingCount', 'reviewCount']) {
        if (isNumberLike(node[k]) && Number(node[k]) <= 0) add('fail', 'schema-rating', join(path, k), `${label}: ${k} must be more than 0`, 'Only add a rating when real reviews exist.', label);
      }
      reviewedSelf(node, path, ctx, label);
    },
    Review(node, path, ctx, label) {
      if (node.reviewRating && typeof node.reviewRating === 'object' && !hasValue(node.reviewRating, 'ratingValue')) {
        add('fail', 'schema-required', join(path, 'reviewRating'), `${label}: reviewRating has no ratingValue`, 'Add the rating the reviewer gave — only real reviews.', label);
      }
      if (typeof node.author === 'string') add('warn', 'schema-author', join(path, 'author'), `${label}: author is plain text — use a Person with a name`, 'e.g. "author": {"@type": "Person", "name": "…"}', label);
      reviewedSelf(node, path, ctx, label);
    },
    FAQPage(node, path, ctx, label) {
      asArray(node.mainEntity).forEach((q, i) => {
        const p = Array.isArray(node.mainEntity) ? `${join(path, 'mainEntity')}[${i}]` : join(path, 'mainEntity');
        if (!q || typeof q !== 'object') {
          add('fail', 'schema-required', p, 'FAQPage: each mainEntity item must be a Question object', null, label);
          return;
        }
        if (!asArray(q['@type']).map(cleanType).includes('Question')) add('warn', 'schema-faq-item', p, 'FAQPage: mainEntity item should have "@type": "Question"', null, label);
        if (!hasValue(q, 'name')) add('fail', 'schema-required', p, 'FAQPage: Question has no "name" (the question text)', 'Use the question exactly as it appears on the page.', label);
        const ans = first(q.acceptedAnswer);
        if (!ans) add('fail', 'schema-required', p, 'FAQPage: Question has no "acceptedAnswer"', 'Add "acceptedAnswer": {"@type": "Answer", "text": "…"} with the answer shown on the page.', label);
        else if (typeof ans !== 'object' || !hasValue(ans, 'text')) add('fail', 'schema-required', `${p}.acceptedAnswer`, 'FAQPage: acceptedAnswer has no "text"', 'Add the full answer text shown on the page.', label);
      });
    },
    BreadcrumbList(node, path, ctx, label) {
      const items = asArray(node.itemListElement);
      const positions = [];
      items.forEach((li, i) => {
        const p = `${join(path, 'itemListElement')}[${i}]`;
        if (!li || typeof li !== 'object') {
          add('fail', 'schema-required', p, 'BreadcrumbList: each item must be a ListItem object', null, label);
          return;
        }
        const pos = li.position;
        if (pos === undefined) add('fail', 'schema-required', p, 'BreadcrumbList: ListItem has no "position"', 'Number the crumbs 1, 2, 3… from the homepage.', label);
        else if (!Number.isInteger(Number(pos))) add('fail', 'schema-number', `${p}.position`, `BreadcrumbList: position "${pos}" is not a whole number`, null, label);
        else positions.push(Number(pos));
        const itemObj = li.item && typeof li.item === 'object' ? li.item : null;
        if (!hasValue(li, 'name') && !(itemObj && hasValue(itemObj, 'name'))) add('fail', 'schema-required', p, 'BreadcrumbList: ListItem has no "name"', 'Use the crumb text shown on the page.', label);
        if (!hasValue(li, 'item') && i < items.length - 1) add('fail', 'schema-required', p, 'BreadcrumbList: ListItem has no "item" (URL) — only the last crumb may leave it out', null, label);
      });
      if (positions.length && positions.some((n, i) => n !== i + 1)) add('warn', 'schema-breadcrumb-order', join(path, 'itemListElement'), `BreadcrumbList: positions are ${positions.join(', ')} — they should run 1, 2, 3… in order`, null, label);
    },
    Event(node, path, ctx, label) {
      const loc = first(node.location);
      if (typeof loc === 'string' && loc.trim()) add('warn', 'schema-location', join(path, 'location'), `${label}: location is plain text — use a Place with an address`, FIX_HINTS.location, label);
      else if (loc && typeof loc === 'object') {
        const isVirtual = asArray(loc['@type']).map(cleanType).includes('VirtualLocation');
        if (isVirtual && !hasValue(loc, 'url')) add('warn', 'schema-location', join(path, 'location'), `${label}: VirtualLocation has no url`, null, label);
        if (!isVirtual && !hasValue(loc, 'address') && !loc['@id']) add('fail', 'schema-required', join(path, 'location'), `${label}: location has no "address" (required by Google)`, FIX_HINTS.location, label);
      }
      if (isIsoDate(node.startDate || '') && isIsoDate(node.endDate || '') && String(node.endDate) < String(node.startDate)) {
        add('warn', 'schema-date', join(path, 'endDate'), `${label}: endDate is before startDate`, null, label);
      }
    },
    JobPosting(node, path, ctx, label) {
      const org = first(node.hiringOrganization);
      if (org && typeof org === 'object' && !org['@id'] && !hasValue(org, 'name')) add('fail', 'schema-required', join(path, 'hiringOrganization'), `${label}: hiringOrganization has no name`, null, label);
      for (const [loc, i] of asArray(node.jobLocation).map((x, j) => [x, j])) {
        const p = Array.isArray(node.jobLocation) ? `${join(path, 'jobLocation')}[${i}]` : join(path, 'jobLocation');
        const addr = loc && typeof loc === 'object' ? first(loc.address) : null;
        if (!addr || typeof addr !== 'object' || !hasValue(addr, 'addressCountry')) add('fail', 'schema-required', p, `${label}: jobLocation needs address.addressCountry (required by Google)`, null, label);
      }
    },
    WebSite(node, path, ctx, label) {
      if (asArray(node.potentialAction).some((a) => a && asArray(a['@type']).map(cleanType).includes('SearchAction'))) {
        add('info', 'schema-searchaction', join(path, 'potentialAction'), 'WebSite: SearchAction (sitelinks search box) is no longer shown by Google (since Nov 2024) — harmless, but not needed', null, label);
      }
    },
  };

  function reviewedSelf(node, path, ctx, label) {
    if (ctx.nested) return; // nested inside an Organization: the parent's check covers it
    const target = first(node.itemReviewed);
    if (!target || typeof target !== 'object') return;
    const { classes } = classify(asArray(target['@type']).map(cleanType), target);
    if (classes.includes('Organization') || classes.includes('LocalBusiness')) {
      add('warn', 'schema-self-serving', join(path, 'itemReviewed'), `${label} reviews an organisation or local business — Google shows no stars for reviews a business publishes about itself`, 'Remove it unless this site collects reviews about other businesses.', label);
    }
  }

  function applyRules(cls, node, path, ctx, label) {
    const rule = SCHEMA_RULES[cls];
    const present = (prop) => hasValue(node, prop) || (ALTERNATIVES[prop] ? ALTERNATIVES[prop](node) : false);
    const by = rule.source === 'google' ? ' (required by Google)' : ' (needed to make sense)';
    const strict = !rule.strictParents || !ctx.nested || rule.strictParents.some((c) => ctx.parentClasses?.includes(c));
    const missing = [...rule.required, ...(ctx.nested ? [] : rule.requiredTopLevel || [])].filter((p) => !present(p));
    for (const prop of missing) {
      add(strict ? 'fail' : 'warn', strict ? 'schema-required' : 'schema-recommended', path, `${label} is missing "${prop}"${strict ? by : ''}`, FIX_HINTS[prop] || `Add "${prop}" with the real value shown on the page — or remove this ${label} if the page doesn't show it.`, label);
    }
    for (const group of rule.oneOf || []) {
      if (!group.some(present)) add('fail', 'schema-required', path, `${label} needs at least one of: ${group.join(', ')}${by}`, FIX_HINTS[group[0]] || `Add one of ${group.join(', ')} — only with real values.`, label);
    }
    if (!ctx.nested || rule.recommendNested) {
      const absent = (rule.recommended || []).filter((prop) => !present(prop));
      if (absent.length) add('warn', 'schema-recommended', path, `${label} has no ${absent.map((x) => `"${x}"`).join(', ')} (recommended${rule.source === 'google' ? ' by Google' : ''})`, 'Add them only if the information is real and shown on the page; otherwise leave them out.', label);
    }
    CUSTOM[cls]?.(node, path, ctx, label);
  }

  function visit(value, path, ctx) {
    if (Array.isArray(value)) {
      value.forEach((v, i) => visit(v, `${path}[${i}]`, ctx));
      return;
    }
    if (!value || typeof value !== 'object') return;
    const node = value;
    const nodeTypes = asArray(node['@type']).filter((t) => typeof t === 'string').map(cleanType);
    if (!ctx.nested) nodeTypes.forEach((t) => types.add(t));
    const keys = Object.keys(node).filter((k) => k !== '@context');
    if (node['@id'] && keys.every((k) => k === '@id' || k === '@type')) return; // a reference to another node
    const label = nodeTypes.join('/') || 'Item';
    if (!nodeTypes.length && !ctx.nested) add('fail', 'schema-type', path, 'This item has no "@type"', 'Add "@type", e.g. "Organization", "LocalBusiness" or "BlogPosting".');
    const { classes, unknown, treatedAsLocal } = classify(nodeTypes, node);
    for (const t of unknown) {
      if (unknownSeen.has(t) || treatedAsLocal) continue;
      unknownSeen.add(t);
      add('info', 'schema-unknown-type', path, `"${t}" is not a type this check knows — Google has no rich result for it, or it is misspelled`, 'Check the spelling on schema.org (e.g. "Organization", not "Organisation").', t);
    }
    for (const t of nodeTypes) if (RETIRED[t]) add('info', 'schema-retired', path, retiredMessage(t), null, t);
    if (treatedAsLocal) add('info', 'schema-local-business', path, `${label} has an address and telephone, so it is checked as a LocalBusiness`, 'Use LocalBusiness or a specific subtype (e.g. Bakery, Dentist) for a business customers visit.', label);
    for (const cls of classes) applyRules(cls, node, path, ctx, label);
    for (const [key, v] of Object.entries(node)) {
      if (key.startsWith('@')) continue;
      const p = join(path, key);
      checkValue(key, v, p, label);
      visit(v, p, { nested: true, parentClasses: classes });
    }
  }

  const roots = Array.isArray(data) ? data.map((d, i) => [d, `[${i}]`]) : [[data, '']];
  if (Array.isArray(data) && !data.length) add('fail', 'schema-shape', '', 'The JSON-LD list is empty');
  for (const [node, path] of roots) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) {
      add('fail', 'schema-shape', path, 'JSON-LD must be an object (or a list of objects)');
      continue;
    }
    const ctxValue = node['@context'];
    if (!isSchemaContext(ctxValue)) {
      add('fail', 'schema-context', path, ctxValue === undefined ? 'Missing "@context": "https://schema.org"' : `"@context" is ${short(JSON.stringify(ctxValue), 60)} — it must be "https://schema.org"`, 'Start the block with "@context": "https://schema.org".');
    }
    if (node['@graph'] !== undefined) {
      const graph = asArray(node['@graph']);
      graph.forEach((n, i) => visit(n, `${path ? `${path}.` : ''}@graph[${i}]`, { nested: false }));
    } else {
      visit(node, path, { nested: false });
    }
  }
  issues.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  return { types: [...types].sort(), issues };
}

// ===========================================================================
// 4. Meta checks (one page) and site checks (all pages)
// ===========================================================================
const OG_TYPES = new Set(['website', 'article', 'profile', 'book', 'product', 'product.item', 'business.business', 'place', 'video.movie', 'video.episode', 'video.tv_show', 'video.other', 'music.song', 'music.album', 'music.playlist', 'music.radio_station', 'restaurant.restaurant', 'restaurant.menu']);
const TWITTER_CARDS = new Set(['summary', 'summary_large_image', 'app', 'player']);

/** mode: 'scan' (what exists) or 'check' (a proposal). Returns checks. */
function metaChecks(p, mode) {
  const out = [];
  const add = (id, status, message, extra = {}) => out.push({ id, status, message, ...extra });
  const T = LIMITS.title;
  const D = LIMITS.description;

  // Title
  const title = (p.title || '').trim();
  if (!title) add('title-missing', 'fail', 'No title', { fix: 'Write a unique title: main keyword near the start, brand at the end if it fits (30–60 characters).' });
  else {
    const m = measureText(title, T.font);
    const before = out.length;
    const ph = findPlaceholder(title);
    if (ph) add('title-placeholder', 'fail', `Title contains placeholder text (${ph})`, { evidence: title, fix: 'Write the real title.' });
    if (m.displayChars < T.min || m.displayChars > T.max) add('title-length', 'warn', `Title is ${m.chars} characters${m.displayChars !== m.chars ? ` (${m.displayChars} counting wide characters as 2)` : ''} — aim for ${T.min}–${T.max}`, { evidence: title, fix: m.displayChars > T.max ? 'Shorten it; keep the main keyword first.' : 'Add the main keyword, place or benefit — and the brand if it fits.' });
    if (m.px > T.px) add('title-width', 'warn', `Title is about ${m.px} px wide at ${T.font}px Arial (estimate) — Google cuts titles at roughly ${T.px}–600 px`, { evidence: fitWidth(title, T.px, T.font), fix: 'Shorten it, or use narrower words; wide letters (W, M) and capitals take more room.' });
    if (isShouting(title)) add('title-caps', 'warn', 'Title is written in capitals — reads as shouting and takes more room', { evidence: title, fix: 'Use normal sentence or title case.' });
    const rep = repeatedWords(title, 3);
    if (rep.length) add('title-stuffing', 'warn', `Title repeats ${rep.join(', ')} — looks like keyword stuffing`, { evidence: title, fix: 'Use the keyword once; add a benefit or place instead.' });
    if (p.titleCount > 1) add('title-multiple', 'warn', `${p.titleCount} <title> tags on the page — browsers and Google use the first`, { fix: 'Keep one <title> (often a theme and an SEO plugin both add one).' });
    if (out.length === before) add('title', 'pass', `${m.chars} characters, ~${m.px} px (estimate)`, { evidence: title });
  }

  // Description
  const desc = (p.description || '').trim();
  if (!desc) {
    add('description-missing', mode === 'check' ? 'fail' : 'warn', 'No meta description — Google will pick its own snippet', { fix: 'Write 70–160 characters: benefit + proof + call to action, matching the page.' });
  } else {
    const m = measureText(desc, D.font);
    const before = out.length;
    const ph = findPlaceholder(desc);
    if (ph) add('description-placeholder', 'fail', `Description contains placeholder text (${ph})`, { evidence: desc, fix: 'Write the real description.' });
    if (m.displayChars < D.min || m.displayChars > D.max) add('description-length', 'warn', `Description is ${m.chars} characters — aim for ${D.min}–${D.max}`, { evidence: desc, fix: m.displayChars > D.max ? 'Shorten it so the call to action is not cut off.' : 'Say more: the benefit, a proof point and a call to action.' });
    if (m.px > D.px) add('description-width', 'warn', `Description is about ${m.px} px wide at ${D.font}px Arial (estimate) — Google often cuts near ${D.px} px`, { evidence: fitWidth(desc, D.px, D.font), fix: 'Shorten it; put the important words first.' });
    if (title && norm(desc) === norm(title)) add('description-same-as-title', 'warn', 'Description is the same as the title', { fix: 'Use the description to add what the title can\'t: benefit, proof, call to action.' });
    const rep = repeatedWords(desc, 4);
    if (rep.length) add('description-stuffing', 'warn', `Description repeats ${rep.join(', ')} — looks like keyword stuffing`, { evidence: desc, fix: 'Write for people; use the keyword once or twice.' });
    if (isShouting(desc)) add('description-caps', 'warn', 'Description is written in capitals', { evidence: desc, fix: 'Use normal sentence case.' });
    if (p.descriptionCount > 1) add('description-multiple', 'warn', `${p.descriptionCount} meta description tags — Google may use either`, { fix: 'Keep one.' });
    if (out.length === before) add('description', 'pass', `${m.chars} characters, ~${m.px} px (estimate)`, { evidence: desc });
  }

  // Canonical
  const canonical = (p.canonical || '').trim();
  if (!canonical) {
    add('canonical-missing', mode === 'check' ? 'info' : 'warn', mode === 'check' ? 'No canonical given — the snippet uses the page URL' : 'No canonical link', { fix: 'Add <link rel="canonical" href="https://…/this-page/"> pointing to the page\'s own preferred URL.' });
  } else {
    const prob = urlProblem(canonical);
    if (prob === 'relative' || prob === 'not-web' || prob === 'empty') add('canonical-url', 'fail', `Canonical ${URL_PROBLEM_TEXT[prob]}`, { evidence: canonical, fix: 'Use the full https:// address of the page.' });
    else if (prob === 'http') add('canonical-url', 'warn', `Canonical ${URL_PROBLEM_TEXT.http}`, { evidence: canonical });
    else if (p.url && /^https?:/.test(p.url) && normalizeUrl(canonical).replace(/\/$/, '') !== normalizeUrl(p.url).replace(/\/$/, '')) {
      add('canonical-other', 'info', 'Canonical points to a different URL — fine for duplicates, wrong for a unique page', { evidence: canonical });
    } else add('canonical', 'pass', 'Canonical is a full URL', { evidence: canonical });
  }

  // Robots / H1 (only for pages that exist)
  if (mode === 'scan') {
    if (p.noindex) add('robots-noindex', 'warn', 'Page is set to noindex — Google will not show it. Intended?', { evidence: p.robots || 'X-Robots-Tag' });
    if (!p.h1?.length) add('h1-missing', 'warn', 'No H1 heading — the title and H1 should tell the same story', { fix: 'Add one H1 that matches the page topic.' });
  }

  // Open Graph
  const og = p.og || {};
  if (!og.image) add('og-image-missing', 'warn', 'No og:image — shared links show no picture or a random one', { fix: 'Add a 1200×630 px image as og:image (full https:// URL).' });
  else {
    const prob = urlProblem(og.image);
    if (prob === 'relative' || prob === 'not-web' || prob === 'empty') add('og-image-url', 'fail', `og:image ${URL_PROBLEM_TEXT[prob]}`, { evidence: og.image, fix: 'Facebook, LinkedIn and WhatsApp need the full https:// address of the image.' });
    else if (prob === 'http') add('og-image-url', 'warn', `og:image ${URL_PROBLEM_TEXT.http}`, { evidence: og.image });
    else add('og-image', 'pass', 'og:image is a full URL', { evidence: og.image });
  }
  if (og.url) {
    const prob = urlProblem(og.url);
    if (prob === 'relative' || prob === 'not-web') add('og-url', 'fail', `og:url ${URL_PROBLEM_TEXT[prob]}`, { evidence: og.url });
  }
  if (mode === 'scan') {
    if (!og.title) add('og-title-missing', 'info', 'No og:title — social sites fall back to the <title>');
    if (!og.description) add('og-description-missing', 'info', 'No og:description — social sites fall back to the meta description or page text');
  }
  if (og.type && !OG_TYPES.has(String(og.type).toLowerCase())) add('og-type', 'warn', `og:type "${short(og.type, 30)}" is unusual`, { fix: 'Use "website" for most pages, "article" for blog posts.' });
  for (const [k, v] of Object.entries(og)) {
    const ph = findPlaceholder(v);
    if (ph) add('og-placeholder', 'fail', `og:${k} contains placeholder text (${ph})`, { evidence: v });
  }

  // Twitter / X
  const tw = p.twitter || {};
  if (!tw.card) {
    if (mode === 'scan') add('twitter-card-missing', 'info', 'No twitter:card — X shows a small or no preview', { fix: 'Add <meta name="twitter:card" content="summary_large_image">.' });
  } else if (!TWITTER_CARDS.has(String(tw.card))) add('twitter-card', 'warn', `twitter:card "${short(tw.card, 30)}" is not a valid card type`, { fix: 'Use "summary_large_image" (or "summary").' });
  for (const [k, v] of Object.entries(tw)) {
    const ph = findPlaceholder(v);
    if (ph) add('twitter-placeholder', 'fail', `twitter:${k} contains placeholder text (${ph})`, { evidence: v });
  }
  return out;
}

/** Turn validated JSON-LD blocks into page checks. */
function schemaChecks(blocks, { mode, isHome }) {
  const out = [];
  if (!blocks.length) {
    out.push({ id: 'schema-none', status: 'info', message: isHome ? 'No structured data — the homepage usually gets Organization or LocalBusiness + WebSite' : 'No structured data on this page', fix: 'See reference/schema-guide.md for which type fits this page.' });
    return out;
  }
  for (const b of blocks) {
    if (!b.valid) {
      out.push({ id: 'schema-parse', status: 'fail', message: `JSON-LD block ${b.index} is not valid JSON: ${b.error}`, evidence: { block: b.index }, fix: 'Fix the JSON syntax (missing comma, quote or bracket), then test it in Google\'s Rich Results Test.' });
      continue;
    }
    for (const i of b.issues) {
      out.push({ id: i.id, status: i.status, message: i.message, evidence: { block: b.index, path: i.path }, ...(i.fix ? { fix: i.fix } : {}) });
    }
    if (!b.issues.some((i) => i.status === 'fail' || i.status === 'warn')) {
      out.push({ id: 'schema', status: 'pass', message: `JSON-LD block ${b.index}: ${b.types.join(', ') || 'no types'} — no problems found`, evidence: { block: b.index } });
    }
  }
  if (mode === 'check' && isHome) {
    const all = blocks.flatMap((b) => b.types || []);
    const hasOrg = all.some((t) => ['Organization', 'LocalBusiness'].includes(SCHEMA_RULES[t] ? t : TYPE_ALIASES[t]) || classify([t], {}).classes.includes('LocalBusiness'));
    if (!hasOrg) out.push({ id: 'schema-home', status: 'info', message: 'Homepage has no Organization or LocalBusiness block', fix: 'Add one with the business name, logo and (for a local business) address and phone shown on the site.' });
  }
  return out;
}

const SEPARATOR = '[|\\-–—·:•/»]';
function brandStyle(title, brand) {
  const t = String(title || '').trim();
  if (!t || !brand) return { style: 'none' };
  const B = norm(brand);
  if (norm(t) === B) return { style: 'only' };
  const last = t.match(new RegExp(`^(.*\\S)\\s+(${SEPARATOR})\\s+(.+)$`));
  if (last && norm(last[3]) === B) return { style: 'suffix', key: `${last[2]} ${last[3]}` };
  if (last && norm(last[3]).includes(B)) return { style: 'suffix', key: `${last[2]} ${last[3]}` };
  const firstSep = t.match(new RegExp(`^(.+?)\\s+(${SEPARATOR})\\s+(.*)$`));
  if (firstSep && norm(firstSep[1]) === B) return { style: 'prefix', key: `${firstSep[1]} ${firstSep[2]}` };
  if (norm(t).includes(B)) return { style: 'inline' };
  return { style: 'none' };
}

function guessBrand(pages) {
  const names = pages.map((p) => p.og?.site_name).filter(Boolean);
  const home = pages.find((p) => p.isHome && p.og?.site_name);
  if (home) return home.og.site_name.trim();
  if (names.length) return mostCommon(names);
  const tails = pages.map((p) => (p.title || '').match(new RegExp(`\\s${SEPARATOR}\\s([^|–—·:•/»]+)$`))?.[1]?.trim()).filter(Boolean);
  const top = mostCommon(tails, 2);
  return top || null;
}
function mostCommon(list, minCount = 1) {
  const counts = new Map();
  for (const x of list) counts.set(x, (counts.get(x) || 0) + 1);
  const best = [...counts].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))[0];
  return best && best[1] >= minCount ? best[0] : null;
}

/** Duplicate titles/descriptions and brand consistency. Adds per-page checks; returns site checks. */
function siteChecks(pages, { mode, brand }) {
  const site = [];
  const usable = pages.filter((p) => !p.error && !p.noindex);
  for (const [field, id, status] of [['title', 'title-duplicate', 'fail'], ['description', 'description-duplicate', mode === 'check' ? 'fail' : 'warn']]) {
    const groups = new Map();
    for (const p of usable) {
      const v = (p[field] || '').trim();
      if (!v) continue;
      const k = norm(v);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const urls = group.map((p) => p.url);
      for (const p of group) {
        p.checks.push({ id, status, message: `Same ${field} as ${group.length - 1} other page(s)`, evidence: urls.filter((u) => u !== p.url), fix: `Give every page its own ${field} — say what makes this page different.` });
      }
      site.push({ id, status, message: `${group.length} pages share the ${field} "${short(group[0][field], 70)}"`, evidence: urls });
    }
  }
  if (brand) {
    const styled = usable.map((p) => ({ p, s: brandStyle(p.title, brand) }));
    const others = styled.filter(({ p }) => !p.isHome);
    const suffixes = new Map();
    for (const { p, s } of others) {
      if (s.style !== 'suffix') continue;
      if (!suffixes.has(s.key)) suffixes.set(s.key, []);
      suffixes.get(s.key).push(p.url);
    }
    const prefixed = others.filter(({ s }) => s.style === 'prefix').map(({ p }) => p.url);
    if (suffixes.size > 1 || (suffixes.size && prefixed.length)) {
      const parts = [...suffixes].sort((a, b) => b[1].length - a[1].length).map(([k, urls]) => `"… ${k}" (${urls.length})`);
      if (prefixed.length) parts.push(`brand first (${prefixed.length})`);
      site.push({ id: 'brand-suffix-mixed', status: 'warn', message: `Titles add the brand in different ways: ${parts.join(', ')}`, evidence: Object.fromEntries([...suffixes].map(([k, urls]) => [k, urls]).concat(prefixed.length ? [['brand first', prefixed]] : [])), fix: `Pick one pattern, e.g. "Page topic | ${brand}", and use it on every page where it fits.` });
    }
    const without = others.filter(({ s }) => s.style === 'none').map(({ p }) => p.url);
    if (suffixes.size && without.length) {
      site.push({ id: 'brand-missing', status: 'info', message: `${without.length} title(s) have no brand name — fine when the title would be too long with it`, evidence: without });
    }
  }
  return site;
}

function verdictOf(checks) {
  if (checks.some((c) => c.status === 'fail')) return 'fail';
  if (checks.some((c) => c.status === 'warn')) return 'warn';
  return 'pass';
}
const sortChecks = (checks) => checks.sort((a, b) => ORDER[a.status] - ORDER[b.status]);
const problemLines = (checks) => checks.filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => `${c.status} ${c.id}: ${short(c.message, 140)}`);
function countStatuses(pages) {
  const s = { fail: 0, warn: 0, info: 0, pass: 0 };
  for (const p of pages) for (const c of p.checks || []) s[c.status]++;
  return s;
}

// ===========================================================================
// 5. Reading pages (HTML) for scan
// ===========================================================================
function readHeadTags(html) {
  const src = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ');
  const og = {};
  const twitter = {};
  let canonical = null;
  for (const tag of openingTags(src)) {
    if (tag.name === 'meta') {
      const key = String(tag.attrs.property || tag.attrs.name || '').toLowerCase().trim();
      const content = (tag.attrs.content ?? '').trim();
      if (key.startsWith('og:') && og[key.slice(3)] === undefined) og[key.slice(3)] = content;
      if (key.startsWith('twitter:') && twitter[key.slice(8)] === undefined) twitter[key.slice(8)] = content;
    } else if (tag.name === 'link' && canonical === null && String(tag.attrs.rel || '').toLowerCase().split(/\s+/).includes('canonical')) {
      canonical = (tag.attrs.href ?? '').trim();
    } else if (tag.name === 'body') {
      // og/twitter tags belong in <head>, but keep reading: some builders put them late.
    }
  }
  return { og, twitter, canonical };
}

function pageFromHtml(html, pageUrl, extra = {}) {
  const a = analyzeHtml(html, pageUrl);
  const head = readHeadTags(html);
  const robots = a.metaRobots || null;
  const noindex = /noindex/.test(robots || '') || /noindex/i.test(extra.xRobots || '');
  const blocks = a.jsonLd.map((j, i) => {
    if (!j.valid) return { index: i + 1, valid: false, error: j.error, types: [] };
    const v = validateJsonLd(j.data);
    return { index: i + 1, valid: true, types: v.types, issues: v.issues, data: j.data };
  });
  const t = measureText(a.title || '', LIMITS.title.font);
  const d = measureText(a.metaDescription || '', LIMITS.description.font);
  return {
    ...extra.record,
    isHome: extra.isHome,
    noindex,
    title: a.title,
    titleCount: a.titleCount,
    titleLength: a.title ? t.chars : 0,
    titlePx: a.title ? t.px : 0,
    description: a.metaDescription,
    descriptionCount: a.metaDescriptionCount,
    descriptionLength: a.metaDescription ? d.chars : 0,
    descriptionPx: a.metaDescription ? d.px : 0,
    canonical: head.canonical,
    robots: robots || (extra.xRobots ? `X-Robots-Tag: ${extra.xRobots}` : null),
    h1: a.h1,
    lang: a.lang,
    og: head.og,
    twitter: head.twitter,
    schema: { types: [...new Set(blocks.flatMap((b) => b.types))].sort(), blocks },
  };
}

function collectHtmlFiles(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = resolve(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) collectHtmlFiles(p, out);
    else if (/\.html?$/i.test(name)) out.push(p);
  }
  return out;
}

function fileUrlFor(file, { rootDir, baseUrl, single }) {
  if (!baseUrl) return pathToFileURL(file).href;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (single) return baseUrl;
  const rel = (rootDir ? relative(rootDir, file) : basename(file)).split(sep).join('/').replace(/(^|\/)index\.html?$/i, '$1');
  return new URL(rel, base).href;
}

// ===========================================================================
// 6. scan
// ===========================================================================
async function cmdScan(args) {
  const inputs = args._.slice(1);
  if (!inputs.length) fail(`Nothing to scan.\n${USAGE}`, 2);
  const MAX = Math.min(toInt(args.max, 50), 500);
  const CONCURRENCY = Math.min(toInt(args.concurrency, 3), 6);
  const DELAY = args.delay === undefined ? 250 : Math.max(0, Number(args.delay) || 0);
  const baseUrl = typeof args['base-url'] === 'string' ? args['base-url'] : null;
  if (baseUrl && !/^https?:\/\//i.test(baseUrl)) fail('--base-url must start with http:// or https://', 2);
  const notes = [];
  const targets = [];
  let sitemap = null;
  let startUrl = null;

  const robotsCache = new Map();
  const robotsFor = (origin) => {
    if (!robotsCache.has(origin)) {
      robotsCache.set(origin, fetchWithRedirects(`${origin}/robots.txt`, { timeoutMs: 15000 }).then((r) => {
        const found = r.ok && !/<html/i.test(r.body || '');
        return { found, status: r.status, ...(found ? parseRobots(r.body) : { groups: [], sitemaps: [] }) };
      }));
    }
    return robotsCache.get(origin);
  };

  let rest = inputs;
  if (args.sitemap) {
    startUrl = inputs[0];
    if (!/^https?:\/\//i.test(startUrl)) fail('--sitemap needs a website address (https://…) as the first argument.', 2);
    const origin = new URL(startUrl).origin;
    const robots = await robotsFor(origin);
    const candidates = robots.sitemaps.length ? robots.sitemaps : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`];
    const info = await loadSitemapUrls(candidates, { maxFiles: 10, maxUrls: MAX * 4 });
    const urls = [...new Set(info.urls.map(normalizeUrl).filter((u) => isSameSite(u, startUrl)))];
    const start = normalizeUrl(startUrl);
    if (!urls.length) notes.push('No sitemap URLs found (robots.txt Sitemap: lines, /sitemap.xml) — scanned the start page only.');
    if (!urls.includes(start)) urls.unshift(start);
    sitemap = { files: info.files.map((f) => ({ url: f.url, status: f.status, urls: f.urls, ...(f.error ? { error: f.error } : {}) })), urls: info.urls.length };
    for (const u of urls) targets.push({ kind: 'url', url: u });
    rest = inputs.slice(1);
  }
  for (const input of rest) {
    if (/^https?:\/\//i.test(input)) targets.push({ kind: 'url', url: normalizeUrl(input) });
    else if (existsSync(input) && statSync(input).isDirectory()) {
      const root = resolve(input);
      const files = collectHtmlFiles(root);
      if (!files.length) notes.push(`No .html files in ${input}`);
      for (const f of files) targets.push({ kind: 'file', file: f, rootDir: root });
    } else if (existsSync(input)) targets.push({ kind: 'file', file: resolve(input), rootDir: null });
    else fail(`Not a URL, file or folder: ${input}`, 2);
  }
  const singleFile = targets.filter((t) => t.kind === 'file').length === 1;
  const seenTargets = new Set();
  const unique = targets.filter((t) => {
    const k = t.kind === 'url' ? t.url : t.file;
    if (seenTargets.has(k)) return false;
    seenTargets.add(k);
    return true;
  });
  const capped = unique.slice(0, MAX);
  if (unique.length > MAX) notes.push(`${unique.length - MAX} more page(s) not scanned — raise --max to include them.`);

  const results = new Array(capped.length);
  const skippedByRobots = [];
  capped.forEach((t, i) => {
    if (t.kind !== 'file') return;
    const url = fileUrlFor(t.file, { rootDir: t.rootDir, baseUrl, single: singleFile && !t.rootDir });
    const isHome = /^https?:/.test(url) ? new URL(url).pathname === '/' : /^index\.html?$/i.test(basename(t.file)) && (!t.rootDir || dirname(t.file) === t.rootDir);
    results[i] = pageFromHtml(readFileSync(t.file, 'utf8'), url, { isHome, record: { url, source: 'file', file: t.file } });
  });
  const urlIdx = capped.map((t, i) => (t.kind === 'url' ? i : -1)).filter((i) => i >= 0);
  const networkErrors = [];
  await mapLimit(urlIdx, CONCURRENCY, async (i) => {
    const url = capped[i].url;
    const u = new URL(url);
    const robots = await robotsFor(u.origin);
    if (robots.found && !robotsAllows(robots, USER_AGENT, u.pathname + u.search)) {
      skippedByRobots.push(url);
      results[i] = null;
      return;
    }
    const r = await fetchWithRedirects(url);
    const record = { url, finalUrl: r.url, source: 'url', status: r.status, redirects: r.chain.length };
    if (r.status === 0) {
      networkErrors.push(r.error);
      results[i] = { ...record, error: r.error, checks: [{ id: 'http-status', status: 'fail', message: `Could not load the page: ${r.error}` }] };
    } else if (!r.ok) {
      results[i] = { ...record, error: `HTTP ${r.status}`, checks: [{ id: 'http-status', status: 'fail', message: `Page answers HTTP ${r.status}` }] };
    } else if (!r.isHtml) {
      results[i] = { ...record, error: `not HTML (${r.contentType || 'unknown type'})`, checks: [{ id: 'http-status', status: 'fail', message: `Not an HTML page (${r.contentType || 'unknown type'})` }] };
    } else {
      results[i] = pageFromHtml(r.body, r.url, { isHome: new URL(r.url).pathname === '/', xRobots: r.headers?.['x-robots-tag'] || '', record });
    }
  }, { delayMs: DELAY });

  const pages = results.filter(Boolean);
  const okPages = pages.filter((p) => !p.error);
  if (urlIdx.length && !okPages.length && networkErrors.length === urlIdx.length - skippedByRobots.length && networkErrors.length) {
    fail(`Could not reach the site: ${networkErrors[0]}. In the Claude app the sandbox often has no internet: fetch the pages with your web tool, save each as an .html file, and run "scan" on the files (add --base-url https://their-site.com/).`, 1);
  }
  for (const p of okPages) {
    p.checks = [...metaChecks(p, 'scan'), ...schemaChecks(p.schema.blocks, { mode: 'scan', isHome: p.isHome })];
  }
  const brand = guessBrand(okPages);
  const site = siteChecks(pages, { mode: 'scan', brand });
  for (const p of pages) {
    sortChecks(p.checks);
    p.verdict = p.error ? 'error' : verdictOf(p.checks);
  }
  skippedByRobots.sort();

  const firstUrl = startUrl || capped.find((t) => t.kind === 'url')?.url || baseUrl;
  const slug = slugify(firstUrl ? siteKey(firstUrl) : 'local-files');
  const outPath = typeof args.out === 'string' ? args.out : `.powerup/reports/meta-scan-${slug}-${isoDate()}.json`;
  const report = {
    tool: TOOL,
    version: VERSION,
    command: 'scan',
    scannedAt: new Date().toISOString(),
    inputs,
    limits: { ...LIMITS, note: 'Pixel widths are estimates (Arial character widths), not measurements.' },
    schemaRules: `Google Search Central structured-data docs (${GOOGLE_DOCS}), checked 2026-11-20`,
    brand,
    sitemap,
    skippedByRobots,
    notes,
    summary: countStatuses(pages),
    site,
    pages,
  };
  writeJson(outPath, report);

  let draftPath = null;
  if (args.draft) {
    draftPath = typeof args.draft === 'string' ? args.draft : `.powerup/reports/meta-draft-${slug}-${isoDate()}.json`;
    const origin = firstUrl && /^https?:/.test(firstUrl) ? new URL(firstUrl).origin : '';
    writeJson(draftPath, {
      site: { name: brand || '', url: origin },
      pages: okPages.map((p) => ({
        url: p.finalUrl || p.url,
        title: p.title || '',
        description: p.description || '',
        ...(p.canonical ? { canonical: p.canonical } : {}),
        og: { ...(p.og.image ? { image: p.og.image } : {}), type: p.og.type || 'website' },
        twitter: { card: p.twitter.card || 'summary_large_image' },
        schema: p.schema.blocks.filter((b) => b.valid).map((b) => b.data),
      })),
    });
  }

  printJson({
    tool: TOOL,
    command: 'scan',
    pagesScanned: okPages.length,
    pagesWithErrors: pages.length - okPages.length,
    skippedByRobots,
    ...(sitemap ? { sitemap: { urlsFound: sitemap.urls, files: sitemap.files.map((f) => `${f.status} ${f.url} (${f.urls} URLs)`) } } : {}),
    brand,
    summary: report.summary,
    site: site.map((s) => ({ id: s.id, status: s.status, message: s.message })),
    pages: pages.map((p) => ({
      url: p.url,
      verdict: p.verdict,
      ...(p.error ? { error: p.error } : {
        title: p.title,
        titleLength: p.titleLength,
        titlePx: p.titlePx,
        descriptionLength: p.descriptionLength,
        schemaTypes: p.schema.types,
      }),
      problems: problemLines(p.checks),
    })),
    notes,
    fullReport: outPath,
    ...(draftPath ? { draft: draftPath } : {}),
  });
}

// ===========================================================================
// 7. check + snippets
// ===========================================================================
const escText = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => escText(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
/** JSON for a <script type="application/ld+json">: "</" can never close the script early. */
const jsonLdText = (obj) => JSON.stringify(obj, null, 2).replace(/<\//g, '<\\/').replace(/<!--/g, '\\u003c!--');

function buildSnippet(page, site) {
  const og = page.og || {};
  const tw = page.twitter || {};
  const canonical = page.canonical || page.url;
  const lines = [];
  const meta = (attr, key, value) => {
    if (value !== undefined && value !== null && String(value).trim() !== '') lines.push(`<meta ${attr}="${key}" content="${escAttr(String(value).trim())}">`);
  };
  lines.push(`<title>${escText((page.title || '').trim())}</title>`);
  meta('name', 'description', page.description);
  if (canonical) lines.push(`<link rel="canonical" href="${escAttr(canonical)}">`);
  meta('name', 'robots', page.robots);
  meta('property', 'og:type', og.type || 'website');
  meta('property', 'og:url', og.url || canonical);
  meta('property', 'og:title', og.title || page.title);
  meta('property', 'og:description', og.description || page.description);
  meta('property', 'og:image', og.image);
  meta('property', 'og:image:alt', og.imageAlt || og['image:alt']);
  meta('property', 'og:site_name', og.siteName || og.site_name || site.name);
  meta('property', 'og:locale', og.locale);
  meta('name', 'twitter:card', tw.card || (og.image ? 'summary_large_image' : 'summary'));
  meta('name', 'twitter:site', tw.site);
  meta('name', 'twitter:title', tw.title);
  meta('name', 'twitter:description', tw.description);
  meta('name', 'twitter:image', tw.image);
  for (const block of page.schemaBlocks.filter((b) => b.valid)) {
    lines.push(`<script type="application/ld+json">\n${jsonLdText(block.data)}\n</script>`);
  }
  return lines.join('\n');
}

function loadJsonFile(file, what) {
  if (!existsSync(file) || statSync(file).isDirectory()) fail(`${what} not found: ${file}`, 2);
  try {
    return JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, ''));
  } catch (e) {
    fail(`${file} is not valid JSON: ${e.message}`, 2);
  }
  return null;
}

function cmdCheck(args) {
  const file = args._[1];
  if (!file) fail(`Which proposal file?\n${USAGE}`, 2);
  const proposal = loadJsonFile(file, 'Proposal file');
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal) || !Array.isArray(proposal.pages) || !proposal.pages.length) {
    fail('The proposal needs a "pages" list, e.g. {"site": {"name": "Brand", "url": "https://…"}, "pages": [{"url": "https://…/", "title": "…", "description": "…"}]}', 2);
  }
  const site = proposal.site && typeof proposal.site === 'object' ? proposal.site : {};
  const siteChecksExtra = [];
  if (!site.name) siteChecksExtra.push({ id: 'site-name', status: 'info', message: 'No site.name — the brand-suffix check and og:site_name are skipped' });
  if (site.url) {
    const prob = urlProblem(site.url);
    if (prob) siteChecksExtra.push({ id: 'site-url', status: prob === 'http' ? 'warn' : 'fail', message: `site.url ${URL_PROBLEM_TEXT[prob]}`, evidence: site.url });
  }

  const pages = proposal.pages.map((raw, i) => {
    const pg = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const url = typeof pg.url === 'string' ? pg.url.trim() : '';
    const checks = [];
    let isHome = false;
    if (!url) checks.push({ id: 'url', status: 'fail', message: `Page ${i + 1} has no "url"`, fix: 'Add the full https:// address of the page.' });
    else {
      const prob = urlProblem(url);
      if (prob === 'relative' || prob === 'not-web') checks.push({ id: 'url', status: 'fail', message: `Page URL ${URL_PROBLEM_TEXT[prob]}`, evidence: url });
      else {
        if (prob === 'http') checks.push({ id: 'url', status: 'warn', message: `Page URL ${URL_PROBLEM_TEXT.http}`, evidence: url });
        isHome = new URL(url).pathname === '/';
        if (site.url && !urlProblem(site.url) && !isSameSite(url, site.url)) checks.push({ id: 'url-other-site', status: 'warn', message: `Page is not on ${siteKey(site.url)}`, evidence: url });
      }
    }
    const schemaBlocks = asArray(pg.schema).map((item, j) => {
      let data = item;
      if (typeof item === 'string') {
        try {
          data = JSON.parse(item);
        } catch (e) {
          return { index: j + 1, valid: false, error: String(e.message).slice(0, 160), types: [] };
        }
      }
      const v = validateJsonLd(data);
      return { index: j + 1, valid: true, types: v.types, issues: v.issues, data };
    });
    const page = {
      url: url || `(page ${i + 1})`,
      isHome,
      title: typeof pg.title === 'string' ? pg.title : '',
      description: typeof pg.description === 'string' ? pg.description : '',
      canonical: typeof pg.canonical === 'string' ? pg.canonical : '',
      robots: typeof pg.robots === 'string' ? pg.robots : '',
      og: pg.og && typeof pg.og === 'object' ? pg.og : {},
      twitter: pg.twitter && typeof pg.twitter === 'object' ? pg.twitter : {},
      schemaBlocks,
    };
    page.checks = [...checks, ...metaChecks(page, 'check'), ...schemaChecks(schemaBlocks, { mode: 'check', isHome })];
    return page;
  });

  const site2 = [...siteChecksExtra, ...siteChecks(pages, { mode: 'check', brand: site.name || null })];
  for (const p of pages) {
    sortChecks(p.checks);
    p.verdict = verdictOf(p.checks);
    p.snippet = buildSnippet(p, site);
  }
  const anyFail = pages.some((p) => p.verdict === 'fail') || site2.some((s) => s.status === 'fail');
  const anyWarn = pages.some((p) => p.verdict === 'warn') || site2.some((s) => s.status === 'warn');
  const verdict = anyFail ? 'fail' : anyWarn ? 'pass with warnings' : 'pass';

  // Optional: compare with a scan report for an old → new table.
  let changes = null;
  if (args.compare) {
    if (typeof args.compare !== 'string') fail('--compare needs the path of a scan report (JSON).', 2);
    const scan = loadJsonFile(args.compare, 'Scan report');
    const before = new Map();
    for (const sp of Array.isArray(scan?.pages) ? scan.pages : []) {
      for (const u of [sp.url, sp.finalUrl].filter(Boolean)) before.set(normalizeUrl(u).replace(/\/$/, ''), sp);
    }
    changes = pages.map((p) => {
      const old = before.get(normalizeUrl(p.url).replace(/\/$/, ''));
      const oldTypes = old ? (old.schema?.types || old.schemaTypes || []) : null;
      return {
        url: p.url,
        found: !!old,
        title: { before: old ? old.title ?? null : null, after: p.title },
        description: { before: old ? old.description ?? null : null, after: p.description },
        schemaTypes: { before: oldTypes, after: [...new Set(p.schemaBlocks.flatMap((b) => b.types))].sort() },
      };
    });
    for (const p of pages) p.before = changes.find((c) => c.url === p.url);
  }

  const slug = slugify(siteKey(site.url || pages.find((p) => /^https?:/.test(p.url))?.url || '') || 'site');
  const outPath = typeof args.out === 'string' ? args.out : `.powerup/reports/meta-${slug}-${isoDate()}.json`;
  let snippetsPath = null;
  if (args.snippets) snippetsPath = typeof args.snippets === 'string' ? args.snippets : `.powerup/reports/meta-${slug}-${isoDate()}-snippets.html`;

  const fullPages = pages.map((p) => ({
    url: p.url,
    verdict: p.verdict,
    title: p.title,
    titleMeasure: measureText(p.title, LIMITS.title.font),
    description: p.description,
    descriptionMeasure: measureText(p.description, LIMITS.description.font),
    schemaTypes: [...new Set(p.schemaBlocks.flatMap((b) => b.types))].sort(),
    checks: p.checks,
    snippet: p.snippet,
  }));
  writeJson(outPath, {
    tool: TOOL,
    version: VERSION,
    command: 'check',
    checkedAt: new Date().toISOString(),
    proposal: file,
    site,
    verdict,
    limits: { ...LIMITS, note: 'Pixel widths are estimates (Arial character widths), not measurements.' },
    schemaRules: `Google Search Central structured-data docs (${GOOGLE_DOCS}), checked 2026-11-20`,
    siteChecks: site2,
    pages: fullPages,
    ...(changes ? { changes } : {}),
  });
  if (snippetsPath) {
    mkdirSync(dirname(resolve(snippetsPath)), { recursive: true });
    writeFileSync(snippetsPath, renderSnippetsHtml({ site, verdict, pages }));
  }

  printJson({
    tool: TOOL,
    command: 'check',
    verdict,
    summary: {
      pages: pages.length,
      pass: pages.filter((p) => p.verdict === 'pass').length,
      warn: pages.filter((p) => p.verdict === 'warn').length,
      fail: pages.filter((p) => p.verdict === 'fail').length,
    },
    site: site2.map((s) => ({ id: s.id, status: s.status, message: s.message })),
    pages: fullPages.map((p) => ({
      url: p.url,
      verdict: p.verdict,
      title: `${p.titleMeasure.chars} chars, ~${p.titleMeasure.px} px`,
      description: `${p.descriptionMeasure.chars} chars, ~${p.descriptionMeasure.px} px`,
      schemaTypes: p.schemaTypes,
      problems: problemLines(p.checks),
    })),
    fullReport: outPath,
    ...(snippetsPath ? { snippets: snippetsPath } : {}),
  });
  process.exitCode = anyFail ? 1 : 0;
}

function renderSnippetsHtml({ site, verdict, pages }) {
  const label = { pass: 'Ready', warn: 'Ready — with warnings', fail: 'Not ready — fix the failures first' };
  const sections = pages.map((p, i) => {
    let host = p.url;
    try {
      const u = new URL(p.url);
      host = `${u.hostname}${u.pathname === '/' ? '' : ` › ${u.pathname.replace(/^\/|\/$/g, '').split('/').join(' › ')}`}`;
    } catch { /* keep as is */ }
    const issues = p.checks.filter((c) => c.status === 'fail' || c.status === 'warn');
    const before = p.before && p.before.found ? `
<table class="diff"><thead><tr><th></th><th>Now</th><th>New</th></tr></thead><tbody>
<tr><th>Title</th><td>${escText(p.before.title.before ?? '—')}</td><td>${escText(p.before.title.after)}</td></tr>
<tr><th>Description</th><td>${escText(p.before.description.before ?? '—')}</td><td>${escText(p.before.description.after)}</td></tr>
<tr><th>Schema</th><td>${escText((p.before.schemaTypes.before || []).join(', ') || '—')}</td><td>${escText(p.before.schemaTypes.after.join(', ') || '—')}</td></tr>
</tbody></table>` : '';
    return `<section class="page ${p.verdict}">
<h2>${escText(p.url)}</h2>
<p class="badge">${label[p.verdict]}</p>
<div class="serp" aria-label="Search result preview (estimate)">
<div class="serp-url">${escText(host)}</div>
<div class="serp-title">${escText(fitWidth(p.title, LIMITS.title.px, LIMITS.title.font))}</div>
<div class="serp-desc">${escText(fitWidth(p.description, LIMITS.description.px, LIMITS.description.font))}</div>
</div>${before}
${issues.length ? `<ul class="issues">${issues.map((c) => `<li class="${c.status}"><strong>${c.status}</strong> ${escText(c.message)}${c.fix ? ` <span class="fix">→ ${escText(c.fix)}</span>` : ''}</li>`).join('\n')}</ul>` : ''}
<div class="code"><button type="button" class="copy" data-target="code-${i}">Copy code</button>
<pre><code id="code-${i}">${escText(p.snippet)}</code></pre></div>
</section>`;
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Meta and schema code${site.name ? ` — ${escText(site.name)}` : ''}</title>
<style>
:root { --text: #1f2937; --muted: #6b7280; --line: #e5e7eb; --bg: #ffffff; --soft: #f9fafb; --fail: #b91c1c; --warn: #b45309; --pass: #047857; }
* { box-sizing: border-box; }
body { margin: 0; padding: 32px 16px 64px; font: 16px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--text); background: var(--bg); }
main { max-width: 900px; margin: 0 auto; }
h1 { font-size: 28px; margin: 0 0 8px; }
h2 { font-size: 16px; margin: 0 0 4px; word-break: break-all; }
.intro { color: var(--muted); margin: 0 0 32px; }
.page { border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin: 0 0 24px; }
.badge { display: inline-block; margin: 0 0 16px; padding: 2px 10px; border-radius: 999px; font-size: 13px; font-weight: 600; color: #fff; }
.pass .badge { background: var(--pass); } .warn .badge { background: var(--warn); } .fail .badge { background: var(--fail); }
.serp { font-family: Arial, sans-serif; max-width: 600px; margin: 0 0 16px; }
.serp-url { font-size: 14px; color: #202124; }
.serp-title { font-size: 20px; line-height: 1.3; color: #1a0dab; white-space: nowrap; overflow: hidden; }
.serp-desc { font-size: 14px; line-height: 1.58; color: #4d5156; }
.diff { width: 100%; border-collapse: collapse; margin: 0 0 16px; font-size: 14px; }
.diff th, .diff td { border: 1px solid var(--line); padding: 6px 8px; text-align: left; vertical-align: top; }
.issues { padding-left: 20px; font-size: 14px; }
.issues .fail strong { color: var(--fail); } .issues .warn strong { color: var(--warn); }
.fix { color: var(--muted); }
.code { position: relative; }
pre { background: var(--soft); border: 1px solid var(--line); border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 13px; line-height: 1.5; margin: 0; }
.copy { position: absolute; top: 8px; right: 8px; font: inherit; font-size: 13px; padding: 4px 10px; border: 1px solid var(--line); border-radius: 6px; background: #fff; cursor: pointer; }
@media print { .copy { display: none; } .page { break-inside: avoid; } }
</style>
</head>
<body>
<main>
<h1>Meta and schema code${site.name ? ` — ${escText(site.name)}` : ''}</h1>
<p class="intro">Overall: <strong>${escText(verdict)}</strong>. Paste each block inside the page's &lt;head&gt; (or use the platform steps you were given). The search preview and pixel widths are estimates — Google decides the final snippet. Made with Power-Up Kit meta-schema on ${isoDate()}.</p>
${sections.join('\n')}
</main>
<script>
document.querySelectorAll('button.copy').forEach(function (b) {
  b.addEventListener('click', function () {
    var code = document.getElementById(b.getAttribute('data-target')).textContent;
    navigator.clipboard.writeText(code).then(function () { b.textContent = 'Copied'; }, function () { b.textContent = 'Select the code and copy it'; });
    setTimeout(function () { b.textContent = 'Copy code'; }, 2000);
  });
});
</script>
</body>
</html>
`;
}

// ===========================================================================
// 8. width
// ===========================================================================
function cmdWidth(args) {
  const texts = args._.slice(1);
  if (!texts.length) fail('Usage: node meta-schema.mjs width "<text>" ["<text>"…] [--font-size 20]', 2);
  const size = Number(args['font-size']) > 0 ? Number(args['font-size']) : LIMITS.title.font;
  printJson({
    tool: TOOL,
    command: 'width',
    font: `Arial ${size}px (estimate)`,
    limits: { title: `~${LIMITS.title.px} px at ${LIMITS.title.font}px`, description: `~${LIMITS.description.px} px at ${LIMITS.description.font}px` },
    results: texts.map((t) => ({ text: t, ...measureText(t, size) })),
  });
}

// ===========================================================================
function writeJson(path, data) {
  mkdirSync(dirname(resolve(path)), { recursive: true });
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2), { booleans: ['sitemap'] });
const command = args._[0];
if (command === 'scan') await cmdScan(args);
else if (command === 'check') cmdCheck(args);
else if (command === 'width') cmdWidth(args);
else fail(`${command ? `Unknown command "${command}".\n` : ''}${USAGE}`, 2);
