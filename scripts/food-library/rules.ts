// Curation rules for the Forge food library (Phase 7B WP4A.1).
//
// Every rule here is a documented, deterministic decision about which USDA
// records to offer and how to label them. No rule supplies or alters a
// nutrient value: values always come from the pinned source records.
// See docs/audits/PHASE_7B_WP4A1_FOOD_LIBRARY_PLAN.md.

export const FAMILIES = [
  "meat",
  "seafood",
  "eggs",
  "dairy",
  "grains",
  "breads",
  "fruits",
  "vegetables",
  "legumes",
  "nuts",
  "fats",
  "beverages",
  "protein",
  "prepared",
  "snacks",
  "condiments",
] as const;
export type Family = (typeof FAMILIES)[number];

/**
 * FNDDS WWEIA food categories and the family each belongs to. A category
 * that is absent here is excluded as a whole (reported as
 * "category-not-curated"), so new USDA categories never slip in unreviewed.
 */
export const FNDDS_CATEGORIES: Record<string, Family> = {
  // Meat and poultry
  "Beef, excludes ground": "meat",
  "Ground beef": "meat",
  Pork: "meat",
  "Lamb, goat, game": "meat",
  "Chicken, whole pieces": "meat",
  "Chicken patties, nuggets and tenders": "meat",
  "Turkey, duck, other poultry": "meat",
  Bacon: "meat",
  Sausages: "meat",
  Frankfurters: "meat",
  "Cold cuts and cured meats": "meat",
  "Liver and organ meats": "meat",
  // Seafood
  Fish: "seafood",
  Shellfish: "seafood",
  // Eggs
  "Eggs and omelets": "eggs",
  // Dairy and alternatives
  "Milk, whole": "dairy",
  "Milk, reduced fat": "dairy",
  "Milk, lowfat": "dairy",
  "Milk, nonfat": "dairy",
  "Flavored milk, whole": "dairy",
  "Flavored milk, reduced fat": "dairy",
  "Flavored milk, lowfat": "dairy",
  "Flavored milk, nonfat": "dairy",
  "Milk shakes and other dairy drinks": "dairy",
  Cheese: "dairy",
  "Cottage/ricotta cheese": "dairy",
  "Yogurt, regular": "dairy",
  "Yogurt, Greek": "dairy",
  "Cream and cream substitutes": "dairy",
  "Cream cheese, sour cream, whipped cream": "dairy",
  "Plant-based milk": "dairy",
  "Plant-based yogurt": "dairy",
  // Grains and cereals
  Rice: "grains",
  "Pasta, noodles, cooked grains": "grains",
  Oatmeal: "grains",
  "Grits and other cooked cereals": "grains",
  "Ready-to-eat cereal, higher sugar (>21.2g/100g)": "grains",
  "Ready-to-eat cereal, lower sugar (=<21.2g/100g)": "grains",
  "Not included in a food category": "grains",
  // Breads
  "Yeast breads": "breads",
  "Rolls and buns": "breads",
  "Bagels and English muffins": "breads",
  Tortillas: "breads",
  "Biscuits, muffins, quick breads": "breads",
  "Pancakes, waffles, French toast": "breads",
  "Crackers, excludes saltines": "breads",
  "Saltine crackers": "breads",
  // Fruits
  Apples: "fruits",
  Bananas: "fruits",
  "Blueberries and other berries": "fruits",
  "Citrus fruits": "fruits",
  "Dried fruits": "fruits",
  Grapes: "fruits",
  "Mango and papaya": "fruits",
  Melons: "fruits",
  "Other fruits and fruit salads": "fruits",
  "Peaches and nectarines": "fruits",
  Pears: "fruits",
  Pineapple: "fruits",
  Strawberries: "fruits",
  // Vegetables
  Broccoli: "vegetables",
  Cabbage: "vegetables",
  Carrots: "vegetables",
  Corn: "vegetables",
  "Lettuce and lettuce salads": "vegetables",
  Onions: "vegetables",
  "Other dark green vegetables": "vegetables",
  "Other red and orange vegetables": "vegetables",
  "Other starchy vegetables": "vegetables",
  "Other vegetables and combinations": "vegetables",
  Spinach: "vegetables",
  "String beans": "vegetables",
  Tomatoes: "vegetables",
  "White potatoes, baked or boiled": "vegetables",
  "Mashed potatoes and white potato mixtures": "vegetables",
  "Olives, pickles, pickled vegetables": "vegetables",
  // Beans, legumes and plant proteins
  "Beans, peas, legumes": "legumes",
  "Bean, pea, legume dishes": "legumes",
  "Soy and meat-alternative products": "legumes",
  // Nuts and seeds
  "Nuts and seeds": "nuts",
  // Oils and fats
  "Butter and animal fats": "fats",
  Margarine: "fats",
  "Salad dressings and vegetable oils": "fats",
  Mayonnaise: "fats",
  // Beverages
  Coffee: "beverages",
  Tea: "beverages",
  "Soft drinks": "beverages",
  "Diet soft drinks": "beverages",
  "Sport and energy drinks": "beverages",
  "Diet sport and energy drinks": "beverages",
  "Other diet drinks": "beverages",
  "Fruit drinks": "beverages",
  "Apple juice": "beverages",
  "Citrus juice": "beverages",
  "Other fruit juice": "beverages",
  "Vegetable juice": "beverages",
  "Smoothies and grain drinks": "beverages",
  Beer: "beverages",
  Wine: "beverages",
  "Liquor and cocktails": "beverages",
  // Protein and nutrition products
  "Protein and nutritional powders": "protein",
  "Nutrition bars": "protein",
  "Nutritional beverages": "protein",
  // Prepared foods
  Burgers: "prepared",
  "Burritos and tacos": "prepared",
  Pizza: "prepared",
  "Meat mixed dishes": "prepared",
  "Poultry mixed dishes": "prepared",
  "Seafood mixed dishes": "prepared",
  "Pasta mixed dishes, excludes macaroni and cheese": "prepared",
  "Macaroni and cheese": "prepared",
  "Rice mixed dishes": "prepared",
  "Fried rice and lo/chow mein": "prepared",
  "Stir-fry and soy-based sauce mixtures": "prepared",
  "Egg rolls, dumplings, sushi": "prepared",
  "Other Mexican mixed dishes": "prepared",
  Nachos: "prepared",
  "Soups, broth-based": "prepared",
  "Soups, cream-based": "prepared",
  "Ramen and Asian broth-based soups": "prepared",
  "Cheese sandwiches": "prepared",
  "Chicken fillet sandwiches": "prepared",
  "Deli and cured meat sandwiches": "prepared",
  "Egg/breakfast sandwiches": "prepared",
  "Frankfurter sandwiches": "prepared",
  "Meat and BBQ sandwiches": "prepared",
  "Peanut butter and jelly sandwiches": "prepared",
  "Seafood sandwiches": "prepared",
  "Vegetable sandwiches/burgers": "prepared",
  "Turnovers and other grain-based items": "prepared",
  "French fries and other fried white potatoes": "prepared",
  "Fried vegetables": "prepared",
  "Vegetable dishes": "prepared",
  "Coleslaw, non-lettuce salads": "prepared",
  // Snacks and sweets
  "Potato chips": "snacks",
  "Tortilla, corn, other chips": "snacks",
  Popcorn: "snacks",
  "Pretzels/snack mix": "snacks",
  "Cereal bars": "snacks",
  "Cookies and brownies": "snacks",
  "Cakes and pies": "snacks",
  "Doughnuts, sweet rolls, pastries": "snacks",
  "Candy containing chocolate": "snacks",
  "Candy not containing chocolate": "snacks",
  "Ice cream and frozen dairy desserts": "snacks",
  Pudding: "snacks",
  "Gelatins, ices, sorbets": "snacks",
  "Sugars and honey": "snacks",
  "Jams, syrups, toppings": "snacks",
  // Sauces and condiments
  "Dips, gravies, other sauces": "condiments",
  "Pasta sauces, tomato-based": "condiments",
  "Mustard and other condiments": "condiments",
  "Tomato-based condiments": "condiments",
  "Soy-based condiments": "condiments",
};

