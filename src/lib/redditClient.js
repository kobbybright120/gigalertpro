// ─────────────────────────────────────────────────────────────────────────────
// GigAlertPro — Smart Reddit Gig Scanner Engine
// Fetches REAL job/gig postings from Reddit (clients looking to hire).
// Filters out freelancer self-promotions. Scores & ranks by relevance.
// ─────────────────────────────────────────────────────────────────────────────

// ── Subreddit Config ─────────────────────────────────────────────────────────
// Each entry defines name, fetch mode, and weight multiplier for scoring.
// "search" mode uses Reddit flair search to pre-filter at the API level.
const SUBREDDITS = [
  { name: "forhire", search: "flair:Hiring", mode: "search", weight: 1.3 },
  { name: "slavelabour", search: "flair:Task", mode: "search", weight: 1.2 },
  { name: "hiring", mode: "new", weight: 1.2 },
  { name: "freelance_forhire", mode: "new", weight: 1.0 },
  { name: "gameDevClassifieds", mode: "new", weight: 0.9 },
  { name: "DesignJobs", mode: "new", weight: 1.0 },
  { name: "ProgrammingJobs", mode: "new", weight: 1.1 },
  { name: "CodingJobs", mode: "new", weight: 1.1 },
  { name: "Programmers_forhire", mode: "new", weight: 1.0 },
  { name: "SoftwareEngineerJobs", mode: "new", weight: 1.1 },
  { name: "WebDeveloperJobs", mode: "new", weight: 1.1 },
  { name: "techjobs", mode: "new", weight: 1.0 },
  { name: "WebDevJobs", mode: "new", weight: 1.1 },
  { name: "MachineLearningJobs", mode: "new", weight: 1.0 },
  { name: "DeveloperJobs", mode: "new", weight: 1.1 },
  { name: "GraphicDesignJobs", mode: "new", weight: 1.0 },
  { name: "Designers_forhire", mode: "new", weight: 1.0 },
  { name: "HireAnEditor", mode: "new", weight: 1.0 },
  { name: "ContentWriter_forhire", mode: "new", weight: 1.0 },
  { name: "IllustratorsForHire", mode: "new", weight: 1.0 },
  { name: "artistforhire", mode: "new", weight: 1.0 },
  { name: "forhire2", mode: "new", weight: 1.0 },
  { name: "YouTubeEditorsForHire", mode: "new", weight: 1.0 },
  { name: "VoiceWork", mode: "new", weight: 1.0 },
  { name: "VideoEditors_forhire", mode: "new", weight: 1.0 },
  { name: "VideoEditors", mode: "new", weight: 1.0 },
  { name: "VideoEditingJobs", mode: "new", weight: 1.0 },
  { name: "FindVideoEditors", mode: "new", weight: 1.0 },
  { name: "VoiceActing", mode: "new", weight: 0.9 },
  { name: "MarketingJobs", mode: "new", weight: 1.0 },
  { name: "hireforgigs", mode: "new", weight: 1.1 },
  { name: "ForHireFreelance", mode: "new", weight: 1.0 },
  { name: "DevsForHire", mode: "new", weight: 1.1 },
  { name: "Jobs4Bitcoins", mode: "new", weight: 0.9 },
  { name: "WritingJobBoard", mode: "new", weight: 1.0 },
  { name: "VirtualAssistant4Hire", mode: "new", weight: 1.0 },
  { name: "BPOinPH", mode: "new", weight: 1.0 },
  { name: "jobnetworking", mode: "new", weight: 1.0 },
  { name: "RemoteJobs", mode: "new", weight: 1.0 },
  { name: "NashvilleJobs", mode: "new", weight: 1.0 },
  { name: "RecruitingHiringPH", mode: "new", weight: 1.0 },
  { name: "VancouverJobs", mode: "new", weight: 1.0 },
  { name: "remotelegaljobs", mode: "new", weight: 1.0 },
];

// ── Cache (persisted in sessionStorage to survive HMR reloads) ───────────────
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes — keep data reasonably fresh
const CACHE_KEY = "gigalertpro_reddit_cache";
function loadCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c.data && c.ts && Date.now() - c.ts < CACHE_TTL_MS) return c;
    }
  } catch {
    /* ignore */
  }
  return { data: null, ts: 0 };
}
function saveCache(c) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {
    /* ignore */
  }
}
let cache = loadCache();

// ── Gig Categories ───────────────────────────────────────────────────────────
const CATEGORIES = [
  {
    label: "Development",
    icon: "code",
    rx: /\b(develop|coding|programm|software|web\s?dev|frontend|backend|full.?stack|react|angular|vue|node|python|java|php|ruby|swift|flutter|mobile\s?app|android|ios|api|database|wordpress|shopify|wix|squarespace|html|css|javascript|typescript|blockchain|solidity|smart\s?contract|game\s?dev|unity|unreal|godot)\b/i,
  },
  {
    label: "Design",
    icon: "palette",
    rx: /\b(design|logo|graphic|ui\/?ux|figma|photoshop|illustrat|brand|visual|banner|poster|flyer|infographic|thumbnail|canva|3d\s?artist|blender|creative\s?director)\b/i,
  },
  {
    label: "Writing",
    icon: "pen",
    rx: /\b(writ|copywriting|content|blog|article|seo\s?writ|ghostwrit|technical\s?writ|edit|proofread|translat|transcript)\b/i,
  },
  {
    label: "Marketing",
    icon: "megaphone",
    rx: /\b(market|seo|social\s?media|ads?\b|advertis|email\s?market|ppc|google\s?ads|facebook\s?ads|growth\s?hack|funnel|lead\s?gen|influencer|digital\s?market|brand\s?strateg)\b/i,
  },
  {
    label: "Video & Audio",
    icon: "video",
    rx: /\b(video|animation|motion\s?graphic|after\s?effects|premiere|youtube|podcast|audio|voice.?over|voice\s?act|narrator|music\s?produc|sound\s?design|audio\s?engineer)\b/i,
  },
  {
    label: "Data & AI",
    icon: "brain",
    rx: /\b(data|machine\s?learn|ai\b|artificial|scraping|analy|automat|bot|chatbot|gpt|llm|neural|deep\s?learn)\b/i,
  },
  {
    label: "Business & Admin",
    icon: "headset",
    rx: /\b(virtual\s?assistant|va\b|admin|data\s?entry|research|customer\s?(?:service|support)|bookkeep|scheduling|project\s?manag|executive\s?assist|secretary|operations)\b/i,
  },
  {
    label: "Sales",
    icon: "dollar-sign",
    rx: /\b(sales|cold\s?call|outreach|biz\s?dev|business\s?develop|account\s?exec|closing|lead\s?qualif|commission|telesales)\b/i,
  },
  {
    label: "Photography",
    icon: "camera",
    rx: /\b(photo|photographer|headshot|portrait|product\s?photo|real\s?estate\s?photo|lightroom|retouching)\b/i,
  },
  {
    label: "Translation",
    icon: "globe",
    rx: /\b(translat|interpret|locali[sz]|multilingual|bilingual|spanish|french|german|chinese|japanese|korean|arabic|portuguese|hindi)\b/i,
  },
];

