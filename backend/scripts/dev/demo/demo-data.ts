export const DEMO_MARKER_BRANCH = "فرع مدينة نصر - عباس العقاد";
export const DEMO_LOGIN_SECRET = "Satamoni@2026";

export interface BranchSpec {
  key: string;
  name: string;
  address: string;
  phone: string;
  hours: string;
  lat: number;
  lng: number;
  isCentralKitchen?: boolean;
  supportsDineIn?: boolean;
  talabatBranchId?: string;
  dailyOrders: [number, number];
  lanSubnet: string;
}

export const BRANCHES: BranchSpec[] = [
  {
    key: "central",
    name: "المطبخ المركزي - العبور",
    address: "المنطقة الصناعية الأولى، بلوك 13034، مدينة العبور، القليوبية",
    phone: "0244810562",
    hours: "6:00 ص - 4:00 م",
    lat: 30.2283,
    lng: 31.4794,
    isCentralKitchen: true,
    supportsDineIn: false,
    dailyOrders: [0, 0],
    lanSubnet: "192.168.10",
  },
  {
    key: "nasr",
    name: DEMO_MARKER_BRANCH,
    address: "42 شارع عباس العقاد، المنطقة السادسة، مدينة نصر، القاهرة",
    phone: "0222738841",
    hours: "12:00 م - 2:00 ص",
    lat: 30.0566,
    lng: 31.3443,
    talabatBranchId: "TLB-CAI-48211",
    dailyOrders: [22, 34],
    lanSubnet: "192.168.20",
  },
  {
    key: "heliopolis",
    name: "فرع مصر الجديدة - الكوربة",
    address: "7 شارع بغداد، الكوربة، مصر الجديدة، القاهرة",
    phone: "0224157720",
    hours: "12:00 م - 1:00 ص",
    lat: 30.0915,
    lng: 31.3236,
    talabatBranchId: "TLB-CAI-48212",
    dailyOrders: [18, 28],
    lanSubnet: "192.168.30",
  },
  {
    key: "maadi",
    name: "فرع المعادي - شارع 9",
    address: "18 شارع 9، المعادي السرايات، القاهرة",
    phone: "0223806614",
    hours: "1:00 م - 1:00 ص",
    lat: 29.9602,
    lng: 31.2569,
    supportsDineIn: false,
    talabatBranchId: "TLB-CAI-48213",
    dailyOrders: [14, 22],
    lanSubnet: "192.168.40",
  },
];

export const RETAIL_BRANCH_KEYS = ["nasr", "heliopolis", "maadi"] as const;

export interface StaffSpec {
  key: string;
  name: string;
  email: string;
  roles: string[];
  branchKey: string | null;
  phone: string;
  department: string;
  position: string;
  baseSalary: number;
  hireDate: string;
  shift?: string;
}