export type Rule = { reason: string; match: RegExp };

/**
 * FNDDS description rules, applied in order; the first match excludes the
 * record with that reason. Ambiguous ("not specified") records are left out
 * because an explicit variant of the same food is offered instead.
 */
export const FNDDS_EXCLUDE: Rule[] = [
  { reason: "unspecified-type (NFS)", match: /\bNFS\b/ },
  { reason: "unspecified-preparation (NS as to)", match: /\bNS as to\b/i },
  {
    reason: "special-population",
    match: /\b(baby|babies|infant|toddler|school|WIC)\b/i,
  },
  {
    reason: "ingredient-only",
    match: /\bas ingredient\b|\bfor use (with|on|in)\b/i,
  },
  {
    reason: "dry-mix-not-reconstituted",
    match: /not reconstituted|\bdry mix\b|dry concentrate/i,
  },
  { reason: "compound-description (and/or)", match: /and\/or/ },
  {
    reason: "source-variant (pre-cooked/other sources)",
    match: /, from (pre-?cooked|precooked|other sources)\b/i,
  },
  {
    reason: "fat-method-variant (margarine/animal fat)",
    match: /\bmargarine\b|animal fat or meat drippings|\blard\b/i,
  },
  {
    reason: "uncommon-cut",
    match:
      /^Chicken, (back|neck or ribs|tail)$|^Chicken (skin|feet)$|^Turkey, (neck|tail|back)$/,
  },
  {
    // Survey-era formulations of named products; packaged foods are logged
    // from their own label instead.
    reason: "brand-named-product",
    match: /\((?:[A-Z][\w'’&.-]*)(?: [A-Z][\w'’&.-]*)*\)/,
  },
  {
    reason: "survey-coding-descriptor",
    match:
      /dark-green leafy|(excluding|including) (carrots|potatoes)|other than dark/i,
  },
  {
    reason: "packaged-meal (brand-dependent)",
    match: /frozen meal|frozen entree|diet frozen/i,
  },
  {
    reason: "survey-combination (meat with generic sauce)",
    match:
      /^(Beef|Pork|Lamb|Veal|Ham|Chicken|Turkey|Fish|Shrimp|Seafood|Meat|Sausage|Tofu|Liver)(,? (and|with) (noodles|rice|potatoes|vegetables))?(,? (with|in) (gravy|mushroom sauce|cheese sauce|cream sauce|cream or white sauce|soy-based sauce|tomato-based sauce|sweet and sour sauce)|, no sauce)$/,
  },
  {
    reason: "survey-combination (meat with generic sauce)",
    match:
      /^(Ham or pork|Lamb or mutton|Venison or deer|Beef|Pork|Lamb) and (noodles|rice|potatoes)( with [a-z -]+sauce| with gravy|, no sauce| with cream sauce, white sauce or mushroom sauce)$/,
  },
  {
    // Salads (egg, tuna, chicken, pasta, potato, coleslaw) are coded once
    // per dressing; mayonnaise, light mayonnaise and Italian are offered.
    reason: "dressing-permutation (mayonnaise and Italian offered)",
    match:
      /made with (mayonnaise-type salad dressing|light mayonnaise-type salad dressing|creamy dressing|light creamy dressing|light Italian dressing|any type of fat free dressing)$/i,
  },
  {
    // Toasting removes water only: a slice's energy is unchanged, so the
    // untoasted bread (by slice, or weighed before toasting) is offered.
    reason: "toasted-variant (log the untoasted bread)",
    match: /^Bread, .*, toasted\b|^Bread, toasted\b/,
  },
  {
    reason: "packaged-meal (brand-dependent)",
    match: /ready-to-heat/i,
  },
];

