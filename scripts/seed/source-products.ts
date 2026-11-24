// Source fixture recovered from the user's original prototype seed data.
// DRAFT ONLY: not a runnable database seeder; validate claims and formats before launch.
// This file intentionally preserves legacy format values for explicit mapping.
type ProductFormat = "pdf" | "bundle" | "video" | "video_and_files" | "consultation";
type ProductAudience = "everyone" | "students" | "housewives" | "job_seekers" | "retired";

// DRAFT COPY. Prices, hours and file types come from the client's prototype site.

// The descriptions were written from the kit titles, so the client must check every

// "included" item and benefit against the real kit before launch.

export const seedCategories = [

  { name: "Bundle", slug: "bundle", sortOrder: 1 },

  { name: "Freelancing aur content", slug: "freelancing-aur-content", sortOrder: 2 },

  { name: "Ghar se kaam", slug: "ghar-se-kaam", sortOrder: 3 },

  { name: "Guidance aur safety", slug: "guidance-aur-safety", sortOrder: 4 },

];

type Faq = { question: string; answer: string };

export type SeedProduct = {

  title: string;

  slug: string;

  categorySlug: string;

  shortDescription: string;

  description: string;

  price: number;

  originalPrice: number;

  format: ProductFormat;

  formatDetail: string;

  audience: ProductAudience;

  leafNumber: number;

  isFeatured?: boolean;

  tags: string[];

  features: string[];

  included: string[];

  whoShouldBuy: string[];

  benefits: string[];

  faqs: Faq[];

};

// Questions that apply to every downloadable kit.

const commonFaqs: Faq[] = [

  {

    question: "Kit mujhe kab milega?",

    answer: "Payment confirm hote hi kit aapki library mein aa jata hai. Wahan se aap kabhi bhi download ya dekh sakte hain.",

  },

  {

    question: "Access kitne time tak rahega?",

    answer: "Lifetime. Ek baar kharidne ke baad kit aapki library mein hamesha rahega.",

  },

  {

    question: "Kya income ki guarantee milti hai?",

    answer:

      "Nahi. Yeh kit seekhne ke liye hai. Aapka result aapki mehnat, skill aur samay par nirbhar karta hai.",

  },

];

