/**
 * Heuristic classifier to infer clean product types for grocery items in the Philippines.
 * Used for instant categorization, offline support, and as a fallback when AI is unavailable.
 */

type TypeRule = {
  type: string;
  pattern: RegExp;
};

const RULES: TypeRule[] = [
  // Oils
  { type: "Coconut Oil", pattern: /\bcoconut\s*oil\b/i },
  { type: "Canola Oil", pattern: /\bcanola\s*oil\b/i },
  { type: "Corn Oil", pattern: /\bcorn\s*oil\b/i },
  { type: "Palm Oil", pattern: /\bpalm\s*oil\b/i },
  { type: "Vegetable Oil", pattern: /\bvegetable\s*oil\b/i },
  { type: "Cooking Oil", pattern: /\b(cooking\s*oil|mantika)\b/i },
  { type: "Olive Oil", pattern: /\bolive\s*oil\b/i },

  // Bakery & Cebu Delicacies
  { type: "Rosquillos", pattern: /\brosquillos\b/i },
  { type: "Otap", pattern: /\botap\b/i },
  { type: "Barquillos", pattern: /\bbarquillos\b/i },
  { type: "Biscuits", pattern: /\b(biscuits?|crackers?|skyflakes|fita|magic\s*flakes)\b/i },
  { type: "Cookies", pattern: /\b(cookies?|oreo|chips\s*ahoy)\b/i },
  { type: "Bread", pattern: /\b(bread|loaf|pan\s*de\s*sal|pandesal)\b/i },

  // Sauces & Condiments
  { type: "Soy Sauce", pattern: /\b(soy\s*sauce|toyo)\b/i },
  { type: "Vinegar", pattern: /\b(vinegar|suka)\b/i },
  { type: "Fish Sauce", pattern: /\b(fish\s*sauce|patis)\b/i },
  { type: "Banana Ketchup", pattern: /\b(banana\s*ketchup|banana\s*sauce)\b/i },
  { type: "Tomato Ketchup", pattern: /\btomato\s*ketchup\b/i },
  { type: "Tomato Sauce", pattern: /\btomato\s*sauce\b/i },
  { type: "Spaghetti Sauce", pattern: /\bspaghetti\s*sauce\b/i },
  { type: "Oyster Sauce", pattern: /\boyster\s*sauce\b/i },
  { type: "Mayonnaise", pattern: /\b(mayo|mayonnaise)\b/i },

  // Canned Goods
  { type: "Corned Beef", pattern: /\bcorned\s*beef\b/i },
  { type: "Corned Tuna", pattern: /\bcorned\s*tuna\b/i },
  { type: "Canned Tuna", pattern: /\b(tuna\s*flakes|tuna\s*chunks|canned\s*tuna|century\s*tuna)\b/i },
  { type: "Sardines", pattern: /\bsardines?\b/i },
  { type: "Luncheon Meat", pattern: /\b(luncheon\s*meat|spam|maling)\b/i },
  { type: "Meat Loaf", pattern: /\bmeat\s*loaf\b/i },
  { type: "Pork and Beans", pattern: /\bpork\s*(and|&)\s*beans\b/i },

  // Dairy & Milks
  { type: "Almond Milk", pattern: /\balmond\s*milk\b/i },
  { type: "Oat Milk", pattern: /\boat\s*milk\b/i },
  { type: "Soy Milk", pattern: /\b(soy\s*milk|soya\s*milk)\b/i },
  { type: "Fresh Milk", pattern: /\b(fresh\s*milk|cowhead|arla)\b/i },
  { type: "Evaporated Milk", pattern: /\b(evap|evaporated\s*milk)\b/i },
  { type: "Condensed Milk", pattern: /\b(condensada|condensed\s*milk)\b/i },
  { type: "Powdered Milk", pattern: /\b(powdered\s*milk|bear\s*brand|nido|birch\s*tree)\b/i },
  { type: "Cheese", pattern: /\b(cheese|cheddar|queso|kraft\s*eden)\b/i },
  { type: "Butter", pattern: /\b(butter|anchor|lurpak)\b/i },
  { type: "Margarine", pattern: /\b(margarine|star\s*margarine)\b/i },

  // Pantry Staples
  { type: "Rice", pattern: /\brice\b/i },
  { type: "Instant Noodles", pattern: /\b(lucky\s*me|instant\s*noodles?|pancit\s*canton|cup\s*noodles?|ramen)\b/i },
  { type: "Pasta", pattern: /\b(pasta|spaghetti|macaroni)\b/i },
  { type: "Coffee", pattern: /\b(coffee|nescafe|kopiko|san\s*mig\s*coffee|great\s*taste)\b/i },
  { type: "Sugar", pattern: /\b(sugar|asukal)\b/i },
  { type: "Salt", pattern: /\bsalt\b/i },
  { type: "Egg", pattern: /\beggs?\b/i },

  // Beverages
  { type: "Energy / Electrolyte Drink", pattern: /\b(pocari\s*sweat|gatorade|powerade)\b/i },
  { type: "Soft Drink", pattern: /\b(coca\s*cola|coke|pepsi|sprite|royal\s*tru)\b/i },
  { type: "Juice", pattern: /\b(juice|tang|calamansi|minute\s*maid)\b/i },

  // Household & Personal Care
  { type: "Dishwashing Liquid", pattern: /\b(dishwashing|dish\s*wash|joy|axion)\b/i },
  { type: "Laundry Detergent", pattern: /\b(laundry\s*detergent|detergent\s*powder|ariel|surf|tide|breeze)\b/i },
  { type: "Fabric Conditioner", pattern: /\b(fabric\s*conditioner|fabric\s*softener|downy)\b/i },
  { type: "Bath Soap", pattern: /\b(bath\s*soap|safeguard|palmolive|dove)\b/i },
  { type: "Shampoo", pattern: /\b(shampoo|pantene|head\s*(&|and)\s*shoulders|sun silk|creamsilk)\b/i },
  { type: "Toothpaste", pattern: /\b(toothpaste|colgate|close-?up)\b/i },
];

/**
 * Infer a standardized product type name from the item's display name or printed receipt raw name.
 * Returns null if no known rule matches.
 */
export function inferProductType(name: string, rawName = ""): string | null {
  const combined = `${name} ${rawName}`.trim();
  if (!combined) return null;

  for (const rule of RULES) {
    if (rule.pattern.test(combined)) {
      return rule.type;
    }
  }

  return null;
}