/**
 * Mixed foods (dishes, snacks and sweets, drinks) are offered at most one
 * qualifier deep ("Pizza, pepperoni"), so search isn't buried under survey
 * permutations of the same dish. Single foods are not limited.
 */
export const MAX_QUALIFIERS: Partial<Record<Family, number>> = {
  prepared: 2,
  snacks: 2,
  beverages: 2,
  condiments: 2,
};
/** Purchase-source qualifiers left out when the generic dish is offered. */
export const SOURCE_QUALIFIER =
  /, (from )?(home recipe|restaurant|fast food \/ restaurant|fast food|restaurant or fast food|ready-to-heat|canned|frozen|bakery|mix|refrigerated dough|store-bought|made from home recipe or purchased at a bakery|purchased at a bakery)\b/;
export const SOURCE_QUALIFIER_FAMILIES: Family[] = [
  "prepared",
  "snacks",
  "breads",
  "beverages",
];

/** The FNDDS margarine category keeps its own records (margarine itself). */
export const FNDDS_RULE_EXEMPT: Record<string, string[]> = {
  "fat-method-variant (margarine/animal fat)": ["Margarine"],
  "dry-mix-not-reconstituted": ["Protein and nutritional powders"],
};

/** "Not included in a food category" holds ingredient rows; keep only these. */
export const FNDDS_UNCATEGORIZED_ALLOW =
  /^(Oats, raw|Wheat germ|Wheat bran|Cereal, oat bran, ready-to-eat)$/;