export const seedProducts: SeedProduct[] = [

  {

    title: "The Whole Money Tree Bundle",

    slug: "whole-money-tree-bundle",

    categorySlug: "bundle",

    shortDescription: "Saare kits ek saath. 8 guides, lifetime updates aur private learners group.",

    description: [

      "Agar aap ek ek kit alag se nahi lena chahte, toh yeh bundle sabse simple raasta hai. Ismein 8 guides ek saath milte hain.",

      "Bundle lene par aapko lifetime updates milte hain aur private learners group mein jagah milti hai, jahan aap doosre learners ke saath apne sawal share kar sakte hain.",

    ].join("\n\n"),

    price: 999,

    originalPrice: 3999,

    format: "bundle",

    formatDetail: "8 guides, lifetime updates aur private learners group",

    audience: "everyone",

    leafNumber: 9,

    isFeatured: true,

    tags: ["bundle", "all kits", "guides", "lifetime updates", "learners group"],

    features: ["8 guides ek saath", "Lifetime updates", "Private learners group", "Lifetime access"],

    included: ["8 guides ka poora collection", "Lifetime updates", "Private learners group mein entry"],

    whoShouldBuy: [

      "Jo log sabhi kits ek saath lena chahte hain",

      "Beginners jo ek hi jagah se shuru karna chahte hain",

      "Jo alag alag kit khareedne ka jhanjhat nahi chahte",

    ],

    benefits: [

      "Ek hi purchase mein sab kuch ek jagah",

      "Naye updates bina extra paise ke milte hain",

      "Doosre learners se judne ka mauka",

    ],

    faqs: [

      {

        question: "Private learners group mein kaise judte hain?",

        answer: "Purchase ke baad group ki details aapko di jayengi.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "Freelance Starter Kit",

    slug: "freelance-starter-kit",

    categorySlug: "freelancing-aur-content",

    shortDescription: "Freelancing shuru karne ke liye video aur PDF guide, bilkul basic se.",

    description: [

      "Freelancing ka matlab hai apni skill ke badle clients ke liye kaam karna. Agar aap pehli baar yeh raasta samajhna chahte hain, toh yeh kit aapko step by step samjhata hai ki kahan se shuru karein.",

      "Is kit mein video lessons aur ek PDF guide hai, jo simple Hinglish mein bani hai. Koi advanced English ya technical background zaroori nahi.",

    ].join("\n\n"),

    price: 199,

    originalPrice: 499,

    format: "video_and_files",

    formatDetail: "Video + PDF · 3.5 hrs",

    audience: "students",

    leafNumber: 1,

    isFeatured: true,

    tags: ["freelancing", "beginners", "students", "online kaam", "skills"],

    features: ["3.5 ghante ka video", "PDF guide", "Simple Hinglish mein", "Lifetime access"],

    included: ["Video lessons (kul 3.5 ghante)", "PDF guide", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Students jo apni skills se kaam shuru karna chahte hain",

      "Beginners jinhe freelancing ka pehla step samajhna hai",

      "Jo log ghar baithe side kaam ke options dekh rahe hain",

    ],

    benefits: [

      "Freelancing kaise kaam karti hai, yeh clear samajh aata hai",

      "Shuruaati galtiyon se bachne mein madad milti hai",

      "Apni skill ke hisaab se agla step plan karna aasan hota hai",

    ],

    faqs: [{ question: "Kya yeh beginners ke liye hai?", answer: "Haan, kit basic se shuru hota hai." }, ...commonFaqs],

  },

  {

    title: "Ghar Se Earning Blueprint",

    slug: "ghar-se-earning-blueprint",

    categorySlug: "ghar-se-kaam",

    shortDescription: "Ghar ke kaam ke saath online options samajhne ke liye 4 ghante ka Hinglish video.",

    description: [

      "Agar aap ghar sambhalte hue kuch naya seekhna chahti hain, toh yeh blueprint aapko online kaam ke alag alag raaste simple bhasha mein dikhata hai.",

      "Video Hinglish mein hai, isliye samajhne mein dikkat nahi hogi. Aap apne time par, apne phone ya laptop par dekh sakti hain.",

    ].join("\n\n"),

    price: 299,

    originalPrice: 799,

    format: "video",

    formatDetail: "Hinglish video · 4 hrs",

    audience: "housewives",

    leafNumber: 2,

    isFeatured: true,

    tags: ["ghar se kaam", "housewives", "part time", "beginners", "online kaam"],

    features: ["4 ghante ka Hinglish video", "Phone ya laptop par dekhein", "Apni speed se seekhein", "Lifetime access"],

    included: ["4 ghante ka Hinglish video", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Housewives jo ghar se kuch seekhna chahti hain",

      "Jinhe kam time mein online options samajhne hain",

      "Beginners jinhe technical knowledge nahi hai",

    ],

    benefits: [

      "Online kaam ke options ek jagah samajh aate hain",

      "Apne time ke hisaab se seekhne ki aazadi",

      "Advanced English ya technical knowledge ki zaroorat nahi",

    ],

    faqs: [

      { question: "Video kis language mein hai?", answer: "Hinglish mein, yaani Hindi aur English ka simple mix." },

      ...commonFaqs,

    ],

  },

  {

    title: "Canva Design Side Hustle",

    slug: "canva-design-side-hustle",

    categorySlug: "freelancing-aur-content",

    shortDescription: "Canva seekhein aur 40 ready templates ke saath design ka kaam shuru karne ki tayyari karein.",

    description: [

      "Canva ek aasan design tool hai. Is kit mein aap video se seekhte hain ki designs kaise banate hain, bina kisi design experience ke.",

      "Saath mein 40 templates milte hain jinhe aap apne hisaab se badal sakte hain.",

    ].join("\n\n"),

    price: 249,

    originalPrice: 599,

    format: "video_and_files",

    formatDetail: "Video + 40 templates · 3 hrs",

    audience: "everyone",

    leafNumber: 3,

    isFeatured: true,

    tags: ["canva", "design", "templates", "side hustle", "beginners"],

    features: ["3 ghante ka video", "40 templates", "Beginner friendly", "Lifetime access"],

    included: ["3 ghante ka video", "40 templates", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Beginners jinhe design ka koi experience nahi",

      "Students jo ek nayi skill seekhna chahte hain",

      "Jo log chhote businesses ke liye designs banana chahte hain",

    ],

    benefits: [

      "Canva ka use confidence ke saath karna aata hai",

      "Templates se shuruaat tezi se hoti hai",

      "Apni creative skill ko aage badhane ka base milta hai",

    ],

    faqs: [

      { question: "Kya mujhe design ka experience chahiye?", answer: "Nahi, kit beginners ke liye banaya gaya hai." },

      ...commonFaqs,

    ],

  },

  {

    title: "Content Writing in Hinglish",

    slug: "content-writing-in-hinglish",

    categorySlug: "freelancing-aur-content",

    shortDescription: "Hinglish mein likhna seekhein. 2.5 ghante ka video aur practice workbook.",

    description: [

      "Aaj ke zyadatar readers Hinglish mein padhna pasand karte hain. Yeh kit aapko simple aur saaf likhne ki practice karwata hai.",

      "Video se concept samjhein aur workbook mein khud likh kar practice karein.",

    ].join("\n\n"),

    price: 199,

    originalPrice: 449,

    format: "video_and_files",

    formatDetail: "Video + workbook · 2.5 hrs",

    audience: "students",

    leafNumber: 4,

    tags: ["content writing", "hinglish", "writing", "students", "freelancing"],

    features: ["2.5 ghante ka video", "Practice workbook", "Hinglish writing ke tareeke", "Lifetime access"],

    included: ["2.5 ghante ka video", "Workbook", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Students jo likhne ki skill banana chahte hain",

      "Beginners jo content writing samajhna chahte hain",

      "Jo log social media ya blogs ke liye likhna chahte hain",

    ],

    benefits: [

      "Saaf aur simple likhne ki aadat banti hai",

      "Workbook se roz practice karna aasan hota hai",

      "Apne likhe hue samples ek jagah jama kar sakte hain",

    ],

    faqs: [

      {

        question: "Kya mujhe achhi English aani chahiye?",

        answer: "Nahi. Kit Hinglish mein hai, isliye simple Hindi aur English kaafi hai.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "Social Reselling from Home",

    slug: "social-reselling-from-home",

    categorySlug: "ghar-se-kaam",

    shortDescription: "Ghar se social media par reselling samjhein. 3 ghante ka video aur supplier sheet.",

    description: [

      "Reselling mein aap doosron ke products online bechte hain. Is kit mein aap samajhte hain ki yeh model kaise kaam karta hai aur shuru karne se pehle kin baaton ka dhyan rakhna chahiye.",

      "Saath mein ek supplier sheet milti hai, jisse aapko research shuru karne mein madad milti hai. Kisi bhi supplier ko paise dene se pehle khud check zaroor karein.",

    ].join("\n\n"),

    price: 349,

    originalPrice: 899,

    format: "video_and_files",

    formatDetail: "Video + supplier sheet · 3 hrs",

    audience: "housewives",

    leafNumber: 5,

    tags: ["reselling", "social media", "ghar se kaam", "supplier", "housewives"],

    features: ["3 ghante ka video", "Supplier sheet", "Ghar se shuru karne ke tareeke", "Lifetime access"],

    included: ["3 ghante ka video", "Supplier sheet", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Housewives jo ghar se reselling samajhna chahti hain",

      "Jinke paas social media accounts hain",

      "Beginners jo reselling ka model pehle samajhna chahte hain",

    ],

    benefits: [

      "Reselling ka poora model ek jagah samajh aata hai",

      "Supplier research ka starting point milta hai",

      "Shuru karne se pehle risks pehchanne mein madad milti hai",

    ],

    faqs: [

      {

        question: "Kya supplier sheet ke suppliers ki guarantee hai?",

        answer:

          "Nahi. Sheet research ka starting point hai. Kisi bhi supplier ke saath kaam shuru karne se pehle aap khud check karein.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "Real vs Scam Job Checker",

    slug: "real-vs-scam-job-checker",

    categorySlug: "guidance-aur-safety",

    shortDescription: "Fake job offers pehchanne ke liye PDF checklist. 45 minute mein padhkar samjhein.",

    description: [

      "Online job offers mein kai baar paise maangne wale ya jhooti commitments karne wale scams chhupe hote hain. Yeh checklist aapko offer ko parakhne ke saaf sawal deti hai.",

      "PDF ko aap 45 minute mein padh sakte hain aur kisi bhi offer ke saamne rakhkar check kar sakte hain.",

    ].join("\n\n"),

    price: 99,

    originalPrice: 299,

    format: "pdf",

    formatDetail: "PDF checklist · 45 min",

    audience: "everyone",

    leafNumber: 6,

    tags: ["scam", "fraud", "job", "checklist", "safety"],

    features: ["PDF checklist", "45 minute mein padhein", "Har offer par use karein", "Lifetime access"],

    included: ["PDF checklist", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Job seekers jo fake offers se bachna chahte hain",

      "Students jo online kaam dhoondh rahe hain",

      "Parents jo apne bachchon ko scams se bachana chahte hain",

    ],

    benefits: [

      "Offer sach hai ya nahi, yeh check karne ka saaf tareeka",

      "Paise ya personal details dene se pehle ruk kar sochne ki aadat",

      "Ek hi checklist baar baar use ho sakti hai",

    ],

    faqs: [

      {

        question: "Kya yeh checklist har scam pakad leti hai?",

        answer: "Nahi. Koi bhi checklist 100 percent guarantee nahi de sakti. Yeh aapko sahi sawal puchne mein madad karti hai.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "Instagram Page Growth Playbook",

    slug: "instagram-page-growth-playbook",

    categorySlug: "freelancing-aur-content",

    shortDescription: "Instagram page ko samajhdari se badhane ke liye 4 ghante ka video aur content calendar.",

    description: [

      "Page grow karne ke liye sirf post karna kaafi nahi hota. Is playbook mein aap seekhte hain ki content ki planning kaise karein aur regular rehkar page ko aage kaise badhayein.",

      "Content calendar aapko har hafte ke liye post ka plan banane mein madad karta hai.",

    ].join("\n\n"),

    price: 299,

    originalPrice: 699,

    format: "video_and_files",

    formatDetail: "Video + content calendar · 4 hrs",

    audience: "job_seekers",

    leafNumber: 7,

    tags: ["instagram", "social media", "content calendar", "growth", "page"],

    features: ["4 ghante ka video", "Content calendar", "Planning ke tareeke", "Lifetime access"],

    included: ["4 ghante ka video", "Content calendar", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Jo log apna Instagram page shuru karna chahte hain",

      "Chhote business owners jo page par dhyan dena chahte hain",

      "Beginners jinhe content planning samajhni hai",

    ],

    benefits: [

      "Content ki planning aasan ho jati hai",

      "Regular posting ki aadat banti hai",

      "Page ke liye ek saaf direction milti hai",

    ],

    faqs: [

      {

        question: "Kya followers ki guarantee milti hai?",

        answer: "Nahi. Followers aur reach aapke content, mehnat aur Instagram ke rules par nirbhar karte hain.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "Online Tuition Setup",

    slug: "online-tuition-setup",

    categorySlug: "ghar-se-kaam",

    shortDescription: "Online tuition shuru karne ka setup samjhein. 2.5 ghante ka video aur PDF.",

    description: [

      "Agar aap padhana pasand karte hain, toh online tuition ek option ho sakta hai. Yeh kit aapko shuruaati setup, jaise class ki planning aur zaroori cheezein, samjhata hai.",

      "Video aur PDF dono hain, taki aap apni pasand se dekh ya padh sakein.",

    ].join("\n\n"),

    price: 249,

    originalPrice: 599,

    format: "video_and_files",

    formatDetail: "Video + PDF · 2.5 hrs",

    audience: "retired",

    leafNumber: 8,

    tags: ["tuition", "teaching", "online class", "retired", "ghar se kaam"],

    features: ["2.5 ghante ka video", "PDF guide", "Online class ka setup", "Lifetime access"],

    included: ["2.5 ghante ka video", "PDF guide", "Lifetime access apni library mein"],

    whoShouldBuy: [

      "Retired log jo apna anubhav doosron ko sikhana chahte hain",

      "Teachers ya tutors jo online classes shuru karna chahte hain",

      "Students jo chhote bachchon ko padhane mein interest rakhte hain",

    ],

    benefits: [

      "Online tuition ka setup ek saaf plan mein samajh aata hai",

      "Apne anubhav ko doosron tak pahunchane ka raasta milta hai",

      "Apne time ke hisaab se kaam ki planning kar sakte hain",

    ],

    faqs: [

      {

        question: "Kya mujhe teacher hona zaroori hai?",

        answer: "Nahi, lekin jis subject mein aap padhana chahte hain, usme aapki achhi samajh honi chahiye.",

      },

      ...commonFaqs,

    ],

  },

  {

    title: "1:1 Clarity Call",

    slug: "clarity-call",

    categorySlug: "guidance-aur-safety",

    shortDescription: "30 minute ki live call, jisme aap apne sawal poochh kar agla step saaf kar sakte hain.",

    description: [

      "Kai baar sabse badi dikkat yeh hoti hai ki samajh nahi aata kahan se shuru karein. Is 30 minute ki live call mein aap apne sawal rakh sakte hain aur apni situation ke hisaab se direction samajh sakte hain.",

      "Call ka time aur tareeka payment ke baad aapko bataya jayega.",

    ].join("\n\n"),

    price: 499,

    originalPrice: 999,

    format: "consultation",

    formatDetail: "Live call · 30 min",

    audience: "everyone",

    leafNumber: 10,

    tags: ["1:1 call", "guidance", "consultation", "clarity", "live call"],

    features: ["30 minute ki live call", "Aapke apne sawalon par baat", "Aapki situation ke hisaab se guidance"],

    included: ["30 minute ki 1:1 live call"],

    whoShouldBuy: [

      "Jo log confuse hain ki kahan se shuru karein",

      "Jinhe kisi offer ya idea par doosri raay chahiye",

      "Jo apne sawal seedhe poochhna chahte hain",

    ],

    benefits: [

      "Apne sawalon ke seedhe jawab milte hain",

      "Agla step zyada saaf hota hai",

      "Galat jagah paise ya time lagane se pehle sochne ka mauka",

    ],

    faqs: [

      { question: "Call kaise hoti hai?", answer: "Payment ke baad aapko booking ki details di jayengi." },

      {

        question: "Kya call ke baad income ki guarantee milti hai?",

        answer: "Nahi. Call se aapko direction samajhne mein madad milti hai, lekin result aapki mehnat par nirbhar karta hai.",

      },

    ],

  },

];