export const STAFF: StaffSpec[] = [
  { key: "owner", name: "أندرياس سمير فهمي", email: "andrias@satamoni.local", roles: ["admin"], branchKey: null, phone: "01001234870", department: "MGMT", position: "GM", baseSalary: 45000, hireDate: "2021-03-01" },
  { key: "opsAdmin", name: "مينا عادل جرجس", email: "mina.adel@satamoni.local", roles: ["admin"], branchKey: null, phone: "01224518890", department: "MGMT", position: "OPS", baseSalary: 32000, hireDate: "2022-01-15" },
  { key: "chiefAccountant", name: "هاني رشدي عبد المسيح", email: "hany.roshdy@satamoni.local", roles: ["accountant"], branchKey: null, phone: "01117765402", department: "FIN", position: "CHIEF_ACC", baseSalary: 26000, hireDate: "2021-06-01" },
  { key: "accountant", name: "مريم نبيل حنا", email: "mariam.nabil@satamoni.local", roles: ["accountant"], branchKey: null, phone: "01276654108", department: "FIN", position: "ACC", baseSalary: 16000, hireDate: "2023-02-12" },
  { key: "callcenter", name: "نورهان طارق السيد", email: "nourhan.tarek@satamoni.local", roles: ["callcenter"], branchKey: null, phone: "01553398210", department: "CS", position: "AGENT", baseSalary: 9500, hireDate: "2024-04-01", shift: "12 م - 8 م" },
  { key: "callcenter2", name: "يوسف أشرف كامل", email: "youssef.ashraf@satamoni.local", roles: ["callcenter"], branchKey: null, phone: "01092217754", department: "CS", position: "AGENT", baseSalary: 9500, hireDate: "2024-09-15", shift: "6 م - 2 ص" },

  { key: "centralManager", name: "عماد فوزي إبراهيم", email: "emad.fawzy@satamoni.local", roles: ["branch_manager"], branchKey: "central", phone: "01006673315", department: "KITCHEN", position: "CK_MANAGER", baseSalary: 22000, hireDate: "2021-09-01", shift: "6 ص - 4 م" },
  { key: "centralBaker", name: "سيد عبد الحميد منصور", email: "sayed.mansour@satamoni.local", roles: ["employee"], branchKey: "central", phone: "01113390217", department: "KITCHEN", position: "BAKER", baseSalary: 9000, hireDate: "2022-05-10", shift: "6 ص - 2 م" },
  { key: "centralStore", name: "رامي ممدوح شاكر", email: "ramy.mamdouh@satamoni.local", roles: ["employee"], branchKey: "central", phone: "01284406613", department: "STORES", position: "STOREKEEPER", baseSalary: 8500, hireDate: "2023-07-01", shift: "7 ص - 3 م" },

  { key: "nasrManager", name: "كريم محمود عبد الله", email: "karim.mahmoud@satamoni.local", roles: ["branch_manager"], branchKey: "nasr", phone: "01005528841", department: "OPS", position: "BRANCH_MANAGER", baseSalary: 18000, hireDate: "2022-02-01", shift: "1 م - 11 م" },
  { key: "nasrCashier", name: "سارة عاطف محمد", email: "sara.atef@satamoni.local", roles: ["cashier"], branchKey: "nasr", phone: "01148827736", department: "OPS", position: "CASHIER", baseSalary: 8000, hireDate: "2023-10-01", shift: "12 م - 12 ص" },
  { key: "nasrChef", name: "أحمد سعيد البنا", email: "ahmed.elbanna@satamoni.local", roles: ["employee"], branchKey: "nasr", phone: "01223309871", department: "KITCHEN", position: "PIZZA_CHEF", baseSalary: 11000, hireDate: "2022-02-01", shift: "12 م - 12 ص" },
  { key: "nasrFeteer", name: "محمد رجب الفطاطري", email: "mohamed.ragab@satamoni.local", roles: ["employee"], branchKey: "nasr", phone: "01067719920", department: "KITCHEN", position: "FETEER_CHEF", baseSalary: 10000, hireDate: "2022-08-15", shift: "12 م - 12 ص" },

  { key: "helioManager", name: "بيتر وجدي نصيف", email: "peter.wagdy@satamoni.local", roles: ["branch_manager"], branchKey: "heliopolis", phone: "01271146620", department: "OPS", position: "BRANCH_MANAGER", baseSalary: 18000, hireDate: "2022-06-01", shift: "1 م - 11 م" },
  { key: "helioCashier", name: "دينا مجدي فرج", email: "dina.magdy@satamoni.local", roles: ["cashier"], branchKey: "heliopolis", phone: "01557741203", department: "OPS", position: "CASHIER", baseSalary: 8000, hireDate: "2024-01-10", shift: "12 م - 12 ص" },
  { key: "helioChef", name: "إسلام حسن عوض", email: "eslam.awad@satamoni.local", roles: ["employee"], branchKey: "heliopolis", phone: "01112263398", department: "KITCHEN", position: "PIZZA_CHEF", baseSalary: 11000, hireDate: "2022-06-01", shift: "12 م - 12 ص" },

  { key: "maadiManager", name: "شريف عزت لبيب", email: "sherif.ezzat@satamoni.local", roles: ["branch_manager"], branchKey: "maadi", phone: "01009934417", department: "OPS", position: "BRANCH_MANAGER", baseSalary: 17000, hireDate: "2023-03-01", shift: "1 م - 11 م" },
  { key: "maadiCashier", name: "آية خالد مصطفى", email: "aya.khaled@satamoni.local", roles: ["cashier"], branchKey: "maadi", phone: "01283357790", department: "OPS", position: "CASHIER", baseSalary: 7500, hireDate: "2024-05-20", shift: "1 م - 1 ص" },
  { key: "maadiChef", name: "مصطفى جمال الدين", email: "mostafa.gamal@satamoni.local", roles: ["employee"], branchKey: "maadi", phone: "01024418865", department: "KITCHEN", position: "PIZZA_CHEF", baseSalary: 10500, hireDate: "2023-03-01", shift: "1 م - 1 ص" },
];

export const DEPARTMENTS = [
  { code: "MGMT", name: "الإدارة العليا", description: "مجلس الإدارة والإدارة التنفيذية" },
  { code: "FIN", name: "الحسابات والمالية", description: "المحاسبة والخزينة والمراجعة" },
  { code: "OPS", name: "تشغيل الفروع", description: "إدارة الفروع والكاشير وخدمة الصالة" },
  { code: "KITCHEN", name: "المطبخ والإنتاج", description: "مطابخ الفروع والمطبخ المركزي" },
  { code: "STORES", name: "المخازن", description: "استلام وصرف وجرد الخامات" },
  { code: "CS", name: "خدمة العملاء والكول سنتر", description: "استقبال الطلبات والمتابعة والشكاوى" },
  { code: "DELIVERY", name: "التوصيل", description: "الطيارين ومتابعة التوصيل" },
];

export const POSITIONS = [
  { code: "GM", name: "المدير العام", department: "MGMT" },
  { code: "OPS", name: "مدير التشغيل", department: "MGMT" },
  { code: "CHIEF_ACC", name: "رئيس الحسابات", department: "FIN" },
  { code: "ACC", name: "محاسب", department: "FIN" },
  { code: "BRANCH_MANAGER", name: "مدير فرع", department: "OPS" },
  { code: "CASHIER", name: "كاشير", department: "OPS" },
  { code: "CK_MANAGER", name: "مدير المطبخ المركزي", department: "KITCHEN" },
  { code: "HEAD_CHEF", name: "شيف أول", department: "KITCHEN" },
  { code: "PIZZA_CHEF", name: "شيف بيتزا", department: "KITCHEN" },
  { code: "FETEER_CHEF", name: "شيف فطير", department: "KITCHEN" },
  { code: "BAKER", name: "خباز عجين", department: "KITCHEN" },
  { code: "STOREKEEPER", name: "أمين مخزن", department: "STORES" },
  { code: "AGENT", name: "موظف كول سنتر", department: "CS" },
  { code: "DRIVER", name: "طيار توصيل", department: "DELIVERY" },
];