/**
 * Near-identical variants: a record is left out when rewriting this text
 * gives the description of another offered record AND both records' values
 * per 100 g are near-identical (see nearIdentical in pipeline.ts). Nothing is
 * merged; a variant whose values differ materially stays in the catalog.
 */
export const EQUIVALENT_VARIANTS: {
  reason: string;
  remove: RegExp;
  replace?: string;
}[] = [
  { reason: "equivalent-variant (decaffeinated)", remove: /,? decaffeinated/i },
  {
    reason: "equivalent-variant (frozen; fresh offered)",
    remove: /\bfrozen\b/,
    replace: "fresh",
  },
  {
    reason: "equivalent-variant (reduced sodium)",
    remove: /,? reduced sodium/,
  },
  {
    reason: "equivalent-variant (salt level)",
    remove: /, (lightly salted|unsalted|low sodium|no salt added)\b/,
    replace: ", salted",
  },
  {
    reason: "equivalent-variant (salt level)",
    remove: /, (lightly salted|unsalted|low sodium|no salt added|salted)\b/,
  },
  { reason: "equivalent-variant (toasted)", remove: /, toasted\b/ },
  {
    reason: "equivalent-variant (with calcium added)",
    remove: /, with calcium added/,
  },
  {
    reason: "equivalent-variant (on wheat; on white offered)",
    remove: /\bon wheat\b/,
    replace: "on white",
  },
  {
    reason: "equivalent-variant (whole grain pasta dish)",
    remove: /, whole grain,/,
  },
  {
    reason: "equivalent-variant (patty size; medium offered)",
    remove: /\b1 (small|large) patty\b/,
    replace: "1 medium patty",
  },
  {
    reason: "equivalent-variant (cooking spray; no added fat offered)",
    remove: /,? (made |fried )?with cooking spray/,
    replace: ", no added fat",
  },
  {
    reason: "equivalent-variant (cooking spray; no added fat offered)",
    remove: / with cooking spray/,
    replace: " no added fat",
  },
];

/** SR Legacy is a gap-filler: only records matching an allow rule are offered. */
export type SrRule = {
  family: Family;
  match: RegExp;
  /** Display-name rewrites, applied in order. */
  name?: [RegExp, string][];
};

const DRY = [
  [/, mature seeds/, ""],
  [/, (raw|uncooked|dry)\b/, ""],
  [/$/, ", dry (uncooked)"],
] as [RegExp, string][];