// ── Self-Promotion Detection (freelancer ads — we REJECT these) ──────────────
const SELF_PROMO_PATTERNS = [
  /\[for\s?hire\]/i,
  /\bfor\s?hire\b/i,
  /\bhire\s?me\b/i,
  /\[offer\]/i,
  /\bi\s?(?:am|'m)\s+(?:a|an)\b.{0,50}\b(designer|developer|writer|editor|freelanc|coder|artist|programmer|marketer|consultant|engineer|animator|videograph)/i,
  /\bi\s?(?:am|'m)\s+an?\s+experienced\b/i,
  /\boffering\s+my\b/i,
  /\boffering\b.{0,25}\bservices?\b/i,
  /\bavailable\s+for\b.{0,25}\b(work|projects?|freelanc|gigs?|hire)\b/i,
  /\blooking\s+for\b.{0,25}\b(work|clients?|projects?|opportunities|gigs?)\b/i,
  /\bmy\s+(?:services|portfolio|rates?|work)\b/i,
  /\bcheck\s+out\s+my\b/i,
  /\bopen\s+(?:to|for)\s+(?:work|commissions|projects?)\b/i,
  /\bi\s+(?:specialize|specialise)\b/i,
  /\byears?\s+(?:of\s+)?experience\b.{0,30}\b(?:in|with)\b/i,
  /\bportfolio\s*:/i,
  /\bhere\s+(?:is|are)\s+(?:my|some)\b.{0,20}\b(?:work|samples?|examples?)\b/i,
  // ── Extended patterns for sneaky pitches ──
  /\bi\s+help\b.{0,40}\b(freelancers?|marketers?|agencies|business|startups?)\b/i,
  /\bhere'?s\s+how\s+you\s+can\b/i,
  /\bincrease\s+(?:your|the)\b.{0,30}\b(?:value|revenue|income|earnings|sales)\b/i,
  /\bi\s+work\s+with\b.{0,30}\b(?:clients?|teams?|agencies|businesses?)\b/i,
  /\bisn'?t\s+an?\s+(?:agency|sales?)\s+pitch\b/i,
  /\bthis\s+isn'?t\b.{0,20}\bpitch\b/i,
  /\bnot\s+(?:a|an)\b.{0,15}\bpitch\b/i,
  /\bI\s+(?:built|created|made|launched)\b.{0,40}\b(?:tool|app|platform|service|saas|product)\b/i,
  /\bDM\s+(?:me|for)\b/i,
  /\bmessage\s+me\b/i,
  /\breach\s+out\s+to\s+me\b/i,
  /\bbooking\s+(?:clients?|calls?|sessions?)\b/i,
  /\bbook\s+a\s+(?:call|session|consultation)\b/i,
  /\bget\s+(?:in\s+touch|started)\b.{0,15}$/im,
  /\bhere'?s\s+(?:what|how)\s+(?:I|we)\b.{0,30}\b(?:do|offer|provide)\b/i,
  // ── Job-board subreddit patterns (for-hire / portfolio posts) ──
  /\[portfolio\]/i,
  /\[seeking/i,
  /\[available\]/i,
  /\[looking\s+for\s+work\]/i,
  /\bended\s+up\s+building\b/i,
  /\bi\s+(?:recently\s+)?graduated\b/i,
  /\bmy\s+(?:experience|skills?)\s+include/i,
  /\bmy\s+(?:primary|main)\s+focus\s+is\b/i,
  /\bgaining\s+(?:hands-on|industry|real-world)\s+experience\b/i,
  /\bdecided\s+to\s+(?:throw|put)\s+it\s+out\s+there\b/i,
  /\bcurious\s+if\b.{0,40}\buseful\s+to\s+other/i,
  /\bi'?ve\s+been\s+(?:actively\s+)?(?:working|freelancing|building)\b/i,
  // ── Career advice / coaching / content creators ──
  /\bI\s+wanted\s+to\s+share\b.{0,30}\b(?:insights?|tips?|advice|video|resource|guide)\b/i,
  /\bthe\s+community\s+might\s+find\s+(?:useful|helpful|interesting)\b/i,
  /\ba\s+video\s+I\s+(?:found|made|created|recorded)\b/i,
  /\byou(?:'re|\s+are)\s+not\s+alone\b/i,
  /\bthe\s+market\s+(?:feels?|is|looks?|seems?)\s+(?:brutal|tough|rough|bad|terrible|dead|horrible)\b/i,
  // ── "Available" in title — freelancer availability post, not a gig ──
  /\bavailable\b.{0,30}\b(?:portfolio|react|node|mongodb|resume|cv|github|samples?|work\s+samples?)\b/i,
  /\bportfolio\s+inside\b/i,
  // ── YOE / resume-style self-promo patterns ──
  /\b\d+\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:experience|exp)\b/i,
  /\b(?:senior|lead|junior|mid|staff)\s+(?:level\s+)?(?:developer|engineer|designer|writer|editor|programmer|freelancer|consultant)\b.{0,50}\b(?:here|available|looking|seeking|open)\b/i,
  /\bI\s+have\s+\d+\+?\s*(?:years?|yrs?)\b/i,
  /\bI\s+am\s+(?:a\s+)?(?:considered|experienced|seasoned|skilled|proficient|senior|lead)\b/i,
  /\bwell\s*[-\s]?versed\s+in\b/i,
  // ── "Looking to [offer services]" — freelancer pitching, not a client hiring ──
  /\blooking\s+to\s+(?:compose|create|make|design|build|develop|write|produce|record|edit|offer|provide|do)\b/i,
  /\blooking\s+to\b.{0,40}\b(?:for\s+(?:indie|small|your|any|game|music|startup))\b/i,
  // ── Discounted / cheap service pitch ──
  /\b(?:discounted|affordable|cheap|low[\s-]?cost|budget[\s-]?friendly)\s+(?:services?|rates?|prices?|work|music|design|dev)/i,
  // ── Credential showcase / featured-in bragging ──
  /\bfeatured\s+(?:in|on|at|among)\b/i,
  /\bwith\s+\d[\d,.]*[KkMm]?\+?\s+(?:subscribers?|followers?|views?|downloads?)\b/i,
  /\bI\s+composed\b/i,
  /\bI\s+(?:have\s+)?(?:been\s+)?making\b.{0,30}\bfor\s+(?:over\s+)?\d+\s+(?:years?|yrs?)\b/i,
  // ── Job-seeker patterns ("help me get hired", "getting into freelancing") ──
  /\b(?:need|want)\s+(?:assistance|help|advice|tips?)\s+(?:for|with|on|about)\s+(?:getting|finding|landing)\s+(?:hired|a\s+job|work|clients?)\b/i,
  /\b(?:how\s+(?:do|can|to)|help\s+me)\b.{0,30}\b(?:get\s+hired|find\s+(?:a\s+)?(?:job|work|clients?)|land\s+(?:a\s+)?(?:job|gig|role))\b/i,
  /\b(?:final|last)\s+year\s+student\b/i,
  /\blooking\s+(?:for|to\s+(?:get|find|land))\b.{0,25}\b(?:my\s+first|an?\s+(?:entry|junior)|(?:a|some)\s+(?:job|work|internship|position|role))\b/i,
];

// ── Non-tech "developer" false-positive filter (real-estate, housing, etc.) ──
const NON_TECH_DEVELOPER_RX =
  /\b(?:real\s*estate|housing|property|land|construction|urban|residential|affordable\s*housing|HUD|zoning|building\s*permits?|condo|apartment)\s.{0,40}\bdeveloper\b|\bdeveloper\b.{0,40}\b(?:real\s*estate|housing|property|land\s*use|rezoning|HUD|affordable|permits?)\b/i;

// ── X/Tweet: patterns that indicate a tweet is NOT an actionable job post ──
const X_REJECT_PATTERNS = [
  // Replies and retweets (not original job posts)
  /^R\s+to\s+@/i,
  /^RT\s+@/i,

  // ── Negations: "you don't need a developer", "no need for", "not hiring" ──
  /\b(?:don'?t|doesn'?t|do\s+not|no\s+longer|not?)\s+(?:need|looking|hiring|seeking)\b/i,
  /\bdon'?t\s+need\s+to\s+be\s+a\b/i,
  /\byou\s+don'?t\s+need\b/i,
  /\bno\s+need\s+(?:for|to)\b/i,
  /\bnot\s+(?:actually\s+)?hiring\b/i,

  // ── Hiring used as analogy, metaphor, or anti-hiring context ──
  /\b(?:is|was|feels?|felt|sounds?)\s+like\s+hiring\b/i,
  /\blike\s+hiring\s+(?:a|an)\b/i,
  /\bsaved?\s+(?:myself|ourselves|me|us|yourself|you|money|time)\s+(?:from\s+)?hiring\b/i,
  /\b(?:replaced?|replacing|eliminat|automat|avoid|skip|bypass)\b.{0,30}\bhiring\b/i,
  /\binstead\s+of\s+hiring\b/i,
  /\bwithout\s+(?:even\s+)?hiring\b/i,
  /\bno\s+(?:need|point|reason)\b.{0,20}\bhiring\b/i,
  /\bwhy\s+(?:you\s+)?(?:should(?:n'?t)?|don'?t)\s+(?:need\s+to\s+)?hir/i,

  // ── Stories, anecdotes, opinions ──
  /\bI\s+(?:met|saw|found|noticed|read|heard|came\s+across)\s+(?:this|a|an|some)\b/i,
  /\baccording\s+to\b/i,
  /\bI\s+genuinely\s+(?:felt|feel|think|believe)\b/i,
  /\bsadly\b/i,
  /\bvolunteer\s+(?:role|position|basis|work)\b/i,
  /\bno\s+pay\b|\bunpaid\b|\bfor\s+free\b|\bfree\s+work\b/i,

  // ── Commentary, advice, hot-takes ──
  /\b(?:freelancers?|developers?)\s+(?:who|that|should|will|are\s+going\s+to)\b.{0,40}\b(?:dominate|win|succeed|learn|thrive)\b/i,
  /\bwould\s+love\s+to\s+learn\s+more\b/i,
  /\bthe\s+(?:biggest|real)\s+(?:barrier|problem|issue|challenge|reason)\b/i,
  /\bremoving\s+the\b.{0,20}\bbarrier\b/i,
  /\b(?:tips?|advice|thread|thoughts?)\s+(?:for|on|about)\b.{0,20}\b(?:freelanc|developer|designer|hiring)/i,
  /\bhere'?s\s+(?:why|what|how)\b/i,
  /\blet\s+me\s+(?:explain|tell\s+you|share)\b/i,
  /\bthe\s+future\s+of\b/i,
  // ── AI / automation commentary (uses hiring vocab but isn't a job) ──
  /\bai\s+(?:will|can|is|has|already)\b.{0,40}\b(?:replac|automat|eliminat|kill|destroy|disrupt|mak.{0,10}\bobsolete)\b/i,
  /\b(?:replac|automat|eliminat)\b.{0,30}\b(?:hiring|freelancer|developer|designer|writer|human|worker|employee)\b/i,
  /\balready\s+saved\s+(?:myself|me|us)\b/i,
  /\bneed\s+more\s+convincing\b/i,
  /\bimpression(?:s)?\s+we(?:'re|\s+are)\s+getting\b/i,
  /\bsince\s+we\s+(?:automated|started|switched|stopped)\b/i,
  // ── Tech / product tips, tutorials, threads ──
  /\bevery\b.{0,20}\bsession\b.{0,30}\b(?:starts?\s+from|re-?explain|without\s+(?:a|context))\b/i,
  /\byou(?:'ll|\s+will)\s+spend\b.{0,30}\b(?:minutes?|hours?|time)\b.{0,20}\b(?:re-?explain|context|onboard)\b/i,
  /\b(?:pro\s+tip|here'?s\s+(?:a|the)\s+(?:fix|solution)|hot\s+take|unpopular\s+opinion|controversial\s+take)\b/i,
  /\b\d+\s+(?:hours?|minutes?)\s+(?:per|a|every)\s+(?:month|week|day|session)\s+wasted\b/i,
  /\b(?:wasted|wasting|waste)\s+(?:on|of)\s+(?:re-?explain|onboard|context(?:ing)?)\b/i,
  /\bstarts?\s+from\s+zero\b/i,

  // ── Agency / company / service marketing (NOT a job post) ──
  /\bwe\s+(?:place|connect|match|pair|deliver|build|run)\b.{0,40}\b(?:managed|pre-?vetted|dedicated|professional|qualified)/i,
  /\bwe\s+(?:place|provide|offer)\b.{0,30}\b(?:virtual\s*assistant|VA|freelancer|developer|designer|writer|marketer|talent)/i,
  /\bthat'?s\s+(?:not\s+)?what\s+we\s+do\b/i,
  /\b(?:our|my)\s+(?:agency|company|service|platform|firm|business|solution|tool)\b.{0,40}\b(?:helps?|offers?|provides?|handles?|manages?|delivers?|connects?|places?)/i,
  /\bwe\s+(?:help|assist|support|enable)\s+(?:you|founders?|businesses?|companies|startups?|entrepreneurs?|clients?|teams?|brands?)\b/i,
  /\bwe\b.{0,20}\b(?:specialize|focus|excel)\s+(?:in|on|at)\b/i,
  /\bpre-?vetted\b/i,
  /\bdedicated\s+(?:account\s+)?manager\b/i,
  /\b(?:book|schedule)\s+(?:a\s+)?(?:call|demo|consultation|session|meeting)\b/i,
  /\bour\s+(?:team|VA|virtual\s*assistant|freelancer|talent|expert)s?\s+(?:are|have|come\s+with|include|handle)\b/i,
  /\bfull(?:y)?\s+(?:managed|onboarded|trained|vetted)\b/i,

  // ── Testimonial stats / sales results ──
  /\b\d{2,3}\s*%\s+(?:retention|satisfaction|success|completion|approval|uptime|of\s+(?:our|my)\s+clients?)\b/i,
  /\bthe\s+result\s*[?→:]/i,
  /\bclient\s+(?:results?|success|testimonial|story|case\s+study)\b/i,
  /\bcase\s+stud(?:y|ies)\b/i,

  // ── Pain-point marketing / sales copy ──
  /\bif\s+you(?:'re|\s+are)\s+(?:a\s+)?(?:founder|CEO|startup|business\s*owner|entrepreneur|agency\s*owner|solopreneur|coach|creator)\b/i,
  /\b(?:stop|quit|tired\s+of)\s+(?:wasting|spending|losing|doing)\b.{0,30}\b(?:time|money|hours?|admin|tasks?|work)\b/i,
  /\bwithout\s+the\b.{0,25}\b(?:hassle|headache|stress|risk|worry|revolving|guesswork|burnout)\b/i,
  /\brevolving\s+door\b/i,
  /\byou\s+get\s+(?:your|a)\b.{0,30}\bhandled\b/i,
  /\bthe\s+real\s+reason\b/i,
  /\b(?:most|many)\s+(?:founders?|businesses?|companies|entrepreneurs?|people)\s+(?:fail|struggle|waste|don'?t|can'?t)\b/i,

  // ── Product / tool / course marketing ──
  /\bjust\s+launched\b/i,
  /\bbuilt\s+(?:a|this|an?)\s+(?:tool|app|platform|product|saas|extension|plugin)\b/i,
  /\b(?:my|our)\s+(?:new\s+)?(?:tool|app|platform|product|saas|course|program|ebook|masterclass)\b/i,
  /\benroll\s+(?:now|today|here)\b/i,
  /\b(?:free|paid)\s+(?:trial|demo|webinar|masterclass|workshop|bootcamp|course)\b/i,
  /\bsubscribe\s+(?:to\s+)?(?:my|our)\b/i,

  // ── Marketing / audience-building tweets ──
  /\blike\s+&\s+(?:comment|retweet|share|follow)\b/i,
  /\bfollow\s+(?:me|us|for|this)\b/i,
  /\bretweet\s+(?:if|this)\b/i,
  /\btag\s+(?:a|someone|your)\b/i,

  // ── Self-promo from X users (freelancers pitching themselves) ──
  /\bI\s+am\s+a\s+professional\b/i,
  /\bI'?m\s+a\s+(?:professional|experienced|skilled|certified)\b/i,
  /\bhit\s+me\s+up\b/i,
  /\bI\s+(?:offer|provide|specialize)\b/i,
  /\bI\s+(?:can\s+)?help\s+(?:you|your)\b.{0,30}\b(?:with|build|grow|scale|manage|design|develop|create|write)\b/i,
  /\banyone\s+(?:is\s+)?looking\s+for\s+(?:a|an)\b.{0,40}\bwith\s+\d+\s+years?\b/i,
  /\b(?:DM|message)\s+(?:me|us)\b/i,
  /\bfeel\s+free\s+to\s+(?:DM|message|contact|reach\s+out|email|ping)\b/i,
  /\bavailable\s+for\s+(?:hire|work|projects?|freelance|gigs?)\b/i,
  /\bopen\s+(?:for|to)\s+(?:work|projects?|freelance|collaborat|new\s+clients?)\b/i,
  /\bI\s+(?:just\s+)?(?:completed|finished|delivered|built|designed|created|developed)\s+(?:a|an|this)\b/i,
  /\blooking\s+for\s+(?:new\s+)?clients?\b/i,
  /\b(?:my|check\s+out\s+my)\s+(?:portfolio|website|work|services?|fiverr|upwork|profile)\b/i,
  /\bhire\s+me\b/i,

  // "if [anyone/you/you're/somebody] need/looking for [someone/a] [role]" — freelancer pitch
  /\bif\s+(?:anyone|anybody|someone|somebody|you(?:'re|\s+are)?)\s+(?:need|looking|search)\b/i,

  // "if you're looking for a [role]" — freelancer pitching, not a client posting
  /\bif\s+you(?:'re|\s+are)\s+(?:looking|searching)\s+for\s+(?:a|an)\s+(?:professional|reliable|skilled|experienced|creative|talented)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|va|virtual\s*assistant|consultant|photographer|illustrat|tutor|translator|bookkeeper|copywriter|video\s*editor|logo|brand|web)/i,

  // "I'm/I am looking for [work-type]" — job seeker, not poster
  /\bI(?:'m|\s+am)\s+(?:a\s+)?(?:looking\s+for|seeking|searching\s+for)\s+(?:work|projects?|gigs?|freelance|clients?|opportunities?|remote\s+work|new\s+opportunities)\b/i,
  // "need a [role]? I'm your guy/person"
  /\bneed\s+(?:a|an)\b.{0,30}\b(?:I'?m\s+your|look\s+no\s+further|I\s+(?:can|got)|here\s+to\s+help)\b/i,
  // Generic self-promo closers
  /\blet'?s\s+(?:connect|work\s+together|collaborate|chat|talk)\b/i,
  /\bready\s+to\s+(?:help|work|collaborate|start|take\s+on)\b/i,

  // ── Portfolio showcase / work samples (freelancer showing work, not a job) ──
  /\b(?:I|we)\s+(?:made|designed|created|built|did|drew|edited|animated|produced)\s+(?:this|that|it)\s+(?:for|with)\s+(?:a|my|our|the)?\s*client\b/i,
  /\bclient\s+(?:loved|was\s+(?:happy|thrilled|super\s+happy|pleased|satisfied)|approved)\b/i,
  /\b(?:came|turned)\s+out\s+(?:exactly|great|amazing|perfect|clean|fire)\b/i,
  /\bput\s+(?:a\s+lot\s+of\s+)?work\s+into\s+this\b/i,
  /\bspent\s+hours?\s+(?:designing|creating|working|editing|building|drawing|animating)\b/i,

  // ── Service listing spam (listing multiple services = freelancer ad) ──
  /\bunlimited\s+revisions?\b/i,
  /\b(?:logo|banner|thumbnail|emotes?|overlay|sub\s*badge|stream\s*(?:revamp|package|branding)|kick\s*\/?\s*twitch)\b.{0,60}\b(?:logo|banner|thumbnail|emotes?|overlay|sub\s*badge|stream|illustration|animation)\b/i,
  /\bwho\s+(?:do|make|does|creates?|designs?|builds?)\b.{0,40}\b(?:logo|banner|thumbnail|emotes?|overlay)\b/i,
  /\bGFX\s+artist\b/i,

  // ── Broad freelancer-ad structural patterns ──
  // Tweet that lists 3+ service types separated by commas (service catalog = ad)
  /(?:logo|banner|thumbnail|emotes?|overlay|flyer|poster|brochure|business\s*card|mockup|infographic|social\s*media\s*(?:post|design)|packaging|label|merch(?:andise)?|t-?shirt)(?:\s*[,/&+]\s*(?:logo|banner|thumbnail|emotes?|overlay|flyer|poster|brochure|business\s*card|mockup|infographic|social\s*media|packaging|label|merch|t-?shirt|illustration|animation|pixel\s*art)){2,}/i,

  // ── Manifestation, wishful thinking ──
  /\bmanifesting\b/i,

  // ── Questions / discussions (not job posts) ──
  /\bwhat'?s\s+the\s+(?:coolest|best|most)\b/i,
  /\bI'?m\s+looking\s+for\s+(?:something|a\s+conference|advice|tips)\b/i,
  /\ba\s+true\s+developer\b/i,
  /\bwhat\s+do\s+you\s+(?:think|recommend|suggest|prefer)\b/i,
  /\bhow\s+(?:do|did|can|should)\s+(?:you|we|I|they)\b.{0,30}\b(?:find|get|start|learn|choose|pick)\b/i,
  // ── Rants / complaints about hiring (not actual jobs) ──
  /\bdo\s+you\s+(?:feel|think)\s+(?:like\s+)?(?:this|that|it)\s+is\s+(?:a\s+)?problem\b/i,
  /\bI\s+(?:am|'m)\s+(?:so\s+)?(?:tired|sick|fu)/i,
  /\bplease\s+specify\s+your\s+requirement/i,
  /\bI\s+come\s+across\s+(?:many|so\s+many|a\s+lot|tons?\s+of)\b/i,
  /\bthere\s+is\s+no\s+(?:reference|clear\s+requirement|detail)/i,
  /\bwhat\s+(?:do|tf)\s+(?:you|u)\s+mean\s+by\s+that\b/i,
];

// ── X/Tweet: STRONG hiring signals (tweet body must contain at least one) ──
// These are deliberately strict — the tweet itself must be a job/gig post
const X_HIRING_SIGNALS = [
  // "hiring" used as an ACTION — "we're hiring", "now hiring", "is hiring"
  // Analogy/avoidance uses ("like hiring", "saved myself hiring") are
  // caught by X_REJECT_PATTERNS BEFORE this signal check runs.
  /\b(?:we(?:'re|\s+are)|i(?:'m|\s+am)|now|currently|actively|urgently|immediately)\s+hiring\b/i,
  /\b(?:\[hiring\]|#hiring)\b/i,
  /\bhiring\s+(?:a|an|for|remote|immediately|now|asap)\b/i,
  /\bwe(?:'re|\s+are)\s+(?:looking|searching)\b/i,
  /\blooking\s+(?:for|to\s+hire)\b.{0,35}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|va|virtual\s*assistant|consultant|someone|contractor|expert|engineer|animator|videograph|photographer|illustrat|tutor|translator|bookkeeper|social\s*media|copywriter|voice\s*(?:over|act)|proofread|transcri|podcast|music\s*produc|3d\s*artist|motion\s*graphic|seo|email\s*market|community\s*manag|project\s*manag|executive\s*assist|ghostwrit|blog|coach|accountant|paralegal|tax|sales|customer\s*support|lead\s*gen|shopify|amazon|product\s*list|data\s*(?:entry|analyst)|game\s*dev|blockchain|mobile\s*(?:app)?\s*dev|frontend|backend|full\s*stack|growth\s*hack|digital\s*market|brand\s*strateg|sound\s*design|audio\s*engineer|retoucher|locali[sz])/i,
  /\bneed\s+(?:a|an)\s+(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|consultant|expert|engineer|animator|videograph|photographer|illustrat|tutor|translator|bookkeeper|virtual\s*assistant|va|copywriter|voice\s*(?:over|act)|social\s*media|data\s*entry|proofread|transcri|podcast\s*editor|music\s*produc|3d\s*artist|motion\s*graphic|seo|ghostwrit|blog|coach|accountant|paralegal|tax\s*prepar|sales\s*rep|customer\s*support|shopify|lead\s*gen|project\s*manag|game\s*dev|blockchain\s*dev|mobile\s*(?:app)?\s*dev|frontend\s*dev|backend\s*dev|full\s*stack|growth\s*hack|digital\s*market|sound\s*design|audio\s*engineer|retoucher|locali[sz])\b/i,
  /\b(?:seeking|searching\s+for)\s+(?:a|an)?\s*(?:designer|developer|writer|freelanc|someone|expert|contractor|engineer|photographer|illustrat|animator|tutor|translator|va|virtual\s*assistant|marketer|copywriter|proofread|transcri|bookkeeper|coach|accountant|podcast|seo|social\s*media|data\s*analyst|project\s*manag|game\s*dev|blockchain|voice\s*(?:act|over)|music\s*produc|growth\s*hack|digital\s*market|mobile\s*dev|frontend|backend|full\s*stack)/i,
  /\bjob\s+(?:posting|opening|opportunity|position|listing|alert)\b/i,
  /\bopen\s+(?:role|position)s?\b/i,
  /\b(?:part|full)\s*-?\s*time\b.{0,20}\b(?:role|position|job|work|remote)\b/i,
  /\bcontract\s+(?:work|role|position|job|opportunity)\b/i,
  /\bwill\s+pay\b|\bpaying\s+\$|\bbudget\s*[:.]?\s*\$/i,
  /\$\s?\d{2,}/,
  /\bsend\s+(?:your\s+)?(?:portfolio|resume|cv|samples?|reel)\b/i,
  /\bapply\b.{0,15}\b(?:now|here|today|below|at|via)\b/i,
  /\bfreelance\s+(?:gig|job|work|opportunity|project|position|role)\b/i,
  /\bremote\s+(?:gig|job|work|opportunity|position|role)\b/i,
];

// ── Pitch / Spam Score Penalties (reduce score instead of hard-reject) ────────
const PENALTY_PATTERNS = [
  { rx: /\bfollow\s+(?:me|us|my)\b/i, penalty: 25 },
  { rx: /\bsubscribe\b/i, penalty: 20 },
  {
    rx: /\bjoin\s+(?:my|our)\b.{0,20}\b(?:discord|slack|newsletter|community|group)\b/i,
    penalty: 25,
  },
  { rx: /\bupvote\b/i, penalty: 15 },
  { rx: /\bshare\s+this\b/i, penalty: 10 },
  {
    rx: /\bfree\s+(?:tool|resource|template|guide|ebook|course|webinar)\b/i,
    penalty: 20,
  },
  { rx: /\bcheck\s+(?:it|this)\s+out\b/i, penalty: 10 },
  { rx: /\blink\s+(?:in|below)\b/i, penalty: 15 },
  { rx: /\bswipe\s+up\b/i, penalty: 20 },
  { rx: /\btip[s]?\s+(?:for|to|that)\b/i, penalty: 10 },
  { rx: /\bhere'?s\s+(?:a|the)\s+(?:trick|secret|hack)\b/i, penalty: 15 },
  { rx: /\bgame\s*changer\b/i, penalty: 10 },
  { rx: /\binstantly\s+(?:increase|boost|grow|double|triple)\b/i, penalty: 20 },
  {
    rx: /\b(?:increase|boost|grow|double|triple)\s+your\b.{0,30}\b(?:income|revenue|sales|value|price|rates?)\b/i,
    penalty: 20,
  },
  { rx: /\bhey\s+everyone\b/i, penalty: 5 },
  // ── Service / agency soft signals ──
  { rx: /\b(?:DM|message)\s+(?:me|us)\b/i, penalty: 20 },
  { rx: /\bwatch\s+(?:my|this|the)\s+(?:video|reel|demo)\b/i, penalty: 15 },
  { rx: /\bwanna\s+(?:scale|grow|level\s+up)\b/i, penalty: 15 },
  { rx: /\bguaranteed\s+(?:results?|ROI|income|revenue)\b/i, penalty: 25 },
  {
    rx: /\b(?:10x|100x|5x)\s+(?:your|the|growth|revenue|results?)\b/i,
    penalty: 20,
  },
  {
    rx: /\b(?:limited\s+(?:spots?|slots?|seats?)|only\s+\d+\s+(?:spots?|slots?|seats?))\b/i,
    penalty: 20,
  },
  { rx: /\bdon'?t\s+miss\s+(?:out|this)\b/i, penalty: 15 },
];

// ── Hiring Signals (clients seeking work — we WANT these) ────────────────────
const HIRING_SIGNALS = [
  { rx: /\[hiring\]/i, score: 25 },
  { rx: /\[task\]/i, score: 25 },
  { rx: /\[paid\]/i, score: 20 },
  // "hiring" as action (not "hiring manager", "hiring process", "hiring freeze")
  {
    rx: /\bhiring\b(?!\s+(?:manager|process|freez|practice|pipeline|decision|committee|team))/i,
    score: 15,
  },
  {
    rx: /\blooking\s+for\b.{0,35}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|va|virtual\s?assistant|consultant|someone|contractor|expert|specialist|agency)/i,
    score: 20,
  },
  {
    rx: /\bneed\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|editor|freelanc|coder|programmer|marketer|consultant|someone|help|person|expert)\b/i,
    score: 18,
  },
  {
    rx: /\bseeking\b.{0,25}\b(?:a|an)?\s*(?:designer|developer|writer|freelanc|someone|expert|contractor)/i,
    score: 16,
  },
  {
    rx: /\bwant\b.{0,25}\b(?:someone|a|an)\b.{0,35}\b(?:to|who)\b/i,
    score: 14,
  },
  { rx: /\bwill\s+pay\b/i, score: 15 },
  { rx: /\bi(?:'ll| will)\s+pay\b/i, score: 15 },
  { rx: /\bpaying\b/i, score: 12 },
  { rx: /\bbudget\b.{0,10}\b\$?\d/i, score: 14 },
  { rx: /\bcompensation\b/i, score: 10 },
  {
    rx: /\bjob\b.{0,15}\b(?:posting|opening|opportunity|position|listing)\b/i,
    score: 12,
  },
  { rx: /\bwe(?:'re|\s+are)\s+looking\b/i, score: 16 },
  {
    rx: /\bour\s+(?:team|company|startup|agency|firm)\b.{0,35}\b(?:needs?|looking|seeking|hiring|searching)\b/i,
    score: 18,
  },
  { rx: /\bproject\b.{0,15}\b(?:budget|rate|pay|compensation)\b/i, score: 12 },
  {
    rx: /\bremote\b.{0,15}\b(?:position|role|job|gig|opportunity|work)\b/i,
    score: 8,
  },
  { rx: /\bfixed\s+(?:price|budget|rate|fee)\b/i, score: 10 },
  { rx: /\bhourly\s+(?:rate|pay|budget|compensation)\b/i, score: 10 },
  { rx: /\bper\s+(?:hour|project|page|word|article)\b/i, score: 8 },
  { rx: /\bcan\s+(?:someone|anyone|anybody)\b/i, score: 12 },
  { rx: /\bhelp\s+(?:me|us|needed|wanted|required)\b/i, score: 10 },
];

// ── Junk / Noise Filters ────────────────────────────────────────────────────
const JUNK_PATTERNS = [
  /\[meta\]/i,
  /\[mod\s?post\]/i,
  /\[announcement\]/i,
  /\bweekly\s+thread\b/i,
  /\bmonthly\s+thread\b/i,
  /\brule\s+\d/i,
  /\bautomod/i,
  /\bsubreddit\s+rules?\b/i,
  // ── Career advice / job-seeking tips (not job posts) ──
  /\b\d+\s+(?:quiet|smart|sneaky|secret|proven|easy|simple|powerful|underrated|effective)\s+(?:strategies|tips|tricks|ways|methods|hacks|steps|things)\b/i,
  /\bstrategies\s+(?:that|to|for)\b.{0,30}\b(?:get(?:ting)?\s+(?:hired|a\s+job|interviews?|offers?)|land(?:ing)?\s+(?:a\s+job|interviews?|offers?))\b/i,
  /\b(?:how\s+to|tips?\s+(?:for|to)|guide\s+(?:to|for)|ways?\s+to)\s+(?:get\s+hired|land\s+(?:a\s+)?(?:job|interview|offer|role)|find\s+(?:a\s+)?(?:job|work|gig))\b/i,
  /\bunemployed\b.{0,40}\b(?:engineer|developer|designer|hired|getting)\b/i,
  /\bas\s+a\s+hiring\s+manager\b/i,
  /\b(?:not\s+the\s+usual|stop\s+(?:doing|sending|applying))\b.{0,30}\b(?:advice|applications?|resumes?)\b/i,
  /\b(?:finally|actually)\s+(?:getting|landing)\s+(?:hired|interviews?|offers?)\b/i,
  /\bif\s+you(?:'re|\s+are)\s+(?:a\s+)?(?:junior|mid-?level|senior|unemployed|job\s*seeking|looking\s+for\s+(?:a\s+)?(?:job|work|your\s+(?:first|next)))\b/i,
  /\b(?:real\s+)?insights?\b.{0,20}\b(?:from|for|about)\b.{0,20}\b(?:the\s+(?:market|industry)|job\s+(?:search|market|hunt)|hiring|interview)\b/i,
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Extract budget/price from text — handles $500, $50/hr, $1k-$5k, etc. */
function extractBudget(text) {
  if (!text) return null;
  // Range: $500-$1000, $1k-5k
  const range = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?(?:k)?\s*[-–—to]+\s*\$?\s?[\d,]+(?:\.\d{1,2})?(?:k)?/i,
  );
  if (range) return range[0].replace(/\s+/g, " ").trim();
  // Hourly: $50/hr, $30 per hour
  const hourly = text.match(
    /\$\s?[\d,]+(?:\.\d{1,2})?\s*(?:\/\s*h(?:ou)?r|per\s+h(?:ou)?r)/i,
  );
  if (hourly) return hourly[0].replace(/\s+/g, " ").trim();
  // "k" shorthand: $5k, $2.5k
  const kMatch = text.match(/\$\s?[\d,.]+\s*k\b/i);
  if (kMatch) return kMatch[0].replace(/\s+/g, "");
  // Plain: $500
  const plain = text.match(/\$\s?[\d,]+(?:\.\d{1,2})?/);
  return plain ? plain[0].replace(/\s/g, "") : null;
}

/** Return "2h ago", "3d ago", etc. */
function timeAgo(utcSeconds) {
  const now = Date.now();
  const then = utcSeconds * 1000;
  const diff = Math.max(0, now - then);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** Detect gig category from title + body */
function detectCategory(text) {
  for (const cat of CATEGORIES) {
    if (cat.rx.test(text)) return { label: cat.label, icon: cat.icon };
  }
  return { label: "Other", icon: "briefcase" };
}

/** True if post is a freelancer self-promotion (not a job posting) */
function isSelfPromotion(title, body, flair) {
  // Explicit title tags are definitive — never override
  if (/\[for\s?hire\]/i.test(title) || /\[offer\]/i.test(title)) return true;
  if (/\bfor\s?hire\b/i.test(title) && !/\[hiring\]/i.test(title)) return true;
  if (/\[portfolio\]/i.test(title)) return true;
  if (/\[seeking/i.test(title)) return true;
  if (/\[available\]/i.test(title)) return true;

  // Flair-based detection (job-board subs often use these flairs)
  if (flair) {
    const f = flair.toLowerCase();
    if (
      f.includes("for hire") ||
      f.includes("portfolio") ||
      f.includes("seeking") ||
      f.includes("available") ||
      f.includes("looking for work")
    )
      return true;
  }

  // Strong hiring signal in the TITLE (not body) overrides body self-promo
  if (HIRING_SIGNALS.some((s) => s.rx.test(title))) return false;

  const text = title + " " + body;
  return SELF_PROMO_PATTERNS.some((rx) => rx.test(text));
}

/** True if post is junk (mod post, rules thread, etc.) */
function isJunk(title) {
  return JUNK_PATTERNS.some((rx) => rx.test(title));
}

/** Compute a 0-100 relevance score for a post */
function computeScore(
  post,
  matchedKwCount,
  totalKws,
  subWeight,
  titleHits = 0,
) {
  let score = 0;
  const text = (post.title || "") + " " + (post.selftext || "");

  // ── Hiring signal strength (0-40 pts) ──
  let hiringPts = 0;
  for (const signal of HIRING_SIGNALS) {
    if (signal.rx.test(text)) hiringPts += signal.score;
  }
  score += Math.min(40, hiringPts);

  // ── Keyword match density (0-25 pts) ──
  score += Math.min(
    25,
    Math.round((matchedKwCount / Math.max(1, totalKws)) * 25),
  );

  // ── Title match bonus (0-15 pts) — keywords in title are far more relevant ──
  if (titleHits > 0) {
    score += Math.min(15, titleHits * 10);
  }

  // ── Budget mentioned (0-10 pts) ──
  if (/\$\s?\d/.test(text)) score += 10;

  // ── Recency bonus (0-15 pts) ──
  if (post.created_utc) {
    const ageHours = (Date.now() / 1000 - post.created_utc) / 3600;
    if (ageHours < 1) score += 15;
    else if (ageHours < 6) score += 12;
    else if (ageHours < 24) score += 8;
    else if (ageHours < 72) score += 4;
  }

  // ── Engagement bonus (0-5 pts) ──
  const comments = post.num_comments || 0;
  if (comments >= 1 && comments <= 10) score += 3; // Some interest, not saturated
  if (comments === 0) score += 5; // Fresh — no one applied yet!

  // ── Subreddit weight multiplier ──
  score = Math.round(score * (subWeight || 1));

  // ── Post length bonus (detail = more legit) (0-5 pts) ──
  const bodyLen = (post.selftext || "").length;
  if (bodyLen > 200) score += 5;
  else if (bodyLen > 50) score += 2;

  // ── Penalty deductions for spammy/pitchy signals ──
  for (const p of PENALTY_PATTERNS) {
    if (p.rx.test(text)) score -= p.penalty;
  }

  return Math.min(100, Math.max(0, score));
}

// ── Reddit Fetch ─────────────────────────────────────────────────────────────

const IS_PROD = import.meta.env.PROD;

/**
 * PRODUCTION: Single fetch to our Vercel serverless proxy (CDN-cached).
 * Returns all posts from all subreddits in one request.
 */
async function fetchAllPostsFromProxy() {
  try {
    const resp = await fetch("/api/scan-reddit", {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      console.error(
        `[GigAlertPro] API returned ${resp.status}: ${resp.statusText}`,
      );
      return [];
    }
    const json = await resp.json();
    if (!IS_PROD) {
      console.log(
        `[GigAlertPro] Reddit API returned ${json.post_count || 0} posts (${json.feed || "unknown"})`,
        json.diagnostics || "no diagnostics",
      );
    }
    return (json.posts || []).map((p) => ({
      ...p,
      _weight: SUBREDDITS.find((s) => s.name === p._sub)?.weight || 1.0,
      _source_platform: "Reddit",
    }));
  } catch (err) {
    console.error("[GigAlertPro] Reddit API fetch failed:", err.message);
    return [];
  }
}

/**
 * Fetch community posts (Craigslist) from the x-feed endpoint.
 */
async function fetchCommunityPostsFromProxy() {
  try {
    const resp = await fetch("/api/x-feed", {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      console.error(
        `[GigAlertPro] Community API returned ${resp.status}: ${resp.statusText}`,
      );
      return [];
    }
    const json = await resp.json();
    if (!IS_PROD) {
      console.log(
        `[GigAlertPro] Community API returned ${json.post_count || 0} posts (${json.feed || "unknown"})`,
      );
    }
    return (json.posts || []).map((p) => ({
      ...p,
      _weight: 1.0,
      _source_platform:
        p._sub === "craigslist"
          ? "Craigslist"
          : p._sub === "nitter"
            ? "X"
            : "Community",
    }));
  } catch (err) {
    console.error("[GigAlertPro] Community API fetch failed:", err.message);
    return [];
  }
}

/**
 * DEV: Per-subreddit fetch via Vite proxy (bypasses CORS locally).
 */
async function fetchSubreddit(sub) {
  let url;
  if (sub.mode === "search") {
    url = `/reddit-api/r/${sub.name}/search.json?q=${encodeURIComponent(sub.search)}&restrict_sr=1&sort=new&limit=30&raw_json=1`;
  } else {
    url = `/reddit-api/r/${sub.name}/new.json?limit=30&raw_json=1`;
  }

  const resp = await fetch(url, {
    headers: { Accept: "application/json" },
  });

  if (resp.status === 429) {
    await delay(5000 + Math.random() * 3000);
    const retry = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!retry.ok) return [];
    try {
      const json = await retry.json();
      return json?.data?.children?.map((c) => c.data) || [];
    } catch {
      return [];
    }
  }

  if (!resp.ok) return [];
  try {
    const json = await resp.json();
    return json?.data?.children?.map((c) => c.data) || [];
  } catch {
    return [];
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetches real Reddit JOB POSTINGS matching keywords.
 * Returns scored, categorized, deduplicated results — most relevant first.
 */
export async function fetchRedditGigs(keywords) {
  if (!keywords || keywords.length === 0) return [];

  const lowerKws = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);
  if (lowerKws.length === 0) return [];

  // Return cache if still fresh
  if (cache.data && Date.now() - cache.ts < CACHE_TTL_MS) {
    return matchAndScore(cache.data, lowerKws);
  }

  // Both dev and prod read from Upstash via proxy endpoints
  // (dev uses Vite middleware, prod uses Vercel serverless)
  const [redditPosts, xPosts] = await Promise.all([
    fetchAllPostsFromProxy(),
    fetchCommunityPostsFromProxy(),
  ]);
  const allPosts = [...redditPosts, ...xPosts];

  cache = { data: allPosts, ts: Date.now() };
  saveCache(cache);
  return matchAndScore(allPosts, lowerKws);
}

/** Clear the post cache (useful after keyword changes) */
export function clearCache() {
  cache = { data: null, ts: 0 };
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}

// ── Matching, Scoring & Ranking ──────────────────────────────────────────────
function matchAndScore(posts, lowerKws) {
  const seen = new Set();
  const results = [];

  for (const p of posts) {
    // ── Dedup by Reddit post ID ──
    const postId = p.id || p.name;
    if (seen.has(postId)) continue;
    seen.add(postId);

    // ── Skip junk (mod posts, rules, meta) ──
    if (isJunk(p.title || "")) continue;

    // ── Skip deleted / removed ──
    if (p.selftext === "[removed]" || p.selftext === "[deleted]") continue;
    if (p.author === "[deleted]" || p.author === "AutoModerator") continue;

    // ── AI Classification gate (set by cron fetch scripts via GPT-4o-mini) ──
    // Posts tagged `_ai_is_gig: false` are confirmed non-gigs — always skip.
    // Posts tagged `_ai_is_gig: true` are confirmed real gigs — SKIP regex filters.
    // Posts with `_ai_is_gig: undefined` (unclassified) fall through to regex checks.
    if (p._ai_is_gig === false) continue;
    const aiApproved = p._ai_is_gig === true;

    // ── Regex filters (ONLY for posts the AI hasn't classified) ──
    // If the AI already approved a post, trust it — don't second-guess with regex.
    const isXPost = p._sub === "nitter" || p._source_platform === "X";

    if (!aiApproved) {
      // ── Skip self-promotions (freelancer ads) — skip for X/Nitter posts
      //    (tweets are pre-screened by search query and have different norms) ──
      if (
        !isXPost &&
        isSelfPromotion(p.title || "", p.selftext || "", p.link_flair_text)
      )
        continue;

      // ── X/Tweet: strict quality gate ─ only show actionable job/gig posts ──
      if (isXPost) {
        const tweetText = (p.title || "") + " " + (p.selftext || "");
        // Reject non-tech "developer" (real estate, housing, etc.)
        if (NON_TECH_DEVELOPER_RX.test(tweetText)) continue;
        // Reject replies, retweets, stories, negations, commentary
        if (X_REJECT_PATTERNS.some((rx) => rx.test(tweetText))) continue;
        // Tweet body must contain at least one STRONG hiring signal
        if (!X_HIRING_SIGNALS.some((rx) => rx.test(tweetText))) continue;
      }
    }

    // ── Keyword matching — title matches weighted higher ──
    const titleLower = (p.title || "").toLowerCase();
    const bodyLower = (p.selftext || "").toLowerCase();
    // For X posts, also match against the Nitter search query (stored in flair)
    const flairLower = isXPost ? (p.link_flair_text || "").toLowerCase() : "";
    const combined =
      titleLower + " " + bodyLower + (flairLower ? " " + flairLower : "");

    // For single-word body-only matches, only check the first 300 chars
    // of the body (where the actual job description is — not the links,
    // portfolio, or "about me" sections that come later).
    const bodyHead = bodyLower.slice(0, 300);

    let titleHits = 0;
    const matched = lowerKws.filter((kw) => {
      if (kw.includes(" ")) {
        // Multi-word: exact phrase match — specific enough to match anywhere
        const inTitle = titleLower.includes(kw);
        const inBody =
          bodyLower.includes(kw) ||
          (flairLower ? flairLower.includes(kw) : false);
        if (inTitle) titleHits++;
        return inTitle || inBody;
      } else {
        // Single word: word boundary
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const rx = new RegExp(`\\b${escaped}\\b`, "i");
        const inTitle = rx.test(titleLower);
        if (inTitle) {
          titleHits++;
          return true;
        }
        // Body-only single-word match: only count if the keyword appears
        // in the first 300 chars of the body (the actual job description).
        // This filters out casual mentions like "Website: www.example.com"
        // or "check my portfolio at..." that appear later in the post.
        const inFlair = flairLower ? rx.test(flairLower) : false;
        if (inFlair) return true;
        return rx.test(bodyHead);
      }
    });

    // All posts (Reddit + Craigslist) require at least one keyword match
    if (matched.length === 0) continue;

    // ── Score ──
    const score = computeScore(
      p,
      matched.length,
      lowerKws.length,
      p._weight || 1.0,
      titleHits,
    );

    // ── Skip low-relevance posts (spammy pitches that barely match) ──
    if (score < 10) continue;

    // ── Category ──
    const category = detectCategory(combined);

    // ── Budget ──
    const budget = extractBudget((p.title || "") + " " + (p.selftext || ""));

    // ── Shared text cleaner ──
    const cleanText = (txt) =>
      (txt || "")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&\w+;/g, " ")
        .replace(/\]\]>/g, "")
        .replace(/https?:\/\/nitter\.[^\s]+/g, "")
        .replace(
          /submitted\s+by\s+\/u\/\S+\s+to\s+r\/\S+.*?(\[link\]|\[comments\])[^\n]*/gi,
          "",
        )
        .replace(/\[link\]|\[comments\]/gi, "")
        .replace(/R\s+to\s+@\w+:\s*/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // Extra cleaning for X tweets: strip hashtags, URLs, and shortened links
    const cleanTweet = (txt) =>
      cleanText(txt)
        .replace(/#\w+/g, "") // remove hashtags
        .replace(/https?:\/\/\S+/g, "") // remove URLs
        .replace(/\S+\.com\/\S*/g, "") // remove shortened links (e.g. jobfound.org/job/...)
        .replace(/\S+\.io\/\S*/g, "")
        .replace(/\S+\.org\/\S*/g, "")
        .replace(/\S+\.net\/\S*/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // ── For X posts: derive a short headline + full body from the tweet ──
    let finalTitle, finalBody;
    if (isXPost) {
      // Use whichever is longer (title & selftext are often identical for tweets)
      const rawTitle = p.title || "";
      const rawBody = p.selftext || "";
      const source = rawBody.length >= rawTitle.length ? rawBody : rawTitle;
      const fullTweet = cleanTweet(source) || "Untitled";

      // First sentence or first ~120 chars at a word boundary for the headline
      const sentenceEnd = fullTweet.search(/[.!?\n]/);
      const cutPoint =
        sentenceEnd > 20 && sentenceEnd <= 150
          ? sentenceEnd + 1
          : Math.min(120, fullTweet.length);
      let headline = fullTweet.slice(0, cutPoint).trim();
      // If we cut mid-text, find last word boundary
      if (cutPoint < fullTweet.length && sentenceEnd < 0) {
        const lastSpace = headline.lastIndexOf(" ");
        if (lastSpace > 40) headline = headline.slice(0, lastSpace);
      }
      finalTitle = headline;
      // Body is the rest of the tweet (skip the headline portion)
      const rest = fullTweet.slice(headline.length).trim();
      finalBody = rest.length > 10 ? rest.slice(0, 400) : "";
    } else {
      finalTitle = cleanText(p.title || "Untitled");
      finalBody = cleanText(p.selftext || "").slice(0, 400);
    }

    results.push({
      id: postId,
      reddit_post_id: p.name || p.id,
      title: finalTitle,
      body_preview: finalBody,
      url:
        p._source_platform === "Reddit"
          ? `https://www.reddit.com${p.permalink}`
          : p.permalink || "",
      subreddit: p._sub || p.subreddit,
      budget,
      author: p.author || "unknown",
      reddit_created: p.created_utc
        ? new Date(p.created_utc * 1000).toISOString()
        : new Date().toISOString(),
      matched_keywords: matched,
      score,
      category: category.label,
      category_icon: category.icon,
      time_ago: p.created_utc ? timeAgo(p.created_utc) : "recently",
      comment_count: p.num_comments || 0,
      upvotes: p.ups || 0,
      flair: p.link_flair_text || null,
      source_platform: p._source_platform || "Reddit",
    });
  }

  // ── Sort: primary by recency (newest first), secondary by score (desc) ──
  results.sort((a, b) => {
    const timeA = new Date(a.reddit_created).getTime();
    const timeB = new Date(b.reddit_created).getTime();
    if (timeB !== timeA) return timeB - timeA;
    return b.score - a.score;
  });

  return results;
}