export const DRIVERS: { name: string; phone: string; branchKey: string }[] = [
  { name: "محمود عبد الفتاح (أبو حميد)", phone: "01143320918", branchKey: "nasr" },
  { name: "عمرو صلاح الدين", phone: "01066201457", branchKey: "nasr" },
  { name: "حسام ناصر علي", phone: "01229903184", branchKey: "heliopolis" },
  { name: "وليد شوقي رمضان", phone: "01507712269", branchKey: "heliopolis" },
  { name: "أحمد فتحي زكي", phone: "01015548832", branchKey: "maadi" },
  { name: "إبراهيم سامي عطية", phone: "01288816605", branchKey: "maadi" },
];

export interface AccountSpec {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "COGS" | "EXPENSE";
  parent?: string;
  system?: boolean;
}

export const CHART_OF_ACCOUNTS: AccountSpec[] = [
  { code: "1000", name: "الأصول", type: "ASSET" },
  { code: "1100", name: "النقدية بالصناديق", type: "ASSET", parent: "1000", system: true },
  { code: "1300", name: "العملاء والمدينون", type: "ASSET", parent: "1000" },
  { code: "1310", name: "مستحقات طلبات (Talabat)", type: "ASSET", parent: "1300" },
  { code: "1320", name: "مستحقات شركات الدفع الإلكتروني", type: "ASSET", parent: "1300" },
  { code: "1400", name: "المخزون", type: "ASSET", parent: "1000", system: true },
  { code: "1500", name: "الأصول الثابتة", type: "ASSET", parent: "1000" },
  { code: "1510", name: "معدات المطابخ والأفران", type: "ASSET", parent: "1500" },
  { code: "1520", name: "الأثاث والديكورات", type: "ASSET", parent: "1500" },
  { code: "1530", name: "موتوسيكلات التوصيل", type: "ASSET", parent: "1500" },
  { code: "1590", name: "مجمع الإهلاك", type: "ASSET", parent: "1500" },
  { code: "2000", name: "الخصوم", type: "LIABILITY" },
  { code: "2100", name: "الموردين", type: "LIABILITY", parent: "2000", system: true },
  { code: "2200", name: "ضريبة القيمة المضافة المستحقة", type: "LIABILITY", parent: "2000" },
  { code: "2300", name: "تأمينات اجتماعية مستحقة", type: "LIABILITY", parent: "2000" },
  { code: "2400", name: "رواتب مستحقة", type: "LIABILITY", parent: "2000", system: true },
  { code: "3000", name: "حقوق الملكية", type: "EQUITY" },
  { code: "3100", name: "رأس المال", type: "EQUITY", parent: "3000" },
  { code: "3200", name: "الأرباح المحتجزة", type: "EQUITY", parent: "3000", system: true },
  { code: "4000", name: "الإيرادات", type: "REVENUE" },
  { code: "4100", name: "إيرادات المبيعات", type: "REVENUE", parent: "4000", system: true },
  { code: "4200", name: "إيرادات أخرى", type: "REVENUE", parent: "4000" },
  { code: "5000", name: "تكلفة المبيعات", type: "COGS" },
  { code: "5100", name: "تكلفة البضاعة المباعة", type: "COGS", parent: "5000", system: true },
  { code: "5300", name: "فروق المخزون والإنتاج والهالك", type: "COGS", parent: "5000", system: true },
  { code: "6000", name: "المصروفات التشغيلية", type: "EXPENSE" },
  { code: "6100", name: "الرواتب والأجور", type: "EXPENSE", parent: "6000", system: true },
  { code: "6200", name: "الإيجارات", type: "EXPENSE", parent: "6000" },
  { code: "6300", name: "الكهرباء والمياه والغاز", type: "EXPENSE", parent: "6000" },
  { code: "6400", name: "الصيانة والإصلاحات", type: "EXPENSE", parent: "6000" },
  { code: "6500", name: "الدعاية والإعلان", type: "EXPENSE", parent: "6000" },
  { code: "6600", name: "عمولات المنصات وشركات الدفع", type: "EXPENSE", parent: "6000" },
  { code: "6700", name: "مصروف الإهلاك", type: "EXPENSE", parent: "6000" },
  { code: "6800", name: "مستلزمات النظافة والتعبئة", type: "EXPENSE", parent: "6000" },
  { code: "6900", name: "مصروفات تشغيل أخرى", type: "EXPENSE", parent: "6000", system: true },
  { code: "6950", name: "فروق الكاش والعجز", type: "EXPENSE", parent: "6000", system: true },
];

export interface InventorySpec {
  key: string;
  name: string;
  unit: string;
  unitCost: number;
  itemType?: "raw" | "manufactured";
  supplier: string;
  perishableDays?: number;
  branchOpening: number;
  centralOpening: number;
  reorderPoint: number;
}