export const SR_RULES: SrRule[] = [
  {
    family: "meat",
    match:
      /^Beef, ground, \d+% lean meat \/ \d+% fat, (raw|patty, cooked, broiled|crumbles, cooked, pan-browned)$/,
    name: [
      [
        /^Beef, ground, (\d+)% lean meat \/ (\d+)% fat/,
        "Ground beef, $1% lean / $2% fat",
      ],
    ],
  },
  {
    family: "meat",
    match:
      /^Beef, (top sirloin, steak|flank, steak|rib eye steak, boneless, lip off|round, eye of round steak, boneless|chuck eye steak, boneless), separable lean only, trimmed to 0" fat, all grades, (raw|cooked, (broiled|grilled))$/,
    name: [
      [/^Beef, top sirloin, steak/, "Top sirloin steak"],
      [/^Beef, flank, steak/, "Flank steak"],
      [/^Beef, rib eye steak, boneless, lip off/, "Ribeye steak, boneless"],
      [
        /^Beef, round, eye of round steak, boneless/,
        "Eye of round steak, boneless",
      ],
      [/^Beef, chuck eye steak, boneless/, "Chuck eye steak, boneless"],
      [
        /, separable lean only, trimmed to 0" fat, all grades/,
        ", lean only, trimmed",
      ],
    ],
  },
  {
    family: "meat",
    match:
      /^Chicken, broilers? or fryers, (breast|thigh|drumstick|leg|wing), (skinless, boneless, )?(meat only|meat and skin), raw$/,
    name: [[/^Chicken, broilers? or fryers, (\w+), /, "Chicken $1, "]],
  },
  {
    family: "meat",
    match: /^Chicken, ground, (raw|cooked)$/,
    name: [[/^Chicken, ground/, "Ground chicken"]],
  },
  {
    family: "meat",
    match:
      /^Turkey, ground, (fat free|93% lean, 7% fat|85% lean, 15% fat), (raw|pan-broiled crumbles|patties, broiled)$/,
    name: [[/^Turkey, ground/, "Ground turkey"]],
  },
  {
    // FNDDS names turkey breast "light meat"; SR names the cut.
    family: "meat",
    match: /^Turkey, retail parts, breast, meat only, (raw|cooked, roasted)$/,
    name: [
      [/^Turkey, retail parts, breast/, "Turkey breast"],
      [/, cooked, roasted$/, ", roasted"],
    ],
  },
  {
    family: "snacks",
    match: /^Syrups, maple$/,
    name: [[/^Syrups, maple$/, "Maple syrup"]],
  },
  {
    family: "meat",
    match:
      /^Pork, fresh, (loin, tenderloin|loin, top loin \(chops\), boneless|loin, center loin \(chops\), bone-in), separable lean only, (raw|cooked, (roasted|broiled))$/,
    name: [
      [/^Pork, fresh, loin, tenderloin/, "Pork tenderloin"],
      [
        /^Pork, fresh, loin, top loin \(chops\), boneless/,
        "Pork loin chop, boneless",
      ],
      [
        /^Pork, fresh, loin, center loin \(chops\), bone-in/,
        "Pork center loin chop, bone-in",
      ],
      [/, separable lean only/, ", lean only"],
    ],
  },
  {
    family: "meat",
    match: /^Pork, fresh, ground, (raw|cooked)$/,
    name: [[/^Pork, fresh, ground/, "Ground pork"]],
  },
  {
    family: "seafood",
    match:
      /^Fish, (salmon, (Atlantic, (farmed|wild)|sockeye|coho, (farmed|wild)|pink|chinook)|cod, (Atlantic|Pacific)|tilapia|haddock|halibut, Atlantic and Pacific|pollock, (Alaska|Atlantic)|trout, rainbow, (farmed|wild)|catfish, channel, (farmed|wild)|mackerel, Atlantic|swordfish|sea bass, mixed species|tuna, fresh, (yellowfin|skipjack|bluefin)), (raw|cooked, dry heat)( \(may [^)]*\))?$/,
    name: [
      [/^Fish, /, ""],
      [/, cooked, dry heat\b/, ", cooked (dry heat)"],
    ],
  },
  {
    family: "seafood",
    match:
      /^Fish, (tuna, (light|white), canned in (water|oil), drained solids|salmon, (pink|sockeye), canned, drained solids|sardine, Atlantic, canned in oil, drained solids with bone)$/i,
    name: [[/^Fish, /, ""]],
  },
  {
    family: "seafood",
    match: /^Crustaceans, shrimp, (raw|cooked)$/,
    name: [[/^Crustaceans, shrimp/, "Shrimp"]],
  },
  {
    family: "grains",
    match:
      /^(Rice, white, long-grain, regular, raw, enriched|Rice, white, medium-grain, raw, enriched|Rice, white, short-grain, enriched, uncooked|Rice, brown, (long|medium)-grain, raw|Rice, white, long-grain, parboiled, enriched, dry|Rice, white, long-grain, precooked or instant, enriched, dry|Wild rice, raw|Quinoa, uncooked|Couscous, dry|Barley, pearled, raw|Bulgur, dry|Millet, raw|Buckwheat groats, roasted, dry|Amaranth grain, uncooked|Spelt, uncooked|Teff, uncooked|Oat bran, raw|Pasta, dry, enriched|Pasta, whole-wheat, dry|Noodles, egg, dry, enriched|Rice noodles, dry|Noodles, japanese, soba, dry)$/,
    name: DRY,
  },
  {
    family: "grains",
    match: /^(Oats|Cereals, oats, regular and quick, not fortified, dry)$/,
    name: [
      [
        /^Cereals, oats, regular and quick, not fortified, dry$/,
        "Oats, rolled or quick, dry (uncooked)",
      ],
      [/^Oats$/, "Oats, whole grain, dry (uncooked)"],
    ],
  },
  {
    family: "grains",
    match:
      /^Wheat flour, (white, all-purpose, enriched, bleached|whole-grain)$/,
  },
  {
    family: "legumes",
    match:
      /^(Beans, (black|kidney, all types|pinto|navy|great northern|small white)|Chickpeas \(garbanzo beans, bengal gram\)|Peas, (green|yellow), split|Mung beans|Lima beans, large|Broadbeans \(fava beans\)|Cowpeas, common \(blackeyes, crowder, southern\)|Soybeans), mature seeds, raw$|^Lentils, raw$/,
    name: [
      [/^Beans, (black|pinto|navy|great northern|small white), /, "$1 beans, "],
      [/^Beans, kidney, all types, /, "Kidney beans, "],
      [/^Peas, (green|yellow), split, /, "Split peas, $1, "],
      ...DRY,
    ],
  },
  {
    family: "legumes",
    match:
      /^(Tofu, raw, (firm|regular), prepared with calcium sulfate|Tofu, extra firm, prepared with nigari|Tempeh|Tempeh, cooked)$/,
  },
  {
    family: "vegetables",
    match:
      /^(Potatoes, (russet, |white, |red, )?flesh and skin, raw|Sweet potato, raw, unprepared)$/,
  },
  {
    family: "protein",
    match:
      /^Beverages, (Whey protein powder isolate|Protein powder whey based|Protein powder soy based)$/,
    name: [[/^Beverages, /, ""]],
  },
];