export const INVENTORY: InventorySpec[] = [
  { key: "flour", name: "دقيق فاخر 72%", unit: "كجم", unitCost: 32, supplier: "mill", branchOpening: 120, centralOpening: 1400, reorderPoint: 60 },
  { key: "yeast", name: "خميرة فورية", unit: "كجم", unitCost: 240, supplier: "mill", branchOpening: 2, centralOpening: 25, reorderPoint: 3 },
  { key: "salt", name: "ملح طعام", unit: "كجم", unitCost: 12, supplier: "mill", branchOpening: 10, centralOpening: 60, reorderPoint: 5 },
  { key: "sugar", name: "سكر أبيض", unit: "كجم", unitCost: 38, supplier: "mill", branchOpening: 25, centralOpening: 60, reorderPoint: 8 },
  { key: "cornOil", name: "زيت ذرة", unit: "لتر", unitCost: 95, supplier: "mill", branchOpening: 40, centralOpening: 80, reorderPoint: 10 },
  { key: "oliveOil", name: "زيت زيتون بكر", unit: "لتر", unitCost: 450, supplier: "mill", branchOpening: 6, centralOpening: 20, reorderPoint: 2 },
  { key: "samna", name: "سمن بلدي", unit: "كجم", unitCost: 320, supplier: "dairy", perishableDays: 60, branchOpening: 45, centralOpening: 0, reorderPoint: 10 },
  { key: "mozzarella", name: "جبنة موتزاريلا", unit: "كجم", unitCost: 380, supplier: "dairy", perishableDays: 30, branchOpening: 160, centralOpening: 0, reorderPoint: 40 },
  { key: "roumi", name: "جبنة رومي", unit: "كجم", unitCost: 420, supplier: "dairy", perishableDays: 45, branchOpening: 20, centralOpening: 0, reorderPoint: 5 },
  { key: "cheddar", name: "جبنة شيدر شرائح", unit: "كجم", unitCost: 400, supplier: "dairy", perishableDays: 45, branchOpening: 20, centralOpening: 0, reorderPoint: 5 },
  { key: "cream", name: "قشطة بلدي", unit: "كجم", unitCost: 210, supplier: "dairy", perishableDays: 7, branchOpening: 25, centralOpening: 0, reorderPoint: 5 },
  { key: "cookingCream", name: "كريمة طبخ", unit: "لتر", unitCost: 180, supplier: "dairy", perishableDays: 20, branchOpening: 25, centralOpening: 0, reorderPoint: 5 },
  { key: "milk", name: "لبن كامل الدسم", unit: "لتر", unitCost: 45, supplier: "dairy", perishableDays: 5, branchOpening: 30, centralOpening: 0, reorderPoint: 8 },
  { key: "eggs", name: "بيض", unit: "بيضة", unitCost: 6, supplier: "dairy", perishableDays: 21, branchOpening: 600, centralOpening: 0, reorderPoint: 120 },
  { key: "mince", name: "لحم بقري مفروم", unit: "كجم", unitCost: 480, supplier: "meat", perishableDays: 4, branchOpening: 70, centralOpening: 0, reorderPoint: 15 },
  { key: "sausage", name: "سجق شرقي", unit: "كجم", unitCost: 380, supplier: "meat", perishableDays: 10, branchOpening: 55, centralOpening: 0, reorderPoint: 12 },
  { key: "basterma", name: "بسطرمة", unit: "كجم", unitCost: 650, supplier: "meat", perishableDays: 30, branchOpening: 18, centralOpening: 0, reorderPoint: 4 },
  { key: "chicken", name: "صدور فراخ مخلية", unit: "كجم", unitCost: 260, supplier: "poultry", perishableDays: 4, branchOpening: 90, centralOpening: 0, reorderPoint: 20 },
  { key: "tuna", name: "تونة قطع", unit: "علبة", unitCost: 85, supplier: "mill", branchOpening: 150, centralOpening: 0, reorderPoint: 30 },
  { key: "tomato", name: "طماطم", unit: "كجم", unitCost: 18, supplier: "veg", branchOpening: 30, centralOpening: 400, reorderPoint: 10 },
  { key: "onion", name: "بصل أحمر", unit: "كجم", unitCost: 20, supplier: "veg", branchOpening: 30, centralOpening: 0, reorderPoint: 8 },
  { key: "pepper", name: "فلفل ألوان", unit: "كجم", unitCost: 60, supplier: "veg", branchOpening: 30, centralOpening: 0, reorderPoint: 8 },
  { key: "mushroom", name: "مشروم طازج", unit: "كجم", unitCost: 160, supplier: "veg", perishableDays: 5, branchOpening: 20, centralOpening: 0, reorderPoint: 5 },
  { key: "olives", name: "زيتون أسود شرائح", unit: "كجم", unitCost: 180, supplier: "mill", branchOpening: 20, centralOpening: 0, reorderPoint: 4 },
  { key: "orange", name: "برتقال عصير", unit: "كجم", unitCost: 25, supplier: "veg", branchOpening: 80, centralOpening: 0, reorderPoint: 20 },
  { key: "honey", name: "عسل نحل", unit: "كجم", unitCost: 300, supplier: "mill", branchOpening: 10, centralOpening: 0, reorderPoint: 3 },
  { key: "nutella", name: "شوكولاتة بالبندق", unit: "كجم", unitCost: 600, supplier: "mill", branchOpening: 12, centralOpening: 0, reorderPoint: 3 },
  { key: "penne", name: "مكرونة بيني", unit: "كجم", unitCost: 45, supplier: "mill", branchOpening: 40, centralOpening: 0, reorderPoint: 10 },
  { key: "bun", name: "عيش برجر بريوش", unit: "قطعة", unitCost: 9, supplier: "mill", perishableDays: 4, branchOpening: 350, centralOpening: 0, reorderPoint: 60 },
  { key: "pepsi", name: "بيبسي كانز 330 مل", unit: "علبة", unitCost: 18, supplier: "drinks", branchOpening: 600, centralOpening: 0, reorderPoint: 120 },
  { key: "water", name: "مياه معدنية 600 مل", unit: "زجاجة", unitCost: 7, supplier: "drinks", branchOpening: 400, centralOpening: 0, reorderPoint: 80 },
  { key: "pizzaBox", name: "علبة بيتزا كرتون", unit: "قطعة", unitCost: 9, supplier: "packaging", branchOpening: 1200, centralOpening: 0, reorderPoint: 200 },
  { key: "feteerBox", name: "علبة فطير كرتون", unit: "قطعة", unitCost: 8, supplier: "packaging", branchOpening: 700, centralOpening: 0, reorderPoint: 120 },
  { key: "dough", name: "عجينة بيتزا جاهزة", unit: "كجم", unitCost: 31, itemType: "manufactured", supplier: "central", perishableDays: 3, branchOpening: 90, centralOpening: 0, reorderPoint: 30 },
  { key: "sauce", name: "صلصة بيتزا", unit: "كجم", unitCost: 38, itemType: "manufactured", supplier: "central", perishableDays: 7, branchOpening: 35, centralOpening: 0, reorderPoint: 10 },
];

export const MANUFACTURED_RECIPES: Record<string, { ingredient: string; quantity: number }[]> = {
  dough: [
    { ingredient: "flour", quantity: 0.6 },
    { ingredient: "yeast", quantity: 0.008 },
    { ingredient: "salt", quantity: 0.012 },
    { ingredient: "sugar", quantity: 0.01 },
    { ingredient: "oliveOil", quantity: 0.02 },
  ],
  sauce: [
    { ingredient: "tomato", quantity: 1.3 },
    { ingredient: "oliveOil", quantity: 0.03 },
    { ingredient: "salt", quantity: 0.015 },
    { ingredient: "sugar", quantity: 0.01 },
  ],
};

export interface SupplierSpec {
  key: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  paymentTerms: string;
}

export const SUPPLIERS: SupplierSpec[] = [
  { key: "mill", name: "شركة النيل للمواد الغذائية والدقيق", contactPerson: "أ. جمال عبد الرحيم", phone: "0233056620", email: "sales@nile-foods.example", address: "المنطقة الصناعية، 6 أكتوبر، الجيزة", paymentTerms: "آجل 30 يوم" },
  { key: "dairy", name: "مؤسسة الدلتا للألبان والأجبان", contactPerson: "م. حسن الشربيني", phone: "0402345519", email: "orders@delta-dairy.example", address: "طريق طنطا - المحلة، الغربية", paymentTerms: "آجل 15 يوم" },
  { key: "meat", name: "مجازر الفيروز للحوم", contactPerson: "الحاج سعيد الفيروز", phone: "01001187742", email: "info@fayrouz-meat.example", address: "سوق الجملة، البساتين، القاهرة", paymentTerms: "نقدي عند الاستلام" },
  { key: "poultry", name: "شركة الوطنية للدواجن", contactPerson: "أ. محمد الدسوقي", phone: "0226710034", email: "b2b@wataneya-poultry.example", address: "العاشر من رمضان، الشرقية", paymentTerms: "آجل 7 أيام" },
  { key: "veg", name: "المعلم حسن عبد العال للخضار والفاكهة", contactPerson: "المعلم حسن عبد العال", phone: "01112094456", email: "hassan.veg@obour-market.example", address: "سوق العبور، القليوبية", paymentTerms: "نقدي" },
  { key: "drinks", name: "الشركة المصرية لتوزيع المشروبات", contactPerson: "أ. شادي منير", phone: "0224998810", email: "distribution@egy-beverages.example", address: "مدينة السلام، القاهرة", paymentTerms: "آجل 21 يوم" },
  { key: "packaging", name: "مصنع الأمل للتعبئة والتغليف", contactPerson: "م. رضا حمدي", phone: "0553387712", email: "sales@alamal-pack.example", address: "المنطقة الصناعية، بلبيس، الشرقية", paymentTerms: "آجل 45 يوم" },
];

export interface VariantSpec {
  label: string;
  price: number;
  talabatPrice: number;
  recipe: Record<string, number>;
}

export interface MenuItemSpec {
  key: string;
  name: string;
  description: string;
  isBest?: boolean;
  variants: VariantSpec[];
  modifiers?: { name: string; priceDelta: number; perVariant?: number[] }[];
  popularity: number;
}

export interface CategorySpec {
  key: string;
  name: string;
  menuGroup?: "regular" | "fasting";
  station: "pizza" | "feteer" | "grill" | "bar";
  color: [number, number, number];
  items: MenuItemSpec[];
}

function pizzaSizes(prices: [number, number, number], recipe: Record<string, number>): VariantSpec[] {
  const scale = [0.65, 1, 1.4];
  const labels = ["صغير", "وسط", "كبير"];
  return labels.map((label, i) => ({
    label,
    price: prices[i],
    talabatPrice: Math.round((prices[i] * 1.12) / 5) * 5,
    recipe: Object.fromEntries(
      Object.entries({ dough: 0.28, sauce: 0.08, ...recipe }).map(([k, q]) => [k, k === "pizzaBox" ? 1 : Math.round(q * scale[i] * 1000) / 1000])
    ),
  }));
}

function feteerSizes(prices: [number, number], recipe: Record<string, number>): VariantSpec[] {
  const scale = [1, 1.6];
  return ["صغير", "كبير"].map((label, i) => ({
    label,
    price: prices[i],
    talabatPrice: Math.round((prices[i] * 1.12) / 5) * 5,
    recipe: Object.fromEntries(
      Object.entries({ flour: 0.25, samna: 0.06, feteerBox: 1, ...recipe }).map(([k, q]) => [k, k === "feteerBox" ? 1 : Math.round(q * scale[i] * 1000) / 1000])
    ),
  }));
}