/** SR records from regional or narrowly sampled studies are never offered. */
export const SR_EXCLUDE =
  /Alaska Native|Navajo|Northern Plains|Shoshone|Apache|Hopi|New York State|with added solution|without salt/i;

/** Removed from every SR description before matching and naming. */
export const SR_DESCRIPTION_NOISE =
  / \(Includes foods for USDA's Food Distribution Program\)/;

/**
 * Ranking hints for otherwise similar results: everyday home preparations
 * first. Each match adds or subtracts one; the sum is clamped to -2..2.
 */
export const PREFER: RegExp[] = [
  /no added fat/i,
  /skin not eaten/i,
  /from fresh/i,
  /, from raw$/i,
  /\bplain\b/i,
  /\bunsweetened\b/i,
  /^Egg, whole,/,
  /lean only/i,
  /\b(baked|grilled|roasted|boiled|steamed)\b/i,
];
export const DISCOURAGE: RegExp[] = [
  /from fast food|restaurant/i,
  /with sauce|coated|breaded/i,
  /\bdiet\b|low calorie sweetener/i,
  /\b(sauce|gravy|dressing|dip|syrup)\b/i,
];

/** FNDDS household-portion descriptions that are not consumer portions. */
export const PORTION_EXCLUDE =
  /^Quantity not specified$|^Guideline amount|\bschool\b|\bNFS\b|\bNS as to\b/i;
/** At most this many household portions per food, in source order. */
export const MAX_PORTIONS = 6;