function single(label: string, price: number, recipe: Record<string, number>): VariantSpec[] {
  return [{ label, price, talabatPrice: Math.round((price * 1.12) / 5) * 5, recipe }];
}

const PIZZA_EXTRAS = [
  { name: "جبنة موتزاريلا إضافية", priceDelta: 40, perVariant: [30, 40, 55] },
  { name: "حرف محشي جبنة", priceDelta: 60, perVariant: [45, 60, 80] },
  { name: "زيتون إضافي", priceDelta: 15 },
];

export const MENU: CategorySpec[] = [
  {
    key: "pizza",
    name: "البيتزا",
    station: "pizza",
    color: [214, 69, 45],
    items: [
      { key: "margherita", name: "بيتزا مارجريتا", description: "صلصة طماطم إيطالي وموتزاريلا وريحان", isBest: true, variants: pizzaSizes([150, 210, 280], { mozzarella: 0.15, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 9 },
      { key: "veggie", name: "بيتزا خضروات", description: "فلفل ألوان ومشروم وبصل وزيتون أسود", variants: pizzaSizes([165, 230, 300], { mozzarella: 0.12, pepper: 0.05, mushroom: 0.04, onion: 0.03, olives: 0.02, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 5 },
      { key: "sausage", name: "بيتزا سجق", description: "سجق شرقي بالفلفل والبصل", isBest: true, variants: pizzaSizes([195, 270, 350], { mozzarella: 0.13, sausage: 0.12, pepper: 0.03, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 8 },
      { key: "bbqChicken", name: "بيتزا فراخ باربكيو", description: "فراخ مشوية بصوص الباربكيو وبصل أحمر", variants: pizzaSizes([210, 290, 370], { mozzarella: 0.13, chicken: 0.13, onion: 0.03, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 7 },
      { key: "supreme", name: "بيتزا سوبر سوبريم", description: "سجق ولحم مفروم وفراخ وخضروات", isBest: true, variants: pizzaSizes([235, 325, 415], { mozzarella: 0.15, sausage: 0.06, mince: 0.06, chicken: 0.05, pepper: 0.03, mushroom: 0.03, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 7 },
      { key: "tunaPizza", name: "بيتزا تونة", description: "تونة وبصل وفلفل أخضر وزيتون", variants: pizzaSizes([190, 260, 335], { mozzarella: 0.12, tuna: 1, onion: 0.03, olives: 0.02, pizzaBox: 1 }), modifiers: PIZZA_EXTRAS, popularity: 4 },
    ],
  },
  {
    key: "feteer",
    name: "الفطير المشلتت",
    station: "feteer",
    color: [222, 160, 52],
    items: [
      { key: "meshaltet", name: "فطير مشلتت سادة", description: "فطير بالسمن البلدي يقدم مع العسل والقشطة", isBest: true, variants: feteerSizes([130, 205], { cream: 0.05, honey: 0.04 }), modifiers: [{ name: "قشطة إضافية", priceDelta: 30 }, { name: "عسل إضافي", priceDelta: 20 }], popularity: 6 },
      { key: "feteerSausage", name: "فطير بالسجق", description: "سجق شرقي وفلفل وموتزاريلا", variants: feteerSizes([175, 265], { sausage: 0.12, mozzarella: 0.08, pepper: 0.03 }), modifiers: [{ name: "جبنة إضافية", priceDelta: 35 }], popularity: 5 },
      { key: "feteerBasterma", name: "فطير بالبسطرمة والبيض", description: "بسطرمة وبيض وجبنة رومي", variants: feteerSizes([195, 295], { basterma: 0.07, eggs: 2, roumi: 0.05 }), modifiers: [{ name: "جبنة إضافية", priceDelta: 35 }], popularity: 4 },
      { key: "feteerMix", name: "فطير ميكس جبن", description: "موتزاريلا ورومي وشيدر", variants: feteerSizes([170, 255], { mozzarella: 0.08, roumi: 0.05, cheddar: 0.04 }), popularity: 4 },
      { key: "feteerNutella", name: "فطير نوتيلا", description: "شوكولاتة بالبندق وسكر بودرة", variants: feteerSizes([160, 245], { nutella: 0.08, sugar: 0.01 }), modifiers: [{ name: "قشطة إضافية", priceDelta: 30 }], popularity: 5 },
    ],
  },
  {
    key: "burger",
    name: "البرجر",
    station: "grill",
    color: [121, 72, 44],
    items: [
      { key: "classicBurger", name: "كلاسيك برجر", description: "لحم بقري 150 جم مع خس وطماطم وصوص ساتاموني", variants: [{ label: "سينجل", price: 155, talabatPrice: 175, recipe: { bun: 1, mince: 0.15, tomato: 0.03, onion: 0.02 } }, { label: "دبل", price: 235, talabatPrice: 265, recipe: { bun: 1, mince: 0.3, tomato: 0.03, onion: 0.02 } }], modifiers: [{ name: "شريحة شيدر", priceDelta: 25 }, { name: "بيضة", priceDelta: 15 }], popularity: 5 },
      { key: "cheeseBurger", name: "تشيز برجر", description: "لحم بقري مع شريحتين شيدر وبصل مكرمل", isBest: true, variants: [{ label: "سينجل", price: 175, talabatPrice: 195, recipe: { bun: 1, mince: 0.15, cheddar: 0.04, onion: 0.03 } }, { label: "دبل", price: 260, talabatPrice: 290, recipe: { bun: 1, mince: 0.3, cheddar: 0.06, onion: 0.03 } }], modifiers: [{ name: "شريحة شيدر", priceDelta: 25 }, { name: "بيضة", priceDelta: 15 }], popularity: 6 },
      { key: "chickenBurger", name: "برجر فراخ كريسبي", description: "صدر فراخ مقرمش مع صوص رانش", variants: [{ label: "سينجل", price: 165, talabatPrice: 185, recipe: { bun: 1, chicken: 0.16, flour: 0.03, cornOil: 0.05 } }, { label: "دبل", price: 245, talabatPrice: 275, recipe: { bun: 1, chicken: 0.32, flour: 0.05, cornOil: 0.08 } }], modifiers: [{ name: "شريحة شيدر", priceDelta: 25 }], popularity: 4 },
    ],
  },
  {
    key: "pasta",
    name: "المكرونات",
    station: "grill",
    color: [236, 196, 120],
    items: [
      { key: "alfredo", name: "بيني ألفريدو بالفراخ", description: "مكرونة بيني بصوص الكريمة والمشروم وقطع الفراخ", variants: single("طبق", 185, { penne: 0.15, cookingCream: 0.12, chicken: 0.12, mushroom: 0.03, roumi: 0.02 }), popularity: 4 },
      { key: "arrabbiata", name: "بيني أرابياتا", description: "صلصة طماطم حارة بالثوم والريحان", variants: single("طبق", 140, { penne: 0.15, sauce: 0.15, oliveOil: 0.01 }), popularity: 2 },
      { key: "negresco", name: "مكرونة نجرسكو", description: "بالبشاميل والفراخ والجبنة المحمرة", variants: single("طبق", 195, { penne: 0.15, milk: 0.2, chicken: 0.1, mozzarella: 0.07, flour: 0.02 }), popularity: 3 },
    ],
  },
  {
    key: "fasting",
    name: "المنيو الصيامي",
    menuGroup: "fasting",
    station: "pizza",
    color: [86, 140, 74],
    items: [
      { key: "fastingPizza", name: "بيتزا خضار صيامي", description: "بدون جبن - خضروات مشوية وزيتون وصلصة", variants: pizzaSizes([140, 195, 255], { pepper: 0.06, mushroom: 0.05, onion: 0.03, olives: 0.03, pizzaBox: 1 }), popularity: 2 },
      { key: "fastingTuna", name: "فطير تونة صيامي", description: "تونة وخضار بزيت الذرة بدل السمن", variants: [{ label: "صغير", price: 160, talabatPrice: 180, recipe: { flour: 0.25, cornOil: 0.06, tuna: 1, pepper: 0.03, feteerBox: 1 } }, { label: "كبير", price: 245, talabatPrice: 275, recipe: { flour: 0.4, cornOil: 0.1, tuna: 2, pepper: 0.05, feteerBox: 1 } }], popularity: 2 },
    ],
  },
  {
    key: "drinks",
    name: "المشروبات",
    station: "bar",
    color: [38, 99, 170],
    items: [
      { key: "pepsi", name: "بيبسي", description: "كانز 330 مل", variants: single("كانز", 30, { pepsi: 1 }), popularity: 7 },
      { key: "water", name: "مياه معدنية", description: "600 مل", variants: single("صغيرة", 15, { water: 1 }), popularity: 4 },
      { key: "orangeJuice", name: "عصير برتقال فريش", description: "برتقال طازج معصور", variants: single("كوب", 55, { orange: 0.45, sugar: 0.02 }), popularity: 3 },
    ],
  },
];

export const COMBOS = [
  { name: "عرض العيلة", description: "2 بيتزا مارجريتا كبير + بيتزا سجق كبير + 4 بيبسي", price: 899, items: [["margherita", "كبير", 2], ["sausage", "كبير", 1], ["pepsi", "كانز", 4]] as [string, string, number][] },
  { name: "وجبة تشيز برجر", description: "تشيز برجر سينجل + بيبسي", price: 189, items: [["cheeseBurger", "سينجل", 1], ["pepsi", "كانز", 1]] as [string, string, number][] },
  { name: "عرض الأصحاب", description: "بيتزا سوبر سوبريم وسط + فطير ميكس جبن صغير + 2 بيبسي", price: 469, items: [["supreme", "وسط", 1], ["feteerMix", "صغير", 1], ["pepsi", "كانز", 2]] as [string, string, number][] },
  { name: "عرض الأونلاين", description: "متاح على الموقع فقط: بيتزا فراخ باربكيو وسط + فطير نوتيلا صغير", price: 399, onlineOnly: true, items: [["bbqChicken", "وسط", 1], ["feteerNutella", "صغير", 1]] as [string, string, number][] },
];

export const PAYMENT_METHODS = [
  { key: "cash", name: "الدفع نقدًا - كاش", kind: "cash", weight: 62 },
  { key: "visa", name: "فيزا - ماكينة البنك الأهلي", kind: "card_or_wallet", settlementChannel: "visa_pos", weight: 17 },
  { key: "instapay", name: "إنستاباي", kind: "card_or_wallet", settlementChannel: "instapay", weight: 12 },
  { key: "vodafone", name: "فودافون كاش", kind: "card_or_wallet", settlementChannel: "vodafone_cash", weight: 7 },
  { key: "orange", name: "أورانج كاش", kind: "card_or_wallet", settlementChannel: "orange_cash", weight: 2 },
  { key: "corporate", name: "آجل - حسابات الشركات", kind: "credit", weight: 0 },
  { key: "talabatOnline", name: "طلبات - دفع أونلاين", kind: "card_or_wallet", talabatPaymentCode: "ONLINE", weight: 0 },
  { key: "talabatCash", name: "طلبات - كاش عند الاستلام", kind: "cash", talabatPaymentCode: "COD", weight: 0 },
] as const;

export const EXPENSE_CATEGORIES = [
  { key: "rent", name: "إيجار الفروع", account: "6200", alertThreshold: 60000 },
  { key: "utilities", name: "كهرباء ومياه وغاز", account: "6300", alertThreshold: 15000 },
  { key: "maintenance", name: "صيانة المعدات والأفران", account: "6400", alertThreshold: 8000 },
  { key: "marketing", name: "إعلانات السوشيال ميديا", account: "6500", alertThreshold: 20000 },
  { key: "commissions", name: "عمولات طلبات وشركات الدفع", account: "6600", alertThreshold: 30000 },
  { key: "cleaning", name: "منظفات ومستلزمات", account: "6800", alertThreshold: 3000 },
  { key: "misc", name: "نثريات", account: "6900", alertThreshold: 2000 },
];

export const MONTHLY_RENT: Record<string, number> = { central: 38000, nasr: 55000, heliopolis: 62000, maadi: 45000 };

const FIRST_NAMES = ["محمد", "أحمد", "محمود", "مصطفى", "عمر", "يوسف", "خالد", "كريم", "مينا", "بيشوي", "إسلام", "حسن", "طارق", "أمير", "زياد", "فادي", "مريم", "سلمى", "نورا", "منة", "هبة", "رنا", "ياسمين", "مارينا", "دعاء", "شيماء", "إيمان", "ندى", "فرح", "جيهان"];
const LAST_NAMES = ["عبد الرحمن", "السيد", "إبراهيم", "حسين", "فؤاد", "جرجس", "منصور", "الشافعي", "عزمي", "رزق", "سليمان", "النجار", "عوض", "شحاتة", "حلمي", "القاضي", "الدسوقي", "بطرس", "فهمي", "زكريا"];
const PREFIXES = ["010", "011", "012", "015"];

export const AREAS: Record<string, { area: string; streets: string[] }[]> = {
  nasr: [
    { area: "مدينة نصر - الحي السابع", streets: ["شارع مكرم عبيد", "شارع الطيران", "شارع حسن المأمون"] },
    { area: "مدينة نصر - الحي العاشر", streets: ["شارع أحمد الزمر", "شارع مصطفى النحاس", "شارع الطاقة"] },
    { area: "مدينة نصر - المنطقة الثامنة", streets: ["شارع ذاكر حسين", "شارع عبد الرزاق السنهوري"] },
  ],
  heliopolis: [
    { area: "مصر الجديدة - روكسي", streets: ["شارع الخليفة المأمون", "شارع إبراهيم اللقاني", "شارع الأهرام"] },
    { area: "مصر الجديدة - الكوربة", streets: ["شارع بغداد", "شارع هارون الرشيد", "شارع مونتازا"] },
    { area: "مصر الجديدة - ميدان الحجاز", streets: ["شارع النزهة", "شارع الحجاز", "شارع عثمان بن عفان"] },
  ],
  maadi: [
    { area: "المعادي - السرايات", streets: ["شارع 9", "شارع 77", "شارع 83"] },
    { area: "المعادي - دجلة", streets: ["شارع 250", "شارع 263", "شارع النصر"] },
    { area: "المعادي الجديدة", streets: ["شارع اللاسلكي", "شارع مصطفى كامل"] },
  ],
};

export function egyptianName(rand: () => number): string {
  return `${FIRST_NAMES[Math.floor(rand() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(rand() * LAST_NAMES.length)]}`;
}

export function egyptianMobile(rand: () => number): string {
  let digits = "";
  for (let i = 0; i < 8; i++) digits += Math.floor(rand() * 10);
  return `${PREFIXES[Math.floor(rand() * PREFIXES.length)]}${digits}`;
}

export const COMPLAINT_TEXTS: Record<string, string[]> = {
  late_order: ["الأوردر وصل بعد ساعة وربع والبيتزا كانت باردة", "الطيار اتأخر جدًا ومكانش بيرد على التليفون"],
  wrong_item: ["طلبت سجق ووصلت مارجريتا", "الفطير وصل من غير القشطة والعسل"],
  quality: ["العجينة كانت نية من النص", "الجبنة قليلة جدًا عن المعتاد"],
  other: ["الطيار مكانش معاه فكة", "عايز أعرف ليه نقاط الولاء مش ظاهرة"],
};

export const RATING_COMMENTS: Record<number, string[]> = {
  5: ["أحلى بيتزا في مدينة نصر", "الفطير ممتاز والتوصيل سريع", "تسلم إيديكم"],
  4: ["حلو بس التوصيل اتأخر شوية", "الطعم ممتاز والعلبة كانت مبهدلة"],
  3: ["عادي مش زي كل مرة", "الجبنة كانت قليلة"],
  2: ["البيتزا وصلت باردة"],
  1: ["الأوردر غلط وخدمة العملاء مردتش"],
};
